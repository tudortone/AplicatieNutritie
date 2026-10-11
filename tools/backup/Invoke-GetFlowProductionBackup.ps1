[CmdletBinding()]
param(
    [switch]$PreflightOnly,
    [switch]$Execute,
    [string]$ToolRoot
)

$ErrorActionPreference = 'Stop'

if ($PreflightOnly -eq $Execute) {
    throw 'Specify exactly one of -PreflightOnly or -Execute.'
}

Import-Module (Join-Path $PSScriptRoot 'GetFlowBackup.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'GetFlowB2Credential.psm1') -Force

if ([string]::IsNullOrWhiteSpace($ToolRoot)) {
    $candidateRoots = @()
    if ($env:LOCALAPPDATA) {
        $candidateRoots += Join-Path $env:LOCALAPPDATA 'Temp\GetFlowBackupToolchain'
    }
    if ($env:USERPROFILE) {
        $candidateRoots += Join-Path $env:USERPROFILE 'AppData\Local\Temp\GetFlowBackupToolchain'
    }
    $ToolRoot = $candidateRoots | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($ToolRoot) -or -not (Test-Path -LiteralPath $ToolRoot -PathType Container)) {
    throw 'Portable backup toolchain is unavailable; no network action was attempted.'
}

$pgBin = Join-Path $ToolRoot 'postgres17\pgsql\bin'
$pgDump = Join-Path $pgBin 'pg_dump.exe'
$psql = Join-Path $pgBin 'psql.exe'
$restic = Join-Path $ToolRoot 'restic\restic_0.19.1_windows_amd64.exe'
foreach ($path in @($pgDump, $psql, $restic)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw 'A required pinned backup executable is missing; no network action was attempted.'
    }
}

$pgVersion = Invoke-GetFlowQuietCommand -ExecutablePath $pgDump -Arguments @('--version')
$psqlVersion = Invoke-GetFlowQuietCommand -ExecutablePath $psql -Arguments @('--version')
$resticVersion = Invoke-GetFlowQuietCommand -ExecutablePath $restic -Arguments @('version')
if ($pgVersion.ExitCode -ne 0 -or $pgVersion.StdOut -notmatch '17\.11') {
    throw 'Pinned PostgreSQL 17.11 pg_dump check failed; no network action was attempted.'
}
if ($psqlVersion.ExitCode -ne 0 -or $psqlVersion.StdOut -notmatch '17\.11') {
    throw 'Pinned PostgreSQL 17.11 psql check failed; no network action was attempted.'
}
if ($resticVersion.ExitCode -ne 0 -or $resticVersion.StdOut -notmatch 'restic 0\.19\.1') {
    throw 'Pinned Restic 0.19.1 check failed; no network action was attempted.'
}

$wslExecutable = Join-Path $env:SystemRoot 'System32\wsl.exe'
if (-not (Test-Path -LiteralPath $wslExecutable -PathType Leaf)) {
    throw 'Windows WSL executable is unavailable; no network action was attempted.'
}
$wslDistro = 'Ubuntu-24.04'
$wslLinuxUser = 'tudor'
$supabaseCliPath = '/home/tudor/.local/bin/supabase-2.120.0'
$restoreLabPath = '/home/tudor/.local/share/getflow-restore-lab'
$restoreHelperPath = Join-Path $PSScriptRoot 'wsl\restore_from_stdin.py'
if (-not (Test-Path -LiteralPath $restoreHelperPath -PathType Leaf)) {
    throw 'WSL isolated restore helper is missing; no network action was attempted.'
}

$wslPgRestoreVersion = Invoke-GetFlowQuietCommand `
    -ExecutablePath $wslExecutable `
    -Arguments @('-d', $wslDistro, '-u', $wslLinuxUser, '--', '/usr/bin/env', '-u', 'SUPABASE_ACCESS_TOKEN', '-u', 'SUPABASE_PROJECT_ID', 'pg_restore', '--version')
if ($wslPgRestoreVersion.ExitCode -ne 0 -or $wslPgRestoreVersion.StdOut -notmatch 'pg_restore \(PostgreSQL\) 17\.11') {
    throw 'Pinned WSL PostgreSQL 17.11 restore client check failed; no network action was attempted.'
}

$wslRestoreProbe = Invoke-GetFlowWslRestoreTargetProbe `
    -WslExecutablePath $wslExecutable `
    -DistroName $wslDistro `
    -LinuxUser $wslLinuxUser `
    -SupabaseCliPath $supabaseCliPath `
    -LabPath $restoreLabPath
if ($wslRestoreProbe.ExitCode -ne 0 -or -not $wslRestoreProbe.Compatible) {
    throw 'Isolated WSL restore lab is not PostgreSQL 17 with pg_cron and supabase_vault; no Production credentials or connection were requested.'
}

if ($PreflightOnly) {
    'PREFLIGHT: PASS'
    'TOOLS: PostgreSQL 17.11 / Restic 0.19.1'
    'RESTORE LAB: WSL2 loopback PostgreSQL 17.11 / pg_cron / supabase_vault'
    'NETWORK: NOT USED'
    'PRODUCTION EXPORT: NOT RUN'
    exit 0
}

$restoreTargetConfirmation = Read-Host 'Type exactly to authorize a new disposable database in the isolated WSL2 restore lab: LOCAL WSL2 RESTORE LAB IS DISPOSABLE'
if ($restoreTargetConfirmation -cne 'LOCAL WSL2 RESTORE LAB IS DISPOSABLE') {
    throw 'A disposable local restore target was not confirmed; no Production credentials or connection were requested.'
}

$restoreTargetProbe = Invoke-GetFlowWslRestoreTargetProbe `
    -WslExecutablePath $wslExecutable `
    -DistroName $wslDistro `
    -LinuxUser $wslLinuxUser `
    -SupabaseCliPath $supabaseCliPath `
    -LabPath $restoreLabPath
if ($restoreTargetProbe.ExitCode -ne 0 -or -not $restoreTargetProbe.Compatible) {
    throw 'Isolated WSL restore target is not compatible; no Production credentials or connection were requested.'
}
Write-Host 'ISOLATED_RESTORE_TARGET: PASS (WSL2 loopback PostgreSQL 17, pg_cron and supabase_vault)'

$confirmation = Read-Host 'Type exactly: EXPORT tfqcihbjgmscsseyzifs TO B2 getflow-backups-eu/getflow-prod-db'
if ($confirmation -cne 'EXPORT tfqcihbjgmscsseyzifs TO B2 getflow-backups-eu/getflow-prod-db') {
    throw 'Production export confirmation did not match; no connection was attempted.'
}
$prefixConfirmation = Read-Host 'After checking Backblaze, type EXISTING_REPOSITORY if this exact prefix contains the intended Restic repository, or EMPTY_PREFIX only if this exact prefix is empty'
if ($prefixConfirmation -cnotin @('EXISTING_REPOSITORY', 'EMPTY_PREFIX')) {
    throw 'Exact B2 repository state was not confirmed; no credentials were requested.'
}

$b2Credential = $null
$b2KeyIdSecure = $null
$b2KeySecure = $null
$databasePasswordSecure = $null
$resticPasswordSecure = $null
$bstrs = [System.Collections.Generic.List[IntPtr]]::new()
try {
    Write-Host 'Loading the verified restricted Backblaze key from current-user DPAPI storage; no secret values will be displayed.'
    $b2Credential = Get-GetFlowB2Credential
    $b2KeyIdSecure = ConvertTo-SecureString -String $b2Credential.UserName -AsPlainText -Force
    $b2KeySecure = $b2Credential.Password
    $databasePasswordSecure = Read-Host 'Existing Supabase PostgreSQL password' -AsSecureString
    $resticPasswordSecure = Read-Host 'Independent Restic encryption password' -AsSecureString

    $b2KeyIdBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($b2KeyIdSecure)
    $bstrs.Add($b2KeyIdBstr)
    $b2KeyBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($b2KeySecure)
    $bstrs.Add($b2KeyBstr)
    $databasePasswordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($databasePasswordSecure)
    $bstrs.Add($databasePasswordBstr)
    $resticPasswordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($resticPasswordSecure)
    $bstrs.Add($resticPasswordBstr)

    $b2KeyId = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2KeyIdBstr)
    $b2Key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2KeyBstr)
    $databasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($databasePasswordBstr)
    $resticPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($resticPasswordBstr)

    if ([string]::IsNullOrWhiteSpace($b2KeyId) -or [string]::IsNullOrWhiteSpace($b2Key) -or
        [string]::IsNullOrWhiteSpace($databasePassword) -or [string]::IsNullOrWhiteSpace($resticPassword)) {
        throw 'A required secure prompt was empty; no database dump was started.'
    }

    $databaseEnvironment = @{
        PGPASSWORD = $databasePassword
        PGSSLMODE = 'require'
    }
    $resticEnvironment = @{
        AWS_ACCESS_KEY_ID = $b2KeyId
        AWS_SECRET_ACCESS_KEY = $b2Key
        AWS_DEFAULT_REGION = 'eu-central-003'
        RESTIC_REPOSITORY = Get-GetFlowBackupRepository
        RESTIC_PASSWORD = $resticPassword
    }

    if ($prefixConfirmation -ceq 'EMPTY_PREFIX') {
        $repositoryInit = Invoke-GetFlowQuietCommand `
            -ExecutablePath $restic `
            -Arguments @('init') `
            -Environment $resticEnvironment
        if ($repositoryInit.ExitCode -ne 0) {
            throw 'Restic repository initialization failed. Do not retry until the exact B2 prefix is rechecked; no Production database query or dump was started.'
        }
        Write-Host 'RESTIC_REPOSITORY: INITIALIZED IN THE EXISTING APPROVED BUCKET/PREFIX'
    }

    $repositoryProbe = Invoke-GetFlowQuietCommand `
        -ExecutablePath $restic `
        -Arguments @('cat', 'config') `
        -Environment $resticEnvironment
    if ($repositoryProbe.ExitCode -ne 0) {
        throw 'Restic repository is missing or unreachable. No Production database query or dump was started.'
    }

    $sourceProbe = Invoke-GetFlowQuietCommand `
        -ExecutablePath $psql `
        -Arguments @(
            '-X', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1',
            '-h', 'aws-1-eu-west-2.pooler.supabase.com',
            '-p', '5432',
            '-U', 'postgres.tfqcihbjgmscsseyzifs',
            '-d', 'postgres',
            '-c', "SELECT current_database() || '|' || split_part(current_setting('server_version'), '.', 1);"
        ) `
        -Environment $databaseEnvironment

    if ($sourceProbe.ExitCode -ne 0 -or $sourceProbe.StdOut.Trim() -cne 'postgres|17') {
        throw 'Production source probe did not match the approved project/database/PostgreSQL major; no dump was started.'
    }

    $pipeline = Invoke-GetFlowBinaryPipe `
        -ProducerPath $pgDump `
        -ProducerArguments (New-GetFlowPgDumpArguments) `
        -ProducerEnvironment $databaseEnvironment `
        -ConsumerPath $restic `
        -ConsumerArguments @(
            'backup', '--stdin', '--stdin-filename', 'getflow-production.dump',
            '--tag', 'getflow-production', '--json'
        ) `
        -ConsumerEnvironment $resticEnvironment

    if (-not $pipeline.Succeeded -or $pipeline.BytesCopied -le 0) {
        throw "Production dump/upload pipeline failed (producer=$($pipeline.ProducerExitCode), restic=$($pipeline.ConsumerExitCode)); no success is claimed. Do not retry until the B2 snapshot list is checked."
    }

    $summary = $null
    foreach ($line in ($pipeline.ConsumerStdOut -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $event = ConvertFrom-Json -InputObject $line -ErrorAction Stop
            if ($event.message_type -eq 'summary') { $summary = $event }
        } catch { }
    }
    $snapshotId = [string]$summary.snapshot_id
    if ($snapshotId -notmatch '^[a-f0-9]{8,64}$') {
        throw 'Upload returned no verifiable Restic snapshot ID. Do not retry until the B2 snapshot list is checked.'
    }

    $integrity = Invoke-GetFlowQuietCommand `
        -ExecutablePath $restic `
        -Arguments @('check') `
        -Environment $resticEnvironment
    if ($integrity.ExitCode -ne 0) {
        Write-Host "RESTIC_SNAPSHOT_ID: $snapshotId"
        throw 'Restic repository metadata check failed. Snapshot retained for investigation; no cleanup or retry was performed.'
    }

    $restoreDatabase = "getflow_restore_$snapshotId"
    $restorePipeline = Invoke-GetFlowWslRestorePipeline `
        -ProducerPath $restic `
        -ProducerArguments @('dump', $snapshotId, 'getflow-production.dump') `
        -ProducerEnvironment $resticEnvironment `
        -RestoreHelperPath $restoreHelperPath `
        -RestoreArguments @('restore', '--target-database', $restoreDatabase) `
        -WslExecutablePath $wslExecutable `
        -DistroName $wslDistro `
        -LinuxUser $wslLinuxUser

    if (-not $restorePipeline.Succeeded -or $restorePipeline.BytesCopied -le 0 -or $restorePipeline.ConsumerStdOut -notmatch 'ISOLATED_RESTORE: PASS') {
        Write-Host "RESTIC_SNAPSHOT_ID: $snapshotId"
        throw "Encrypted snapshot integrity passed, but isolated WSL restore failed (restic=$($restorePipeline.ProducerExitCode), pg_restore=$($restorePipeline.ConsumerExitCode)). Snapshot and any partial local target were retained; no cleanup or retry was performed."
    }

    Write-Host "RESTIC_SNAPSHOT_ID: $snapshotId"
    Write-Host 'STREAMED_EXPORT: PASS'
    Write-Host 'RESTIC_INTEGRITY_CHECK: PASS'
    Write-Host 'ISOLATED_RESTORE: PASS (PostgreSQL 17 inside WSL2; no host database listener exposed)'
    Write-Host "ISOLATED_RESTORE_DATABASE: $restoreDatabase"
    Write-Host 'CLEANUP: NONE — no Production dump was written to disk; repository pruning was not run.'
} finally {
    foreach ($secure in @($b2KeyIdSecure, $b2KeySecure, $databasePasswordSecure, $resticPasswordSecure)) {
        if ($null -ne $secure) { $secure.Dispose() }
    }
    foreach ($pointer in $bstrs) {
        if ([IntPtr]::Zero -ne $pointer) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
    $b2KeyId = $null
    $b2Key = $null
    $b2Credential = $null
    $databasePassword = $null
    $resticPassword = $null
    $databaseEnvironment = $null
    $resticEnvironment = $null
    $pipeline = $null
}
