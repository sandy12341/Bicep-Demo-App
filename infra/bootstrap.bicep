targetScope = 'subscription'

@description('Deployment location for the bootstrap resource group.')
param location string = 'westus3'

@description('Lowercase deployment instance identifier.')
param instanceName string = 'tbcore1'

@description('Exact GitHub repository owner/name.')
param githubRepository string

param resourceGroupName string = 'rg-taskboard-demo'
param bootstrapResourceGroupName string = 'rg-taskboard-bootstrap'

var tags = {
  demo: 'bicep-taskboard'
  environment: 'demo'
  instance: instanceName
}

resource appRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

resource bootstrapRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: bootstrapResourceGroupName
  location: location
  tags: tags
}

module automation 'modules/bootstrap-identity.bicep' = {
  name: 'automation-identity-${instanceName}'
  scope: bootstrapRg
  params: {
    instanceName: instanceName
    githubRepositoryOwner: split(githubRepository, '/')[0]
    githubRepositoryName: split(githubRepository, '/')[1]
    tags: tags
  }
}

module appRoles 'modules/bootstrap-app-roles.bicep' = {
  name: 'automation-roles-${instanceName}'
  scope: appRg
  params: {
    automationPrincipalId: automation.outputs.principalId
  }
}

output resourceGroupName string = appRg.name
output bootstrapResourceGroupName string = bootstrapRg.name
output automationClientId string = automation.outputs.clientId
output automationPrincipalId string = automation.outputs.principalId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
