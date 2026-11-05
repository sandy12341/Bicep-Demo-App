param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$AutomationPrincipalId,
    [Parameter(Mandatory)][string]$PackagePath,
    [ValidatePattern('^[a-z0-9]{3,12}$')][string]$InstanceName = 'tbcore1',
    [string]$AppTitle = 'Bicep Task Board',
    [ValidatePattern('^[a-zA-Z0-9._-]{1,64}$')][string]$AppCommit = 'manual'
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-Subscription $SubscriptionId
$group = Assert-OwnedGroup $SubscriptionId $ResourceGroupName
if ($group.tags.instance -cne $InstanceName) { throw 'InstanceName must match the bootstrapped application group.' }
if (!(Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw 'Application ZIP package is missing. Run Package.ps1 first.' }
$template = Join-Path (Join-Path $script:ProjectRoot 'infra') 'main.bicep'
$deployment = Invoke-Az @('deployment', 'group', 'create', '--subscription', $SubscriptionId,
    '--resource-group', $ResourceGroupName, '--name', "taskboard-$InstanceName",
    '--template-file', $template, '--parameters',
    "instanceName=$InstanceName", "automationPrincipalId=$AutomationPrincipalId",
    "appTitle=$AppTitle", "appCommit=$AppCommit", '-o', 'json') | ConvertFrom-Json
$outputs = $deployment.properties.outputs
Save-DemoJson $outputs 'deployment.json'
& (Join-Path $PSScriptRoot 'Initialize.ps1') -SubscriptionId $SubscriptionId -ResourceGroupName $ResourceGroupName
Invoke-Az @('webapp', 'deploy', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName,
    '--name', $outputs.appName.value, '--src-path', (Resolve-Path $PackagePath).Path, '--type', 'zip',
    '--clean', 'true', '--restart', 'true', '-o', 'none') | Out-Null
& (Join-Path $PSScriptRoot 'Smoke.ps1') -AppUrl $outputs.appUrl.value -ExpectedCommit $AppCommit
Write-Host "Verified application: $($outputs.appUrl.value)"
if ($env:GITHUB_STEP_SUMMARY) {
    "### Verified deployment`n[$($outputs.appUrl.value)]($($outputs.appUrl.value))`n`nCommit: ``$AppCommit``" |
        Add-Content $env:GITHUB_STEP_SUMMARY
}
