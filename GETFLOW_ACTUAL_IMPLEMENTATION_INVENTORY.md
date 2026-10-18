# GETFLOW — ACTUAL IMPLEMENTATION INVENTORY & AUDIT LEDGER
## FORENSIC AUDIT OF EXISTING CAPABILITIES • RUNTIME TRACES • ARCHITECTURAL CLASSIFICATION
**Date:** October 18, 2026  
**Auditor:** Principal Software Engineer, React Native Architect & Backend Security Lead  
**Branch:** `main` | **Target Package:** `com.totsrl.getflo` | **Target Hardware:** Samsung Galaxy S24 Ultra (`SM-S928B`, Android 16)  

---

## 1. FLOW-BY-FLOW IMPLEMENTATION LEDGER (FLOWS A THROUGH V)

| Flow ID | Flow Description | Source Files | Runtime Entrypoint | Backend Dependency | Existing Tests | Classification | Observed Problem / Missing Item | Recommended Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | **Google Sign-In & Session Persistence** | `context/AuthContext.tsx`, `lib/auth.ts`, `app/index.tsx` | App startup & auth redirect | Supabase Auth (Google OAuth) | `oauth.test.ts`, `accountLogout.test.ts` | **VERIFIED_END_TO_END** | Working; token refresh handles session resumption cleanly. | Preserve existing implementation. |
| **B** | **Camera Capture** | `app/camera.tsx`, `lib/camera.ts` | `/camera` route, Shutter CTA | Native CameraX (`expo-camera`) | `p116CameraAndKeyboardRegression.test.tsx` | **VERIFIED_ON_INSTALLED_DEVICE** | Resolved in v34/v36 by removing `skipProcessing: true` on Android 16. | Preserve existing implementation. |
| **C** | **Gallery Photo Selection** | `app/camera.tsx`, `lib/imageOptimizer.ts` | "Alege din galerie" CTA | Native ImagePicker (`expo-image-picker`) | `galleryPermissionBehavior.test.tsx` | **VERIFIED_END_TO_END** | Working; permission flow and image URI normalization functional. | Preserve existing implementation. |
| **D** | **Photo Preprocessing & Upload** | `lib/imageOptimizer.ts`, `lib/imagekit.ts` | `uploadImageToImageKit` | ImageKit CDN & `/api/imagekit-auth` | `imageOptimizer.test.ts`, `f03_mass_assignment_imagekit.test.js` | **PRESENT_BUT_BROKEN** (Latency) | Redundant `/imagekit-auth` roundtrip on every photo upload; cold-start vulnerability causing up to 45s latency. | Cache valid ImageKit auth params in memory with 30-min TTL; pre-warm on camera mount. |
| **E** | **Trigger.dev Job Creation & Processing** | `backend-nutritie-ai/routes/photoFlow.js`, `src/trigger/analiza-mancare-ai.js` | `POST /api/photo-jobs` | Trigger.dev Cloud & Gemini 2.5 Flash | `trigger_photo_contract.test.js`, `photo_flow_routes.test.js` | **IMPLEMENTED_LOCALLY_BUT_NOT_DEPLOYED** | Local worker logic complete with 503 backoff; production Trigger Cloud deployment pending. | Keep local worker updated; stage deployment with owner approval. |
| **F** | **AI Result Retrieval** | `frontend-nutritie/lib/photoJobs.ts` | `waitForPhotoJob`, `getPhotoJob` | `GET /api/photo-jobs/:id` | `photoJobs.test.ts` | **VERIFIED_END_TO_END** | Working; polling interval 1.2s retrieves parsed JSON correctly. | Optimize first poll to 800ms for faster feedback. |
| **G** | **Hybrid Analysis $\to$ Optional Go Home $\to$ Runner Sphere** | `app/camera.tsx`, `components/home/RunnerSphereCompanionCluster.tsx` | `mergiLaAcasa` CTA in Camera | AsyncStorage `@getflow/photo-job/v1/` & backend | `runnerSphereCompanion.test.tsx` | **PRESENT_BUT_BROKEN** | Tapping Sphere in completed/failed state always opens generic camera instead of specific result/recovery. | Direct tap to result on completion, recovery modal on failure, and progress sheet during processing. |
| **H** | **Detailed Analysis Stages** | `app/camera.tsx` | `analysisStage` state machine (1..4) | Client-side status listener | `photoNonFoodAndStages.test.tsx` | **VERIFIED_END_TO_END** | Truthful 4-stage progression reflects actual pipeline events. | Preserve existing implementation. |
| **I** | **Athletic Pro HUD (Option A)** | `components/food/PhotoMealResultView.tsx`, `MacroDistributionBar.tsx` | `/camera` post-analysis view | None (Client rendering) | `photoResultQuality.test.ts` | **VERIFIED_ON_INSTALLED_DEVICE** | Prominent calories, 4-segment macro distribution (fiber distinct, no double count), Neon Lime CTA. | Preserve existing design. |
| **J** | **Ingredient Replacement & Quantity Editing** | `components/food/IngredientCardRow.tsx`, `ChangeIngredientSheet.tsx`, `StepperQuantityControl.tsx` | In-HUD card steppers & "Schimbă" | None (Client recalculation) | `v7QuickPortionCatalog.test.ts` | **VERIFIED_ON_INSTALLED_DEVICE** | $\pm 25$g steppers, numeric tap-to-type, real-time macro updates verified on S24 Ultra. | Preserve existing implementation. |
| **K** | **Photo AI $\to$ Journal Save** | `app/camera.tsx`, `lib/payloadMese.ts`, `lib/mealUtils.ts` | "Adaugă în Jurnal" CTA | Supabase `mese` table | `meallUtils.test.ts`, `p101ReluareSiConflict.test.ts` | **VERIFIED_END_TO_END** | Single insert with idempotency key; updates daily calorie totals. | Guard against raw database error display on write failure. |
| **L** | **Manual Add $\to$ Journal Save** | `components/food/ManualAddMealModal.tsx`, `app/(tabs)/index.tsx` | "+ Adaugă manual" CTA | Supabase `mese` table | `coerentaMasa.test.ts` | **VERIFIED_END_TO_END** | Manual entry form with live calculations inserts into Supabase correctly. | Preserve existing implementation. |
| **M** | **Chat AI $\to$ Journal Save** | `app/(tabs)/chat.tsx`, `components/coach/CoachMealConfirmModal.tsx` | "+ Adaugă în jurnal" inside AI card | Supabase `mese` via `insereazaMasaCuPoza` | `coachMealDraft.test.ts`, `chatMealProposal.test.ts` | **VERIFIED_END_TO_END** | Resolved in v36; defaults meal category to current hour if omitted, saves reliably. | Preserve existing implementation. |
| **N** | **Runner Sphere Running Animation** | `components/home/RunnerSphere.tsx` | Home screen widget | None (Reanimated UI thread) | `runnerSphereCompanion.test.tsx` | **PRESENT_BUT_BROKEN** | 100ms `setInterval` + `useState` causes 10 JS re-renders/sec, frame jitter, and red startup on stale failed job. | Eliminate JS timer; drive motion with Reanimated UI-thread values; auto-expire stale failed jobs. |
| **O** | **Non-Food / Error Recovery** | `components/food/PhotoMealErrorView.tsx`, `app/camera.tsx` | Trigger `isNotFood` $\to$ Error view | None (Client view) | `photoNonFoodAndStages.test.tsx` | **PRESENT_BUT_BROKEN** | `camera.tsx` still falls back to raw `error.message` on uncaught errors or DB rejection. | Map all error codes to localized user-friendly copy; eliminate technical exception display. |
| **P** | **Flow Credits & Daily Free Allowance** | `context/FlowCreditsContext.tsx`, `backend-nutritie-ai/routes/photoFlow.js` | Modal & backend credit check | Supabase RPC `consuma_credit` | `flow_credits_core.test.js`, `flowCreditsUi.test.tsx` | **VERIFIED_END_TO_END** | 3 free daily analyses, atomic reservation and commit/release mechanics verified. | Preserve existing implementation. |
| **Q** | **Rewarded Advertisements & SSV** | `lib/ads/rewardedAdsService.ts`, `backend-nutritie-ai/routes/rewarded.js` | "+1 Credit" watch ad CTA | Google AdMob & signed SSV callback | `admob_ssv.test.js`, `rewardedAdsService.test.ts` | **VERIFIED_END_TO_END** | Production AdMob App ID configured, test rewarded ad grants credits idempotently. | Preserve existing implementation. |
| **R** | **Groq Chat Quotas & Cost Protection** | `backend-nutritie-ai/services/ai/chat.js`, `frontend-nutritie/app/(tabs)/chat.tsx` | `POST /api/chat` | Groq API (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) | `groq_migration.test.js` | **NOT_IMPLEMENTED** (Independent Quota) | Chat currently shares generic AI quota (50/day) and consumes Photo AI credits! No UI quota counter or daily limit (10 msgs). | Implement dedicated server-side Chat quota (10 free msgs/day), `GET /api/chat/quota`, and UI counter badge. |
| **S** | **Premium Purchases & Entitlements** | `app/paywall.tsx`, `context/RevenueCatContext.tsx`, `app/(tabs)/profil.tsx` | "Upgrade to Pro" & "Gestionează abonamentul" | Google Play Billing & RevenueCat | `google_billing_routes.test.js`, `paywallBillingMetadata.test.tsx` | **VERIFIED_END_TO_END** | Play subscriptions URL triggered correctly; paid entitlement bypass operational. | Preserve existing implementation. |
| **T** | **Sprout Profile & Customization** | `components/home/PixelCompanion.tsx`, `FlowCompanionModal.tsx` | Tap Sprout on Home | Local state / profile | `runnerSphereCompanion.test.tsx` | **PRESENT_BUT_BROKEN** (Incomplete) | Modal currently shows older generic evolution stages; missing dedicated Sprout profile, introduction & one-time naming. | Add Sprout introduction and one-time companion naming dialog with durable persistence. |
| **U** | **GDPR Export & Deletion** | `backend-nutritie-ai/routes/gdpr.js`, `utils/gdprWorker.js`, `utils/gdprServices.js` | `DELETE /api/gdpr/cont`, `GET /api/gdpr/export` | Supabase RLS & ImageKit API | `gdpr_gpt_remediation.test.js`, `training_v2_gdpr.test.js` | **IMPLEMENTED_LOCALLY_BUT_NOT_DEPLOYED** | Defects GDPR-01 to GDPR-05 completely repaired locally; 100% green tests; SQL migration ready for deployment. | Paused at Production Gate pending owner deployment sign-off. |
| **V** | **Live Legal Pages & Play Declarations** | `public/termeni.html`, `public/confidentialitate.html`, `app/(tabs)/profil.tsx` | Profile legal links | Public web server | `legal_routes.test.js` | **VERIFIED_END_TO_END** | Individual developer identity, European Accessibility Act microenterprise statutory exemption verified. | Console declarations documented for owner. |

---

## 2. PRIORITIZED EXECUTION PLAN

1. **P0 — Security & Data Integrity:**
   - Confirm GDPR remediation integrity (GDPR-01 through GDPR-05) remains 100% green without regression.
2. **P0 — Broken Critical Functionality:**
   - **Runner Sphere:** Remove JS `setInterval` re-renders; drive smooth running on UI thread; prevent stale failed jobs from tinting the sphere red on app startup; route tap to specific result/recovery.
   - **Photo AI Errors:** Replace all remaining raw error displays in `camera.tsx` with localized friendly `PhotoMealErrorView` messages.
3. **P1 — Cost Leakage & Provider Protection:**
   - **Groq Chat Quotas:** Disconnect Chat AI from Photo AI credits; implement dedicated server-authoritative 10-message daily Free quota with rollback on failure; add `GET /api/chat/quota`; build unobtrusive UI counter in `chat.tsx`.
4. **P1 — Performance & Latency:**
   - **Photo AI Latency:** Eliminate redundant `/imagekit-auth` roundtrip via in-memory TTL caching and pre-warming; profile T0..T12.
5. **P2 — Visual & Companion Polish:**
   - **Sprout Profile:** Add dedicated Sprout companion profile with introduction and permanent one-time naming modal.
6. **P2 — Code Cleanup:**
   - Apply Ponytail to clean up unused variables, dead code, and resolve all 12 ESLint warnings.
7. **P0 — Release Gate & Verification:**
   - Re-run full test matrix (Backend 78 suites, Frontend 165 suites, TypeScript, ESLint).
   - Verify Android package provenance and generate final Release Gate Verdict.
