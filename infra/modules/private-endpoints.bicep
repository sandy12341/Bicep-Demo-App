param instanceName string
param suffix string
param tags object
param vnetId string
param subnetId string
param storageAccountId string
param vaultId string

var targets = [
  {
    name: 'table'
    resourceId: storageAccountId
    groupId: 'table'
    zone: 'privatelink.table.${environment().suffixes.storage}'
  }
  {
    name: 'vault'
    resourceId: vaultId
    groupId: 'vault'
    zone: 'privatelink.vaultcore.azure.net'
  }
]

resource zones 'Microsoft.Network/privateDnsZones@2024-06-01' = [for target in targets: {
  name: target.zone
  location: 'global'
  tags: tags
}]

resource links 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [for (target, i) in targets: {
  parent: zones[i]
  name: 'link-${instanceName}-${suffix}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnetId }
  }
}]

resource endpoints 'Microsoft.Network/privateEndpoints@2024-05-01' = [for target in targets: {
  name: 'pe-${target.name}-${instanceName}-${suffix}'
  location: resourceGroup().location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: target.name
        properties: {
          privateLinkServiceId: target.resourceId
          groupIds: [target.groupId]
        }
      }
    ]
  }
}]

resource zoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = [for (target, i) in targets: {
  parent: endpoints[i]
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: target.name
        properties: { privateDnsZoneId: zones[i].id }
      }
    ]
  }
}]
