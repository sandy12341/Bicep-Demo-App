param appName string
param tableEndpoint string
param tableName string
param vaultUri string
param appTitle string
param appCommit string

resource app 'Microsoft.Web/sites@2025-03-01' existing = {
  name: appName
}

resource config 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    TABLE_STORAGE_ENDPOINT: tableEndpoint
    TABLE_NAME: tableName
    APP_TITLE: appTitle
    APP_COMMIT: appCommit
    DEMO_MODE: 'false'
    NODE_ENV: 'production'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    WEBSITE_RUN_FROM_PACKAGE: '1'
    DEMO_INTEGRATION_SECRET: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/demo-integration-token/)'
  }
}
