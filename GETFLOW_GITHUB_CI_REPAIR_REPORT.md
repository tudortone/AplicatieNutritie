# GETFLOW GITHUB CI REPAIR & LEAKED SECRET REMEDIATION REPORT

**Date:** 10 October 2026  
**Repository:** `tudortone/AplicatieNutritie` (GetFlow)  
**Package:** `com.totsrl.getflo`  
**Integration Branch:** `ci-integration/verified-fixes`  
**Integration HEAD Commit:** `af1c4c1` (`feat(coach): integrate verified AI Coach to Journal flow, locale namespace alignment, and regression tests`)  
**Latest CI Run ID:** `38073819381` (Triggered on integration branch commit `9a35568`)

---

## EXECUTIVE SUMMARY & STATUS DELIVERABLE

```yaml
DEEPSEEK KEY:
REVOKED (Confirmed revoked by Product Owner; independently verified via TruffleHog live probe in GitHub Actions CI Run 38070531135 Job 114266829069 where probe was rejected by DeepSeek with HTTP 401 and secret scan completed SUCCESS)

OTHER EXPOSED SECRETS:
NONE (Zero other credentials detected across full repository history by TruffleHog)

CURRENT SOURCE SECRET EXPOSURE:
NONE (Zero references to DeepSeek, plaintext keys, or leaked credentials exist in current source, configs, or documentation)

HISTORICAL SECRET EXPOSURE:
CONFIRMED HISTORICAL & INERT (Introduced in commit 4f049854 on 2026-07-06 in backend-nutritie-ai/server.js:239; subsequently removed in commit 28373b5d; now permanently revoked at provider level)

SECRET SCANNING:
PASS (GitHub Actions TruffleHog job 114266829069 completed SUCCESS with 0 verified secrets detected)

BACKEND CI:
PASS (Job 114266829122: npm audit 0 vulnerabilities, ESLint clean, 74/74 Jest suites passed, 725/725 tests passed; @clerk/express uninstalled)

RLS CI:
PASS (Job 114266829162: Supabase Postgres 15.6.1 real multi-tenant isolation verified across all 12 tables)

FRONTEND CI:
FAIL (Job 114266829100: Typecheck PASS, Lint PASS; failed at Step 7 auditGate.js due to upstream braces <=3.0.3; functional app code 100% clean across 155 suites)

DEPENDENCY SCAN:
FAIL (Job 114266828995: osv-scanner detected GHSA-vfj7-8cjw-p6xm on build-time braces <=3.0.3 with no upstream fix)

CLERK RETIREMENT:
RETIRED LOCALLY (@clerk/express uninstalled, boot credentials made optional, webhook contained to dead-letter logging with 0 PII; Supabase Auth canonical)

SENTRY MONITORING:
VERIFIED & PRESERVED (Frontend and backend SDKs active, enterprise health-data scrubbing enforced, recommendation KEEP)

INTEGRATION BRANCH:
ci-integration/verified-fixes (HEAD commit: af1c4c1)

SAFE TO MERGE:
NO (Pending Product Owner formal risk authorization of build-time braces advisory before merge to main)

PRODUCTION DEPLOYMENT:
NOT PERFORMED (Zero deployments to Render, Vercel, Trigger.dev, Supabase, or Google Play EAS)

OWNER ACTION REQUIRED:
1. [COMPLETED] DeepSeek API key revocation: COMPLETED & VERIFIED IN CI.
2. Review and formally approve a time-limited build-time exception for braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) in auditGate.js and osv-scanner.toml, or wait for upstream maintainer patch.
3. Review and authorize urgent production deployment of Clerk containment hotfix and package retirement (commit dbe9b5a) to Render.
```

---

## 1. PRIORITY 0: HISTORICAL DEEPSEEK CREDENTIAL REVOCATION & VERIFICATION

### 1.1 Remediation & Live CI Verification
- **Incident Scope:** TruffleHog `v3.96.0` (`--only-verified`, `fetch-depth: 0`) in earlier CI Run `38068263242` flagged a historical key in commit `4f049854a646e908d727f4479f57b89e7f490704` (authored 2026-07-06 in `backend-nutritie-ai/server.js:239`).
- **Owner Action:** The Product Owner executed revocation in the DeepSeek account dashboard.
- **Independent Automated Verification:** In GitHub Actions CI Run `38070531135`, Job `114266829069` (`Secret Scanning`):
  - TruffleHog executed with `--only-verified` across the full Git history (`fetch-depth: 0`).
  - TruffleHog probed the DeepSeek authentication endpoint with the historical key string.
  - DeepSeek servers rejected the credential as revoked/invalid (`HTTP 401`).
  - **Result: Job 114266829069 completed with conclusion SUCCESS (Exit code 0, 0 verified secrets).**

### 1.2 Current Source vs. Historical Commits
- **Active Code Exposure:** **NONE.** Full repository inspection confirms zero occurrences of the key pattern in current codebase, environment files, EAS secrets, Render manifests, or documentation.
- **Historical Git Record:** While the inert string remains in commit `4f049854` (July 2026), it can no longer be abused because it is dead at the provider.
- **History Rewriting Policy:** Per `AGENTS.md` Rule 5 ("Nu folosi force-push, reset distructiv sau rescrierea istoricului"), Git history was not rewritten. Provider revocation completely neutralizes the credential risk without breaking collaborator repositories or invalidating commit signatures.

---

## 2. PRIORITY 1: PRODUCTION PROTECTION, CLERK RETIREMENT & SENTRY AUDIT

- **No Production Deployments:** No deployments were executed to Render, Trigger.dev, Supabase, or EAS.
- **Production Vulnerability Status:** The currently deployed live backend on Render (`nutritie-backend-ai.onrender.com`) still runs older commit `f0d066c977df863de584b4fc4eb52d74a1778349` containing the uncontained Clerk webhook handler. Under certain Clerk webhook payloads, this older version could trigger unwanted account mutations.
- **Local Containment & Retirement Status:** Fully contained and completed on `ci-integration/verified-fixes` in commits `18875e3` and `dbe9b5a`:
  - `backend-nutritie-ai/package.json`: `@clerk/express` uninstalled and removed; audited clean with 0 vulnerabilities.
  - `backend-nutritie-ai/config/env.js`: `CLERK_SECRET_KEY` and webhook secret made optional on production boot.
  - `backend-nutritie-ai/routes/webhooks.js`: Hardened webhook signature verification; contained to dead-letter logging with 0 PII; ignores delete events.
  - `backend-nutritie-ai/src/trigger/user-sync.js`: Defensive idempotency and no-op guards for legacy jobs.
  - Validated by 4 passing test suites: `clerk_webhooks.test.js`, `p08_webhook_scale.test.js`, `user_sync_trigger.test.js`, `identitate.test.js`.
- **Sentry Audit:** `@sentry/react-native` and `@sentry/node` verified installed and initialized with valid DSNs. Strict health-data privacy scrubbing active (`sendDefaultPii: false`, tokens/passwords/PII stripped, user ID removed). Recommendation: **KEEP**.

---

## 3. PRIORITY 2: INTEGRATION BRANCH VERIFICATION

- **Branch Name:** `ci-integration/verified-fixes`
- **HEAD Commit:** `af1c4c1`
- **Peer Agent Integration (GPT-6 Luna & GPT-6 Sol):** All modified files and peer unit tests created by peer agents were preserved, reviewed, and committed into clean logical groups:
  - `19d5058`: Backend dependency security fixes (`compression@1.8.2`, `proxy-addr@2.0.8`, `js-yaml@4.3.2`).
  - `18875e3`: Clerk webhook containment, Trigger worker hardening, user feedback schema & RLS.
  - `2e20bda`: Account logout isolation, password recovery error mapping, user data cleanup.
  - `34492eb`: AI Coach suggestion cards, Add to Journal confirmation, Proguard R8 plugin, and UX localizations.
  - `fdaef1d`: CI repair report and leaked secret remediation ledger.
  - `61cb252`: Documentation update on verified DeepSeek revocation and green Secret Scanning.
  - `dbe9b5a`: Clerk retirement (`@clerk/express` removal, optional boot credentials, test cleanup).
  - `9a35568`: Clerk retirement architecture and Sentry operational audit reports.
  - `af1c4c1`: Final Luna handoff: verified AI Coach to Journal flow, locale namespace alignment, and regression tests.
- **Remote `main` Protection:** Zero automatic merges to `main` have occurred. `origin/main` remains clean at `bf7ca4c`.

---

## 4. GITHUB ACTIONS CI AUDIT SUMMARY

| CI Job Name | Remote `bf7ca4c` | Branch `ci-integration/verified-fixes` (`fdaef1d`) | Status | Notes |
|---|---|---|---|---|
| **Secret Scanning** | PASS | **PASS** | **RESOLVED** | TruffleHog live verified: revoked key confirmed inactive (HTTP 401) |
| **Backend Lint & Tests** | FAIL | **PASS** | **RESOLVED** | Node 22 clean, 0 audit vulnerabilities, 74/74 Jest suites pass (725 tests) |
| **RLS Integration Tests (Postgres)** | PASS | **PASS** | **RESOLVED** | Supabase Postgres 15.6.1 container, 12 tables verified |
| **Frontend Typecheck, Lint & Tests** | FAIL | FAIL | **BLOCKED (POLICY)** | Typecheck & Lint PASS; Step 7 fails on `braces <=3.0.3` |
| **Dependency Vulnerability Scan** | FAIL | FAIL | **BLOCKED (UPSTREAM)** | `osv-scanner` flags `braces <=3.0.3` (`GHSA-vfj7-8cjw-p6xm`) |

### 4.1 Dependency Advisories Detail & Risk Assessment

#### A. `braces <=3.0.3` (`GHSA-vfj7-8cjw-p6xm`)
- **Published:** 8 October 2026.
- **Severity:** High (CVSS 7.5).
- **Vulnerability:** Stack exhaustion denial of service from deeply nested unclosed curly braces in glob pattern strings.
- **Dependency Chain:** Metro bundler / Jest runner -> `micromatch` -> `braces`.
- **Runtime Exposure:** **0% (Zero).** `braces` is strictly a build-time bundler/test tool. It is not packaged into the client APK/AAB runtime bundle, nor is it executed against untrusted user input in production.
- **Upstream Patch Status:** `braces@3.0.3` is the latest release on the npm registry. No patched version (`3.0.4+`) has been published by the maintainer.
- **Disposition:** Kept fail-closed in CI. If the owner approves, an expiring exception (e.g. expiring `2026-11-30`) can be placed in `auditGate.js` and `osv-scanner.toml`.

#### B. `node-forge <=1.4.0` (`GHSA-86W9-CPQP-85RV`)
- **Published:** 1 October 2026.
- **Severity:** High.
- **Dependency Chain:** `@expo/cli` -> `@expo/code-signing-certificates` -> `node-forge`.
- **Runtime Exposure:** **0% (Zero).** Used exclusively at build-time for Expo CLI code signing.
- **Status:** Already covered by documented owner exception in `auditGate.js` (expiring `2026-12-31`) and `osv-scanner.toml`.

---

## 5. NEXT ACTIONS FOR PRODUCT OWNER

1. **[DEPLOYMENT] Authorize Render Backend Hotfix Deployment:**
   - Deploy commit `dbe9b5a` to Render production to contain the active Clerk webhook vulnerability and eliminate `@clerk/express`.
2. **[AUTHORIZATION] Approve Temporary Risk Exception for `braces`:**
   - Authorize adding an expiring build-time exception for `braces <=3.0.3` in `auditGate.js` and `osv-scanner.toml` to turn Frontend CI and Dependency Scan green, OR decide to maintain fail-closed until an upstream patch is published.
3. **[DEPLOYMENT] Authorize Trigger.dev Task Deployment:**
   - Deploy task `user-sync` to Trigger.dev cloud.
