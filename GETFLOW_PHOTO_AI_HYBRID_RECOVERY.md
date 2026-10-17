# GETFLOW — PHOTO AI HYBRID PROCESSING RECOVERY
## RESTORATION OF APPROVED EXPERIENCE & RUNNER SPHERE DUAL STATUS

**Package:** `com.totsrl.getflo`  
**Consulted Design References:** `apple-design` (Agency, Simplicity, Nonintrusive Status), `swiftui-design-skill` (System First, Anti-Slop, Brand Preservation)  

---

### 1. USER EXPERIENCE & INTERACTION CONTRACT

The approved hybrid Photo AI processing interaction has been restored:

1. **Submission**: After capturing a photo or picking an image from Gallery, the full analysis starts immediately.
2. **Dedicated Progress Screen**: The user is presented with the real-time scanning overlay displaying the real analysis state and kinetic animation.
3. **Optional Backgrounding ("Mergi la Acasă" / "Go to Home")**:
   - The scanning overlay provides a prominent, high-contrast action button:
     - **RO**: `Mergi la Acasă`
     - **EN**: `Go to Home`
   - Touch target is $\ge 44\times 44\text{pt}$, styled with approved neon lime accents (`#CCFF00`) and subtle glassmorphic backdrop.
4. **Non-destructive Navigation**:
   - Tapping "Mergi la Acasă" immediately navigates to Home (`/(tabs)`) WITHOUT canceling or aborting the background job.
   - The Trigger.dev / Render backend job continues uninterrupted.
   - Screen unmount (`useEffect` cleanup) is protected: local network abort is suppressed when an active backend job exists.
5. **Runner Sphere Status & Tap Routing**:
   - **During Processing**: The Runner Sphere in the Home header transitions from `idle` to `processing`. It performs kinetic orbital rotation and fluid neon color cycling (Lime $\to$ Cyan $\to$ Amber $\to$ Magenta).
   - **Tapping during Processing**: Tapping the sphere navigates directly to `/camera` showing the live analysis progress.
   - **On Completion**: The Runner Sphere pulses and transitions to vibrant Emerald Green (`#10B981`) with a checkmark badge.
   - **Tapping when Complete**: Tapping the sphere navigates to `/camera` where the completed result is recovered, ingredients are displayed, and portions/category can be reviewed and saved to Journal.
   - **On Failure**: The Runner Sphere indicates the failure state; tapping it opens the recoverable retry card without duplicate credit charges.
6. **No Duplicate Home Banner**:
   - The duplicate `HomePhotoAnalysisIndicator` ("Your Photo AI analysis is ready") has been completely removed from `app/(tabs)/index.tsx`.
   - The Home header remains clean, uncluttered, and strictly preserves the approved aesthetic.

---

### 2. ARCHITECTURAL & CODE CHANGES

| File | Changes Made |
| :--- | :--- |
| `frontend-nutritie/app/camera.tsx` | - Added `Home` icon import from `lucide-react-native`.<br>- Added `shouldGoHomeOnSubmitRef` to handle early "Go to Home" taps during upload.<br>- Guarded unmount cleanup to avoid aborting in-flight backend jobs.<br>- Implemented `mergiLaAcasa` callback.<br>- Added `camera-go-home-btn` to `scanningOverlay`.<br>- Added `goHomeBtn` and `goHomeBtnText` styles conforming to dark theme & 44pt touch targets. |
| `frontend-nutritie/app/(tabs)/index.tsx` | - Removed `HomePhotoAnalysisIndicator` import and JSX component.<br>- Preserved `RunnerSphereCompanionCluster` as the sole authoritative status indicator. |
| `frontend-nutritie/components/home/RunnerSphere.tsx` | - Verified TalkBack accessibility attributes (`accessibilityRole="button"`, state-specific labels). |
| `frontend-nutritie/components/home/RunnerSphereCompanionCluster.tsx` | - Polls `/photo-jobs/:id` and synchronizes `idle` / `processing` / `completed` / `failed` state directly to `RunnerSphere`. |

---

### 3. AUTOMATED VERIFICATION RESULTS

- `runnerSphereCompanion.test.tsx`: **5/5 PASSED**
- `galleryPermissionBehavior.test.tsx`: **35/35 PASSED**
- `responsiveHomeJournalHotfix.test.tsx`: **23/23 PASSED**
- `photoJobs.test.ts`: **15/15 PASSED**
- `typescript (tsc --noEmit)`: **0 ERRORS**
