Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$script:ProjectRoot = Split-Path $PSScriptRoot -Parent

function Invoke-Az {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $result = & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command '$($Arguments[0]) $($Arguments[1])' failed. See the Azure CLI error above."
    }
    return ($result -join [Environment]::NewLine)
}

function Assert-Identifier {
    param([string]$Value, [string]$Name)
    if ($Value -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,89}$') { throw "Invalid $Name." }
}

function Assert-Subscription {
    param([string]$SubscriptionId)
    if ($SubscriptionId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'A subscription UUID is required.' }
    $account = Invoke-Az @('account', 'show', '--subscription', $SubscriptionId, '-o', 'json') | ConvertFrom-Json
    if ($account.state -ne 'Enabled') { throw 'The target subscription is not enabled.' }
    return $account
}

function Assert-OwnedGroup {
    param([string]$SubscriptionId, [string]$ResourceGroupName)
    Assert-Identifier $ResourceGroupName 'resource group name'
    $group = Invoke-Az @('group', 'show', '--subscription', $SubscriptionId, '--name', $ResourceGroupName, '-o', 'json') | ConvertFrom-Json
    if ($group.tags.demo -ne 'bicep-taskboard') { throw 'Refusing to operate on a group without the bicep-taskboard ownership tag.' }
    if ($null -eq $group.tags.PSObject.Properties['workload'] -or $group.tags.workload -cne 'classroom-ready') {
        throw 'Refusing to operate on a legacy/non-EDU group. Bootstrap a fresh Classroom Ready instance; do not retag the old task board.'
    }
    return $group
}

function Save-DemoJson {
    param([object]$Value, [string]$Name)
    $directory = Join-Path $script:ProjectRoot 'artifacts'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $Value | ConvertTo-Json -Depth 30 | Set-Content (Join-Path $directory $Name) -Encoding utf8
}

function Invoke-WithRetry {
    param([scriptblock]$Operation, [int]$Attempts = 8, [int]$DelaySeconds = 15)
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try { return & $Operation } catch {
            if ($attempt -eq $Attempts) { throw }
            Write-Warning "Dependency not ready (attempt $attempt/$Attempts): $($_.Exception.Message)"
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}
