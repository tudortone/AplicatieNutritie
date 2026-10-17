# GETFLOW PHOTO AI 2.0 — IMPLEMENTATION PLAN

**Target Branch:** `main`  
**Target Hardware:** Samsung Galaxy S24 Ultra (`R5CX120W81K`, Android 16 / SDK 36)  
**Package:** `com.totsrl.getflo`  

---

## Phase 1: Baseline Architecture & Design Freeze Integrity
1. Re-verify active branch `main` and current HEAD `5258fb73`.
2. Ensure frozen areas are strictly untouched: Home, Calorie Ring, Runner Sphere, Sprout companion, Flow Credits Pill, bottom navigation tabs, Training V1.
3. Ensure GPT Codex Training V2 worktree is completely untouched.

## Phase 2: Component Architecture (Photo AI 2.0)
1. **`PhotoMealResultView.tsx` (New Dedicated Component):**
   - Extract review sheet logic from `app/camera.tsx` into a modular, testable component to dramatically reduce `camera.tsx` complexity.
   - Implement the selected design direction (Option A or Option B).
   - Render compact photo thumbnail, editable meal title, and meal category radio pill selector.
   - Render interactive Macro Distribution Bar with live recomputing calories and macros.
   - Render ingredient list with 48dp stepper buttons (`-` / `+` 25g) and inline gram editing.
   - Sticky safe-area bottom bar with primary "Adaugă în Jurnal • {kcal} kcal" CTA.
2. **`PhotoMealErrorView.tsx` (New Dedicated Component):**
   - Extract error handling into a unified state renderer covering:
     - State A: No Food Detected (`camera-not-food-card`)
     - State B: Low Confidence / Review Required
     - State C: Network Loss & Offline Save
     - State D: AI Provider Error & Credit Refund Note
     - State E: Malformed Output
     - State F: Journal Save Failure (Preserves User Edits 100%)
     - State G: Expired Job
     - State H: Camera/Gallery Permission Errors

## Phase 3: Integration into `app/camera.tsx`
1. Replace legacy inline review sheet and error cards with `<PhotoMealResultView />` and `<PhotoMealErrorView />`.
2. Connect real-time state updates: gram adjustments directly trigger `evaluatePhotoMealQuality` and recalculate `totalCalculat` via `construiesteAlimenteScan`.
3. Preserve the deterministic save pipeline:
   - Check minimum grams (> 0).
   - Generate deterministic operation UUID.
   - Insert into Supabase `mese` table with offline SQLite queue fallback.
   - Invalidate nutrition cache and trigger `marcheazaMeseModificate(ownerId)`.
   - Display `MealSaveSuccessModal` with haptic feedback.

## Phase 4: Verification, TDD & Samsung Device QA
1. Update and expand Jest unit test suites (`flowCreditsUi.test.tsx`, `p116CameraAndKeyboardRegression.test.tsx`, `runnerSphereCompanion.test.tsx`).
2. Run full frontend & backend Jest suites.
3. Test end-to-end on Samsung Galaxy S24 Ultra:
   - Food photo $\to$ Result review $\to$ Edit portion $\to$ Save to Journal $\to$ Home totals.
   - Non-food photo $\to$ Empty state $\to$ Retake $\to$ Safe recovery.
   - Save failure simulation $\to$ Retain edits $\to$ Retry $\to$ Single row written.

## Phase 5: Ponytail Cleanup & Release Hardening
1. Remove redundant inline styles and dead code in `app/camera.tsx`.
2. Verify security, RLS, ImageKit, Google Play billing, and GDPR exports.
3. Validate Android release build (`./gradlew assembleRelease`).
