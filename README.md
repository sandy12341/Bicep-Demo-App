# Bicep Task Board

A disposable browser application for demonstrating Bicep and GitHub Actions. **Phase 1 is the core. Phase 2 extensions are deferred.**

## What you get

- A responsive task board: add, complete, reopen, delete, filter, and view counts.
- Five fake sample tasks, deployed commit SHA, and sanitized dependency status.
- One Node.js/TypeScript App Service hosting both UI and API.
- **Azure Table Storage, not SQL:** no database server, SQL schema, passwords, or database firewall rules.
- Passwordless storage access through managed identity and table-scoped RBAC.
- A synthetic Key Vault secret to demonstrate separation of secrets from application code. It is not needed for task persistence and its value is never returned.
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

Open **http://localhost:3000**. A local-mode banner explicitly identifies in-memory storage and the placeholder secret. Tasks reset on restart. Memory mode is refused on Azure App Service; Azure failures never silently switch to memory.

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

- Application group: `rg-taskboard-demo`
- Bootstrap identity group: `rg-taskboard-bootstrap`
- Instance: `tbcore1`

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
| `AZURE_RESOURCE_GROUP` | `rg-taskboard-demo` or your chosen group |
| `DEMO_INSTANCE` | `tbcore1` or your chosen instance |

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
5. Deploys the ZIP; the app atomically seeds samples over its private table endpoint with bounded retries. Verifies live HTML, version, readiness, storage CRUD and secret resolution.
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
.\scripts\Preview.ps1 -SubscriptionId $subscription -ResourceGroupName rg-taskboard-demo `
  -AutomationPrincipalId '<automation-object-id>' -AppCommit manual
.\scripts\Deploy.ps1 -SubscriptionId $subscription -ResourceGroupName rg-taskboard-demo `
  -AutomationPrincipalId '<automation-object-id>' -PackagePath artifacts\app.zip -AppCommit manual
```

Prefer Actions for deployment. An interactive operator does **not** automatically inherit the automation identity's Table/Key Vault data roles. Either use approved explicit data-role assignments or run the OIDC workflow. Manual scripts never silently grant the operator data access.

The package command refuses to overwrite a previous `artifacts/package` or `artifacts/app.zip`; archive them or remove only those known staging paths before running again. Keep the application group and instance consistent across runs.

### 4. Preview a PR safely

Dispatch **Approved PR what-if** from `main`, specifying an open same-repository PR number and its exact 40-character head SHA. Review/approve its environment job. Only trusted base-branch scripts run; candidate Bicep is previewed, not candidate scripts.

What-if requires deployment-level permissions; it is not inherently a read-only permission. Predictions can include noise (such as the release SHA) or unresolved runtime values, and are not a guarantee of successful deployment. Review the run logs and exact commit before merge.

## Data behavior

The `tasks` table contains a single `board` partition. UUID task rows and one private metadata row hold the task count/seed version. Transactional batches with conditional ETags keep the 100-task cap authoritative under concurrency.

On production startup, the app atomically creates the metadata and exactly five samples over private connectivity if no seed marker exists. Startup retries dependency errors with sanitized logs and fails explicitly if initialization cannot complete; it does not serve a healthy API before initialization. Repeated deployment preserves all edits, deletions and new tasks. There is no public reset/seed endpoint. The standalone seed utility requires private network connectivity and the proper data role; GitHub does not run it. To start over, deliberately destroy/recreate the disposable environment; ordinary app deployment never resets data.

Do not edit metadata or write tasks directly in Storage Explorer. The API owns the count invariant. Metadata/data inconsistencies produce explicit errors rather than an invented successful response.

## Teardown and recreation

Dispatch **Destroy core** from `main` and type the exact application group name. Or:

```powershell
.\scripts\Destroy.ps1 -SubscriptionId $subscription -ResourceGroupName rg-taskboard-demo `
  -ConfirmResourceGroup rg-taskboard-demo
```

This deletes the **whole dedicated application group and its task data**, after checking its ownership tag; it verifies group disappearance. Never add unrelated/shared resources to this group.

The bootstrap identity/group is deliberately retained. Key Vault is soft-deleted and purge-protected for seven days; immediate name reuse/permanent purge is not available. Stopping only the app does not stop App Service plan billing.

To redeploy, rerun bootstrap to recreate the group and its scoped permissions. Choose a **new instance**, for example `tbcore2`, and update `DEMO_INSTANCE` before deployment to avoid the retained vault name. Normal incremental deployments do not delete resources removed from Bicep; changing instance names in a still-existing group can leave old resources billing.

For separately approved full cleanup after the app group is gone:

```powershell
.\scripts\CleanupBootstrap.ps1 -SubscriptionId $subscription -ResourceGroupName rg-taskboard-demo `
  -BootstrapResourceGroupName rg-taskboard-bootstrap -ConfirmBootstrapGroup rg-taskboard-bootstrap
```

Remove this demo's repository variables and preview environment manually. Subscription deployment-history records may remain; these are not running compute resources. Inspect Azure for soft-deleted vaults and retained platform artifacts.

## Cost and security boundaries

- Fixed costs include App Service B1, two private endpoints and two private DNS zones; Table Storage and Key Vault are usage-priced.
- West US 3 public retail Linux B1 rate checked during implementation: USD 0.017/hour, approximately USD 12.41 for 730 hours, before the additional usage charges below.
- Two standard private endpoints at USD 0.01/hour each add approximately USD 14.60/month; two private DNS zones add USD 1/month. Estimated total baseline: **USD 28.01/month** at 730 hours, plus Private Link data, DNS queries and other usage/taxes. Rates/agreements can change. No NAT gateway or self-hosted runner is provisioned.
- There is no SQL database charge. Refresh **West US 3** retail/subscription pricing before deploying; the earlier SQL-based estimate does not apply.
- Add storage/secret operations, capacity, transfer and GitHub Actions/artifact charges.
- Table Storage and Key Vault public network access is disabled. A dedicated VNet with an App Service-delegated /26 subnet and a separate endpoint subnet provides private access. Private DNS resolves their normal service names to private IPs inside the VNet. The public UI and SCM deployment endpoint remain accessible over HTTPS; SCM/FTP basic publishing remains disabled. No policy exemption or public data-plane exception is needed.
- Teardown disconnects App Service VNet integration before deleting the group, including private endpoints, DNS zones, VNet and task data.
- Fake data only. This anonymous task board is a disposable demonstration, not production authentication or tenant isolation.
- Health/status never exposes secret values. Secret values are generated outside templates and not uploaded in artifacts.
- `/healthz` is liveness; `/readyz` fails if Table Storage or the Key Vault reference is not ready.

## Phase 2 (not included yet)

Separate dev/test and same-artifact promotion, application rollback/drift scenarios, **an independent storage lifecycle deployment stack** (not the core task datastore), stack deny settings, isolated Azure Policy and optional Application Insights. None is provisioned by Phase 1.

References: [Tables SDK](https://learn.microsoft.com/en-us/javascript/api/overview/azure/data-tables-readme), [Table Entra authorization](https://learn.microsoft.com/en-us/azure/storage/tables/authorize-access-azure-active-directory), [Key Vault references](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references), [GitHub OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect).
