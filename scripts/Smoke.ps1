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
$task = $null
try {
    $task = Invoke-RestMethod "$base/api/tasks" -Method Post -ContentType 'application/json' `
        -Body (@{ title = "Smoke $([guid]::NewGuid().ToString('N').Substring(0,8))" } | ConvertTo-Json)
    $updated = Invoke-RestMethod "$base/api/tasks/$($task.id)" -Method Patch -ContentType 'application/json' -Body '{"completed":true}'
    if (!$updated.completed) { throw 'Table-backed task update failed.' }
    $tasks = Invoke-RestMethod "$base/api/tasks"
    if ($task.id -notin $tasks.id) { throw 'Created task was not persisted.' }
} finally {
    if ($task) { Invoke-RestMethod "$base/api/tasks/$($task.id)" -Method Delete | Out-Null }
}
Write-Host 'Live UI, version, readiness, Table Storage CRUD, and Key Vault checks passed.'
