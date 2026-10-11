$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot '..\GetFlowBackup.psm1'

if (-not (Test-Path -LiteralPath $modulePath)) {
    throw 'GetFlowBackup module is missing.'
}

Import-Module $modulePath -Force
Import-Module (Join-Path $PSScriptRoot '..\GetFlowB2Credential.psm1') -Force
& (Join-Path $PSScriptRoot 'Test-GetFlowB2Api.ps1')
$passed = 0

function Assert-Equal($Expected, $Actual, [string]$Name) {
    if ($Expected -is [array]) {
        if (($Expected -join "`n") -cne ($Actual -join "`n")) {
            throw "$Name failed."
        }
    } elseif ($Expected -cne $Actual) {
        throw "$Name failed."
    }
    $script:passed++
}

$expectedSchemas = @(
    'auth',
    'cron',
    'extensions',
    'graphql',
    'graphql_public',
    'public',
    'realtime',
    'storage',
    'supabase_migrations'
)
Assert-Equal $expectedSchemas @(Get-GetFlowBackupSchemas) 'approved schema allowlist'

$dumpArguments = @(New-GetFlowPgDumpArguments)
Assert-Equal $true ($dumpArguments -contains '--schema=auth') 'auth schema included'
Assert-Equal $true ($dumpArguments -contains '--schema=supabase_migrations') 'migration history included'
Assert-Equal $false ($dumpArguments -contains '--no-privileges') 'object grants remain included for recovery'
Assert-Equal 0 ($dumpArguments | Where-Object { $_ -match 'vault|password=|postgresql://' } | Measure-Object | Select-Object -ExpandProperty Count) 'vault and credentials excluded from dump arguments'
$pgDumpHelp = & (Join-Path $env:USERPROFILE 'AppData\Local\Temp\GetFlowBackupToolchain\postgres17\pgsql\bin\pg_dump.exe') --help
$pgDumpHelpText = $pgDumpHelp -join "`n"
Assert-Equal 0 ($dumpArguments | Where-Object { $_ -like '-*' -and $pgDumpHelpText -notmatch [regex]::Escape($_.Split('=')[0]) } | Measure-Object | Select-Object -ExpandProperty Count) 'all pg_dump flags supported by pinned client'

$resticRepository = Get-GetFlowBackupRepository
Assert-Equal 's3:https://s3.eu-central-003.backblazeb2.com/getflow-backups-eu/getflow-prod-db' $resticRepository 'fixed EU bucket/prefix'
Assert-Equal $true (Test-GetFlowRestoreTargetProbe 'postgres|17|pg_cron,supabase_vault') 'compatible restore target accepted'
Assert-Equal $true (Test-GetFlowRestoreTargetProbe "postgres|17|pg_cron,supabase_vault`r`n") 'restore probe line ending accepted'
Assert-Equal $false (Test-GetFlowRestoreTargetProbe 'postgres|17|pgcrypto') 'incomplete restore target rejected'
Assert-Equal $false (Test-GetFlowRestoreTargetProbe 'postgres|16|pg_cron,supabase_vault') 'wrong PostgreSQL major rejected'
Assert-Equal $false (Test-GetFlowRestoreTargetProbe 'postgres|17|pg_cron,supabase_vault,extra') 'unexpected restore extensions rejected'

$b2Payload = New-GetFlowB2RestrictedKeyPayload -AccountId 'abcdef123456'
Assert-Equal 'getflow-backup-restic' $b2Payload.keyName 'restricted B2 key name'
Assert-Equal 'bac2df27241e261ba31f0d10' $b2Payload.bucketIds[0] 'restricted B2 bucket ID'
Assert-Equal 'getflow-prod-db/' $b2Payload.namePrefix 'restricted B2 prefix'
Assert-Equal 's3' $b2Payload.options[0] 'S3-compatible Restic key mode'
Assert-Equal @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles') @($b2Payload.capabilities | Sort-Object) 'least-privilege B2 file capabilities'
$validB2Key = [pscustomobject]@{
    keyName = 'getflow-backup-restic'
    bucketIds = @('bac2df27241e261ba31f0d10')
    namePrefix = 'getflow-prod-db/'
    capabilities = @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles')
    options = @('s3')
}
Assert-Equal $true (Test-GetFlowB2RestrictedKeyMetadata $validB2Key) 'exact B2 key metadata accepted'
Assert-Equal $false (Test-GetFlowB2RestrictedKeyMetadata ([pscustomobject]@{
    keyName = 'getflow-backup-restic'; bucketIds = @('bac2df27241e261ba31f0d10'); namePrefix = 'getflow-prod-db/';
    capabilities = @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles', 'readBuckets'); options = @('s3')
})) 'extra B2 bucket capability rejected'
Assert-Equal $false (Test-GetFlowB2RestrictedKeyMetadata ([pscustomobject]@{
    keyName = 'getflow-backup-restic'; bucketIds = @('bac2df27241e261ba31f0d10'); namePrefix = 'getflow-prod-db';
    capabilities = @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles'); options = @('s3')
})) 'B2 prefix mismatch rejected'

$credentialTestDirectory = Join-Path $PSScriptRoot ('.tmp-b2-dpapi-' + [guid]::NewGuid().ToString('N'))
$credentialTestPath = Join-Path $credentialTestDirectory 'credential.xml'
$syntheticCredentialSecret = ConvertTo-SecureString 'getflow-synthetic-backblaze-secret' -AsPlainText -Force
try {
    $syntheticCredential = [System.Management.Automation.PSCredential]::new('synthetic-key-id', $syntheticCredentialSecret)
    Save-GetFlowB2Credential -Credential $syntheticCredential -Path $credentialTestPath
    $restoredCredential = Get-GetFlowB2Credential -Path $credentialTestPath
    Assert-Equal 'synthetic-key-id' $restoredCredential.UserName 'DPAPI credential ID round-trip'
    Assert-Equal 'getflow-synthetic-backblaze-secret' ([System.Net.NetworkCredential]::new('', $restoredCredential.Password)).Password 'DPAPI credential secret round-trip'
    Assert-Equal $true (Test-GetFlowB2PrivateAcl -Path $credentialTestPath) 'DPAPI credential file ACL is private'
    Assert-Equal $false ((Get-Content -LiteralPath $credentialTestPath -Raw) -match 'getflow-synthetic-backblaze-secret') 'DPAPI file contains no plaintext synthetic secret'
    $restoredCredential.Password.Dispose()
} finally {
    $syntheticCredentialSecret.Dispose()
    if (Test-Path -LiteralPath $credentialTestDirectory) {
        Remove-Item -LiteralPath $credentialTestDirectory -Recurse -Force
    }
}

$env:GETFLOW_BACKUP_TEST_SENTINEL = 'must-not-leak-to-child-processes'
$pwshCommand = Get-Command pwsh, powershell -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pwshCommand) {
    throw 'No PowerShell executable found.'
}
$pwshPath = $pwshCommand.Source
$cleanStartInfo = New-GetFlowProcessStartInfo -ExecutablePath $pwshPath -Arguments @('-NoProfile')
Assert-Equal $false (@($cleanStartInfo.EnvironmentVariables.Keys) -contains 'GETFLOW_BACKUP_TEST_SENTINEL') 'child process does not inherit arbitrary parent secrets'
$scopedStartInfo = New-GetFlowProcessStartInfo -ExecutablePath $pwshPath -Arguments @('-NoProfile') -Environment @{ PGPASSWORD = 'synthetic-test-only' }
Assert-Equal $true (@($scopedStartInfo.EnvironmentVariables.Keys) -contains 'PGPASSWORD') 'explicit scoped child credential is supplied'
Assert-Equal $false (@($scopedStartInfo.EnvironmentVariables.Keys) -contains 'GETFLOW_BACKUP_TEST_SENTINEL') 'scoped child credential does not reintroduce inherited environment'
Remove-Item Env:\GETFLOW_BACKUP_TEST_SENTINEL

$sinkPath = Join-Path ([System.IO.Path]::GetTempPath()) ('getflow-backup-sink-' + [guid]::NewGuid().ToString('N') + '.bin')
try {
    $producerCode = '[Console]::OpenStandardOutput().Write([byte[]]@(0,1,127,128,255),0,5)'
    $consumerCode = '$m=[IO.MemoryStream]::new();[Console]::OpenStandardInput().CopyTo($m);[IO.File]::WriteAllBytes(''' + $sinkPath.Replace("'", "''") + ''',$m.ToArray())'
    $pipeline = Invoke-GetFlowBinaryPipe `
        -ProducerPath $pwshPath `
        -ProducerArguments @('-NoProfile', '-NonInteractive', '-Command', $producerCode) `
        -ConsumerPath $pwshPath `
        -ConsumerArguments @('-NoProfile', '-NonInteractive', '-Command', $consumerCode)
    $expectedBytes = [byte[]]@(0, 1, 127, 128, 255)
    $actualBytes = [System.IO.File]::ReadAllBytes($sinkPath)
    Assert-Equal ($expectedBytes -join ',') ($actualBytes -join ',') 'binary stream integrity'
    Assert-Equal 0 $pipeline.ProducerExitCode 'producer exit status'
    Assert-Equal 0 $pipeline.ConsumerExitCode 'consumer exit status'
    Assert-Equal $true $pipeline.Succeeded 'successful pipeline status'

    $failingProducer = '[Console]::OpenStandardOutput().Write([byte[]]@(1),0,1);exit 7'
    $failedPipeline = Invoke-GetFlowBinaryPipe `
        -ProducerPath $pwshPath `
        -ProducerArguments @('-NoProfile', '-NonInteractive', '-Command', $failingProducer) `
        -ConsumerPath $pwshPath `
        -ConsumerArguments @('-NoProfile', '-NonInteractive', '-Command', $consumerCode)
    Assert-Equal 7 $failedPipeline.ProducerExitCode 'producer failure is preserved'
    Assert-Equal $false $failedPipeline.Succeeded 'partial stream cannot be reported successful'

    $runnerPath = Join-Path $PSScriptRoot '..\Invoke-GetFlowProductionBackup.ps1'
    if (-not (Test-Path -LiteralPath $runnerPath)) {
        throw 'Production backup runner is missing.'
    }
    $preflight = Invoke-GetFlowQuietCommand `
        -ExecutablePath $pwshPath `
        -Arguments @('-NoProfile', '-File', $runnerPath, '-PreflightOnly', '-ToolRoot', (Join-Path $env:USERPROFILE 'AppData\Local\Temp\GetFlowBackupToolchain')) `
        -Environment @{ USERPROFILE = $env:USERPROFILE }
    if ($preflight.ExitCode -eq 0 -and $preflight.StdOut -match 'PREFLIGHT: PASS') {
        Assert-Equal $true ($preflight.StdOut -match 'RESTORE LAB: WSL2 loopback PostgreSQL 17.11 / pg_cron / supabase_vault') 'preflight verifies the isolated WSL restore target'
        Assert-Equal $true ($preflight.StdOut -match 'PRODUCTION EXPORT: NOT RUN') 'preflight does not start Production export'
        'BACKUP_PREFLIGHT: PASS (local-only; Production export not run)'
    } else {
        # The isolated restore service can be unavailable independently of the
        # pure backup/B2 unit checks. Keep this as BLOCKED, never convert it to
        # a passing preflight assertion.
        'BACKUP_PREFLIGHT: BLOCKED (isolated WSL Supabase/PostgreSQL restore lab is not running)'
    }
} finally {
    Remove-Item -LiteralPath $sinkPath -Force -ErrorAction SilentlyContinue
}

"BACKUP_SCRIPT_TESTS: PASS ($passed assertions)"
