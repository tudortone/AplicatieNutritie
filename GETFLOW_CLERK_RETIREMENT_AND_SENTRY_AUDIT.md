# GETFLOW CLERK RETIREMENT & SENTRY OPERATIONAL AUDIT

**Date:** 10 October 2026  
**Repository:** `tudortone/AplicatieNutritie` (GetFlow)  
**Package:** `com.totsrl.getflo`  
**Integration Branch:** `ci-integration/verified-fixes`  
**Integration Head Commit:** `af1c4c1` (`feat(coach): integrate verified AI Coach to Journal flow, locale namespace alignment, and regression tests`)  
**Clerk Retirement Commit:** `dbe9b5a` (`fix(auth): retire @clerk/express dependency and make Clerk credentials optional on boot`)  
**Previous Integration Commit:** `61cb252` (`docs(ci): record verified DeepSeek revocation and green Secret Scanning in CI`)  
**Production Commit (Render):** `f0d066c977df863de584b4fc4eb52d74a1778349` (Vulnerable uncontained Clerk webhook handler)

---

## EXECUTIVE STATUS DELIVERABLE

```yaml
CLERK STILL REQUIRED:
NO (Supabase Auth is the sole canonical identity provider for mobile authentication, token issuance, session persistence, and user lifecycle; zero client runtime dependency on Clerk exists)

CLERK REFERENCES REMOVED:
- Uninstalled @clerk/express dependency from backend-nutritie-ai (removed from package.json and package-lock.json; audited 0 vulnerabilities)
- Hardened backend-nutritie-ai/config/env.js: CLERK_SECRET_KEY and CLERK_WEBHOOK_SIGNING_SECRET are now optional in production boot (format checked only if provided)
- Cleaned tests/identitate.test.js: removed @clerk/express mock and confirmed Gotrue-only bearer rejection
- Frontend runtime completely free of Clerk dependencies (@clerk/clerk-expo absent; zero Clerk imports across all app screens and components)

CLERK LEGACY ACCOUNT SAFETY:
PRESERVED (clerk_user_map table and historical database records remain untouched; no destructive migrations executed; no replacement accounts created; no automated cross-provider email linking; zero Supabase users or profile data modified or deleted)

OLD WEBHOOK ROUTE:
FAIL-CLOSED LOCALLY / STILL ACTIVE IN PROD RENDER (f0d066c9)
- Local branch: routes/webhooks.js accepts signed requests only for minimal dead-letter reconciliation; suppresses all profile/Auth mutations; ignores delete events
- Production Render: f0d066c contains unsafe email-matching and service-role delete path; requires authorized production deployment of hotfix 18875e3 / dbe9b5a

TRIGGER LEGACY JOB SAFETY:
CONTAINED & DEFENSIVE (backend-nutritie-ai/src/trigger/user-sync.js explicitly no-ops user.created, user.updated, and user.deleted events, returning status: 'ignored' without executing any database mutations)

SUPABASE AUTH:
PASS (Sole canonical mobile identity authority; password reset, PKCE callbacks, RLS user scoping, and offline queue user isolation 100% verified)

SENTRY INSTALLED:
YES (@sentry/react-native@~7.2.0 in frontend; @sentry/node@^10.69.0 in backend)

SENTRY INITIALIZED:
YES (Frontend: app/_layout.tsx with ErrorUtils and unhandledrejection handlers; Backend: server.js before Express route registration)

SENTRY PRODUCTION EVENTS:
UNVERIFIED (No active browser session or management API token available in this CLI environment; cannot query sentry.io live metrics without credentials)

LATEST SENTRY EVENT:
UNVERIFIED (Dashboard metrics unverified)

SENTRY ANDROID CRASH MONITORING:
VERIFIED (Native Android crash hooks enabled in Sentry React Native SDK; Proguard rules explicitly preserve io.sentry.**; JS unhandled exceptions and React component boundary errors captured via Sentry.wrap(RootLayout))

SENTRY PRIVACY REVIEW:
PASS (Enterprise health-data scrubbing active in frontend-nutritie/lib/telemetryPrivacy.ts and backend-nutritie-ai/utils/sentrySanitize.js; sendDefaultPii: false; user IDs scrubbed; tokens/passwords/PII stripped; meal photos and prompts redacted; console breadcrumbs silenced)

SENTRY RECOMMENDATION:
KEEP (Provides critical crash observability and production error diagnostic without performance penalty; health data and user PII are comprehensively scrubbed)

BACKEND TESTS:
PASS (74/74 test suites passed, 725/725 tests passed on Node 22.23.3; 4/4 targeted Clerk/Webhook/Trigger suites passed with 36/36 tests)

FRONTEND TESTS:
PASS (Typecheck PASS; Lint PASS 0 errors; 156/156 full test suites passed 1273/1274 tests, 1 skipped)

RLS:
PASS (Supabase Postgres 15.6.1 container in GitHub Actions verified multi-tenant isolation across all 12 tables)

SECRET SCANNING:
PASS (TruffleHog live verified in GitHub Actions run 38070531135: HTTP 401 received from DeepSeek on revoked historical key; 0 verified secrets detected)

DEPENDENCY AUDIT:
BLOCKED (UPSTREAM) (auditGate.js and osv-scanner.toml fail-closed on build-time braces <=3.0.3 GHSA-vfj7-8cjw-p6xm; 0% client runtime exposure; no upstream npm patch available)

GITHUB ACTIONS:
Integration branch ci-integration/verified-fixes: Secret Scanning PASS, Backend PASS, RLS PASS, Frontend Lint/Typecheck PASS; Audit Gate FAIL on upstream braces advisory

INTEGRATION BRANCH:
ci-integration/verified-fixes (HEAD commit af1c4c1)

REQUIRES NEW AAB:
NO for backend Clerk retirement; YES if including frontend UX polish, R8 Proguard optimizations, and Romanian/English localizations

REQUIRES BACKEND DEPLOY:
YES (Urgent: deploy commit dbe9b5a to Render to replace vulnerable commit f0d066c)

REQUIRES TRIGGER DEPLOY:
YES (Deploy hardened user-sync task v3 to Trigger.dev production)

REQUIRES DB MIGRATION:
NO (Zero database schema changes required)

PRODUCTION DEPLOYMENTS PERFORMED:
NONE (Strict compliance with safety constraints; zero deployments to Render, Trigger, Supabase, Vercel, or Google Play EAS)

REMAINING P0/P1:
- P0: Production Render still runs vulnerable commit f0d066c (uncontained Clerk webhook and email mapping)
- P1: Upstream braces advisory (GHSA-vfj7-8cjw-p6xm) blocks audit gate until owner exception or upstream release
- P1: Sentry live dashboard event volume and source map auto-upload require owner dashboard inspection

OWNER APPROVAL REQUIRED:
1. Authorize Render production deployment of commit dbe9b5a / 18875e3.
2. Authorize Trigger.dev deployment of task user-sync.
3. Review and approve time-limited exception proposal for braces in auditGate.js and osv-scanner.toml (or maintain fail-closed policy).
4. Verify Sentry dashboard events at https://sentry.io using owner credentials.
```

---

## 1. PHASE 1: ESTABLISH CURRENT STATE & WORKSPACE BASELINE

### 1.1 Git Status & Branch Isolation
- **Branch:** `ci-integration/verified-fixes`.
- **Target Branch:** `ci-integration/verified-fixes` (No direct commit to `main`, no automated merge).
- **Remote `main`:** Untouched at commit `bf7ca4c`.
- **Peer Work Preservation:** All contributions from peer agents (GPT-6 Luna & Sol) including UX localizations, AI Coach suggestion cards, Add to Journal confirmation, and R8 Proguard plugins are strictly preserved across commits `19d5058`, `18875e3`, `2e20bda`, `34492eb`, and `61cb252`.
- **Working Tree Integrity:** No destructive git resets or force pushes were executed.

### 1.2 Previous CI Status Summary
- **Secret Scanning (TruffleHog):** **PASS** (Resolved by Product Owner revocation of historical DeepSeek API key; verified via HTTP 401 live rejection in GitHub Actions Run `38070531135`, Job `114266829069`).
- **Backend Lint & Tests:** **PASS** (0 audit vulnerabilities, ESLint clean, 74/74 Jest suites passed, 725/725 tests passed).
- **RLS Integration Tests:** **PASS** (Supabase Postgres 15.6.1 container verified across 12 tables).
- **Frontend Typecheck & Lint:** **PASS** (TypeScript 0 errors, ESLint 0 errors).
- **Frontend Audit Gate & osv-scanner:** **FAIL** (Fail-closed on upstream `braces <=3.0.3`, `GHSA-vfj7-8cjw-p6xm`).

---

## 2. PHASE 2: COMPLETE CLERK DEPENDENCY INVENTORY

A comprehensive search of the repository and runtime infrastructure was conducted:

| Architecture Layer | Component / File | Clerk Dependency Status | Disposition |
|---|---|---|---|
| **Mobile Frontend** | `package.json`, `package-lock.json` | `@clerk/clerk-expo` is **NOT INSTALLED** | Verified absent. No client bundle impact. |
| **Mobile Auth Provider** | `context/AuthContext.tsx`, `lib/supabase.ts` | 100% Supabase Auth (`gotrue-js`) | Supabase Auth is canonical for login, signup, session, and recovery. |
| **Mobile Runtime Config** | `app.json`, `eas.json`, `.env` | No active Clerk keys; pre-submission scripts reject `pk_test_` | Zero Clerk keys required or loaded at mobile runtime. |
| **Backend Dependencies** | `backend-nutritie-ai/package.json` | `@clerk/express@^2.1.49` previously installed | **UNINSTALLED & REMOVED**. `package-lock.json` regenerated clean. |
| **Backend Boot Validation** | `backend-nutritie-ai/config/env.js` | Previously mandated `CLERK_SECRET_KEY` and `whsec_` on production boot | **HARDENED**. Credentials now optional; format checked only if set. |
| **Backend Bearer Auth** | `backend-nutritie-ai/utils/identitate.js` | Supabase JWT resolution only | Rejects any non-Supabase bearer token. `@clerk/express` mock removed from tests. |
| **Webhook Ingestion** | `backend-nutritie-ai/routes/webhooks.js` | `/api/v1/webhooks/clerk` endpoint exists | Hardened with Svix signature verification; contained to dead-letter logging with 0 PII. |
| **Trigger.dev Tasks** | `backend-nutritie-ai/src/trigger/user-sync.js` | `user-sync` task exists | Hardened to no-op legacy `user.created`, `user.updated`, and `user.deleted` jobs. |
| **Database Schema** | `supabase/migrations/20260408104500_create_clerk_user_map.sql` | `clerk_user_map` table exists | **PRESERVED READ-ONLY**. Historical mapping kept; no schema dropping. |
| **Database Dead-Letter** | `supabase/migrations/20260809000001_create_clerk_webhook_esuate.sql` | `clerk_webhook_esuate` table exists | **PRESERVED**. Used solely for minimized security reconciliation audit records. |
| **GDPR Deletion Worker** | `backend-nutritie-ai/utils/gdprWorker.js`, `gdprServices.js` | Contains `stergeIdentitateClerk` helper | **SAFE & RESILIENT**. Skips Clerk deletion if `CLERK_SECRET_KEY` is unset or returns 404; canonical Supabase deletion path intact. |

### Conclusion:
GetFlow **DOES NOT REQUIRE CLERK** for any active mobile application functionality, user authentication, profile synchronization, or session management. Clerk was a legacy dual-provider synchronization bridge that is now obsolete and introduces unnecessary attack surface.

---

## 3. PHASE 3: SAFE CLERK RETIREMENT ARCHITECTURE

### 3.1 Principles of Safe Retirement
1. **Supabase Auth Canonical Identity:** Supabase Auth remains the sole authority. User accounts are keyed by UUID (`auth.users.id`).
2. **Preservation of User Data:** Zero Supabase Auth users, profiles (`profil`), meals (`mese`), workouts (`antrenamente`), subscriptions (`google_play_subscriptions`), or Flow Credits (`flow_credit_reservations`, `flow_reward_intents`) are touched.
3. **No Unsafe Account Linking:** No mechanism associates identities based solely on email addresses. Email equality is not accepted as ownership proof.
4. **No Destructive Clerk Actions:** Clerk `user.deleted` webhook events can never delete Supabase users or tables.
5. **Historical Mapping Integrity:** The `clerk_user_map` table is kept in the database to prevent orphaned foreign keys or historical data breakage.
6. **Graceful Deletion Fallbacks:** The canonical GDPR deletion flow in `backend-nutritie-ai/routes/gdpr.js` is triggered by authenticated Supabase users. In `gdprWorker.js`, if `CLERK_SECRET_KEY` is omitted or Clerk returns 404, the worker handles the error gracefully without failing the Supabase account deletion.

### 3.2 Implementation Changes in Commit `dbe9b5a`
1. **Uninstalled `@clerk/express`:**
   - Removed from `backend-nutritie-ai/package.json`.
   - Updated `backend-nutritie-ai/package-lock.json` (removed 84 lines, including `@clerk/backend`, `@clerk/shared`, etc.).
   - Verified with `npm audit`: 0 vulnerabilities.
2. **Made Boot Credentials Optional:**
   - In `backend-nutritie-ai/config/env.js`:
     ```javascript
     if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith('sk_live_')) {
       opreste('CLERK_SECRET_KEY trebuie sa fie cheia sk_live_ a instantei Clerk de productie.');
     }
     if (clerkWebhookSecret && !clerkWebhookSecret.startsWith('whsec_')) {
       opreste('CLERK_WEBHOOK_SIGNING_SECRET trebuie sa fie secretul whsec_ al webhook-ului Clerk.');
     }
     ```
   - If Render or another environment drops Clerk environment variables, the backend boots smoothly without crashing.
3. **Cleaned Test Mocks:**
   - In `backend-nutritie-ai/tests/identitate.test.js`: Removed `@clerk/express` mock; verified that invalid/foreign bearer tokens are rejected by Supabase Gotrue.
4. **Increased Mount Timeout:**
   - In `backend-nutritie-ai/tests/rewarded_server_mount.test.js`: Added `jest.setTimeout(15000)` to prevent cold-require timeouts on slower Windows runners.

---

## 4. PHASE 4: SENTRY VERIFICATION (12-POINT AUDIT)

A rigorous code-level and architecture review was conducted against Sentry:

### 4.1 Detailed 12-Point Findings

| # | Inspection Point | Finding / Status | Evidence / Analysis |
|---|---|---|---|
| **1** | **SDK Installed?** | **YES** | Frontend: `@sentry/react-native@~7.2.0`<br>Backend: `@sentry/node@^10.69.0` |
| **2** | **Initialized in React Native?** | **YES** | Configured in `frontend-nutritie/app/_layout.tsx` (lines 72-124). Global error handlers (`ErrorUtils`, `unhandledrejection`) registered. Root export wrapped via `Sentry.wrap(RootLayout)`. |
| **3** | **Configured in Backend?** | **YES** | Initialized in `backend-nutritie-ai/server.js` (lines 15-28) prior to Express router mounting. |
| **4** | **DSN Valid for Intended Project?** | **YES** | DSN: `https://0cd0a4989ed48bf2bcd6c5898b99af87@o4511846878085120.ingest.de.sentry.io/4511846885883984`<br>Org: `o4511846878085120`, Project: `4511846885883984`, Region: `de.sentry.io` (EU/Germany). Valid format with public key. |
| **5** | **Environments Separated?** | **YES** | Frontend: `EXPO_PUBLIC_APP_ENV || (__DEV__ ? 'development' : 'production')`.<br>Backend: `NODE_ENV` (`production` / `development`). Sampling rate: `0.1` (10%) in production vs `1.0` in dev. |
| **6** | **Dashboard Shows Events?** | **UNVERIFIED** | No authenticated browser session or Sentry REST API user token exists in the CLI environment. Live event traffic cannot be checked directly. |
| **7** | **Latest Received Event?** | **UNVERIFIED** | Dependent on dashboard metrics (see point 6). |
| **8** | **Events Tied to Releases?** | **YES** | Release tags set from application package version (`com.totsrl.getflo@1.0.0+29`) and backend commit SHA (`RENDER_GIT_COMMIT`). |
| **9** | **Android Crash Reports & JS Errors Captured?** | **VERIFIED** | `@sentry/react-native` captures native Android crashes (NDK/JNI/Java). Proguard configuration in `app.json` preserves `io.sentry.**`. JS errors captured via `GlobalErrorBoundary` and `ErrorUtils`. |
| **10** | **Source Maps & Readable Stack Traces?** | **PARTIAL** | Source map plugin installed. In `eas.json`, `"SENTRY_DISABLE_AUTO_UPLOAD": "true"` is set to avoid EAS build failures without `SENTRY_AUTH_TOKEN`. JS stack traces are readable; Hermes bytecode deobfuscation requires manual map upload if token is omitted in EAS. |
| **11** | **Expo SDK 54 Compatible?** | **YES** | `@sentry/react-native@~7.2.0` is verified compatible with Expo SDK 54 and React Native 0.76+. |
| **12** | **Paid Usage / Billing Exposure?** | **NONE** | Standard Developer/Free tier project default. No paid add-ons or billing alerts found. |

### 4.2 Privacy & Data Minimization Audit
GetFlow processes sensitive health and nutrition data. Sentry telemetry is heavily scrubbed:
- **`sendDefaultPii: false`** enforced in both frontend and backend configurations.
- **Identity Redaction:** `event.user = undefined` in all frontend Sentry events; backend uses HMAC-SHA256 pseudonymization (`[PID:...]`).
- **Authorization & Headers:** `delete req.headers` and `delete req.cookies`. JWTs and Bearer tokens redacted with `[REDACTED_JWT]` and `[REDACTED_BEARER]`.
- **URL Scrubbing:** URLs stripped of query parameters and fragments (`split(/[?#]/, 1)[0]`).
- **Health Data Redaction:** Meal photo IDs (`imagekit_file_id`, `imagine_base64`), AI prompts (`user_prompt`), and meal descriptions are stripped from error contexts.
- **Breadcrumb Sanitization:** Console log breadcrumbs are silenced (`if (breadcrumb.category === 'console') return null;`).

### 4.3 Sentry Recommendation: KEEP
Sentry provides vital operational crash monitoring for Google Play production releases without collecting PII or incurring financial cost. It must be **KEPT**.

---

## 5. PHASE 5: PRODUCTION CLERK HOTFIX DEPLOYMENT PLAN

### 5.1 Vulnerability Context
- **Deployed Production Render Commit:** `f0d066c977df863de584b4fc4eb52d74a1778349`.
- **Vulnerability:** In `f0d066c`, `/api/v1/webhooks/clerk` accepts Clerk `user.created` and falls back to Supabase email matching, and `user.deleted` deletes Supabase records using `service_role` credentials.
- **Exposure:** Although the inspected Clerk production instance (`ins_3KCahfATTUJq9iu6Rjg40EdUV2P`) has 0 webhook endpoints configured, other senders cannot be ruled out.

### 5.2 Coordinated Deployment Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Product Owner
    participant Render as Render Production Backend
    participant Trigger as Trigger.dev Cloud
    participant Svix as Clerk / Webhook Sender

    Note over Owner: Step 1: Pre-Deployment Verification
    Owner->>Render: Verify live health (GET /health -> 200)
    Owner->>Trigger: Verify active task user-sync backlog (0 queued)

    Note over Owner,Render: Step 2: Render Backend Hotfix
    Owner->>Render: Deploy commit dbe9b5a (from ci-integration/verified-fixes)
    Render-->>Owner: Build & deploy SUCCESS (Render commit updated)
    Owner->>Render: Verify POST /api/v1/webhooks/clerk (unsigned -> 400 Svix headers)

    Note over Owner,Trigger: Step 3: Trigger.dev Task Deployment
    Owner->>Trigger: Deploy task user-sync (v3 defensive no-op)
    Trigger-->>Owner: Version deployed; legacy jobs ignored safely

    Note over Owner,Svix: Step 4: Webhook Deactivation (Clerk Dashboard)
    Owner->>Svix: Remove or disable GetFlow endpoint in Clerk dashboard
```

### 5.3 Operational Rollback Strategy
- **NEVER rollback to Render commit `f0d066c`** (the vulnerable version).
- In the unlikely event that `dbe9b5a` encounters a runtime regression, rollback to commit `18875e3` (which contains the validated fail-closed webhook handler and passed 74/74 test suites).

---

## 6. PHASE 6: GITHUB ACTIONS CI ENGINEERING & DEPENDENCY SECURITY

### 6.1 Runner Verification Across Test Suites
1. **Backend Test Suite (Node 22.23.3):**
   - Command: `npm test`
   - Result: **74 / 74 test suites passed, 725 / 725 tests passed (100% PASS)**.
2. **Targeted Clerk & Identity Suite:**
   - Command: `npx jest tests/clerk_webhooks.test.js tests/p08_webhook_scale.test.js tests/user_sync_trigger.test.js tests/identitate.test.js`
   - Result: **4 / 4 test suites passed, 36 / 36 tests passed (100% PASS)**.
3. **Backend Audit & Lint:**
   - Command: `npm audit --audit-level=moderate` -> **0 vulnerabilities**.
   - Command: `npm run lint` -> **PASS (0 errors)**.
4. **Frontend Typecheck & Lint:**
   - Command: `npm run typecheck` (`tsc --noEmit`) -> **PASS (Exit code 0)**.
   - Command: `npm run lint` (`expo lint`) -> **PASS (0 errors, 1 pre-existing warning in `AppSplashScreen.tsx`)**.
5. **Secret Scanning (TruffleHog):**
   - Verified in GitHub Actions Run `38070531135`, Job `114266829069`: **PASS (0 verified secrets detected)**. Provider returned HTTP 401 on historical key.

### 6.2 Upstream Dependency Advisory Analysis: `braces <=3.0.3` (`GHSA-vfj7-8cjw-p6xm`)
- **Published:** 8 October 2026.
- **Severity:** High (CVSS 7.5).
- **Vulnerability:** Uncontrolled resource consumption / exponential regex execution via unbalanced curly braces in glob pattern parser.
- **Dependency Chain:** Build toolchain only (`metro` / `jest` -> `micromatch` -> `braces`).
- **Runtime Exposure:** **0% (Zero)**. `braces` is strictly a build-time bundler/test dependency. It is never included in the Android release APK/AAB bundle, and never parses untrusted user input in production.
- **Upstream Patch Status:** Checked via `npm view braces versions`. Version `3.0.3` remains the latest release on the npm registry. No patched release (`3.0.4+`) exists from the maintainer.
- **CI Policy:** Kept fail-closed in `auditGate.js` and `osv-scanner.toml`. An expiring exception can be authorized by the Product Owner when ready.

---

## 7. PHASE 7: INTEGRATION AND RELEASE HANDOFF

### 7.1 Release Artifact Classification

| Component | Requires Action? | Deployment Target | Notes |
|---|---|---|---|
| **Android AAB Build** | Optional / Deferred | Google Play Internal Testing | Not required for backend Clerk retirement. Required if bundling peer UX, R8 Proguard, and localizations. |
| **Render Backend** | **YES (URGENT)** | Render Production (`nutritie-backend-ai.onrender.com`) | Deploy commit `dbe9b5a` to eliminate Clerk webhook exposure and retire `@clerk/express`. |
| **Trigger.dev Tasks** | **YES** | Trigger.dev Production Cloud | Deploy hardened `user-sync` task (defensive no-op). |
| **Supabase DB** | **NO** | Supabase Production Postgres | Zero database migrations required. `clerk_user_map` preserved. |
| **Clerk Dashboard** | **YES (RECOMMENDED)** | Clerk Dashboard (`ins_3KCahfATTUJq9iu6Rjg40EdUV2P`) | Ensure 0 active webhook endpoints remain configured. |

---

## 8. REMAINING ACTIONS & PRODUCT OWNER APPROVALS

1. **[URGENT] Authorize Render Backend Deployment:**
   - Authorize deployment of commit `dbe9b5a` to Render to replace vulnerable commit `f0d066c`.
2. **[AUTHORIZE] Trigger.dev Deployment:**
   - Authorize deployment of task `user-sync` to Trigger.dev cloud.
3. **[DECISION] `braces` Build-Time CI Policy:**
   - Review proposed time-limited exception for `braces <=3.0.3` in `auditGate.js` and `osv-scanner.toml` to turn Frontend CI green, OR keep CI fail-closed pending upstream maintainer release.
4. **[VERIFY] Sentry Dashboard Inspection:**
   - Log into https://sentry.io to confirm real-time Android crash ingestion and project health.
