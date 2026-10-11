Set-StrictMode -Version Latest

$script:GetFlowB2KeyName = 'getflow-backup-restic'
$script:GetFlowB2BucketName = 'getflow-backups-eu'
$script:GetFlowB2BucketId = 'bac2df27241e261ba31f0d10'
$script:GetFlowB2Prefix = 'getflow-prod-db/'
$script:GetFlowB2Capabilities = @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles')

function New-GetFlowB2RestrictedKeyPayload {
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][string]$AccountId)

    if ($AccountId -notmatch '^[a-f0-9]{12,64}$') {
        throw 'Backblaze account identity did not pass format validation.'
    }

    return @{
        accountId = $AccountId
        bucketIds = @($script:GetFlowB2BucketId)
        capabilities = @($script:GetFlowB2Capabilities)
        keyName = $script:GetFlowB2KeyName
        namePrefix = $script:GetFlowB2Prefix
        options = @('s3')
    }
}

function Test-GetFlowB2RestrictedKeyMetadata {
    [OutputType([bool])]
    param([Parameter(Mandatory)][object]$KeyMetadata)

    $bucketIds = @($KeyMetadata.bucketIds | ForEach-Object { [string]$_ } | Sort-Object)
    $capabilities = @($KeyMetadata.capabilities | ForEach-Object { [string]$_ } | Sort-Object)
    $options = @($KeyMetadata.options | ForEach-Object { [string]$_ } | Sort-Object)
    $expectedBuckets = @($script:GetFlowB2BucketId | Sort-Object)
    $expectedCapabilities = @($script:GetFlowB2Capabilities | Sort-Object)

    return (
        [string]$KeyMetadata.keyName -ceq $script:GetFlowB2KeyName -and
        [string]$KeyMetadata.namePrefix -ceq $script:GetFlowB2Prefix -and
        ($bucketIds -join "`n") -ceq ($expectedBuckets -join "`n") -and
        ($capabilities -join "`n") -ceq ($expectedCapabilities -join "`n") -and
        ($options -join "`n") -ceq 's3'
    )
}

function Get-GetFlowB2CredentialPath {
    [OutputType([string])]
    param()

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw 'Windows LocalAppData is unavailable; protected B2 credential storage cannot be used.'
    }

    return Join-Path (Join-Path $env:LOCALAPPDATA 'GetFlowBackupB2Credential') 'backblaze-credential.xml'
}

function Set-GetFlowB2PrivateAcl {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][bool]$Directory)

    if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        throw 'DPAPI credential storage is supported only on Windows.'
    }

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($Directory) {
        $acl = [System.Security.AccessControl.DirectorySecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $currentSid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
    } else {
        $acl = [System.Security.AccessControl.FileSecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $currentSid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
    }

    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Test-GetFlowB2PrivateAcl {
    [OutputType([bool])]
    param([Parameter(Mandatory)][string]$Path)

    if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        return $false
    }

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if (-not $acl.AreAccessRulesProtected) { return $false }

    $rules = @($acl.Access | Where-Object { -not $_.IsInherited })
    if ($rules.Count -eq 0) { return $false }
    foreach ($rule in $rules) {
        $ruleSid = $rule.IdentityReference
        if ($ruleSid -isnot [System.Security.Principal.SecurityIdentifier]) {
            try { $ruleSid = $ruleSid.Translate([System.Security.Principal.SecurityIdentifier]) } catch { return $false }
        }
        if ($ruleSid.Value -cne $currentSid) { return $false }
    }
    return (@($rules | Where-Object {
        $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne 0)
    }).Count -gt 0)
}

function Save-GetFlowB2Credential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory)][string]$Path
    )

    if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        throw 'DPAPI credential storage is supported only on Windows.'
    }
    if (Test-Path -LiteralPath $Path) {
        throw 'Protected B2 credential already exists; refusing to overwrite it.'
    }

    $directory = Split-Path -Parent $Path
    $createdDirectory = $false
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $directory -Force)
        Set-GetFlowB2PrivateAcl -Path $directory -Directory $true
        $createdDirectory = $true
    } elseif (-not (Test-GetFlowB2PrivateAcl -Path $directory)) {
        throw 'Existing protected B2 credential directory does not have a current-user-only ACL; refusing to change it.'
    }

    $temporaryPath = Join-Path $directory ('.b2-credential-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $createdFinal = $false
    try {
        $Credential | Export-Clixml -LiteralPath $temporaryPath -ErrorAction Stop
        Set-GetFlowB2PrivateAcl -Path $temporaryPath -Directory $false
        Move-Item -LiteralPath $temporaryPath -Destination $Path -ErrorAction Stop
        $createdFinal = $true

        $roundTrip = Import-Clixml -LiteralPath $Path -ErrorAction Stop
        if ($roundTrip -isnot [System.Management.Automation.PSCredential] -or
            $roundTrip.UserName -cne $Credential.UserName -or
            ([System.Net.NetworkCredential]::new('', $roundTrip.Password)).Password -cne
            ([System.Net.NetworkCredential]::new('', $Credential.Password)).Password) {
            throw 'Protected B2 credential round-trip validation failed.'
        }
    } catch {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        if ($createdFinal) { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }
        throw 'Protected B2 credential could not be safely stored and verified.'
    }
}

function Get-GetFlowB2Credential {
    [OutputType([System.Management.Automation.PSCredential])]
    param([string]$Path = (Get-GetFlowB2CredentialPath))

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'Protected Backblaze credential is missing; create and verify the restricted key first.'
    }

    try {
        $credential = Import-Clixml -LiteralPath $Path -ErrorAction Stop
        if ($credential -isnot [System.Management.Automation.PSCredential] -or
            [string]::IsNullOrWhiteSpace($credential.UserName) -or
            $null -eq $credential.Password) {
            throw 'Credential shape mismatch.'
        }
        return $credential
    } catch {
        throw 'Protected Backblaze credential could not be opened for this Windows user.'
    }
}

Export-ModuleMember -Function @(
    'New-GetFlowB2RestrictedKeyPayload',
    'Test-GetFlowB2RestrictedKeyMetadata',
    'Get-GetFlowB2CredentialPath',
    'Save-GetFlowB2Credential',
    'Get-GetFlowB2Credential',
    'Test-GetFlowB2PrivateAcl'
)
