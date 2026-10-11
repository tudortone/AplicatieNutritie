Set-StrictMode -Version Latest

$script:GetFlowBackupSchemas = @(
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

function Get-GetFlowBackupSchemas {
    [OutputType([string[]])]
    param()

    return [string[]]$script:GetFlowBackupSchemas.Clone()
}

function New-GetFlowPgDumpArguments {
    [OutputType([string[]])]
    param()

    $arguments = [System.Collections.Generic.List[string]]::new()
    foreach ($argument in @(
        '--format=custom',
        '--no-owner',
        '--compress=3',
        '--no-password',
        '--host=aws-1-eu-west-2.pooler.supabase.com',
        '--port=5432',
        '--username=postgres.tfqcihbjgmscsseyzifs',
        '--dbname=postgres'
    )) {
        $arguments.Add($argument)
    }

    foreach ($schema in $script:GetFlowBackupSchemas) {
        $arguments.Add("--schema=$schema")
    }

    return $arguments.ToArray()
}

function Get-GetFlowBackupRepository {
    [OutputType([string])]
    param()

    return 's3:https://s3.eu-central-003.backblazeb2.com/getflow-backups-eu/getflow-prod-db'
}

function Test-GetFlowRestoreTargetProbe {
    [OutputType([bool])]
    param([AllowNull()][string]$ProbeOutput)

    return ($ProbeOutput -and $ProbeOutput.Trim() -ceq 'postgres|17|pg_cron,supabase_vault')
}

function New-GetFlowProcessStartInfo {
    [OutputType([System.Diagnostics.ProcessStartInfo])]
    param(
        [Parameter(Mandatory)][string]$ExecutablePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [hashtable]$Environment = @{}
    )

    if (-not [System.IO.Path]::IsPathRooted($ExecutablePath)) {
        throw 'Executable path must be absolute.'
    }

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $ExecutablePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    # Do not pass the caller's entire environment (which may contain unrelated
    # production credentials) to pg_dump, psql, Restic, or helper processes.
    $startInfo.EnvironmentVariables.Clear()
    foreach ($name in @('SystemRoot', 'WINDIR')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $startInfo.EnvironmentVariables[$name] = $value
        }
    }

    if ($startInfo.PSObject.Properties['ArgumentList']) {
        foreach ($argument in $Arguments) {
            [void]$startInfo.ArgumentList.Add([string]$argument)
        }
    } else {
        $escapedArgs = foreach ($arg in $Arguments) {
            if ($arg -match '[\s"]') {
                '"' + ($arg -replace '(\\*)(")', '$1$1\"') + '"'
            } else {
                $arg
            }
        }
        $startInfo.Arguments = $escapedArgs -join ' '
    }

    foreach ($name in $Environment.Keys) {
        if ([string]::IsNullOrWhiteSpace([string]$name)) {
            throw 'Environment variable name cannot be empty.'
        }
        if ($null -ne $Environment[$name]) {
            $startInfo.EnvironmentVariables[[string]$name] = [string]$Environment[$name]
        }
    }

    return $startInfo
}

function Invoke-GetFlowBinaryPipe {
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$ProducerPath,
        [Parameter(Mandatory)][string[]]$ProducerArguments,
        [Parameter(Mandatory)][string]$ConsumerPath,
        [Parameter(Mandatory)][string[]]$ConsumerArguments,
        [hashtable]$ProducerEnvironment = @{},
        [hashtable]$ConsumerEnvironment = @{}
    )

    if (-not (Test-Path -LiteralPath $ProducerPath -PathType Leaf)) {
        throw 'Producer executable is unavailable.'
    }
    if (-not (Test-Path -LiteralPath $ConsumerPath -PathType Leaf)) {
        throw 'Consumer executable is unavailable.'
    }

    $producer = [System.Diagnostics.Process]::new()
    $consumer = [System.Diagnostics.Process]::new()
    $producer.StartInfo = New-GetFlowProcessStartInfo -ExecutablePath $ProducerPath -Arguments $ProducerArguments -Environment $ProducerEnvironment
    $consumer.StartInfo = New-GetFlowProcessStartInfo -ExecutablePath $ConsumerPath -Arguments $ConsumerArguments -Environment $ConsumerEnvironment

    $producerStarted = $false
    $consumerStarted = $false
    $copyFailure = $false
    [long]$bytesCopied = 0
    $consumerStdOut = ''

    try {
        $consumerStarted = $consumer.Start()
        if (-not $consumerStarted) {
            throw 'Consumer process did not start.'
        }

        $producerStarted = $producer.Start()
        if (-not $producerStarted) {
            throw 'Producer process did not start.'
        }

        $producerErrorTask = $producer.StandardError.ReadToEndAsync()
        $consumerErrorTask = $consumer.StandardError.ReadToEndAsync()
        $consumerOutputTask = $consumer.StandardOutput.ReadToEndAsync()

        $buffer = [byte[]]::new(65536)
        while (($read = $producer.StandardOutput.BaseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $consumer.StandardInput.BaseStream.Write($buffer, 0, $read)
            $bytesCopied += $read
        }
        $consumer.StandardInput.BaseStream.Flush()
        $consumer.StandardInput.Close()

        $producer.WaitForExit()
        $consumer.WaitForExit()
        $null = $producerErrorTask.GetAwaiter().GetResult()
        $null = $consumerErrorTask.GetAwaiter().GetResult()
        $consumerStdOut = $consumerOutputTask.GetAwaiter().GetResult()

        return [pscustomobject]@{
            ProducerExitCode = $producer.ExitCode
            ConsumerExitCode = $consumer.ExitCode
            BytesCopied = $bytesCopied
            Succeeded = ($producer.ExitCode -eq 0 -and $consumer.ExitCode -eq 0 -and -not $copyFailure)
            ConsumerStdOut = $consumerStdOut
        }
    } catch {
        $copyFailure = $true
        if ($producerStarted -and -not $producer.HasExited) {
            try { $producer.Kill() } catch { }
        }
        if ($consumerStarted -and -not $consumer.HasExited) {
            try { $consumer.Kill() } catch { }
        }
        throw 'Binary backup pipeline failed; no successful backup should be recorded.'
    } finally {
        if ($producerStarted) { $producer.Dispose() }
        if ($consumerStarted) { $consumer.Dispose() }
    }
}

function Invoke-GetFlowQuietCommand {
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$ExecutablePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [hashtable]$Environment = @{}
    )

    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw 'Required executable is unavailable.'
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = New-GetFlowProcessStartInfo -ExecutablePath $ExecutablePath -Arguments $Arguments -Environment $Environment
    if (-not $process.Start()) {
        throw 'Required process did not start.'
    }

    try {
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Close()
        $process.WaitForExit()
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $null = $stderrTask.GetAwaiter().GetResult()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = $stdout
        }
    } finally {
        $process.Dispose()
    }
}

function Invoke-GetFlowWslRestoreTargetProbe {
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$WslExecutablePath,
        [Parameter(Mandatory)][string]$DistroName,
        [Parameter(Mandatory)][string]$LinuxUser,
        [Parameter(Mandatory)][string]$SupabaseCliPath,
        [Parameter(Mandatory)][string]$LabPath
    )

    if (-not [System.IO.Path]::IsPathRooted($WslExecutablePath)) {
        throw 'WSL executable path must be absolute.'
    }

    $query = "SELECT current_database() AS database, split_part(current_setting('server_version'), '.', 1) AS major, COALESCE(string_agg(extname, ',' ORDER BY extname), '') AS extensions FROM pg_extension WHERE extname IN ('pg_cron', 'supabase_vault');"
    $arguments = @(
        '-d', $DistroName,
        '-u', $LinuxUser,
        '--', '/usr/bin/env',
        '-u', 'SUPABASE_ACCESS_TOKEN',
        '-u', 'SUPABASE_PROJECT_ID',
        '-u', 'SUPABASE_DB_PASSWORD',
        '-u', 'SUPABASE_DB_URL',
        '-u', 'SUPABASE_URL',
        '-u', 'SUPABASE_SERVICE_ROLE_KEY',
        '-u', 'DATABASE_URL',
        $SupabaseCliPath,
        'db', 'query', '--local', '--output-format', 'json', '--workdir', $LabPath, $query
    )

    $result = Invoke-GetFlowQuietCommand -ExecutablePath $WslExecutablePath -Arguments $arguments
    $databaseMajor = ''
    $extensions = ''
    $compatible = $false

    if ($result.ExitCode -eq 0) {
        $jsonStart = $result.StdOut.IndexOf('[')
        if ($jsonStart -ge 0) {
            try {
                $rows = @(ConvertFrom-Json -InputObject $result.StdOut.Substring($jsonStart) -ErrorAction Stop)
                if ($rows.Count -eq 1) {
                    $database = [string]$rows[0].database
                    $databaseMajor = [string]$rows[0].major
                    $extensions = [string]$rows[0].extensions
                    $compatible = (
                        $database -ceq 'postgres' -and
                        $databaseMajor -ceq '17' -and
                        $extensions -ceq 'pg_cron,supabase_vault'
                    )
                }
            } catch {
                $compatible = $false
            }
        }
    }

    return [pscustomobject]@{
        ExitCode = $result.ExitCode
        Compatible = $compatible
        DatabaseMajor = $databaseMajor
        Extensions = $extensions
    }
}

function Get-GetFlowWslPath {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$WslExecutablePath,
        [Parameter(Mandatory)][string]$DistroName,
        [Parameter(Mandatory)][string]$LinuxUser,
        [Parameter(Mandatory)][string]$WindowsPath
    )

    if (-not [System.IO.Path]::IsPathRooted($WindowsPath)) {
        throw 'Path to run inside WSL must be absolute.'
    }

    $normalizedWindowsPath = $WindowsPath.Replace('\', '/')
    $result = Invoke-GetFlowQuietCommand `
        -ExecutablePath $WslExecutablePath `
        -Arguments @('-d', $DistroName, '-u', $LinuxUser, '--', 'wslpath', '-a', $normalizedWindowsPath)

    $linuxPath = $result.StdOut.Trim()
    if ($result.ExitCode -ne 0 -or $linuxPath -notmatch '^/(mnt/|home/)') {
        throw 'The approved local helper path could not be resolved inside WSL.'
    }

    return $linuxPath
}

function Invoke-GetFlowWslRestorePipeline {
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$ProducerPath,
        [Parameter(Mandatory)][string[]]$ProducerArguments,
        [hashtable]$ProducerEnvironment = @{},
        [Parameter(Mandatory)][string]$RestoreHelperPath,
        [Parameter(Mandatory)][string[]]$RestoreArguments,
        [Parameter(Mandatory)][string]$WslExecutablePath,
        [Parameter(Mandatory)][string]$DistroName,
        [Parameter(Mandatory)][string]$LinuxUser
    )

    $helperLinuxPath = Get-GetFlowWslPath `
        -WslExecutablePath $WslExecutablePath `
        -DistroName $DistroName `
        -LinuxUser $LinuxUser `
        -WindowsPath $RestoreHelperPath

    $consumerArguments = @(
        '-d', $DistroName,
        '-u', $LinuxUser,
        '--', 'python3', $helperLinuxPath
    ) + $RestoreArguments

    return Invoke-GetFlowBinaryPipe `
        -ProducerPath $ProducerPath `
        -ProducerArguments $ProducerArguments `
        -ProducerEnvironment $ProducerEnvironment `
        -ConsumerPath $WslExecutablePath `
        -ConsumerArguments $consumerArguments
}

Export-ModuleMember -Function @(
    'Get-GetFlowBackupSchemas',
    'New-GetFlowPgDumpArguments',
    'Get-GetFlowBackupRepository',
    'Test-GetFlowRestoreTargetProbe',
    'New-GetFlowProcessStartInfo',
    'Invoke-GetFlowBinaryPipe',
    'Invoke-GetFlowQuietCommand',
    'Invoke-GetFlowWslRestoreTargetProbe',
    'Get-GetFlowWslPath',
    'Invoke-GetFlowWslRestorePipeline'
)
