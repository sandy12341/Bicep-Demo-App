param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-OwnedGroup $SubscriptionId $ResourceGroupName
$outputs = Get-Content -LiteralPath (Join-Path (Join-Path $script:ProjectRoot 'artifacts') 'deployment.json') -Raw | ConvertFrom-Json
$env:TABLE_STORAGE_ENDPOINT = $outputs.tableEndpoint.value
$env:TABLE_NAME = $outputs.tableName.value
Invoke-WithRetry {
    & node (Join-Path $PSScriptRoot 'seed.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Table initialization failed. Check Table Data Contributor access and RBAC propagation.' }
}
$secretNames = @(Invoke-WithRetry {
    Invoke-Az @('keyvault', 'secret', 'list', '--subscription', $SubscriptionId,
        '--vault-name', $outputs.vaultName.value, '--query', '[].name', '-o', 'json') | ConvertFrom-Json
})
if ('demo-integration-token' -notin $secretNames) {
    $secretFile = [System.IO.Path]::GetTempFileName()
    try {
        $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
        [System.IO.File]::WriteAllText($secretFile, [Convert]::ToBase64String($bytes))
        Invoke-Az @('keyvault', 'secret', 'set', '--subscription', $SubscriptionId,
            '--vault-name', $outputs.vaultName.value, '--name', 'demo-integration-token',
            '--file', $secretFile, '-o', 'none') | Out-Null
    } finally { Remove-Item -LiteralPath $secretFile -Force }
}
Invoke-Az @('rest', '--method', 'post', '--url',
    "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Web/sites/$($outputs.appName.value)/config/configreferences/appsettings/refresh?api-version=2022-03-01",
    '-o', 'none') | Out-Null
