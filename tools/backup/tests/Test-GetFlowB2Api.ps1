$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$apiModulePath = Join-Path $PSScriptRoot '..\GetFlowB2Api.psm1'
$credentialModulePath = Join-Path $PSScriptRoot '..\GetFlowB2Credential.psm1'
Import-Module $apiModulePath -Force
Import-Module $credentialModulePath -Force
$script:assertions = 0

function Assert-Equal($Expected, $Actual, [string]$Name) {
    if ($Expected -is [array]) {
        if (($Expected -join "`n") -cne ($Actual -join "`n")) { throw "$Name failed." }
    } elseif ($Expected -is [bool]) {
        if ([bool]$Expected -ne [bool]$Actual) { throw "$Name failed." }
    } elseif ($Expected -cne $Actual) {
        throw "$Name failed."
    }
    $script:assertions++
}

$syntheticKeyId = 'synthetic-key-id'
$syntheticKey = 'synthetic-secret-do-not-log'
$expectedBasic = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($syntheticKeyId + ':' + $syntheticKey))
$basic = New-GetFlowB2BasicAuthorizationHeader -ApplicationKeyId $syntheticKeyId -ApplicationKey $syntheticKey
Assert-Equal $expectedBasic $basic 'Backblaze Basic auth encoding follows keyId:key base64'

$script:capturedRequests = [System.Collections.Generic.List[object]]::new()
$mockApi = {
    param($Method, $Uri, $Headers, $BodyJson)
    $script:capturedRequests.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Headers = $Headers; BodyJson = $BodyJson })
    if ($Uri.AbsolutePath.EndsWith('/b2_authorize_account')) {
        return [pscustomobject]@{ accountId = 'abcdef123456'; authorizationToken = 'synthetic-token' }
    }
    if ($Uri.AbsolutePath.EndsWith('/b2_list_buckets')) {
        return [pscustomobject]@{ buckets = @([pscustomobject]@{ bucketId = 'bac2df27241e261ba31f0d10'; bucketName = 'getflow-backups-eu'; bucketType = 'allPrivate' }) }
    }
    if ($Uri.AbsolutePath.EndsWith('/b2_create_key')) {
        return [pscustomobject]@{ applicationKeyId = 'synthetic-child-id'; applicationKey = 'synthetic-child-secret' }
    }
    throw 'Unexpected synthetic API route.'
}.GetNewClosure()

$authUri = [uri]'https://api.backblazeb2.com/b2api/v4/b2_authorize_account'
$authResponse = Invoke-GetFlowB2ApiRequest -Method Get -Uri $authUri -Headers @{ Authorization = $basic } -RequestInvoker $mockApi
Assert-Equal 'abcdef123456' $authResponse.accountId 'authorize account response fixture'
Assert-Equal 'Get' $script:capturedRequests[0].Method 'authorize uses GET'
Assert-Equal $authUri.AbsolutePath $script:capturedRequests[0].Uri.AbsolutePath 'authorize v4 endpoint'
Assert-Equal $expectedBasic $script:capturedRequests[0].Headers.Authorization 'Basic header sent without mutation'
Assert-Equal $null $script:capturedRequests[0].BodyJson 'authorize sends no body'

$apiBase = [uri]'https://api003.backblazeb2.com'
$listBucketsUri = [uri]($apiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_list_buckets')
$bucketResponse = Invoke-GetFlowB2ApiRequest -Method Post -Uri $listBucketsUri -Headers @{ Authorization = 'synthetic-token' } `
    -Body @{ accountId = 'abcdef123456'; bucketName = 'getflow-backups-eu' } -RequestInvoker $mockApi
Assert-Equal 'allPrivate' $bucketResponse.buckets[0].bucketType 'bucket privacy response fixture'
Assert-Equal 'Post' $script:capturedRequests[1].Method 'list buckets uses POST'
$listBucketsBody = $script:capturedRequests[1].BodyJson | ConvertFrom-Json
Assert-Equal 'abcdef123456' $listBucketsBody.accountId 'list buckets sends accountId'
Assert-Equal 'getflow-backups-eu' $listBucketsBody.bucketName 'list buckets narrows by bucket name'
Assert-Equal 'synthetic-token' $script:capturedRequests[1].Headers.Authorization 'list buckets uses auth token'

$restrictedPayload = New-GetFlowB2RestrictedKeyPayload -AccountId 'abcdef123456'
$createUri = [uri]($apiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_create_key')
$null = Invoke-GetFlowB2ApiRequest -Method Post -Uri $createUri -Headers @{ Authorization = 'synthetic-token' } `
    -Body $restrictedPayload -RequestInvoker $mockApi
Assert-Equal 'Post' $script:capturedRequests[2].Method 'create key uses POST'
$createBody = $script:capturedRequests[2].BodyJson | ConvertFrom-Json
Assert-Equal 'getflow-backup-restic' $createBody.keyName 'create request uses approved key name'
Assert-Equal 'bac2df27241e261ba31f0d10' $createBody.bucketIds[0] 'create request restricts exact bucket'
Assert-Equal 'getflow-prod-db/' $createBody.namePrefix 'create request restricts exact prefix'
Assert-Equal @('deleteFiles', 'listFiles', 'readFiles', 'writeFiles') @($createBody.capabilities | Sort-Object) 'create request includes minimum approved file capabilities'
Assert-Equal 's3' $createBody.options[0] 'create request enables required S3 option'
Assert-Equal 'synthetic-token' $script:capturedRequests[2].Headers.Authorization 'create request uses auth token'

# A failed list-keys response must expose only the status and documented code.
$failureException = [System.Exception]::new('synthetic message that must not be shown')
$failureRecord = [System.Management.Automation.ErrorRecord]::new($failureException, 'SyntheticB2Failure', [System.Management.Automation.ErrorCategory]::InvalidOperation, $null)
$failureRecord.ErrorDetails = [System.Management.Automation.ErrorDetails]::new('{"status":403,"code":"unauthorized","message":"synthetic-sensitive-response-body"}')
$safeDiagnostic = Get-GetFlowB2ApiFailureDiagnostic -ErrorRecord $failureRecord -Operation 'b2_list_buckets'
Assert-Equal $true ($safeDiagnostic -match 'b2_list_buckets failed \(HTTP 403, code unauthorized\)') 'diagnostic reports operation, HTTP status and API code'
Assert-Equal $false ($safeDiagnostic -match 'synthetic-sensitive|synthetic message|synthetic-secret|synthetic-token') 'diagnostic suppresses response body and credential sentinels'
$mockHttpFailure = { throw $failureRecord }.GetNewClosure()
$invokeFailureMessage = ''
try {
    $null = Invoke-GetFlowB2ApiRequest -Method Post -Uri $listBucketsUri -Headers @{ Authorization = 'synthetic-token' } `
        -Body @{ accountId = 'abcdef123456'; bucketName = 'getflow-backups-eu' } -RequestInvoker $mockHttpFailure
} catch { $invokeFailureMessage = $_.Exception.Message }
Assert-Equal $true ($invokeFailureMessage -match 'b2_list_buckets failed \(HTTP 403, code unauthorized\)') 'request wrapper returns safe API diagnostic'
Assert-Equal $false ($invokeFailureMessage -match 'synthetic-sensitive|synthetic message|synthetic-secret|synthetic-token') 'request wrapper does not leak diagnostic sentinels'

$transportException = [System.Net.Http.HttpRequestException]::new('synthetic-network-message')
$transportRecord = [System.Management.Automation.ErrorRecord]::new($transportException, 'SyntheticTransportFailure', [System.Management.Automation.ErrorCategory]::ResourceUnavailable, $null)
$safeTransport = Get-GetFlowB2ApiFailureDiagnostic -ErrorRecord $transportRecord -Operation 'b2_authorize_account'
Assert-Equal $true ($safeTransport -match 'network/transport: HttpRequestException') 'transport failures are categorized without messages'
Assert-Equal $false ($safeTransport -match 'synthetic-network-message') 'transport detail is suppressed'

$formatException = [System.FormatException]::new(
    'synthetic-format-message-secret-sentinel',
    [System.InvalidOperationException]::new('synthetic-inner-message-secret-sentinel')
)
$formatRecord = [System.Management.Automation.ErrorRecord]::new(
    $formatException,
    'SyntheticFormatFailure',
    [System.Management.Automation.ErrorCategory]::InvalidData,
    $null
)
$formatDiagnostic = Get-GetFlowB2ApiFailureDiagnostic -ErrorRecord $formatRecord -Operation 'b2_list_buckets'
Assert-Equal $true ($formatDiagnostic -match 'PowerShell/runtime error: FormatException, inner InvalidOperationException') 'format diagnostics identify outer and inner exception types'
Assert-Equal $false ($formatDiagnostic -match 'synthetic-format-message|synthetic-inner-message|synthetic-secret|synthetic-token') 'format diagnostics suppress exception messages and credential sentinels'

$mockFormatFailure = {
    param($Method, $Uri, $Headers, $BodyJson)
    throw [System.FormatException]::new(
        'synthetic-format-message-secret-sentinel',
        [System.InvalidOperationException]::new('synthetic-inner-message-secret-sentinel')
    )
}.GetNewClosure()
$formatInvokeMessage = ''
try {
    $null = Invoke-GetFlowB2ApiRequest -Method Post -Uri $listBucketsUri -Headers @{ Authorization = 'synthetic-token' } `
        -Body @{ accountId = 'abcdef123456'; bucketName = 'getflow-backups-eu' } -RequestInvoker $mockFormatFailure
} catch { $formatInvokeMessage = $_.Exception.Message }
Assert-Equal $true ($formatInvokeMessage -match 'b2_list_buckets failed \(PowerShell/runtime error: FormatException, inner InvalidOperationException') 'request wrapper preserves sanitized FormatException classification'
Assert-Equal $true ($formatInvokeMessage -match ', at [A-Za-z0-9_.-]+:\d+\); response details suppressed\.$') 'request wrapper reports a sanitized source location'
Assert-Equal $false ($formatInvokeMessage -match 'synthetic-format-message|synthetic-inner-message|synthetic-secret|synthetic-token') 'request wrapper suppresses FormatException messages and credentials'

$httpsRejected = $false
try {
    $null = Invoke-GetFlowB2ApiRequest -Method Get -Uri ([uri]'http://api003.backblazeb2.com/b2api/v4/b2_authorize_account') -Headers @{} -RequestInvoker $mockApi
} catch { $httpsRejected = $true }
Assert-Equal $true $httpsRejected 'non-HTTPS API calls rejected before invocation'

$keyListState = [pscustomobject]@{ Page = 0 }
$keyListMock = {
    param($Method, $Uri, $Headers, $BodyJson)
    $keyListState.Page++
    if ($Method -cne 'Get' -or $Uri.AbsolutePath -cnotmatch '/b2_list_keys$' -or $Headers.Authorization -cne 'synthetic-token') {
        throw 'Synthetic list-keys contract mismatch.'
    }
    if ($keyListState.Page -eq 1) {
        if ($Uri.Query -notmatch 'accountId=abcdef123456' -or $Uri.Query -notmatch 'maxKeyCount=1000') { throw 'First key-list query mismatch.' }
        return [pscustomobject]@{ keys = @([pscustomobject]@{ keyName = 'unrelated' }); nextApplicationKeyId = 'synthetic-next-id' }
    }
    if ($Uri.Query -notmatch 'startApplicationKeyId=synthetic-next-id') { throw 'Key-list pagination query mismatch.' }
    return [pscustomobject]@{ keys = @([pscustomobject]@{ keyName = 'getflow-backup-restic' }); nextApplicationKeyId = $null }
}.GetNewClosure()
$allKeys = @(Get-GetFlowB2ApplicationKeys -ApiBase $apiBase -AccountId 'abcdef123456' -AuthorizationToken 'synthetic-token' -RequestInvoker $keyListMock)
Assert-Equal 2 $keyListState.Page 'key listing paginates read-only before key creation'
Assert-Equal 2 $allKeys.Count 'key listing returns keys across pages'
Assert-Equal $true (@($allKeys | Where-Object keyName -CEQ 'getflow-backup-restic').Count -eq 1) 'existing named key is detectable to prevent duplicate creation'

'B2_API_TESTS: PASS (' + $script:assertions + ' assertions)'
