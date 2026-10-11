$ErrorActionPreference = 'Stop'

$modulePath = Join-Path $PSScriptRoot '..\GetFlowBackup.psm1'
$wslHarnessPath = Join-Path $PSScriptRoot 'wsl_synthetic_restore.py'
$restoreHelperPath = Join-Path $PSScriptRoot '..\wsl\restore_from_stdin.py'
Import-Module $modulePath -Force

$wslPath = (Get-Command wsl.exe -ErrorAction Stop).Source
$distro = 'Ubuntu-24.04'
$linuxUser = 'tudor'
$labPath = '/home/tudor/.local/share/getflow-restore-lab'
$token = [guid]::NewGuid().ToString('N').Substring(0, 12)
$sourceDatabase = "getflow_restore_test_${token}_src"
$targetDatabase = "getflow_restore_test_${token}_target"
$fixtureCreated = $false

function Assert-Equal($Expected, $Actual, [string]$Name) {
    if ($Expected -cne $Actual) {
        throw "$Name failed."
    }
}

try {
    $probe = Invoke-GetFlowWslRestoreTargetProbe `
        -WslExecutablePath $wslPath `
        -DistroName $distro `
        -LinuxUser $linuxUser `
        -SupabaseCliPath '/home/tudor/.local/bin/supabase-2.120.0' `
        -LabPath $labPath
    Assert-Equal 0 $probe.ExitCode 'isolated WSL restore probe exit code'
    Assert-Equal $true $probe.Compatible 'isolated WSL PostgreSQL 17 and required extensions'

    $harnessLinuxPath = Get-GetFlowWslPath `
        -WslExecutablePath $wslPath `
        -DistroName $distro `
        -LinuxUser $linuxUser `
        -WindowsPath $wslHarnessPath

    $setup = Invoke-GetFlowQuietCommand `
        -ExecutablePath $wslPath `
        -Arguments @('-d', $distro, '-u', $linuxUser, '--', 'python3', $harnessLinuxPath, 'setup', '--source-database', $sourceDatabase, '--token', $token)
    if ($setup.ExitCode -ne 0 -or $setup.StdOut -notmatch 'SYNTHETIC_SOURCE: READY') {
        throw 'Synthetic source database could not be prepared.'
    }
    $fixtureCreated = $true

    $pipeline = Invoke-GetFlowWslRestorePipeline `
        -ProducerPath $wslPath `
        -ProducerArguments @('-d', $distro, '-u', $linuxUser, '--', 'python3', $harnessLinuxPath, 'dump', '--source-database', $sourceDatabase, '--token', $token, '--schema-list', ((Get-GetFlowBackupSchemas) -join ',')) `
        -RestoreHelperPath $restoreHelperPath `
        -RestoreArguments @('restore', '--target-database', $targetDatabase) `
        -WslExecutablePath $wslPath `
        -DistroName $distro `
        -LinuxUser $linuxUser
    if (-not $pipeline.Succeeded) {
        throw "Synthetic WSL pg_dump to pg_restore stream failed (producer=$($pipeline.ProducerExitCode), consumer=$($pipeline.ConsumerExitCode), bytes=$($pipeline.BytesCopied), restoreStatus=$($pipeline.ConsumerStdOut.Trim()))."
    }
    if ($pipeline.BytesCopied -le 0) {
        throw 'Synthetic PostgreSQL archive was empty.'
    }

    $verify = Invoke-GetFlowQuietCommand `
        -ExecutablePath $wslPath `
        -Arguments @('-d', $distro, '-u', $linuxUser, '--', 'python3', $harnessLinuxPath, 'verify', '--target-database', $targetDatabase, '--token', $token)
    Assert-Equal 0 $verify.ExitCode 'synthetic restored data verification exit code'
    Assert-Equal "GETFLOW_SYNTHETIC_RESTORED|1|true`n" $verify.StdOut 'restored row and excluded Vault fixture'

    $cleanup = Invoke-GetFlowQuietCommand `
        -ExecutablePath $wslPath `
        -Arguments @('-d', $distro, '-u', $linuxUser, '--', 'python3', $harnessLinuxPath, 'cleanup', '--source-database', $sourceDatabase, '--target-database', $targetDatabase, '--token', $token)
    Assert-Equal 0 $cleanup.ExitCode 'synthetic database cleanup exit code'
    Assert-Equal $true ($cleanup.StdOut -match 'SYNTHETIC_DATABASES: REMOVED') 'only dedicated synthetic databases removed'
    $fixtureCreated = $false

    'WSL_RESTORE_INTEGRATION: PASS (local compatibility, binary stream, synthetic data, Vault fixture exclusion)'
} finally {
    if ($fixtureCreated) {
        # Remove only the exact synthetic source/target pair generated above.
        $null = Invoke-GetFlowQuietCommand `
            -ExecutablePath $wslPath `
            -Arguments @('-d', $distro, '-u', $linuxUser, '--', 'python3', $harnessLinuxPath, 'cleanup', '--source-database', $sourceDatabase, '--target-database', $targetDatabase, '--token', $token)
    }
}
