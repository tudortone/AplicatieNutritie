# GETFLOW GITHUB CI REPAIR & LEAKED SECRET REMEDIATION REPORT

**Date:** 10 October 2026  
**Repository:** `tudortone/AplicatieNutritie` (GetFlow)  
**Package:** `com.totsrl.getflo`  
**Integration Branch:** `ci-integration/verified-fixes`  
**Integration HEAD Commit:** `34492eba87e90cae692efb679271f0f36edad261`  
**Latest CI Run ID:** `38068263242` (Triggered on integration branch commit `34492eb`)

---

## EXECUTIVE SUMMARY & STATUS DELIVERABLE

```yaml
DEEPSEEK KEY:
NOT VERIFIED (Flagged as verified active by TruffleHog live probe in CI run 38068263242; independent verification without using credential requires owner dashboard check -> OWNER ACTION REQUIRED)

OTHER EXPOSED SECRETS:
NONE (Zero other credentials detected across full repository history by TruffleHog)

CURRENT SOURCE SECRET EXPOSURE:
NONE (Zero references to DeepSeek, plaintext keys, or leaked credentials exist in current source, configs, or documentation)

HISTORICAL SECRET EXPOSURE:
CONFIRMED HISTORICAL (Introduced in commit 4f049854 on 2026-07-06 in backend-nutritie-ai/server.js:239; subsequently removed in commit 28373b5d, but preserved in immutable Git history)

SECRET SCANNING:
FAIL (GitHub Actions TruffleHog job 114260241855 flagged historical commit 4f049854 via --only-verified)

BACKEND CI:
PASS (Job 114260242164: npm audit 0 vulnerabilities, ESLint clean, 74/74 Jest suites passed, 725/725 tests passed)

RLS CI:
PASS (Job 114260242074: Supabase Postgres 15.6.1 real multi-tenant isolation verified across all 12 tables)

FRONTEND CI:
FAIL (Job 114260242092: Typecheck PASS, Lint PASS, failed at Step 7 auditGate.js due to upstream braces <=3.0.3; functional app code 100% clean across 155 suites)

DEPENDENCY SCAN:
FAIL (Job 114260242071: osv-scanner detected GHSA-vfj7-8cjw-p6xm on build-time braces <=3.0.3 with no upstream fix)

INTEGRATION BRANCH:
ci-integration/verified-fixes (HEAD commit: 34492eba87e90cae692efb679271f0f36edad261)

SAFE TO MERGE:
NO (Blocked by: 1. Owner revocation of historical DeepSeek key to clear Secret Scanning; 2. Owner risk authorization of build-time braces advisory)

PRODUCTION DEPLOYMENT:
NOT PERFORMED (Zero deployments to Render, Vercel, Trigger.dev, Supabase, or Google Play EAS)

OWNER ACTION REQUIRED:
1. Immediately revoke the DeepSeek API key (sk-f53cb4...) in the DeepSeek developer account dashboard.
2. Review and formally approve a time-limited build-time exception for braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) in auditGate.js and osv-scanner.toml, or wait for upstream maintainer patch.
3. Review and authorize urgent production deployment of Clerk webhook containment hotfix to Render.
```

---

## 1. PRIORITY 0: HISTORICAL DEEPSEEK CREDENTIAL EXPOSURE

### 1.1 Finding & Incident Scope
- **Tool:** TruffleHog `v3.96.0` (`--only-verified`, `fetch-depth: 0`) in GitHub Actions CI Run `38068263242` (Job ID `114260241855`).
- **Target File:** `backend-nutritie-ai/server.js` (Line 239).
- **Origin Commit:** `4f049854a646e908d727f4479f57b89e7f490704` (Committed 2026-07-06).
- **Remediation in Source:** Commit `28373b5df5b565d6c8104dfc0411a070eb35aeb4` previously replaced DeepSeek with Gemini/Groq providers and removed the hardcoded string from active code.
- **Active Code Exposure:** **NONE.** Complete repository scan confirmed zero occurrences of the key pattern in current codebase, environment files, EAS secrets, Render manifests, or documentation.

### 1.2 Credential Handling & Safe Verification Rules
- In strict adherence to security protocol:
  - The secret was **NOT** printed, copied, or reproduced in unmasked form in any documentation.
  - The secret was **NOT** used to make manual test requests from the agent environment.
  - Plaintext values in documentation are replaced with `[REDACTED]`.
  - No fake replacement credentials were created.
- **TruffleHog Live Probe Finding:** Because TruffleHog executed with `--only-verified`, the failure indicates that as of the CI run timestamp (2026-10-10 16:35 UTC), DeepSeek's authentication servers responded positively to the key verification probe.

### 1.3 Provider Revocation vs Git History Remediation
- **Critical Distinction:** Deleting code containing an API key from Git HEAD does **not** revoke the key at the provider, and does **not** purge it from Git history.
- **Primary Remediation (Immediate):** The Product Owner must log in to the DeepSeek Console and revoke/delete the key.
  - Once revoked at the provider, the key becomes inert and cannot be exploited by anyone clone-reading historical Git commits.
  - Once revoked, TruffleHog's `--only-verified` check will query DeepSeek, receive `HTTP 401 Unauthorized`, and immediately cease reporting a verified secret failure.
- **Secondary Remediation (Git History):** Rewriting Git history (via `git filter-repo`) would alter all commit SHAs since July 2026, breaking downstream worktrees and violating `AGENTS.md` Rule 5 ("Nu folosi force-push, reset distructiv sau rescrierea istoricului"). Because provider revocation completely neutralizes the threat, Git history rewrite is not recommended unless explicitly ordered by the repository owner.

---

## 2. PRIORITY 1: PRODUCTION PROTECTION & CLERK HOTFIX

- **No Production Deployments:** No deployments were executed to Render, Trigger.dev, Supabase, or EAS.
- **Production Vulnerability Status:** The currently deployed live backend on Render (`nutritie-backend-ai.onrender.com`) still runs an older build containing the uncontained Clerk webhook handler. Under certain Clerk webhook payloads, this older version could trigger unwanted account data mutations.
- **Local Containment Status:** Fully preserved and validated on `ci-integration/verified-fixes` in commit `18875e3`:
  - `backend-nutritie-ai/routes/webhooks.js`: Hardened webhook signature verification and payload containment.
  - `backend-nutritie-ai/src/trigger/user-sync.js`: Defensive idempotency and role guards.
  - Validated by 3 passing test suites: `clerk_webhooks.test.js`, `p08_webhook_scale.test.js`, `user_sync_trigger.test.js`.
- **Recommendation:** Production Render deployment of this hotfix is urgent and requires separate owner authorization.

---

## 3. PRIORITY 2: INTEGRATION BRANCH VERIFICATION

- **Branch Name:** `ci-integration/verified-fixes`
- **HEAD Commit:** `34492eba87e90cae692efb679271f0f36edad261`
- **Peer Agent Integration (GPT-6 Luna & GPT-6 Sol):** All 56 modified files and associated unit tests created by peer agents were preserved, reviewed, and committed into clean logical groups:
  - `19d5058`: Backend dependency security fixes (`compression@1.8.2`, `proxy-addr@2.0.8`, `js-yaml@4.3.2`).
  - `18875e3`: Clerk webhook containment, Trigger worker hardening, user feedback schema & RLS.
  - `2e20bda`: Account logout isolation, password recovery error mapping, user data cleanup.
  - `34492eb`: AI Coach suggestion cards, Add to Journal confirmation, Proguard R8 plugin, and UX localizations.
- **Remote `main` Protection:** Zero automatic merges to `main` have occurred. `origin/main` remains clean at `bf7ca4c`.

---

## 4. PRIORITY 3 & 4: GITHUB ACTIONS CI JOBS AUDIT

| CI Job Name | Remote `bf7ca4c` | Branch `ci-integration/verified-fixes` | Current Status | Root Cause / Blocker |
|---|---|---|---|---|
| **Backend Lint & Tests** | FAIL | **PASS** | **RESOLVED** | Node 22 clean, 0 audit vulnerabilities, 74/74 Jest suites pass |
| **RLS Integration Tests (Postgres)** | PASS | **PASS** | **RESOLVED** | Supabase Postgres 15.6.1 container, 12 tables verified |
| **Frontend Typecheck, Lint & Tests** | FAIL | FAIL | **BLOCKED (POLICY)** | Typecheck & Lint PASS; Step 7 fails on `braces <=3.0.3` |
| **Dependency Vulnerability Scan** | FAIL | FAIL | **BLOCKED (UPSTREAM)** | `osv-scanner` flags `braces <=3.0.3` (`GHSA-vfj7-8cjw-p6xm`) |
| **Secret Scanning** | PASS | FAIL | **BLOCKED (OWNER)** | TruffleHog flagged verified historical DeepSeek key |

### 4.1 Dependency Advisories Detail & Risk Assessment

#### A. `braces <=3.0.3` (`GHSA-vfj7-8cjw-p6xm`)
- **Published:** 8 October 2026.
- **Severity:** High (CVSS 7.5).
- **Vulnerability:** Stack exhaustion denial of service from deeply nested unclosed curly braces in glob pattern strings.
- **Dependency Chain:** Metro bundler / Jest runner -> `micromatch` -> `braces`.
- **Runtime Exposure:** **0% (Zero).** `braces` is strictly a build-time bundler/test tool. It is not packaged into the client APK/AAB runtime bundle, nor is it executed against untrusted user input in production.
- **Upstream Patch Status:** `braces@3.0.3` is the latest release on the npm registry. No patched version (`3.0.4+`) has been published by the maintainer.
- **Disposition:** No silent suppression was applied. If the owner approves, a time-limited exception (e.g. expiring `2026-11-30`) can be placed in `auditGate.js` and `osv-scanner.toml`.

#### B. `node-forge <=1.4.0` (`GHSA-86W9-CPQP-85RV`)
- **Published:** 1 October 2026.
- **Severity:** High.
- **Dependency Chain:** `@expo/cli` -> `@expo/code-signing-certificates` -> `node-forge`.
- **Runtime Exposure:** **0% (Zero).** Used exclusively at build-time for Expo CLI code signing.
- **Status:** Already covered by documented owner exception in `auditGate.js` (expiring `2026-12-31`) and `osv-scanner.toml`.

---

## 5. REQUIRED OWNER ACTIONS SUMMARY

1. **[CRITICAL] Revoke Compromised DeepSeek Credential:**
   - Log in to DeepSeek Console (`https://platform.deepseek.com/api_keys`).
   - Locate and permanently delete / revoke the active key matching historical commit `4f049854`.
   - Once revoked, the Secret Scanning job in GitHub Actions will automatically transition to PASS.

2. **[AUTHORIZATION] Approve Temporary Risk Exception for `braces`:**
   - Review build-time scope of `GHSA-vfj7-8cjw-p6xm`.
   - Authorize adding an expiring exception to `frontend-nutritie/scripts/auditGate.js` and `osv-scanner.toml` until `braces@3.0.4` is published.

3. **[DEPLOYMENT] Authorize Render Backend Hotfix Deployment:**
   - Deploy commit `18875e3` to Render production to contain the active Clerk webhook vulnerability.
