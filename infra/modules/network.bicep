param instanceName string
param suffix string
param tags object

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-${instanceName}-${suffix}'
  location: resourceGroup().location
  tags: tags
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${instanceName}-${suffix}'
  location: resourceGroup().location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.42.0.0/24']
    }
    subnets: [
      {
        name: 'app'
        properties: {
          addressPrefix: '10.42.0.0/26'
          networkSecurityGroup: { id: nsg.id }
          delegations: [
            {
              name: 'app-service'
              properties: { serviceName: 'Microsoft.Web/serverFarms' }
            }
          ]
        }
      }
      {
        name: 'endpoints'
        properties: {
          addressPrefix: '10.42.0.64/26'
          networkSecurityGroup: { id: nsg.id }
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

output appSubnetId string = '${vnet.id}/subnets/app'
output endpointSubnetId string = '${vnet.id}/subnets/endpoints'
output vnetId string = vnet.id
