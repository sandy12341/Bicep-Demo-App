param instanceName string
param suffix string
param tags object

var planName = 'asp-${instanceName}-${suffix}'
var appName = 'app-${instanceName}-${suffix}'

resource plan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: planName
  location: resourceGroup().location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    size: 'B1'
    family: 'B'
    capacity: 1
  }
  properties: {
    reserved: true
  }
  tags: tags
}

resource app 'Microsoft.Web/sites@2025-03-01' = {
  name: appName
  location: resourceGroup().location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      scmMinTlsVersion: '1.2'
      alwaysOn: true
      healthCheckPath: '/healthz'
      appCommandLine: 'npm start'
      metadata: [
        {
          name: 'CURRENT_STACK'
          value: 'node'
        }
      ]
    }
  }
  tags: tags
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: app
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: app
  name: 'scm'
  properties: {
    allow: false
  }
}

output appName string = app.name
output appUrl string = 'https://${app.properties.defaultHostName}'
output principalId string = app.identity.principalId
