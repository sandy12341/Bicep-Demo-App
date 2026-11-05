targetScope = 'resourceGroup'

param automationPrincipalId string

resource contributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, automationPrincipalId, 'contributor')
  properties: {
    principalId: automationPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
  }
}

resource roleAssignmentOperator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, automationPrincipalId, 'restricted-role-administrator')
  properties: {
    principalId: automationPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f58310d9-a9f6-439a-9e8d-f62e7b41a168')
    conditionVersion: '2.0'
    condition: '''
    (
      (!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'}))
      OR
      (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, b86a8fe4-44ce-4948-aee5-eccb2c155cd7, 0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3})
    )
    AND
    (
      (!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'}))
      OR
      (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, b86a8fe4-44ce-4948-aee5-eccb2c155cd7, 0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3})
    )
    '''
  }
}
