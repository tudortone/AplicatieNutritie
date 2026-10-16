# GETFLOW — EVOLVING COMPANION & PROGRESS WIDGET DESIGN

**Project:** GetFlow (`com.totsrl.getflo`)  
**Task:** Product Design, Progression Architecture, and Visual Concept Evaluation  
**Mode:** **BRAINSTORMING / PRODUCT DESIGN ONLY — STOP FOR OWNER APPROVAL**  
**Consulted UI Policies:** `apple-design`, `swiftui-design-skill`, Android Accessibility Guidelines  
**Primary Reference Authority:** Owner-provided concept board `HOME TOP BAR — REFINED CONCEPT`

---

## 1. THREE COMPANION PRODUCT CONCEPTS

### Concept A — FLOW PET (Owner's Attached Reference)
![Concept A: Flow Pet](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/concept_a_flow_pet_1792194049970.jpg)

- **Character Identity:** A charming, pixel-inspired sprout companion that evolves into an agile leaf-fox and ultimately a glowing cyber-beast with vibrant neon-lime accents (`#CCFF00`).
- **Visual Style:** Micro pixel-art aesthetic (32×32dp footprint), matching the exact pet in the owner's attached reference board.
- **Personality:** Warm, energetic, supportive. Celebrates healthy meals and consistent streaks.
- **Evolution Stages (Pilot):**
  - **Stage 1 (Lv 1–3):** *Sprout Seedling* — Small, round sprout with curious wide eyes and a single leaf.
  - **Stage 2 (Lv 4–7):** *Leaf Fox* — Agile young companion with pointed ears and animated tail.
  - **Stage 3 (Lv 8+):** *Flow Guardian* — Majestic cyber-beast enveloped in a soft lime energy corona.

---

### Concept B — FLOW SPARK (Living Lightbulb / Energy Creature)
![Concept B: Flow Spark](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/concept_b_flow_spark_1792194066537.jpg)

- **Character Identity:** A friendly, minimalist living incandescent bulb with glowing LED filament facial expressions that emit warm neon-lime light.
- **Visual Style:** Sleek industrial minimalism, glass translucency, clean filament line art.
- **Personality:** Inventive, clever, illuminating. Reacts to nutrient balance and caloric mindfulness.
- **Evolution Stages (Pilot):**
  - **Stage 1:** *Edison Filament* — Warm, vintage amber filament with a shy, cozy smile.
  - **Stage 2:** *Halogen Arc* — Bright lime halogen core with dynamic electrical micro-arcs.
  - **Stage 3:** *Plasma Core* — High-tech crystalline orb encircled by orbital energy sparks.

---

### Concept C — FLOW ORBIT COMPANION (Paired Celestial Winged Sphere)
![Concept C: Flow Orbit Companion](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/concept_c_flow_orbit_1792194086607.jpg)

- **Character Identity:** A mini mechanical/celestial wisp designed as the direct sister entity to the Runner Sphere.
- **Visual Style:** Chrome steel shell, visor eyes, and glowing holographic wings of light.
- **Personality:** Fast, aerodynamic, futuristic. Floats beside the sphere in synchronous rhythm.
- **Evolution Stages (Pilot):**
  - **Stage 1:** *Orb Droplet* — Tiny floating metallic droplet with curious lime visor eyes.
  - **Stage 2:** *Winged Wisp* — Dual light wings that beat during active workouts and photo processing.
  - **Stage 3:** *Celestial Guardian* — Armored crest with dual revolving energy rings.

---

## 2. RECOMMENDED CONCEPT: CONCEPT A (FLOW PET)

We strongly recommend **Concept A (Flow Pet)** for the following design and technical reasons:
1. **Direct Alignment with Owner's Reference Board:** Matches the pixel-inspired sprout creature shown in the approved `HERO TOP BAR CONCEPT` asset.
2. **Visual Contrast:** Pairing a mechanical chrome/glass Runner Sphere with an organic, cute pixel pet creates a visually rich contrast (high-tech precision + warm emotional connection).
3. **Footprint & Legibility:** At 32×32dp, pixel-art maintains 100% silhouette clarity on mobile screens without getting lost or looking blurry like complex 3D renders.

---

## 3. BEFORE & AFTER HOME TOP BAR INTEGRATION

### In-Context Home Top Bar Mockup
![Home Top Bar Integration](/C:/Users/tudor/.gemini/antigravity-ide/brain/52f0a408-d40f-43bf-80ac-1569548494ed/runner_sphere_home_mockup_1792193944833.jpg)

### Spatial Layout Comparison (Android Viewport 360dp – 412dp):

```text
BEFORE (Current Production Header):
[ Empty Space (~110dp) ]                     [ Flow Credits Pill ] [ Bell ] [ Streak 🔥 ]

AFTER (Refined Header with Runner Sphere & Companion):
[ Sphere (44dp) ] [ Pet (32dp) + Lv 4 ]      [ Flow Credits Pill ] [ Bell ] [ Streak 🔥 ]
└────────────── 82dp ─────────────────┘      └─────────────── 208dp ───────────────────┘
```
- Fits completely within standard Android width without squeezing or hiding existing controls.
- Calorie Ring and daily nutrition breakdown remain 100% untouched below the header.

---

## 4. PROGRESSION SYSTEM & ETHICAL HEALTH DESIGN

### 4.1 Authoritative Existing Data Sources (No New Backend Infrastructure)
To avoid unnecessary backend complexity during the MVP pilot, the companion levels directly from verified existing local and Supabase data sources:

| Source | File / Hook | Data Points Used | Ethical Health Safeguards |
| :--- | :--- | :--- | :--- |
| **Streaks** | `context/GamificareContext.tsx` | Consecutive active days | Rewards consistency, not perfection. |
| **Daily Logging** | `hooks/useMeseAzi.ts` | Meal entries count | Points awarded for *logging*, regardless of whether calories were high or low. |
| **Workouts** | `hooks/useAntrenamente.ts` | Completed workout sessions | Points for completion, capped at 1 workout per day to prevent over-training. |
| **Water Target** | `hooks/useApa.ts` | Daily hydration progress | Rewards healthy water intake (up to daily target). |
| **Flow Credits** | `context/FlowCreditsContext.tsx` | Spendable credit balance | Read-only balance reflection; never converted into XP. |

### 4.2 Ethical Health Safeguards (Anti-Disordered Eating)
- **Zero Calorie Restriction Rewards:** We strictly do **NOT** award XP for eating fewer calories or achieving a severe deficit.
- **Zero Starvation Incentives:** Under-eating does not level up the companion.
- **Safe Consistency Focus:** XP is earned by the mindful habit of logging meals, drinking water, and exercising safely.

### 4.3 Pilot Progression Formula
```text
XP Formula:
- Daily Check-in / Open App: +10 XP
- Log at least 3 meals in a day: +30 XP
- Complete a workout session: +40 XP
- Reach 80%+ of hydration target: +20 XP
Daily Cap: 100 XP per day (prevents obsessive grinding)

Levels & Evolution:
- Level 1 (0 – 100 XP): Sprout Seedling (Stage 1)
- Level 2 (100 – 300 XP): Sprout Seedling
- Level 3 (300 – 600 XP): Sprout Seedling
- Level 4 (600 – 1,000 XP): Leaf Fox (Stage 2 Evolution!)
- Level 5 – 7 (1,000 – 2,500 XP): Leaf Fox
- Level 8+ (2,500+ XP): Flow Guardian (Stage 3 Evolution!)
```

---

## 5. RESOLVING THE "BUDGET / MONEY" AMBIGUITY

The owner's prompt notes:
> *"The owner also wants useful progress or budget information. IMPORTANT AMBIGUITY: 'Budget / money' might mean: available Flow Credits, money spent or available for the application, progress toward a daily goal, or an in-app progression system. Do not invent a financial budgeting feature. Ask the owner which interpretation is intended before implementation."*

We propose two distinct, ethical widgets for the owner to choose between:

### Option 1: Flow Credits Budget Widget (Spendable AI Balance)
- **What it displays:** The user's verified, server-authoritative Flow Credits balance (e.g., `4 Credits`).
- **Utility:** Shows how many Photo AI analyses, AI Coach suggestions, or barcode lookups the user can perform today.
- **Integration:** Replaces or enriches the existing `FlowCreditsPill` with a micro-indicator directly beside the companion.

### Option 2: Daily Calorie / Macronutrient Budget Widget
- **What it displays:** The remaining daily energy budget (e.g., `850 kcal remaining` or `45g protein left`).
- **Utility:** Nutritionists and fitness coaches commonly refer to daily target allowances as an "energy budget".
- **Integration:** Pinned as a subtle pill beside the companion, linking to the Calorie Ring below.

### Option 3: Separate Financial Tracking (Requires Product/Privacy Assessment)
- If the owner specifically desires real financial budgeting (money spent on groceries, food costs, or app subscriptions), this introduces major banking/financial regulatory and privacy implications under GDPR/PSD2. This must be handled in a dedicated financial feature, not combined with the companion.

---

## 6. PROPOSED COMPONENT ARCHITECTURE & PERFORMANCE BUDGET

```text
frontend-nutritie/
├── components/home/
│   ├── FlowCompanionWidget.tsx      # Main left container (Sphere + Companion)
│   ├── RunnerSphereCore.tsx         # 44dp layered metallic sphere + Reanimated rings
│   ├── MicroCompanionView.tsx       # 32dp pixel-art sprite with Reanimated bobbing
│   ├── CompanionLevelBadge.tsx      # Floating Lv 4 pill with micro-progress bar
│   └── FlowCompanionModal.tsx       # Fullscreen bottom sheet with evolution lore
└── lib/
    ├── companionProgression.ts      # Pure functions for XP, levels, and evolution
    └── companionSound.ts            # Optional subtle haptic pulses on level-up
```

### Performance & Thermal Budget:
- **Frame Rate:** Locked 60 FPS / 120Hz (runs 100% on native Reanimated UI thread).
- **CPU Overhead:** < 0.5% (no runtime physics, no 3D raytracing).
- **Memory Overhead:** ~1.5 MB for lightweight WebP sprite sheets.
- **Reduced Motion:** If `useReducedMotion()` is enabled, all continuous bobbing and orbital rotation stops; sprites remain in crisp static poses.

---

## 7. PRIVACY, ETHICS & CHILD SAFETY

- **COPPA / GDPR-K Compliance:** The companion is supportive and friendly, but contains **zero loot boxes, zero gambling mechanics, zero dark patterns, and zero pay-to-win mechanics**.
- **Data Isolation:** Progression XP and levels are saved under user-scoped AsyncStorage keys (`user_${userId}_companion_xp`) and synchronized to Supabase `profil` metadata. Logging out or switching accounts instantly clears and restores the correct user's pet.

---

## 8. TEST STRATEGY & EFFORT ESTIMATE

### Test Strategy:
1. `__tests__/companionProgression.test.ts`: Unit test XP accumulation, level threshold calculations, evolution stage boundaries, and daily XP capping.
2. `__tests__/companionAccountIsolation.test.ts`: Verify that switching users does not leak XP, levels, or pet evolution.
3. `__tests__/companionResponsiveLayout.test.tsx`: Verify header rendering across 320dp, 360dp, 412dp, and tablet widths.

### Effort Estimate:
- **Phase 1 (Visual Assets & Reanimated Sprites):** 1.5 dev days
- **Phase 2 (Progression State & Context Integration):** 1 dev day
- **Phase 3 (Header Responsive Integration & Modal Polish):** 1 dev day
- **Phase 4 (TDD, Accessibility, & Samsung S24 Ultra QA):** 1 dev day
- **Total Implementation Effort:** 4.5 dev days.

---

## 9. OWNER DECISION GATE

> [!IMPORTANT]
> **Owner Clarification Required:**  
> Before writing plans or code, please review the proposal and answer the interactive questions below:  
> 1. Which companion design concept do you prefer: **Concept A (Flow Pet)**, **Concept B (Flow Spark)**, or **Concept C (Flow Orbit)**?  
> 2. What is your intended meaning for **"budget"**: **Flow Credits (AI currency)**, **Daily Calorie/Macro allowance**, or **In-App XP/Progression**?
