# Private-network adaptation

Status: Validated. User approved implementation and deployment at the revised cost.

## Context

Phase 1 core infrastructure exists in rg-taskboard-demo, West US 3, subscription
29f8c0d1-b7e3-4613-88e2-6fb5b022f546. Enforced management-group policies disable
Storage and Key Vault public access. Application initialization failed; app is not live.

## Proposed approach

Keep the public demonstration UI and B1 plan. Add compliant private connectivity
from App Service to Table Storage and Key Vault. Retain GitHub OIDC, protected PRs,
managed identities, the existing database and separate teardown.

## Architecture and initialization

- Reuse Linux B1 and the existing public HTTPS UI; B1 supports regional VNet integration.
- Add one VNet with a delegated /26 App Service subnet and a separate private-endpoint subnet.
- Add two private endpoints: Storage Table and Key Vault, and the matching private DNS zones/links.
- Explicitly disable public networking on Storage and Key Vault; never change the enforced policy.
- Initialize the table from the app's managed identity inside the VNet at startup.
  Keep the existing atomic seed marker and no-resurrection behavior; expose initialization
  failures explicitly and keep readiness unhealthy until successful.
- Initialize the synthetic Key Vault secret through its documented ARM resource API,
  using GitHub OIDC management-plane permissions already granted. Check metadata first,
  preserve existing values, generate a random value only when absent, and never print it.
  Runtime secret reads remain private and use the app's Secrets User role.
- No self-hosted runner, extra compute, inbound app private endpoint, NAT gateway or policy exemption.
- Use a protected PR and required CI before merge; merge triggers deployment.
- GitHub smoke tests exercise the public API backed by private resources.
- Confirm SCM/FTP basic publishing remains disabled.
- Keep all added resources in rg-taskboard-demo for group teardown; document VNet dependency ordering.

## Cost estimate

USD public list-rate estimate at 730 hours/month, excluding taxes/discounts and usage:

| Component | Monthly baseline |
|---|---:|
| Existing Linux B1 | $12.41 |
| Two standard private endpoints, $0.01/hour each | $14.60 |
| Two private DNS zones, $0.50 each/month | $1.00 |
| Total | $28.01 |

Add Table/Key Vault operations, Private Link data processing, DNS queries and transfer.
Retail pricing confirms the global Standard Private Endpoint hourly meter and private DNS
zone pricing. VNet integration does not require upgrading the plan.

## Validation and boundaries

Recipe: standalone Bicep with Azure CLI and the existing GitHub OIDC workflow.

All validation checks pass:
- Core validation: CLI, authentication, Bicep build, ARM validation and what-if.
- Bicep linting: no compiler/linter warnings.
- Azure Policy validation: preserve the enforced private-only Storage/Key Vault configuration.
- Application lint, types, unit and emulator integration tests.
- Required hosted Validate core check, including desktop/mobile browser tests and script parsing.

- Bicep compile/lint and targeted startup/seed tests, full existing CI, PowerShell parsing.
- Read-only what-if on the trusted main workflow and exact reviewed templates.
- Verify approved private connections, DNS overlay, storage/vault public access disabled,
  five samples, production mode, version, secret status, and live CRUD with cleanup.
- If another enforced policy blocks VNet/private endpoints, stop and disclose it.
- West US 3, subscription and resource groups unchanged; Phase 2 extensions remain deferred.

## Todos

1. Research networking, initialization and existing application lifecycle.
2. Obtain approval for the revised implementation and provisioning cost.
3. Implement Bicep, application lifecycle, workflows and related documentation.
4. Validate in PR, deploy and verify live functionality and private data access.

## 7. Validation Proof

- `npm run validate`: lint, application/test types, five unit/API tests and production build passed.
- `npm run test:storage`: real SDK emulator test passed, including startup initialization and no reseeding.
- Bicep main/bootstrap/example parameters compilation passed without warnings after routing-schema correction.
- All PowerShell scripts parsed successfully.
- Azure validation helper: CLI/auth/build/ARM validation/what-if all passed.
- Exact JSON what-if: ten Creates, three Modifies, zero resource Deletes; two role predictions Unsupported.
  The helper's text-based deletion count included property removals, not resource deletion.
- Activity log verified management-group public-network-disable policies; templates explicitly comply.
- Scoped runtime Table Contributor and Secrets User retained; no broader role assignment is introduced.
- Required hosted CI and live verification remain execution gates, not claimed complete.
