Set-StrictMode -Version Latest

function New-GetFlowB2BasicAuthorizationHeader {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$ApplicationKeyId,
        [Parameter(Mandatory)][string]$ApplicationKey
    )

    if ([string]::IsNullOrWhiteSpace($ApplicationKeyId) -or [string]::IsNullOrWhiteSpace($ApplicationKey)) {
        throw 'Backblaze Basic authorization requires a non-empty key ID and key.'
    }
    if ($ApplicationKeyId -match '[^\x00-\x7f]' -or $ApplicationKey -match '[^\x00-\x7f]') {
        throw 'Backblaze key material must contain ASCII characters for Basic authorization.'
    }

    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($ApplicationKeyId + ':' + $ApplicationKey))
    return 'Basic ' + $encoded
}

function Get-GetFlowB2OperationName {
    [OutputType([string])]
    param([Parameter(Mandatory)][uri]$Uri)

    if ($Uri.AbsolutePath -match '/(b2_[a-z_]+)$') { return [string]$Matches[1] }
    return 'unknown operation'
}

function Get-GetFlowB2ApiFailureDiagnostic {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][System.Management.Automation.ErrorRecord]$ErrorRecord,
        [Parameter(Mandatory)][string]$Operation
    )

    $status = $null
    $code = $null
    try {
        $responseStatus = $ErrorRecord.Exception.Response.StatusCode
        if ($null -ne $responseStatus) {
            $parsedStatus = 0
            if ([int]::TryParse([string]$responseStatus, [ref]$parsedStatus) -and $parsedStatus -ge 100 -and $parsedStatus -le 599) {
                $status = $parsedStatus
            }
        }
    } catch { }

    # Backblaze error bodies include a human-readable message. Parse and retain
    # only its stable numeric status and identifier code; never log its body.
    $responseText = ''
    if ($null -ne $ErrorRecord.ErrorDetails) { $responseText = [string]$ErrorRecord.ErrorDetails.Message }
    if (-not [string]::IsNullOrWhiteSpace($responseText)) {
        try {
            $response = $responseText | ConvertFrom-Json -ErrorAction Stop
            if ($null -eq $status -and $null -ne $response.status) {
                $parsedStatus = 0
                if ([int]::TryParse([string]$response.status, [ref]$parsedStatus) -and $parsedStatus -ge 100 -and $parsedStatus -le 599) {
                    $status = $parsedStatus
                }
            }
            if ([string]$response.code -match '^[a-z0-9_]{1,64}$') { $code = [string]$response.code }
        } catch { }
    }

    if ($null -ne $status -or $null -ne $code) {
        $parts = @()
        if ($null -ne $status) { $parts += "HTTP $status" }
        if ($null -ne $code) { $parts += "code $code" }
        return "Backblaze $Operation failed ($($parts -join ', ')); response details suppressed."
    }

    $exceptionType = $ErrorRecord.Exception.GetType().Name
    if ($exceptionType -notmatch '^[A-Za-z][A-Za-z0-9]{0,63}$') { $exceptionType = 'unknown' }
    $innerExceptionType = $null
    if ($null -ne $ErrorRecord.Exception.InnerException) {
        $innerExceptionType = $ErrorRecord.Exception.InnerException.GetType().Name
        if ($innerExceptionType -notmatch '^[A-Za-z][A-Za-z0-9]{0,63}$') { $innerExceptionType = 'unknown' }
    }

    # Include only a safe PowerShell source location (file leaf and line number).
    # Full exception messages, stack paths, request URIs and response bodies can
    # contain credentials or account-specific data and are intentionally omitted.
    $location = $null
    $safeStackTrace = [string]$ErrorRecord.ScriptStackTrace
    foreach ($stackLine in ($safeStackTrace -split "`r?`n")) {
        if ($stackLine -match '^\s*at\s+[^,\r\n]+,\s+(?<path>[A-Za-z]:\\[^:\r\n]+):\s+line\s+(?<line>\d+)\s*$') {
            $stackPath = [string]$Matches['path']
            $stackLineNumber = [string]$Matches['line']
            $fileName = [System.IO.Path]::GetFileName($stackPath)
            if ($fileName -match '^[A-Za-z0-9_.-]{1,100}$') {
                $location = "$fileName`:$stackLineNumber"
                break
            }
        }
    }
    $details = @($exceptionType)
    if ($null -ne $innerExceptionType) { $details += "inner $innerExceptionType" }
    if ($null -ne $location) { $details += "at $location" }
    $safeDetails = $details -join ', '
    if ($ErrorRecord.Exception -is [System.Net.Http.HttpRequestException] -or
        $ErrorRecord.Exception -is [System.Net.WebException] -or
        $ErrorRecord.Exception -is [System.Threading.Tasks.TaskCanceledException]) {
        return "Backblaze $Operation failed (network/transport: $safeDetails); response details suppressed."
    }
    return "Backblaze $Operation failed (PowerShell/runtime error: $safeDetails); response details suppressed."
}

function Invoke-GetFlowB2ApiRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('Get', 'Post')][string]$Method,
        [Parameter(Mandatory)][uri]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [hashtable]$Body,
        [scriptblock]$RequestInvoker
    )

    if ($Uri.Scheme -cne 'https') { throw 'Backblaze API requests must use HTTPS.' }
    $operation = Get-GetFlowB2OperationName -Uri $Uri
    $bodyJson = $null
    if ($null -ne $Body) { $bodyJson = $Body | ConvertTo-Json -Depth 8 -Compress }

    try {
        if ($null -ne $RequestInvoker) {
            return & $RequestInvoker $Method $Uri $Headers $bodyJson
        }

        $request = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
            ErrorAction = 'Stop'
        }
        if ($null -ne $bodyJson) {
            $request.ContentType = 'application/json'
            $request.Body = $bodyJson
        }
        return Invoke-RestMethod @request
    } catch {
        $diagnostic = Get-GetFlowB2ApiFailureDiagnostic -ErrorRecord $_ -Operation $operation
        throw $diagnostic
    }
}

function Get-GetFlowB2ApplicationKeys {
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory)][uri]$ApiBase,
        [Parameter(Mandatory)][string]$AccountId,
        [Parameter(Mandatory)][string]$AuthorizationToken,
        [scriptblock]$RequestInvoker
    )

    $results = [System.Collections.Generic.List[object]]::new()
    $startKeyId = $null
    $seenStartKeyIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    do {
        if (-not [string]::IsNullOrWhiteSpace($startKeyId) -and -not $seenStartKeyIds.Add($startKeyId)) {
            throw 'Backblaze key listing pagination repeated a cursor; refusing an unsafe key-creation preflight.'
        }
        $query = 'accountId=' + [uri]::EscapeDataString($AccountId) + '&maxKeyCount=1000'
        if (-not [string]::IsNullOrWhiteSpace($startKeyId)) {
            $query += '&startApplicationKeyId=' + [uri]::EscapeDataString($startKeyId)
        }
        $uri = [uri]($ApiBase.AbsoluteUri.TrimEnd('/') + '/b2api/v4/b2_list_keys?' + $query)
        $response = Invoke-GetFlowB2ApiRequest -Method Get -Uri $uri `
            -Headers @{ Authorization = $AuthorizationToken } -RequestInvoker $RequestInvoker
        foreach ($key in @($response.keys)) { [void]$results.Add($key) }
        $startKeyId = [string]$response.nextApplicationKeyId
    } while (-not [string]::IsNullOrWhiteSpace($startKeyId))

    return $results.ToArray()
}

Export-ModuleMember -Function @(
    'New-GetFlowB2BasicAuthorizationHeader',
    'Get-GetFlowB2OperationName',
    'Get-GetFlowB2ApiFailureDiagnostic',
    'Invoke-GetFlowB2ApiRequest',
    'Get-GetFlowB2ApplicationKeys'
)
