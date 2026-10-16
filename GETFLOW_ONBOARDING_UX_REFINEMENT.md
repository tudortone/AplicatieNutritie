# GETFLOW — FIRST-LAUNCH ONBOARDING UX REFINEMENT PROPOSAL

**Model:** Gemini 3.8 Flash High  
**Scope:** Onboarding Only  
**Priority:** P2  
**Status:** **PHASE 1–4 COMPLETED — WAITING FOR OWNER APPROVAL** (Read-Only Inspection & Design Proposal)  
**Consulted UI Policies:** `apple-design` (`onboarding.md`, `sliders.md`, `steppers.md`, `entering-data.md`) & `swiftui-design-skill` (Tactile precision, anti-slop, Flow dark theme `#090C0E` + lime `#CCFF00`)

---

## 1. VISUAL DESIGN COMPARISON & MOCKUPS

![Onboarding Value Selector Comparison](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/onboarding_before_after_1792193729453.jpg)

![Refined Onboarding Value Selector Mockup](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/onboarding_refined_selector_1792193714347.jpg)

---

## 2. ORIGINAL ISSUE & OWNER INTENT

The owner observed that during first-launch onboarding:
1. **Value vs Control Mismatch:** Value selectors display one number (e.g., `175 cm` or `75 kg`) while their interactive horizontal ruler/slider appears at the far-left minimum value (`120 cm` or `35 kg`).
2. **Abrupt Jumps:** Touching or slightly dragging the ruler causes an immediate value jump from the displayed number down to the minimum.
3. **Lack of Tactile Precision:** Users with specific numbers (e.g., 183 cm or 68.4 kg) are forced to swipe a micro-ruler through dozens of ticks without direct keypad entry or fine-stepper adjustment.
4. **Fluidity & Animation Friction:** Screen slide transitions clash with staggered child element fade animations, causing visual hitching during rapid step progression.

---

## 3. PHASE 1 — CODEBASE INSPECTION & ROOT CAUSE IDENTIFICATION

### 3.1 Mapping of All Actual Onboarding Steps (No Invented Steps)
The GetFlow onboarding flow consists of exactly **13 defined steps** in `PASI_ONBOARDING` (`components/onboarding/pasi.ts`):

| Step # | Route | Screen File | Component Type | Value Range / Options | Initial Default |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `/onboarding` | `app/onboarding/index.tsx` | Language Picker | `ro`, `en`, `de`, `fr` | System / `en` |
| 2 | `/onboarding/gen` | `app/onboarding/gen.tsx` | Radio Option Cards | `masculin`, `feminin` | `null` (required) |
| 3 | `/onboarding/data-nasterii` | `app/onboarding/data-nasterii.tsx` | 3-Column Scroll Picker | Day (1–31), Month (1–12), Year (18–100yo) | 25yo default (`anCurent - 25`) |
| 4 | `/onboarding/inaltime` | `app/onboarding/inaltime.tsx` | **SelectorValoare (Ruler)** | **120 – 230 cm** (step 1 cm) | `IMPLICIT = 175` |
| 5 | `/onboarding/greutate` | `app/onboarding/greutate.tsx` | **SelectorValoare (Ruler)** | **35 – 250 kg** (step 0.5 kg) | `IMPLICIT = 75` |
| 6 | `/onboarding/scop` | `app/onboarding/scop.tsx` | Radio Option Cards | `slabire`, `mentinere`, `masa` | `null` (required) |
| 7* | `/onboarding/greutate-tinta` | `app/onboarding/greutate-tinta.tsx` | **SelectorValoare (Ruler)** | **35 – 250 kg** (step 0.5 kg) | -10% lose / +8% gain |
| 8 | `/onboarding/activitate` | `app/onboarding/activitate.tsx` | Radio Option Cards | 5 activity levels | `null` (required) |
| 9* | `/onboarding/ritm` | `app/onboarding/ritm.tsx` | **SelectorValoare (Ruler)** | **0.1 – 1.5 kg/week** (step 0.1) | `IMPLICIT = 0.5` |
| 10 | `/onboarding/dieta` | `app/onboarding/dieta.tsx` | Radio Option Cards | 7 diet styles | `null` (required) |
| 11 | `/onboarding/calculating` | `app/onboarding/calculating.tsx` | Animated Progress Bar | 5 calculation stages | Auto-advances in 2.8s |
| 12 | `/onboarding/plan` | `app/onboarding/plan.tsx` | Plan Card & Macros | Daily kcal, P/C/F, BMR, TDEE | Read-only calculation |
| 13 | `/onboarding/prezentare` | `app/onboarding/prezentare.tsx` | Feature Showcase | 5 feature icons + Complete CTA | Saves and routes to `/auth` |

*\*Steps 7 and 9 are dynamically bypassed if the user selects `mentinere` (weight maintenance).*

---

### 3.2 The Exact Technical Root Causes

#### Root Cause 1: `useEffect` Early-Return on Mount in `SelectorValoare.tsx`
In `frontend-nutritie/components/onboarding/SelectorValoare.tsx`:
```tsx
const refScroll = useRef<ScrollView>(null)
const ultimaValoare = useRef(valoare) // Initialized to props.valoare on mount (e.g. 175)
const manevreaza = useRef(false)

// Pozitionam rigla pe valoarea curenta cand aceasta se schimba din exterior.
useEffect(() => {
    if (manevreaza.current) return
    if (valoare === ultimaValoare.current) return // <--- ABORTS ON INITIAL MOUNT!
    ultimaValoare.current = valoare
    const x = indiceDinValoare(valoare) * LATIME_PAS
    refScroll.current?.scrollTo({ x, animated: false })
}, [valoare, indiceDinValoare])
```
- Because `ultimaValoare` is initialized with `useRef(valoare)`, the condition `valoare === ultimaValoare.current` evaluates to `true` on initial render.
- The `scrollTo` command **is never called on mount**.

#### Root Cause 2: Native `<ScrollView>` Defaults to `contentOffset: { x: 0 }` (Minimum)
- In React Native, a horizontal `<ScrollView>` without an explicit `contentOffset` prop mounts at `x = 0`.
- At `x = 0`, the first visible graduation tick corresponds to `min` (`120 cm` for height, `35 kg` for weight, `0.1 kg/sapt` for pace).
- Result: **The displayed headline text shows `175 cm`, but the physical ruler indicator is pinned to the far-left minimum (`120 cm`)**.

#### Root Cause 3: Android 16 Layout Measurement Timing
- In React Native on Android, calling `scrollTo` before `onLayout` resolves is silently ignored because the content dimensions are not yet established in native layout memory.
- Without `contentOffset={{ x: initialX, y: 0 }}` and layout-gated synchronization, programmatic scrolls fail intermittently.

#### Root Cause 4: Silent Persistence of Unconfirmed Initial Values
- In `inaltime.tsx`:
  ```tsx
  laContinuare={() => {
      if (date.inaltimeCm === null) actualizeaza({ inaltimeCm: IMPLICIT })
  }}
  ```
- If a user rapidly taps "Continuă" without touching the ruler, the app silently persists `175 cm` and `75 kg` to their permanent user profile without explicit user confirmation.

#### Root Cause 5: Haptic Over-saturation During Rapid Dragging
- `Haptics.selectionAsync()` is invoked inside `laDerulare` on every single pixel tick. Rapid inertia flings trigger up to 60 haptic events per second on Android, flooding the system vibration thread and causing UI frame drops.

---

## 4. PHASE 2 — THE BETTER VALUE SELECTION CONTRACT

### 4.1 Value Synchronization & Suggested State
1. **Guaranteed Instant Initial Alignment:**
   - Compute `initialContentOffset = useMemo(() => ({ x: indiceDinValoare(valoare) * LATIME_PAS, y: 0 }), [])` and pass it directly to `<ScrollView contentOffset={initialContentOffset}>`.
   - On `onLayout`, execute a guaranteed alignment verification to ensure the ruler is centered precisely on the initial value across all screen widths.
2. **Distinguishing Confirmed vs Suggested Values:**
   - If the user has not interacted with the control yet (`date.inaltimeCm === null`), display a subtle label or pulse: *"Valoare sugerată · Atinge pentru a ajusta"* (Suggested value · Tap to adjust).
   - Once touched, edited, or stepped, the value transitions immediately to **Committed / Confirmed** state (`#FFFFFF` solid text with active lime accent mark).
3. **Preservation of Existing Profile Values:**
   - If a valid existing value is present in `date` (e.g., returning via "Înapoi" or resuming an interrupted session), the ruler mounts directly at that exact persisted value, never resetting to a default midpoint.

---

## 5. PHASE 3 — SMOOTHNESS, TACTILE INTERACTION & ACCESSIBILITY

In alignment with Apple HIG (`sliders.md › Best practices` & `steppers.md`):

1. **Precision Stepper Buttons (`-` / `+`):**
   - Place subtle, circular stepper pills on the left (`-`) and right (`+`) of the numeric display.
   - Allows one-handed single-unit adjustments (e.g. 174 -> 175 -> 176 cm) without requiring micro-swipes on the ruler.
2. **Direct Numeric Keypad Input:**
   - Tapping the numeric value displays an inline or sheet numeric keypad.
   - Allows users with known metrics (e.g., 183 cm or 68.4 kg) to type their value directly in 1 second.
3. **Throttled Haptic Feedback:**
   - Throttle `Haptics.selectionAsync()` to a minimum 35ms interval during fast momentum scrolls, preventing motor saturation and maintaining high FPS on Android.
4. **Harmonized Motion & Screen Transitions:**
   - Align `EcranPas` enter animations with the native Stack slide duration (240ms), eliminating the double-animation lag.
   - Respect system `reduceMotion` settings.

---

## 6. PHASE 4 — PROPOSED MINIMAL IMPLEMENTATION PLAN

### Files Expected to Change:
1. `frontend-nutritie/components/onboarding/SelectorValoare.tsx`:
   - Add `contentOffset` initialization and `onLayout` alignment.
   - Add stepper buttons (`-` / `+`) and direct numeric editing mode.
   - Add haptic throttling (35ms threshold).
   - Add explicit suggested vs confirmed visual state.
2. `frontend-nutritie/app/onboarding/inaltime.tsx`:
   - Wire explicit confirmation state so initial suggestion is clear and not silently fabricated.
3. `frontend-nutritie/app/onboarding/greutate.tsx`:
   - Wire explicit confirmation state for weight.
4. `frontend-nutritie/app/onboarding/greutate-tinta.tsx`:
   - Wire aligned initial target offset based on goal.
5. `frontend-nutritie/app/onboarding/ritm.tsx`:
   - Fix initial ruler alignment on 0.5 kg/week.
6. `frontend-nutritie/components/onboarding/EcranPas.tsx`:
   - Harmonize Reanimated enter durations to match Stack transition (240ms).
7. `frontend-nutritie/__tests__/onboardingValueSelector.test.tsx` (New TDD Suite):
   - Test initial ruler offset calculation.
   - Test stepper increment/decrement behavior.
   - Test direct numeric input parsing and boundary clamping.
   - Test synchronization between input, ruler, and context state.

---

## 7. OWNER APPROVAL GATE

> [!IMPORTANT]
> **Brainstorming Approval Required Before Implementation:**  
> In accordance with the instructions, this task is currently in **read-only inspection and proposal mode**. No code changes have been applied yet.  
> Please review the proposed design, mockups, and interaction plan above. Upon your approval, implementation will proceed using strict TDD and non-destructive verification.
