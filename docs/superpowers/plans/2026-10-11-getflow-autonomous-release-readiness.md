# GetFlow Autonomous Release Readiness Plan

> **For agentic workers:** This plan is an evidence-gathering and release-readiness plan. Do not infer deployment or release authority from this plan. Use the project’s existing tests and configuration; use isolated workspaces for any implementation.

**Goal:** Reconcile current GetFlow source, CI, deployment and Android readiness against current evidence, fix only independently safe source defects, and leave Production and public release tracks unchanged.

**Architecture:** Read the four owner-designated reports first, then treat them as historical hypotheses. Parallelize isolated read-only investigations across Git/CI, backend/Clerk, Trigger/Supabase, supply chain, monetization/domain, and Android/QA. The controller validates findings, prioritizes owner-only blockers, and performs or delegates only scoped fixes with fresh tests and review.

**Tech Stack:** Git/GitHub Actions, Node.js 22, Expo SDK 54, Express backend, Supabase, Trigger.dev, Render, Google Play/AdMob.

**Spec:** User request in the current Codex task, “GETFLOW — AUTONOMOUS MASTER ORCHESTRATOR”.

## Global Constraints

- Preserve the current dirty workspace; never reset, clean, stash, rebase, merge, or discard unrelated work.
- Do not expose credentials, tokens, customer data, or private configuration values.
- Read-only Production inspection is permitted; do not change Production configuration/data, deploy, modify billing, or publish releases without explicit target-specific authorization.
- Do not merge into `main` automatically; commit only verified, task-owned files on `ci-integration/verified-fixes`.
- Do not claim tests, builds, deployments, or device validation without fresh evidence.
- Preserve the Android package `com.totsrl.getflo` and the existing release/versioning state.

---

### Task 1: Historical reports and local baseline

**Files:** Read the four reports named in the user request; inspect repository instructions, Git status/diff, current HEAD/branch/remotes, and the existing task ledger. Do not edit source.

- [x] Read `GETFLOW_RELEASE_READINESS_2026_10_11.md`.
- [x] Read `GETFLOW_CLERK_PRODUCTION_HOTFIX_REPORT.md`.
- [x] Read `GETFLOW_SENTRY_ISSUES_TRIAGE.md`.
- [x] Read `GETFLOW_INTERNAL_TESTING_HANDOFF.md`.
- [x] Record the current branch, HEAD, remote, and dirty-worktree inventory.

### Task 2: Git, release branch, and CI

**Files:** Git refs/history; `.github/workflows/**`; repository release scripts. Read-only.

- [x] Verify integration branch/reference ancestry and remote tracking.
- [x] Inspect CI workflow definitions and current provider run state, if authorized access is available.
- [x] Report current blockers and exact evidence without changing Git refs or CI settings.

### Task 3: Render backend and Clerk security

**Files:** `backend-nutritie-ai/routes/**`, auth middleware, deployment configuration. Read-only.

- [x] Verify the current source’s webhook and Supabase identity behavior.
- [x] Read-only probe public health/deployment identity where safely available; do not send mutation requests.
- [x] Compare current runtime evidence with the historical live vulnerable-commit claims.

### Task 4: Trigger.dev and Supabase authentication

**Files:** `backend-nutritie-ai/src/trigger/**`, Supabase client/auth code, migrations and policies. Read-only.

- [x] Verify task identifiers and source-level auth ownership boundaries.
- [x] Keep Production secrets/data/schema and deployed tasks untouched.
- [ ] Verify live deployment/migration/RLS state only after safe read-only access or an isolated integration environment is available.

### Task 5: Dependency vulnerabilities and supply chain

**Files:** frontend/backend manifests and lockfiles; audit policy and CI gates. Read-only first.

- [x] Reconcile present dependency versions and exact-head audit output with the reports.
- [x] Check current upstream advisory/fix status for braces and node-forge.
- [x] Remove broad OSV package-name ignores, which hid future advisories; `auditGate.js` and its existing exception were left untouched. No new exception was created.
- [ ] Execute the modified OSV config with the exact pinned scanner; no local OSV scanner binary is installed.

### Task 6: AdMob, domain, and monetization

**Files:** AdMob config, public-domain/static hosting files, purchase/product integration. Read-only.

- [x] Verify source/config IDs without displaying secrets.
- [x] Read-only verify public `app-ads.txt` and website state.
- [x] Do not alter billing, store listing, account configuration, or domain DNS.

### Task 7: Android build and automated QA

**Files:** `frontend-nutritie/app.json`, `app.config.js`, `eas.json`, native project/permission verifiers, CI tests. Read-only first.

- [x] Verify Android package, SDK/permissions, production profile, existing v29 artifact hash, and local device/tool availability.
- [x] Confirm no connected-device proof; ADB daemon did not start. Current Play/EAS remote counters remain unverified.
- [x] Attempt `permissions:verify` under Node 22.23.3; it failed before manifest verification when the disposable prebuild's `npm ci` exited `Exit handler never called!` and cleaned its temp directory.
- [x] Do not build or upload an AAB in this task; the existing v29 artifact predates some working-tree changes and lacks reliable source fingerprint provenance.

### Task 8: Safe remediation, verification, and final handoff

**Files:** Only files explicitly identified by the evidence-based fix scope; task ledger and a final status report.

- [x] Implement one evidence-based local hardening: remove 29 global package-name ignores from `osv-scanner.toml`; no application code or audit-gate exception changed.
- [ ] Run the exact OSV scanner; blocked locally because the CLI is not installed. Frontend Jest Node 22 attempt was incomplete after the sandbox temp-path failure and a partial elevated retry (seven suites passed, no final summary).
- [ ] Commit only validated task-owned files to `ci-integration/verified-fixes`; Git index is read-only in the default workspace sandbox, so the authorized staging/commit requires elevation. Preserve unverified changes and all user-owned dirty paths.
- [x] Update the task ledger with evidence, statuses, next actions, and exact owner-only blockers.
