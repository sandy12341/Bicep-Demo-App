param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-OwnedGroup $SubscriptionId $ResourceGroupName
$outputs = Get-Content -LiteralPath (Join-Path (Join-Path $script:ProjectRoot 'artifacts') 'deployment.json') -Raw | ConvertFrom-Json
$vaultResource = "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.KeyVault/vaults/$($outputs.vaultName.value)"
$secretNames = @(Invoke-Az @('rest', '--method', 'get', '--url', "$vaultResource/secrets?api-version=2025-05-01",
    '--query', 'value[].name', '-o', 'json') | ConvertFrom-Json | ForEach-Object { ($_ -split '/')[-1] })
if ('demo-integration-token' -notin $secretNames) {
    $secretFile = [System.IO.Path]::GetTempFileName()
    try {
        $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
        $body = @{ properties = @{ value = [Convert]::ToBase64String($bytes) } } | ConvertTo-Json -Depth 3
        [System.IO.File]::WriteAllText($secretFile, $body)
        Invoke-Az @('rest', '--method', 'put', '--url', "$vaultResource/secrets/demo-integration-token?api-version=2025-05-01",
            '--headers', 'Content-Type=application/json', '--body', "@$secretFile", '-o', 'none') | Out-Null
    } finally { Remove-Item -LiteralPath $secretFile -Force }
}
Invoke-Az @('rest', '--method', 'post', '--url',
    "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Web/sites/$($outputs.appName.value)/config/configreferences/appsettings/refresh?api-version=2022-03-01",
    '-o', 'none') | Out-Null
