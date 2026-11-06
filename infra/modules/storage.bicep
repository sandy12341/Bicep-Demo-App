@minLength(3)
param instanceName string
@minLength(13)
param suffix string
param tags object
param appPrincipalId string
param automationPrincipalId string

var tableContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')

resource account 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: 'st${take(instanceName, 8)}${suffix}'
  location: resourceGroup().location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Disabled'
  }
}

resource service 'Microsoft.Storage/storageAccounts/tableServices@2025-01-01' = {
  parent: account
  name: 'default'
}

resource tasks 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = {
  parent: service
  name: 'tasks'
}

resource appAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: tasks
  name: guid(tasks.id, appPrincipalId, tableContributorRole)
  properties: {
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: tableContributorRole
  }
}

resource automationAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: tasks
  name: guid(tasks.id, automationPrincipalId, tableContributorRole)
  properties: {
    principalId: automationPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: tableContributorRole
  }
}

output storageAccountName string = account.name
output tableEndpoint string = account.properties.primaryEndpoints.table
output tableName string = tasks.name
output storageAccountId string = account.id
