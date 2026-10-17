# GETFLOW — PRODUCTION ROLLOUT & RELEASE PLAN
## CONTROLLED STAGED ROLLOUT • MONITORING CRITERIA • ROLLBACK RUNBOOK

**Target Application:** GetFlow — Smart Nutrition & Fitness  
**Package:** `com.totsrl.getflo`  
**Distribution Channel:** Google Play Store (Production Track)  
**Initial Target Version:** versionCode 36, versionName 1.0.0  
**Date:** 18 October 2026  
**Auditor:** Release Auditor & Senior Mobile Architect  

---

## 1. PRE-ROLLOUT MANDATORY CONDITIONS

Production release must NOT commence until:
1. Google Play Internal Testing phase completes with $\ge 5$ verified tester sessions.
2. Zero Sentry unhandled exceptions or fatal crash events recorded during testing.
3. Explicit Owner approval obtained for the production release trigger.

---

## 2. FOUR-PHASE STAGED ROLLOUT SCHEDULE

To minimize user impact and ensure server capacity stability, the production rollout will follow a 4-phase staged percentage release via Google Play Console:

```
[Phase 1: 5%] ──(24h stable)──> [Phase 2: 20%] ──(48h stable)──> [Phase 3: 50%] ──(48h stable)──> [Phase 4: 100%]
```

### Phase 1: 5% Initial Staged Rollout (Day 1 - 24 Hours)
- **Target Audience:** 5% of all active Android users in target markets (Romania, EU).
- **Monitoring Focus:**
  - Sentry crash-free user rate ($\ge 99.5\%$ required).
  - Backend Render API response latency (P95 $< 850$ ms).
  - Trigger.dev Photo AI job completion rate ($\ge 98.5\%$).
  - AdMob consent impression success rate.

### Phase 2: 20% Expansion (Day 2 - 48 Hours)
- **Target Audience:** 20% of users.
- **Monitoring Focus:**
  - Flow Credits rewarded ad completion and reward grant rate.
  - In-App Purchase subscription activation and token verification.
  - Supabase database connection pool utilization ($< 40\%$).

### Phase 3: 50% Broad Release (Day 4 - 48 Hours)
- **Target Audience:** 50% of users.
- **Monitoring Focus:**
  - Journal save concurrency and row-level security error rates ($0\%$).
  - Negative store reviews or unexpected UI layout feedback on varied screen ratios.

### Phase 4: 100% Full Production Rollout (Day 6)
- **Target Audience:** 100% of all users worldwide.
- **Milestone:** Release considered fully shipped. Ongoing telemetry monitoring continues.

---

## 3. HALT & ROLLBACK CRITERIA (CIRCUIT BREAKERS)

Rollout percentage progression will be immediately HALTED or HALTED & ROLLED BACK if any of the following trigger conditions occur:

1. **Crash Rate Spike:** Sentry crash-free user session rate drops below **99.0%** in any 2-hour window.
2. **Photo AI Failure Spike:** Photo analysis error rate exceeds **5%** of total photo uploads.
3. **Database Persistence Loss:** Any confirmed report of saved meals not persisting to Supabase `mese` table.
4. **Billing / Revenue Failure:** In-App Purchase token validation failure rate $> 1\%$.
5. **Security / Privacy Incident:** Any unauthorized data access or RLS violation reported.

---

## 4. ROLLBACK & EMERGENCY RESPONSE RUNBOOK

If a critical blocker is detected during rollout:

1. **Halt Staged Rollout:**
   - In Google Play Console $\to$ **Production** $\to$ **Releases** $\to$ Select active release $\to$ Click **Halt rollout**.
   - This immediately stops distribution of the new version to new users.
2. **Hotfix Preparation:**
   - Isolate root cause on branch `main`.
   - Apply minimal targeted fix using Ponytail principles.
   - Increment `versionCode` (e.g. `versionCode=37`).
   - Run complete regression matrix (`npm test`, `npx tsc --noEmit`).
   - Push new AAB bundle directly to Internal Testing, verify on Samsung S24 Ultra, and submit hotfix release to Play Store.
3. **Emergency OTA Fallback:**
   - If the issue is purely Javascript runtime without native binary changes, an EAS Update can be deployed to the `main` release channel within 10 minutes to resolve the issue transparently for existing users.
