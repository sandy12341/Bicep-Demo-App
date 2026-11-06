param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$AutomationPrincipalId,
    [ValidatePattern('^[a-z0-9]{3,12}$')][string]$InstanceName = 'educr1',
    [string]$AppTitle = 'Classroom Ready',
    [ValidatePattern('^[a-zA-Z0-9._-]{1,64}$')][string]$AppCommit = 'preview',
    [string]$TemplateFile
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$null = Assert-Subscription $SubscriptionId
$group = Assert-OwnedGroup $SubscriptionId $ResourceGroupName
if ($group.tags.instance -cne $InstanceName) { throw 'InstanceName must match the bootstrapped application group.' }
if (!$TemplateFile) { $TemplateFile = Join-Path (Join-Path $script:ProjectRoot 'infra') 'main.bicep' }
Invoke-Az @('deployment', 'group', 'what-if', '--subscription', $SubscriptionId,
    '--resource-group', $ResourceGroupName, '--template-file', $TemplateFile,
    '--parameters', "instanceName=$InstanceName", "automationPrincipalId=$AutomationPrincipalId",
    "appTitle=$AppTitle", "appCommit=$AppCommit", '--no-pretty-print') | Write-Output
