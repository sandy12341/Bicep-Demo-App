param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$GitHubRepository,
    [string]$Location = 'westus3',
    [string]$ResourceGroupName = 'rg-classroomready-demo',
    [string]$BootstrapResourceGroupName = 'rg-classroomready-bootstrap',
    [ValidatePattern('^[a-z0-9]{3,12}$')][string]$InstanceName = 'educr1'
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$account = Assert-Subscription $SubscriptionId
Assert-Identifier $ResourceGroupName 'application group'
Assert-Identifier $BootstrapResourceGroupName 'bootstrap group'
if ($GitHubRepository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'GitHubRepository must be owner/repository.' }
$oidcJson = & gh api "repos/$GitHubRepository/actions/oidc/customization/sub"
if ($LASTEXITCODE -ne 0) { throw 'Unable to read repository OIDC configuration. Authenticate gh with access to this repository.' }
$oidc = $oidcJson | ConvertFrom-Json
if (-not $oidc.use_default) { throw 'Custom repository OIDC subject templates are not supported by this bootstrap.' }
$subjectPrefix = if ($oidc.use_immutable_subject) { $oidc.sub_claim_prefix } else { "repo:$GitHubRepository" }
if ([string]::IsNullOrWhiteSpace($subjectPrefix)) { throw 'Repository OIDC subject prefix is missing.' }
if ($ResourceGroupName -eq $BootstrapResourceGroupName) { throw 'Application and bootstrap groups must be different.' }
foreach ($name in @($ResourceGroupName, $BootstrapResourceGroupName)) {
    $exists = Invoke-Az @('group', 'exists', '--subscription', $SubscriptionId, '--name', $name, '-o', 'tsv')
    if ($exists.Trim() -eq 'true') {
        $existing = Assert-OwnedGroup $SubscriptionId $name
        if ($existing.tags.instance -cne $InstanceName) {
            # A new instance is allowed only after the old application group was torn down.
            if ($name -eq $ResourceGroupName) { throw 'Existing application group belongs to another instance; tear it down first.' }
        }
        if ($existing.location -cne $Location) { throw "Existing group $name is in a different region." }
    }
}
$confirmation = Read-Host "Create demo groups and GitHub federation in $($account.name), $Location? Type $ResourceGroupName"
if ($confirmation -cne $ResourceGroupName) { throw 'Bootstrap cancelled.' }
$template = Join-Path (Join-Path $script:ProjectRoot 'infra') 'bootstrap.bicep'
$deployment = Invoke-Az @('deployment', 'sub', 'create', '--subscription', $SubscriptionId, '--location', $Location,
    '--name', "taskboard-bootstrap-$InstanceName", '--template-file', $template,
    '--parameters', "location=$Location", "instanceName=$InstanceName", "githubSubjectPrefix=$subjectPrefix",
    "resourceGroupName=$ResourceGroupName", "bootstrapResourceGroupName=$BootstrapResourceGroupName", '-o', 'json') | ConvertFrom-Json
Save-DemoJson $deployment.properties.outputs 'bootstrap.json'
Write-Host 'Bootstrap complete. Non-secret outputs: artifacts/bootstrap.json'
Write-Host 'Configure the repository variables and demo-preview environment as described in README.md.'
