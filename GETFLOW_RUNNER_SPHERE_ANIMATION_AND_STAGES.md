# GETFLOW RUNNER SPHERE ANIMATION & STAGE TRACKING

**Target Hardware:** Samsung Galaxy S24 Ultra (`R5CX120W81K`, Android 16 / SDK 36)  
**Component:** `frontend-nutritie/components/home/RunnerSphere.tsx`  
**Consulted Design References:** `apple-design`, `swiftui-design-skill`  
**Footprint:** Exactly 44×44 dp, touch target 44×44 dp, companion cluster alignment preserved.

---

## 1. Problem Description

During previous QA testing, two issues were identified with the Runner Sphere on the Home screen:
1. **Static Appearance of Runner:** The stick-figure runner inside the sphere did not appear to be actually running; it looked stationary or appeared to vibrate in place because the previous frames were simple horizontal flips with identical line weights and opacities.
2. **Loss of Stage Tracking:** Tapping the sphere while an AI food photo analysis was processing in the background did not consistently surface the multi-step pipeline progress or could open an indeterminate loading spinner.

---

## 2. Anatomical 6-Phase Gait Cycle Design

To create an authentic, visually convincing running gait cycle within a compact 24×24 SVG viewport, we consulted human biomechanics and animation craft:
- A real human running gait comprises alternating stance phases, swing phases, and flight phases where neither foot touches the ground.
- In 2D stick-figure representations, having both arms and legs at the same brightness creates visual ambiguity (the "depth inversion illusion") where limbs appear to switch sides erratically.

### Implementation:
1. **6 Anatomical Gait Phases (`RUN_FRAMES`):**
   - **Phase 0:** Near leg heel strike forward (contact), far leg kicked back in extension, near arm back, far arm forward.
   - **Phase 1:** Near leg mid-stance vertical support (absorbing body weight), far leg drives forward at 90° knee angle past hips.
   - **Phase 2:** Near leg explosive toe-off backward, far leg reaches forward into flight apex.
   - **Phase 3:** Far leg heel strike forward (contact), near leg kicked back in extension, far arm back, near arm forward.
   - **Phase 4:** Far leg mid-stance vertical support, near leg drives forward at 90° knee angle past hips.
   - **Phase 5:** Far leg explosive toe-off backward, near leg reaches forward into flight apex.

2. **3D Depth Shading:**
   - **Far Limbs (Arms & Legs):** Rendered behind the torso at `rgba(204, 255, 0, 0.48)` opacity and `1.9 - 2.0` stroke width.
   - **Torso & Head:** Rendered at solid `#CCFF00` with `2.3` stroke width.
   - **Near Limbs (Arms & Legs):** Rendered in the foreground at solid `#CCFF00` with `2.1 - 2.3` stroke width.
   - Result: As the limbs cycle, the runner exhibits clear forward locomotion with natural leg crossover and arm swings.

3. **Restrained Color Palette:**
   - Maintained strict compliance with GetFlow dark mode rules.
   - Idle / Running: `#CCFF00` (Neon Lime).
   - Completed: `#10B981` (Emerald).
   - Failed: `#EF4444` (Coral Red).
   - Removed all distracting rainbow or multi-color cycling.

4. **Timing & Accessibility:**
   - Cadence: 100ms per frame = 600ms complete stride cycle (100 strides/min), mimicking an athletic 5:00/km running pace.
   - Fully respects `useReducedMotion()`. When reduced motion is active, the runner displays a clean, static athletic pose (`IDLE_FRAME`) with a subtle static glow.

---

## 3. Analysis Stages on Tap

When an analysis job is in progress (`state === 'processing'`), tapping the sphere opens the camera modal or status sheet which displays the full 4-stage stepper:
1. **Etapa 1:** Pregătire & Încărcare imagine (Preparing & Uploading image)
2. **Etapa 2:** În coada de procesare AI (Queued in AI processing pipeline)
3. **Etapa 3:** Analiză nutrițională detaliată (Gemini Vision AI analyzing food items & macros)
4. **Etapa 4:** Finalizare & pregătire jurnal (Finalizing & preparing journal entry)

Once finalized, the sphere transitions cleanly to `state === 'completed'` with the green checkmark badge, and tapping it directly opens the review card with full macro breakdown.

---

## 4. Verification Evidence

- `frontend-nutritie/__tests__/runnerSphereCompanion.test.tsx`:
  - `renders idle state with accessible label`: **PASS**
  - `renders processing state while analysis is running`: **PASS**
  - `renders completed state with checkmark badge`: **PASS**
  - `features an authentic 6-phase running gait cycle with alternating limbs and depth shading`: **PASS**
  - Total: 6/6 tests passing.

**Status: VERIFIED & PASS**
