param instanceName string
param suffix string
param tags object
param appPrincipalId string
param automationPrincipalId string

var vaultName = 'kv-${take(instanceName, 6)}-${suffix}'
var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var secretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource vault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: vaultName
  location: resourceGroup().location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
  tags: tags
}

resource appSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, appPrincipalId, secretsUserRoleId)
  scope: vault
  properties: {
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
  }
}

resource automationSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, automationPrincipalId, secretsOfficerRoleId)
  scope: vault
  properties: {
    principalId: automationPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsOfficerRoleId)
  }
}

output vaultName string = vault.name
output vaultUri string = vault.properties.vaultUri
