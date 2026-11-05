targetScope = 'resourceGroup'

@description('Short, lowercase deployment instance identifier.')
@minLength(3)
@maxLength(12)
param instanceName string = 'tbcore1'

@description('Object ID of the user-assigned GitHub automation identity.')
param automationPrincipalId string

@description('Deployment-specific commit identifier.')
param appCommit string

@description('Application title shown by the app.')
param appTitle string = 'Taskboard Demo'

var suffix = uniqueString(resourceGroup().id, instanceName)
var tags = {
  demo: 'bicep-taskboard'
  environment: 'demo'
  instance: instanceName
}

module app 'modules/app.bicep' = {
  name: 'app-${suffix}'
  params: {
    instanceName: instanceName
    suffix: suffix
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage-${suffix}'
  params: {
    instanceName: instanceName
    suffix: suffix
    tags: tags
    automationPrincipalId: automationPrincipalId
    appPrincipalId: app.outputs.principalId
  }
}

module vault 'modules/vault.bicep' = {
  name: 'vault-${suffix}'
  params: {
    instanceName: instanceName
    suffix: suffix
    tags: tags
    appPrincipalId: app.outputs.principalId
    automationPrincipalId: automationPrincipalId
  }
}

module settings 'modules/settings.bicep' = {
  name: 'settings-${suffix}'
  params: {
    appName: app.outputs.appName
    tableEndpoint: storage.outputs.tableEndpoint
    tableName: storage.outputs.tableName
    vaultUri: vault.outputs.vaultUri
    appTitle: appTitle
    appCommit: appCommit
  }
}

output appName string = app.outputs.appName
output appUrl string = app.outputs.appUrl
output storageAccountName string = storage.outputs.storageAccountName
output tableEndpoint string = storage.outputs.tableEndpoint
output tableName string = storage.outputs.tableName
output vaultName string = vault.outputs.vaultName
output appPrincipalId string = app.outputs.principalId
output automationPrincipalId string = automationPrincipalId
