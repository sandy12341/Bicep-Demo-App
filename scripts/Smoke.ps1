param(
    [Parameter(Mandatory)][string]$AppUrl,
    [Parameter(Mandatory)][string]$ExpectedCommit
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$base = $AppUrl.TrimEnd('/')
Invoke-WithRetry {
    $ready = Invoke-RestMethod "$base/readyz" -TimeoutSec 20
    if ($ready.status -ne 'ok') { throw 'Application readiness is not healthy.' }
} -Attempts 12 -DelaySeconds 15
$live = Invoke-RestMethod "$base/healthz" -TimeoutSec 20
if ($live.status -ne 'ok') { throw 'Liveness check failed.' }
$page = Invoke-WebRequest $base -TimeoutSec 20
if ($page.StatusCode -ne 200 -or $page.Content -notmatch '(?i)<!doctype html') { throw 'Browser page did not respond with HTML.' }
$info = Invoke-RestMethod "$base/api/info" -TimeoutSec 20
if ($info.commit -cne $ExpectedCommit -or !$info.secretConfigured -or !$info.databaseConnected -or $info.localDemo) {
    throw 'Deployed commit, Table Storage connectivity, Key Vault resolution, or production-mode verification failed.'
}
$incident = $null
try {
    $loaners = Invoke-RestMethod "$base/api/loaners"
    $loaner = $loaners | Where-Object { !$_.incidentId -and $_.deviceType -ceq 'chromebook' } | Select-Object -First 1
    if (!$loaner) { throw 'No compatible loaner is available for the smoke test. Return a synthetic loaner and rerun.' }
    $incident = Invoke-RestMethod "$base/api/incidents" -Method Post -ContentType 'application/json' `
        -Body (@{ schoolId = 'north'; assetTag = "DEMO-SMOKE-$([guid]::NewGuid().ToString('N').Substring(0,8).ToUpperInvariant())"; deviceType = 'chromebook'; category = 'power' } | ConvertTo-Json)
    $updated = Invoke-RestMethod "$base/api/incidents/$($incident.id)" -Method Patch -ContentType 'application/json' -Body '{"status":"in-repair"}'
    if ($updated.status -cne 'in-repair') { throw 'Table-backed incident status update failed.' }
    $assigned = Invoke-RestMethod "$base/api/incidents/$($incident.id)/loaner" -Method Post -ContentType 'application/json' `
        -Body (@{ loanerId = $loaner.id } | ConvertTo-Json)
    $saved = (Invoke-RestMethod "$base/api/incidents") | Where-Object id -CEQ $incident.id
    $inventory = (Invoke-RestMethod "$base/api/loaners") | Where-Object id -CEQ $loaner.id
    if ($assigned.loanerId -cne $loaner.id -or $saved.loanerId -cne $loaner.id -or $inventory.incidentId -cne $incident.id) {
        throw 'Reciprocal incident/loaner persistence verification failed.'
    }
    $returned = Invoke-RestMethod "$base/api/incidents/$($incident.id)/loaner" -Method Delete
    if ($returned.loanerId) { throw 'Loaner return failed.' }
    $inventory = (Invoke-RestMethod "$base/api/loaners") | Where-Object id -CEQ $loaner.id
    if ($inventory.incidentId) { throw 'Returned loaner is not available.' }
    $resolved = Invoke-RestMethod "$base/api/incidents/$($incident.id)" -Method Patch -ContentType 'application/json' -Body '{"status":"resolved"}'
    if ($resolved.status -cne 'resolved') { throw 'Incident resolution failed.' }
} finally {
    if ($incident) {
        $saved = (Invoke-RestMethod "$base/api/incidents") | Where-Object id -CEQ $incident.id
        if ($saved -and $saved.loanerId) {
            Invoke-RestMethod "$base/api/incidents/$($incident.id)/loaner" -Method Delete | Out-Null
        }
        if ($saved) { Invoke-RestMethod "$base/api/incidents/$($incident.id)" -Method Delete | Out-Null }
    }
}
Write-Host 'Live UI, version, readiness, incident lifecycle, loaner persistence/return, and Key Vault checks passed.'
