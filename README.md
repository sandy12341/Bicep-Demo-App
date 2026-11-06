# Classroom Ready: District Device Support

A disposable K-12 district device-support application demonstrating Bicep and GitHub Actions through classroom device repair and loaner accountability. **Phase 1 is the core. Phase 2 extensions are deferred.**

**Synthetic data only.** The schools are fictional, asset tags must begin `DEMO-`, and all visitors can modify records. Never enter student/staff identifiers or real school data. This is not a student-record system, a FERPA compliance claim, an authenticated service, or a production-ready district application.

## What you get

- Structured device reporting, school/status filters, Open -> In repair -> Resolved workflow and reopening.
- Six compatible loaners with exclusive assignment, explicit return, and return-before-resolution/deletion enforcement.
- Three fictional schools, five synthetic incidents, district-wide operational counts, deployed commit SHA and sanitized dependency status.
- A staged power-incident urgency PR and independent screen-policy PR, including tested patches and a reproducible merge-conflict walkthrough in [the runbook](docs/demo-runbook.md#pr-demonstration-power-incident-urgency).
- One Node.js/TypeScript App Service hosting both UI and API.
- **Azure Table Storage, not SQL:** no database server, SQL schema, passwords, or database firewall rules.
- Passwordless storage access through managed identity and table-scoped RBAC.
- A synthetic Key Vault secret to demonstrate separation of secrets from application code. It is not needed for incident persistence and its value is never returned.
- Bicep bootstrap/application modules, PR checks, approved what-if, deployment and guarded teardown.

```text
Browser -- HTTPS --> Linux App Service B1 -- VNet/private endpoint --> Table Storage
                                |
                                +-- private endpoint/Key Vault reference --> Key Vault
GitHub Actions -- OIDC --> Bicep + app ZIP deployment + live smoke tests
```

Default Azure region: **West US 3**. No live resources or GitHub repository are created just by installing or testing this project.

## Local UI: no Azure required

Prerequisites: Node.js **22**, npm, and PowerShell 7 for operation scripts.

```powershell
npm ci
npm run build
$env:DEMO_MODE = 'true'
npm start
```

Open **http://localhost:3000**. A local-mode banner explicitly identifies in-memory storage and the placeholder secret. Incidents and loaner assignments reset on restart, but survive browser refresh. Memory mode is refused on Azure App Service; Azure failures never silently switch to memory.

The working tree is the **Standard-priority baseline**. Power/screen urgency is intentionally delivered as separate patches, not pre-enabled, so the PR produces a visible change. Follow the runbook to apply them on separate branches after committing the baseline with your authorization.

Alternatively copy [.env.example](.env.example) to `.env`, then run:

```powershell
node --env-file=.env dist/server.js
```

Use `npm run dev` with the same environment variables for source reload.

## Validation

```powershell
npm run validate
npm run test:storage
npx playwright install chromium
npm run test:browser
az bicep build --file infra\main.bicep --outfile artifacts\main.json
az bicep build --file infra\bootstrap.bicep --outfile artifacts\bootstrap-template.json
```

`test:storage` starts an isolated Azurite Table emulator on loopback port 10002, uses the real Azure Tables SDK, and stops/cleans its own emulator afterward. It verifies atomic seed, CRUD, restart persistence, concurrency/cap, and no resurrection of deleted samples. It refuses to interfere with an existing service on that port. Emulator shared credentials never enter the Azure application configuration. The regular unit suite skips the emulator test; `test:storage` explicitly runs it. Browser tests use explicit local memory mode on port 3100.

CI also parses all operation scripts and compiles the example Bicep parameters. Emulator success does **not** verify actual Azure identity, policy, quota, or GitHub enforcement.

The production-only dependency audit reports no advisories at validation time. The full audit reports moderate advisories in development-only Azurite/linting transitive packages; compatible automatic fixes did not resolve them. Azurite is loopback-only, used with fake test data, and excluded from the production package. Do not apply a forced downgrade or incompatible override just to suppress audit output; review updated tool releases before wider use.

## Repository map

| Path | Purpose |
|---|---|
| [src](src) | Express API, Table/explicit-memory stores, static UI |
| [tests](tests) | API, emulator persistence/concurrency, desktop/mobile browser tests |
| [infra](infra) | Bootstrap and application Bicep, modules, parameter example |
| [scripts](scripts) | Bootstrap, package, preview, deploy, seed, smoke and cleanup |
| [.github/workflows](.github/workflows) | PR validation, approved preview, deploy and destroy |
| [docs/demo-runbook.md](docs/demo-runbook.md) | Customer presentation sequence |

## Azure and GitHub setup

### 1. Select the target and authorize bootstrap

Bootstrap requires permissions to create resource groups, a managed identity/federation, Contributor assignments, and **conditional Role Based Access Control Administrator** assignments. A dedicated demo subscription is preferable. Check subscription policy, provider registrations (`Microsoft.Web`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.ManagedIdentity`), regional SKU availability and quota before provisioning.

Use a **fresh EDU instance**, never the old task-board groups. Existing ownership tags remain; an additional `workload=classroom-ready` group tag is required by all operation scripts. Legacy groups are rejected before mutation, and legacy storage metadata is rejected before seeding. Do not retag/migrate/reset the old instance. Retain its original code and workflow configuration separately if it must continue receiving releases.

No Azure resources, GitHub settings, commits or pushes are made by local validation. Before any push/merge that triggers deployment, verify the repository variables and OIDC identity target the new EDU groups. With read-only GitHub access, obtain collaborator write access or use an independently authorized repository; signing into VS Code does not switch GitHub CLI credentials.

Create/select the intended GitHub repository and push this code only after authorizing that separately. The scripts do not create a remote repository, commit, or push.

```powershell
az login
$subscription = '<subscription-guid>'
$repository = '<owner>/<repository>'
.\scripts\Bootstrap.ps1 -SubscriptionId $subscription -GitHubRepository $repository -Location westus3
```

Bootstrap asks you to type the application group's exact name. Defaults:

Authenticate GitHub CLI (`gh auth login`) with repository access first. Bootstrap reads
the repository OIDC configuration and uses its exact subject prefix, including immutable
owner/repository IDs when enabled. Custom subject templates are rejected explicitly.
For direct Bicep deployment, supply `githubSubjectPrefix` from
`gh api repos/<owner>/<repository>/actions/oidc/customization/sub`
(`sub_claim_prefix` for immutable subjects; `repo:<owner>/<repository>` for legacy subjects).

- Application group: `rg-classroomready-demo`
- Bootstrap identity group: `rg-classroomready-bootstrap`
- Instance: `educr1`

Bootstrap outputs non-secret IDs into ignored `artifacts/bootstrap.json`. Use matching group and instance inputs for later steps.

Automation is **Contributor only on the dedicated application group** plus restricted role-assignment management for three roles: Storage Table Data Contributor, Key Vault Secrets User and Key Vault Secrets Officer. It is not subscription Owner. The restriction permits delegation of those data-access roles within that group, so this is not an identity for shared/production resources.

The app and automation each receive table-scoped Storage Table Data Contributor; only the app gets Key Vault Secrets User. The app seeds its table privately on startup. Automation initializes the synthetic secret through the documented ARM management API, checking metadata and preserving any existing value; it never prints the value. Its existing Contributor role permits that management-plane operation. Automation also retains Secrets Officer on this vault, but GitHub runners have no private data-plane connectivity. The bootstrap identity has federation only for the exact repository's `main` branch and `demo-preview` environment.

### 2. Configure repository variables and protection

Set Actions **repository variables** (IDs are not passwords):

| Variable | Value |
|---|---|
| `AZURE_SUBSCRIPTION_ID` | Bootstrap `subscriptionId.value` |
| `AZURE_TENANT_ID` | Bootstrap `tenantId.value` |
| `AZURE_CLIENT_ID` | Bootstrap `automationClientId.value` |
| `AZURE_PRINCIPAL_ID` | Bootstrap `automationPrincipalId.value` (object ID, not client ID) |
| `AZURE_RESOURCE_GROUP` | `rg-classroomready-demo` or your fresh EDU group |
| `DEMO_INSTANCE` | `educr1` or your fresh EDU instance |

Create the **`demo-preview` GitHub environment**:

- Permit **main only** as a deployment branch.
- Configure required reviewers and prevent self-review where supported.
- Only approve an explicitly reviewed same-repository PR and exact head commit.
- If reviewers are unavailable on your plan/visibility, restrict workflow dispatch to trusted maintainers and disclose that dispatch is not equivalent to independent required approval.

Enable a branch ruleset/protection on `main` requiring a PR and **Validate core** before merging, where supported. Prevent bypass for the intended demo participants. Without this configuration, a red check does not itself block merge. The main deployment reruns its own tests but this is not a substitute for review.

Do not grant untrusted collaborators dispatch/admin access. Never add Azure authentication to fork PR checks or use `pull_request_target` to run candidate code with credentials.

### 3. Deploy

Merge to `main` or dispatch **Deploy core** on `main`. It:

1. Validates and tests the source, emulator integration and desktop/mobile UI.
2. Builds a production ZIP once on Linux; stores it as an artifact.
3. Logs into Azure with OIDC, previews and applies Bicep.
4. Initializes the synthetic secret through ARM without opening the vault's public data endpoint.
5. Deploys the ZIP; the app atomically seeds samples over its private table endpoint with bounded retries. Verifies live HTML, version, readiness, incident lifecycle, reciprocal loaner persistence/return and secret resolution. Smoke checks create and clean up only their own incident; one available Chromebook loaner and spare incident capacity are required.
6. Displays the clickable HTTPS application URL in the run summary.

The deployment uses a built-in runtime, not a Docker image. Linux CI packaging avoids cross-platform dependency surprises. A brief interruption is possible on B1; no slots or zero-downtime guarantee.

ZIP deployment disables Azure CLI's extra Linux startup tracker, which can remain pending
after a successful rollout. Deployment errors still fail the command; the bounded smoke
checks independently require the exact release, healthy dependencies and real CRUD before success.

The operation scripts can also be run by an identity with the same required management/data permissions:

```powershell
npm ci
npm run build
.\scripts\Package.ps1
.\scripts\Preview.ps1 -SubscriptionId $subscription -ResourceGroupName rg-classroomready-demo `
  -AutomationPrincipalId '<automation-object-id>' -AppCommit manual
.\scripts\Deploy.ps1 -SubscriptionId $subscription -ResourceGroupName rg-classroomready-demo `
  -AutomationPrincipalId '<automation-object-id>' -PackagePath artifacts\app.zip -AppCommit manual
```

Prefer Actions for deployment. An interactive operator does **not** automatically inherit the automation identity's Table/Key Vault data roles. Either use approved explicit data-role assignments or run the OIDC workflow. Manual scripts never silently grant the operator data access.

The package command refuses to overwrite a previous `artifacts/package` or `artifacts/app.zip`; archive them or remove only those known staging paths before running again. Keep the application group and instance consistent across runs.

### 4. Preview a PR safely

Dispatch **Approved PR what-if** from `main`, specifying an open same-repository PR number and its exact 40-character head SHA. Review/approve its environment job. Only trusted base-branch scripts run; candidate Bicep is previewed, not candidate scripts.

What-if requires deployment-level permissions; it is not inherently a read-only permission. Predictions can include noise (such as the release SHA) or unresolved runtime values, and are not a guarantee of successful deployment. Review the run logs and exact commit before merge.

## Data behavior

The existing Azure table name `tasks` is retained to avoid changing table-scoped RBAC. Its single `board` partition contains `incident:<UUID>` rows, `loaner:<UUID>` rows and private metadata with seed version 2. Priority is computed by the backend when returning incidents; it is never stored or used to rewrite timestamps.

Atomic ETag-guarded transactions enforce the 100-incident cap and reciprocal loaner assignment/return. Because the SDK's public batch-delete API has no conditional-delete option, assignment also updates metadata: deletion reads metadata before the incident and conditions its transaction on that version. An assignment racing a stale deletion therefore cannot orphan a loaner.

On production startup, the app atomically creates metadata, five incidents and six loaners only in a fresh empty partition. Legacy metadata and nonempty data without a marker are rejected. Repeated deployment preserves edits, deletions, assignments and new incidents. There is no public reset/seed endpoint. The standalone seed utility requires private network connectivity and the proper data role; GitHub does not run it. Do not edit metadata or write rows directly in Storage Explorer.

### API

`/api/tasks` is intentionally retired for this new-instance application.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/catalog` | Controlled schools, device types, issue categories and statuses |
| GET | `/api/incidents` | All incidents with derived `priority` (`standard`/`urgent`) |
| POST | `/api/incidents` | Only `schoolId`, `assetTag`, `deviceType`, `category`; returns Open incident |
| PATCH | `/api/incidents/:id` | Only `status`: `open`, `in-repair`, `resolved`; ordered transitions/reopening |
| DELETE | `/api/incidents/:id` | Delete an incident only without an outstanding loaner |
| GET | `/api/loaners` | Six loaners with reciprocal `incidentId`; empty string means available |
| POST | `/api/incidents/:id/loaner` | Only `loanerId`; compatible exclusive assignment to an unresolved incident |
| DELETE | `/api/incidents/:id/loaner` | Return the incident's assigned loaner |

Validation returns 400, missing records 404, and invalid transitions/assignment conflicts/cap 409. Dependency failures return sanitized 500 responses. IDs are UUIDs, and tags are `DEMO-` plus 1-20 uppercase letters, numbers or hyphens. Filters are client-side; dashboard counts are explicitly district-wide.

## Teardown and recreation

Dispatch **Destroy core** from `main` and type the exact application group name. Or:

```powershell
.\scripts\Destroy.ps1 -SubscriptionId $subscription -ResourceGroupName rg-classroomready-demo `
  -ConfirmResourceGroup rg-classroomready-demo
```

This deletes the **whole dedicated EDU application group and its incident/loaner data**, after checking both ownership and workload tags; it verifies group disappearance. Never add unrelated/shared resources to this group.

The bootstrap identity/group is deliberately retained. Key Vault is soft-deleted and purge-protected for seven days; immediate name reuse/permanent purge is not available. Stopping only the app does not stop App Service plan billing.

To redeploy, rerun bootstrap to recreate the group and its scoped permissions. Choose a **new instance**, for example `educr2`, and update `DEMO_INSTANCE` before deployment to avoid the retained vault name. Normal incremental deployments do not delete resources removed from Bicep; changing instance names in a still-existing group can leave old resources billing.

For separately approved full cleanup after the app group is gone:

```powershell
.\scripts\CleanupBootstrap.ps1 -SubscriptionId $subscription -ResourceGroupName rg-classroomready-demo `
  -BootstrapResourceGroupName rg-classroomready-bootstrap -ConfirmBootstrapGroup rg-classroomready-bootstrap
```

Remove this demo's repository variables and preview environment manually. Subscription deployment-history records may remain; these are not running compute resources. Inspect Azure for soft-deleted vaults and retained platform artifacts.

## Cost and security boundaries

- Fixed costs include App Service B1, two private endpoints and two private DNS zones; Table Storage and Key Vault are usage-priced.
- West US 3 public retail Linux B1 rate checked during implementation: USD 0.017/hour, approximately USD 12.41 for 730 hours, before the additional usage charges below.
- Two standard private endpoints at USD 0.01/hour each add approximately USD 14.60/month; two private DNS zones add USD 1/month. Estimated total baseline: **USD 28.01/month** at 730 hours, plus Private Link data, DNS queries and other usage/taxes. Rates/agreements can change. No NAT gateway or self-hosted runner is provisioned.
- There is no SQL database charge. Refresh **West US 3** retail/subscription pricing before deploying; the earlier SQL-based estimate does not apply.
- Add storage/secret operations, capacity, transfer and GitHub Actions/artifact charges.
- Table Storage and Key Vault public network access is disabled. A dedicated VNet with an App Service-delegated /26 subnet and a separate endpoint subnet provides private access. Private DNS resolves their normal service names to private IPs inside the VNet. The public UI and SCM deployment endpoint remain accessible over HTTPS; SCM/FTP basic publishing remains disabled. No policy exemption or public data-plane exception is needed.
- Teardown disconnects App Service VNet integration before deleting the group, including private endpoints, DNS zones, VNet and incident/loaner data.
- Fake data only. This anonymous district-support demo is not production authentication or tenant isolation. Production use requires separately scoped identity, authorization, audit, retention, accessibility and privacy reviews.
- Health/status never exposes secret values. Secret values are generated outside templates and not uploaded in artifacts.
- `/healthz` is liveness; `/readyz` fails if Table Storage or the Key Vault reference is not ready.

## Phase 2 (not included yet)

Separate dev/test and same-artifact promotion, application rollback/drift scenarios, **an independent storage lifecycle deployment stack** (not the core incident datastore), stack deny settings, isolated Azure Policy and optional Application Insights. None is provisioned by Phase 1.

References: [Tables SDK](https://learn.microsoft.com/en-us/javascript/api/overview/azure/data-tables-readme), [Table Entra authorization](https://learn.microsoft.com/en-us/azure/storage/tables/authorize-access-azure-active-directory), [Key Vault references](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references), [GitHub OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect).
