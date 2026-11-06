targetScope = 'resourceGroup'

param instanceName string
param githubSubjectPrefix string
param tags object

resource automation 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${instanceName}'
  location: resourceGroup().location
  tags: tags
}

resource deployFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-deploy-main'
  parent: automation
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: '${githubSubjectPrefix}:ref:refs/heads/main'
  }
}

resource previewFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-preview-demo'
  parent: automation
  dependsOn: [
    deployFederatedCredential
  ]
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: '${githubSubjectPrefix}:environment:demo-preview'
  }
}

output clientId string = automation.properties.clientId
output principalId string = automation.properties.principalId
