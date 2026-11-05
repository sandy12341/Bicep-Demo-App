param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$ConfirmResourceGroup
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-Subscription $SubscriptionId
$null = Assert-OwnedGroup $SubscriptionId $ResourceGroupName
if ($ConfirmResourceGroup -cne $ResourceGroupName) { throw 'Teardown requires an exact resource group confirmation.' }
if ($ResourceGroupName -match '(?i)bootstrap') { throw 'This command never deletes bootstrap groups. Use separately authorized cleanup.' }
Write-Warning "Deleting $ResourceGroupName, including ALL task data. Key Vault remains soft-deleted and purge-protected."
Invoke-Az @('group', 'delete', '--subscription', $SubscriptionId, '--name', $ResourceGroupName, '--yes') | Out-Null
$exists = Invoke-Az @('group', 'exists', '--subscription', $SubscriptionId, '--name', $ResourceGroupName, '-o', 'tsv')
if ($exists.Trim() -ne 'false') { throw 'Resource group still exists; teardown is not complete.' }
Write-Host 'Application resource group deletion verified. Bootstrap identity is retained; inspect soft-deleted resources and retained backups.'
