[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'GetFlowB2Credential.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'GetFlowB2Api.psm1') -Force

function ConvertFrom-GetFlowSecureString {
    param([Parameter(Mandatory)][System.Security.SecureString]$Value)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Revoke-GetFlowCreatedB2Key {
    param([Parameter(Mandatory)][string]$KeyId, [Parameter(Mandatory)][uri]$ApiBase, [Parameter(Mandatory)][string]$AuthorizationToken)

    try {
        $null = Invoke-GetFlowB2ApiRequest -Method Post -Uri ([uri]($ApiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_delete_key')) `
            -Headers @{ Authorization = $AuthorizationToken } -Body @{ applicationKeyId = $KeyId }
        return $true
    } catch {
        return $false
    }
}

$credentialPath = Get-GetFlowB2CredentialPath
if (Test-Path -LiteralPath $credentialPath) {
    throw 'A protected Backblaze credential already exists; refusing to create or overwrite another key.'
}

# Validate Windows DPAPI, user-only ACLs, and the destination path with synthetic
# material before the remote one-time key creation.
$storeProbePath = Join-Path (Split-Path -Parent $credentialPath) ('.preflight-' + [guid]::NewGuid().ToString('N') + '.xml')
$probeSecret = ConvertTo-SecureString 'getflow-synthetic-dpapi-probe' -AsPlainText -Force
$probe = $null
try {
    Save-GetFlowB2Credential -Credential ([System.Management.Automation.PSCredential]::new('synthetic-id', $probeSecret)) -Path $storeProbePath
    $probe = Get-GetFlowB2Credential -Path $storeProbePath
    if ($probe.UserName -cne 'synthetic-id' -or
        ([System.Net.NetworkCredential]::new('', $probe.Password)).Password -cne 'getflow-synthetic-dpapi-probe') {
        throw 'Synthetic DPAPI store validation failed.'
    }
} finally {
    $probeSecret.Dispose()
    if ($null -ne $probe) { $probe.Password.Dispose() }
    Remove-Item -LiteralPath $storeProbePath -Force -ErrorAction SilentlyContinue
}
Write-Host 'PROTECTED_CREDENTIAL_STORE_PREFLIGHT: PASS (Windows DPAPI, current-user ACL, synthetic round-trip)'

$masterKeyIdSecure = Read-Host 'Rotated Backblaze Master Application Key ID (masked)' -AsSecureString
$masterKeySecure = Read-Host 'Rotated Backblaze Master Application Key (masked)' -AsSecureString
$masterKeyId = $null
$masterKey = $null
$auth = $null
$created = $null
$childAuth = $null
$apiBase = $null
$appKeySecure = $null
$credential = $null
$stored = $false
try {
    $masterKeyId = ConvertFrom-GetFlowSecureString $masterKeyIdSecure
    $masterKey = ConvertFrom-GetFlowSecureString $masterKeySecure
    if ([string]::IsNullOrWhiteSpace($masterKeyId) -or [string]::IsNullOrWhiteSpace($masterKey)) {
        throw 'A required protected prompt was empty; no remote key was created.'
    }

    $basic = New-GetFlowB2BasicAuthorizationHeader -ApplicationKeyId $masterKeyId -ApplicationKey $masterKey
    $auth = Invoke-GetFlowB2ApiRequest -Method Get -Uri 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account' `
        -Headers @{ Authorization = $basic }
    $storageApi = $auth.apiInfo.storageApi
    $apiBase = [uri]$storageApi.apiUrl
    if ($apiBase.Scheme -cne 'https' -or $apiBase.Host -notmatch '^api[0-9]+\.backblazeb2\.com$') {
        throw 'Backblaze returned an unexpected API host; no key was created.'
    }

    $masterCapabilities = @($auth.apiInfo.storageApi.allowed.capabilities | ForEach-Object { [string]$_ })
    foreach ($requiredCapability in @('listBuckets', 'listKeys', 'writeKeys')) {
        if ($masterCapabilities -cnotcontains $requiredCapability) {
            throw "The supplied Backblaze credential lacks the required Native API capability '$requiredCapability'; no key was created."
        }
    }

    $bucketResponse = Invoke-GetFlowB2ApiRequest -Method Post -Uri ([uri]($apiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_list_buckets')) `
        -Headers @{ Authorization = [string]$auth.authorizationToken } `
        -Body @{ accountId = [string]$auth.accountId; bucketName = 'getflow-backups-eu' }
    $matchingBucket = @($bucketResponse.buckets | Where-Object {
        $_.bucketName -ceq 'getflow-backups-eu' -and $_.bucketId -ceq 'bac2df27241e261ba31f0d10' -and $_.bucketType -ceq 'allPrivate'
    })
    if ($matchingBucket.Count -ne 1) {
        throw 'Authenticated Backblaze account did not resolve the verified private EU backup bucket; no key was created.'
    }

    $existingNamedKeys = @(Get-GetFlowB2ApplicationKeys -ApiBase $apiBase -AccountId ([string]$auth.accountId) `
        -AuthorizationToken ([string]$auth.authorizationToken) | Where-Object { [string]$_.keyName -ceq 'getflow-backup-restic' })
    if ($existingNamedKeys.Count -gt 0) {
        throw 'An active key named getflow-backup-restic already exists. No key was created; inspect its exact scope in Backblaze before continuing.'
    }

    $confirmation = Read-Host 'Type exactly to create the single restricted file-only key: CREATE getflow-backup-restic'
    if ($confirmation -cne 'CREATE getflow-backup-restic') {
        throw 'Key creation confirmation did not match; no remote key was created.'
    }

    $createPayload = New-GetFlowB2RestrictedKeyPayload -AccountId ([string]$auth.accountId)
    $createPayload.bucketIds = @([string]$matchingBucket[0].bucketId)
    try {
        $created = Invoke-GetFlowB2ApiRequest -Method Post -Uri ([uri]($apiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_create_key')) `
            -Headers @{ Authorization = [string]$auth.authorizationToken } -Body $createPayload
    } catch {
        $createFailureDiagnostic = $_.Exception.Message
        $postFailureMatches = @()
        $postFailureListSucceeded = $false
        # A lost response can mean the server created the key but the client did
        # not receive its one-time secret. Check once, never retry creation.
        try {
            $postFailureMatches = @(Get-GetFlowB2ApplicationKeys -ApiBase $apiBase -AccountId ([string]$auth.accountId) `
                -AuthorizationToken ([string]$auth.authorizationToken) | Where-Object { [string]$_.keyName -ceq 'getflow-backup-restic' })
            $postFailureListSucceeded = $true
            if ($postFailureMatches.Count -gt 0) {
                throw "Backblaze key creation response failed ($createFailureDiagnostic); the named key exists remotely. Do not rerun; inspect and revoke/secure it in Backblaze."
            }
        } catch {
            if ($_.Exception.Message -match 'named key exists remotely') { throw }
        }
        if ($postFailureListSucceeded) {
            throw "Backblaze key creation failed ($createFailureDiagnostic); one follow-up key listing found no matching active key. Do not rerun until the Backblaze console confirms the outcome."
        }
        throw "Backblaze key creation failed ($createFailureDiagnostic); the follow-up key listing also failed. The remote outcome is uncertain; do not rerun until inspected in Backblaze."
    }

    if (-not (Test-GetFlowB2RestrictedKeyMetadata -KeyMetadata $created)) {
        throw 'Backblaze returned an unexpected key scope; the new key will not be used.'
    }
    if ([string]::IsNullOrWhiteSpace([string]$created.applicationKeyId) -or
        [string]::IsNullOrWhiteSpace([string]$created.applicationKey)) {
        throw 'Backblaze returned incomplete one-time key material; the key was not stored or used.'
    }

    # Verify the newly created child key's effective scope before storing it.
    $childBasic = New-GetFlowB2BasicAuthorizationHeader -ApplicationKeyId ([string]$created.applicationKeyId) `
        -ApplicationKey ([string]$created.applicationKey)
    $childAuth = Invoke-GetFlowB2ApiRequest -Method Get -Uri 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account' `
        -Headers @{ Authorization = $childBasic }

    $effectiveScope = $childAuth.apiInfo.storageApi.allowed
    $effectiveBuckets = @($effectiveScope.buckets | ForEach-Object { "{0}|{1}" -f $_.id, $_.name } | Sort-Object)
    $effectiveCapabilities = @($effectiveScope.capabilities | ForEach-Object { [string]$_ } | Sort-Object)
    $expectedEffectiveBuckets = @('bac2df27241e261ba31f0d10|getflow-backups-eu')
    $expectedEffectiveCapabilities = @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles')
    if (($effectiveBuckets -join "`n") -cne ($expectedEffectiveBuckets -join "`n") -or
        ($effectiveCapabilities -join "`n") -cne ($expectedEffectiveCapabilities -join "`n") -or
        [string]$effectiveScope.namePrefix -cne 'getflow-prod-db/') {
        throw 'The effective child-key scope did not exactly match the approved bucket, prefix, and file-only capabilities.'
    }

    $appKeySecure = ConvertTo-SecureString ([string]$created.applicationKey) -AsPlainText -Force
    $credential = [System.Management.Automation.PSCredential]::new([string]$created.applicationKeyId, $appKeySecure)
    Save-GetFlowB2Credential -Credential $credential -Path $credentialPath
    $stored = $true

    Write-Host 'B2_RESTRICTED_KEY: PASS'
    Write-Host 'KEY NAME: getflow-backup-restic'
    Write-Host 'BUCKET/PREFIX: getflow-backups-eu/getflow-prod-db/'
    Write-Host 'CAPABILITIES: deleteFiles, listFiles, readFiles, writeFiles'
    Write-Host 'EFFECTIVE SCOPE: VERIFIED BY CHILD-KEY AUTHORIZATION RESPONSE'
    Write-Host 'SECRET STORAGE: VERIFIED WINDOWS DPAPI (CURRENT USER ONLY)'
} catch {
    if ($null -ne $created -and -not $stored -and -not [string]::IsNullOrWhiteSpace([string]$created.applicationKeyId)) {
        $revoked = $false
        if ($null -ne $apiBase -and $null -ne $auth -and -not [string]::IsNullOrWhiteSpace([string]$auth.authorizationToken)) {
            $revoked = Revoke-GetFlowCreatedB2Key -KeyId ([string]$created.applicationKeyId) -ApiBase $apiBase `
                -AuthorizationToken ([string]$auth.authorizationToken)
        }
        if (-not $revoked) {
            throw 'A restricted key was created but verification/storage did not complete, and safe revocation could not be confirmed. Stop; owner must inspect the named key in Backblaze.'
        }
    }
    throw
} finally {
    $masterKeyIdSecure.Dispose()
    $masterKeySecure.Dispose()
    if ($null -ne $credential) { $credential.Password.Dispose() }
    $masterKeyId = $null
    $masterKey = $null
    $basic = $null
    $childBasic = $null
    $auth = $null
    $childAuth = $null
    $created = $null
}
