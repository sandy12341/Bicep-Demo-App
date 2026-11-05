param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$BootstrapResourceGroupName,
    [Parameter(Mandatory)][string]$ConfirmBootstrapGroup
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-Subscription $SubscriptionId
$null = Assert-OwnedGroup $SubscriptionId $BootstrapResourceGroupName
if ($BootstrapResourceGroupName -ceq $ResourceGroupName -or $ConfirmBootstrapGroup -cne $BootstrapResourceGroupName) {
    throw 'Full cleanup requires a different bootstrap group and its exact name as confirmation.'
}
$appExists = Invoke-Az @('group', 'exists', '--subscription', $SubscriptionId, '--name', $ResourceGroupName, '-o', 'tsv')
if ($appExists.Trim() -ne 'false') { throw 'Delete and verify the application group before removing its deployment identity.' }
Invoke-Az @('group', 'delete', '--subscription', $SubscriptionId, '--name', $BootstrapResourceGroupName, '--yes') | Out-Null
$exists = Invoke-Az @('group', 'exists', '--subscription', $SubscriptionId, '--name', $BootstrapResourceGroupName, '-o', 'tsv')
if ($exists.Trim() -ne 'false') { throw 'Bootstrap resource group still exists.' }
Write-Host 'Bootstrap group and federation removed. Remove only this demo repository variables/environment separately.'
