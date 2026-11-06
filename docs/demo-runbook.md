# Classroom Ready: K-12 district device support demo

## Before presenting

- Follow [setup](../README.md) for a **fresh EDU application and bootstrap group**. Never target, retag, reset or destroy the old task-board instance.
- Verify CLI identity, repository write access, new-instance Actions variables/OIDC, quota/policy and environment protections before any separately authorized push, merge or deployment.
- Require **Validate core** and PR review on main where supported. A red check does not itself block merges without enforced rules.
- Use only fictional schools and `DEMO-` tags. All visitors can modify this unauthenticated demo. Never enter student/staff data, credentials or real school data.
- Keep an available Chromebook loaner and spare incident capacity for deployment smoke checks.
- PR validation has no Azure credentials or automatic application preview deployment. Use a local preview; live delivery runs after merging to main.
- Record the baseline commit SHA and fresh deployment URL. GitHub CLI and VS Code authentication are separate.

## The district story

1. Open Classroom Ready. Show the synthetic/local warnings, three fictional schools and six loaners.
2. Report `DEMO-CB-106`, category "Won't power on", at North Creek School.
3. Start repair, assign a compatible Chromebook loaner and show available count falling from six to five. A laptop is not offered; the API also rejects incompatible assignment.
4. Show disabled Resolve/Delete controls and the return-first explanation. Return the loaner, resolve and reopen the incident. Refresh to show persistence.
5. Explain: "This models classroom device continuity and district equipment accountability. We aren't claiming measured instructional-time savings."
6. Delete the added demonstration incident before presenting the controlled priority fixture.

Local mode survives browser refresh, not server restart. Azure storage survives app restart/redeployment; the local banner must never imply Azure persistence.

## Infrastructure and delivery evidence

- Show [main Bicep](../infra/main.bicep) and its modules. One App Service hosts UI/API; Table Storage and Key Vault are private through VNet integration/private endpoints/DNS.
- Explain table-scoped managed-identity RBAC, OIDC automation and the separate synthetic Key Vault secret. No secret value is returned by the UI.
- Present a harmless declared-tag PR and **Approved PR what-if** from main with its exact reviewed head SHA. Candidate resources are not deployed; what-if is a prediction.
- Show PR checks: lint/types, API/domain tests, Azurite concurrency/persistence, desktop/mobile browsers and Bicep/script validation.
- After authorized merge, follow **Deploy core**, check smoke success, and match the live release SHA to the deployed main commit, not necessarily the feature branch SHA.
- Redeploy and show incidents/loaners unchanged. Atomic seed never resurrects deleted samples.
- Cleanup requires the exact fresh group confirmation and loses all its data. Bootstrap identity and purge-protected soft-deleted vault remain; see [teardown](../README.md#teardown-and-recreation).

## PR demonstration: power-incident urgency

### Deliverables and baseline

The worktree is the EDU **Standard-priority baseline**, not the feature pre-applied. The ready-to-apply patches are:

- [Power feature](pr-demo/power-urgency.patch): backend power rule, district-wide urgency card/filter, styling, API/domain and desktop/mobile tests.
- [Screen feature](pr-demo/screen-urgency.patch): independent screen rule and its domain tests, from the same baseline.

Both modify the same empty category-list line in [the domain](../src/store.ts), guaranteeing an overlapping policy edit under normal Git merging. Do not apply both patches sequentially; put them on independent branches.

No patches create commits, branches, PRs, change GitHub settings or deploy. The commands below are **operator steps**, not actions already performed. Commit the baseline only after reviewing the workspace and authorizing its target. Include the Copilot co-author trailer in authored commits.

Use five recognizable fixture IDs (`10000000-0000-4000-8000-000000000001` through `...000005`):

| Asset | School | Issue | Status |
|---|---|---|---|
| DEMO-CB-101 | North | Power | Open |
| DEMO-CB-202 | East | Screen | Open |
| DEMO-LT-103 | North | Keyboard | Open |
| DEMO-LT-304 | West | Connectivity | In repair |
| DEMO-CB-205 | East | Power | Resolved |

Baseline: all five Standard. Power PR: only CB-101 Urgent. Screen branch: only CB-202 Urgent. Combined resolution: exactly two Urgent. Restore fixture statuses through ordinary API/UI actions if a previous presentation changed them; never reset Azure data.

### 1. Prepare independent branches

Start from a clean, committed baseline; replace `<baseline-sha>` with that actual commit. Verify `git status`, `gh api user --jq .login`, remote and new deployment variables first. Do not merge while existing variables target the old task board.

```powershell
git switch -c feature/power-incident-urgency <baseline-sha>
git apply --check docs\pr-demo\power-urgency.patch
git apply docs\pr-demo\power-urgency.patch
npm run validate
npm run test:storage
npm run test:browser
git add src\store.ts src\public tests\power-priority.test.ts tests\power-browser.spec.ts
git commit -m "Prioritize unresolved devices that won't power on" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin feature/power-incident-urgency
gh pr create --base main --head feature/power-incident-urgency --title "Prioritize unresolved devices that won't power on" --body "Adds API-derived urgency for unresolved power incidents, visible badge/count/filter and tests. Existing rows are not rewritten. Fresh EDU deployment only."
```

Open the PR's Files changed and Checks tabs. Locally run `npm start` with `DEMO_MODE=true`; demonstrate the power badge, count of one and Urgent filter. No branch-specific Azure environment was created.

From the same baseline:

```powershell
git switch -c feature/screen-incident-urgency <baseline-sha>
git apply --check docs\pr-demo\screen-urgency.patch
git apply docs\pr-demo\screen-urgency.patch
npm run validate
npm run test:storage
npm run test:browser
git add src\store.ts tests\screen-priority.test.ts
git commit -m "Prioritize unresolved screen damage" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin feature/screen-incident-urgency
gh pr create --base main --head feature/screen-incident-urgency --title "Prioritize unresolved screen damage" --body "Independent district triage requirement: unresolved screen incidents become Urgent. Includes lifecycle tests; no persistence migration."
```

Obtain review and merge the screen PR **first**, with checks passing and the fresh deployment target confirmed. A screen-only baseline shows the Urgent badge but not the new power PR's count/filter.

### 2. Resolve the business-rule conflict

```powershell
git fetch origin
git switch feature/power-incident-urgency
git merge origin/main
git status
```

Show the **actual** conflicted domain file in VS Code's merge editor. Current is the checked-out power feature; Incoming is updated main with screen urgency. Choosing only one drops a district requirement.

Resolve the category line to:

```typescript
const urgentCategories: readonly IssueCategory[] = ['power', 'screen'];
```

Keep `incident.status !== 'resolved'` in the derived priority helper. Preserve both separate category test files. Git may also report nearby incidental conflicts if the baseline was changed; resolve them to retain both requirements, never blindly choose a side.

```powershell
git diff --check
npm run validate
npm run test:storage
npm run test:browser
git add src\store.ts
git commit -m "Merge screen urgency while preserving power triage" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```

No rebase, force push, direct main edits or deliberately broken main code are needed. Update the power PR description: its final rule now includes **both power and screen**. Include before/after screenshots and the tests actually executed.

### 3. Show a concrete outcome

1. Refresh the same fixture: two Urgent incidents, same IDs and stored timestamps. This is read-time classification, not a reseed/migration.
2. Select Urgent and North: only CB-101 appears. The clearly labeled district-wide card stays two.
3. Select West: empty urgency list. Select Resolved + Urgent: empty list, not a falsely urgent closed repair.
4. Restore All schools/All statuses. Start repair on CB-101: count stays two. Return any loaner and resolve: count becomes one. Reopen: count returns to two.
5. Show the backend/domain tests: Power and Screen are Urgent in Open/In repair, Standard when Resolved. Keyboard/Connectivity stay Standard.
6. Optional failed-check demonstration: on a disposable demo branch only, temporarily remove the unresolved-status condition. The resolved-power test must fail. Restore the rule and rerun checks before proposing any merge. Do not weaken live loaner rules.
7. Obtain review and merge the corrected power PR. Follow the fresh-instance deployment and live smoke checks; refresh the UI and match release SHA to the resulting main commit.

Customer message: **"A reviewed business-rule change now surfaces unusable classroom devices, without losing incidents or double-booking equipment."**

Urgent is a fictional triage policy, not an SLA or automated loaner allocation. Local results are not live Azure evidence; if access/authorization is missing, explicitly label live deployment pending.

## Troubleshooting and boundaries

| Symptom | Evidence and response |
|---|---|
| Legacy group refused | Bootstrap fresh EDU groups; never retag the old task board to bypass protection |
| Incompatible table metadata | Use the new instance/table; do not reset or migrate legacy data |
| Assignment returns 409 | Another visitor won the loaner; UI refreshes availability and displays the conflict |
| Resolve/Delete disabled | Return the assigned loaner first |
| Smoke fails for availability/cap | Return a synthetic loaner or delete an unassigned synthetic incident, then rerun; never commandeer another assignment |
| OIDC/private dependency readiness fails | Check exact repository subject, identity roles, DNS/private endpoints and policy; never enable public data networking or broad roles as a shortcut |
| Live UI responds but workflow fails | Inspect live SHA/readiness/lifecycle checks; ARM success is not app success |
| Vault name cannot be reused | Purge protection is intentional; use a new instance after deliberate fresh-group teardown |

No automatic destructive retries, public reset endpoint, rollback guarantee or zero-downtime guarantee. Promotion, drift/rollback, independent storage stacks, monitoring and real district identity/privacy controls are deferred.
