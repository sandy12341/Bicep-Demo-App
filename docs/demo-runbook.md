# Phase 1 customer demo

## Before presenting

- Complete [setup](../README.md), verify West US 3 quota/policy and authorization.
- Ensure branch rules require **Validate core** and preview environment protection is effective for your GitHub plan.
- Deploy from Actions, verify the clickable URL, and keep the deployment logs open.
- Use only fake data; do not reveal Key Vault values, credentials or Azure tokens.
- Prepare an application PR and a harmless infrastructure-tag PR. Never put deliberately broken code on main.
- Know the exact application group, instance, bootstrap group and teardown confirmation.

## 1. The working application

Open the HTTPS Task Board from the deployment summary. Show five sample tasks, create a task, complete/reopen it, and delete it. Refresh to show persistence. Explain the commit SHA and sanitized storage/secret badges.

Customer message: "This is a real web application backed by a managed data service, not a screenshot."

## 2. Infrastructure as code

Open [main Bicep](../infra/main.bicep): web, storage, vault and settings modules. Show parameters, outputs, deterministic names, shared tags and identity dependencies.

Show the dedicated resource group in Azure. Explain:

- One App Service hosts both frontend and API; no containers or separate frontend service.
- Table Storage avoids a SQL server, schema/administrator setup and database firewall.
- Runtime identity receives access only to the tasks table.
- Key Vault is a separate synthetic secrets demonstration; no password is needed for Table Storage.

Customer message: "The environment and its permissions are reviewed, repeatable code."

## 3. Safe infrastructure preview

Open the prepared PR adding/changing a harmless declared tag. Run **Approved PR what-if** from main for the reviewed PR/head SHA; show reviewer approval where supported, then the predicted changes.

The workflow never deploys PR resources and never executes candidate scripts with Azure credentials. What-if is a prediction, not a guarantee. There can be noise from release/configuration values.

Merge after successful checks/review; show the tag applied in Azure.

## 4. PR-to-live application delivery

Change a visible static UI string in a PR. Show lint, TypeScript, unit/API, Azurite integration, desktop/mobile browser and Bicep checks.

Merge, follow **Deploy core**, and refresh the same URL. Verify the new release SHA and existing task data.

Customer message: "Every release is traceable to a reviewed commit and verified after deployment."

## 5. Show a failed check without breaking the live app

On a demo branch, change title validation to accept whitespace; the existing test should fail. Show the red check and blocked merge **only if branch protection is actually configured**.

Restore correct validation, push, and show green checks. Do not merge a broken change. If enforcement is unsupported or bypassed, disclose that limitation rather than claim the check itself blocks merge.

## 6. Repeatability

Create a recognizable task and edit/delete a sample. Dispatch **Deploy core** again. Show the task persisted and the sample is not resurrected. Explain one-time atomic sample seeding, ETag concurrency, and incremental infrastructure updates.

Customer message: "Redeploying does not mean resetting the data."

## 7. Deliberate cleanup

Explain that all task data will be lost. Dispatch **Destroy core** from main and type the exact application group. Verify its removal in the run and Azure.

Show what remains: bootstrap identity/group and the soft-deleted purge-protected vault. Explain new-instance recreation and separately approved bootstrap cleanup using [the README](../README.md#teardown-and-recreation).

Customer message: "Disposable environments need a verified cleanup path, not just a deploy button."

## Troubleshooting checkpoints

| Symptom | Evidence and response |
|---|---|
| OIDC login fails | Match repository, main ref/environment subject, tenant/client IDs; enforce preview environment branch restrictions |
| Storage/KV initialization receives 403 | Confirm exact identity's table/vault data role and bounded propagation retries; do not enable account keys or broad roles as a shortcut |
| App readiness fails | Inspect sanitized App Service logs and Key Vault reference resolution; verify table initialization and runtime identity |
| App URL responds but pipeline is red | Check live commit, readiness and CRUD; an ARM success alone is not application success |
| Vault name cannot be reused | Purge protection is intentional; re-bootstrap with a fresh instance after teardown |
| Package staging already exists | Preserve previous artifact, or explicitly remove only known package staging and ZIP paths before repackaging |
| App returns 409 when adding | The 100-task demo cap is reached; delete a fake task before retrying |

There are no automatic retries of destructive operations, no public fault/reset endpoint, no automatic data rollback, and no promise of zero-downtime deployment.

## Deferred Phase 2

Dev/test promotion, drift and rollback, independent storage deployment stacks/protection, Azure Policy sandbox and monitoring will be implemented separately. Do not imply those are already present.
