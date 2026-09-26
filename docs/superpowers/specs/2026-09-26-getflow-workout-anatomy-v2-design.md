# GetFlow Workout / Anatomy V2 — Design Specification

Date: 2026-09-26  
Status: awaiting implementation-plan approval  
Scope: Anatomy V2, exercise catalog, workout templates and sessions, Strength Map, original Flow Rank, integration QA

## 1. Objective

Build a separate, reversible Workout V2 experience that connects an original interactive anatomy model to a canonical exercise catalog, editable workout templates, active workout tracking, persisted history, a transparent current-strength rank, and a separate personal-progress metric.

The existing production anatomy and workout screens remain intact. V2 stays behind a preview feature flag until automated verification and native validation establish that it is safe to enable.

## 2. Non-goals and protected systems

This work does not modify billing, subscriptions, AdMob, SSV, UMP, Flow Credits monetization, nutrition, Photo AI, Journal business logic, OAuth, or GDPR behavior. It does not build an AAB or publish a release.

The feature does not provide medical analysis, injury assessment, population percentiles, or claims about strength relative to other people.

Liftoff is permitted only as inspiration for the broad sequence “logged lifting → progression → visualization → rank.” No Liftoff code, artwork, formulas, scale, thresholds, names, palette, UI composition, wording, or data will be used.

## 3. Existing-state constraints

The repository currently contains:

- a production `BodyMap` generated from `assets/anatomy/fata.svg` and `spate.svg`;
- 19 coarse production muscle IDs, including a single `delts` ID;
- a legacy catalog assembled from four exercise files;
- an active-workout draft stored under global AsyncStorage keys;
- completed workouts stored in `public.antrenamente` with JSON exercise sets;
- session-volume and tonnage ranks that are not suitable for the new demonstrated-strength product.

The existing assets have no repository-level provenance suitable for promotion as the V2 foundation. They remain production fallback only. Existing workout rows must remain readable.

## 4. Delivery structure

Implementation is split into four verified phases. Each phase produces its requested report and must pass its focused tests before the next phase begins.

1. Anatomy V2 foundation.
2. Exercise catalog, presets, builder, and template/session separation.
3. Strength Map and original Flow Rank.
4. End-to-end integration, responsiveness, accessibility, performance, and regression QA.

## 5. Module boundaries

New work lives in isolated V2 modules rather than enlarging the existing 45 KB workout screen.

```text
frontend-nutritie/
  assets/anatomy-v2/
    front.svg
    back.svg
    PROVENANCE.md
  constants/workout-v2/
    muscles.ts
    exercises.ts
    presets.ts
    ranks.ts
  lib/workout-v2/
    anatomyState.ts
    catalog.ts
    measurement.ts
    templateModel.ts
    sessionModel.ts
    strengthEngine.ts
    legacyAdapter.ts
    storageKeys.ts
  hooks/workout-v2/
    useWorkoutTemplates.ts
    useActiveWorkout.ts
    useStrengthMap.ts
  components/workout-v2/
    AnatomyV2Map.tsx
    AnatomyV2Legend.tsx
    MuscleDetailSheet.tsx
    ExercisePicker.tsx
    TemplateBuilder.tsx
    ActiveWorkout.tsx
    StrengthSummary.tsx
  app/workout-v2-preview.tsx
```

Names may be adjusted slightly to match repository conventions, but the boundaries remain: static domain data, pure computation, persistence hooks, presentational components, and route composition are separate.

## 6. Feature flag and fallback

The authority is a single helper that evaluates:

```text
__DEV__ || EXPO_PUBLIC_ENABLE_WORKOUT_V2_PREVIEW === "true"
```

`/workout-v2-preview` is registered in the Expo Router stack. When disabled it redirects to the existing workout tab and exposes no production navigation entry. Preview data is in-memory mock data and never writes user history or templates.

The production `BodyMap`, its assets, verifier, and existing workout tab are not deleted or silently switched. A later release decision can route the production workout entry to V2 without removing the fallback.

## 7. Anatomy V2

### 7.1 Artwork and legal provenance

V2 uses an original GetFlow vector model drawn specifically for this repository from basic Bézier shapes. It will not trace or derive from the current unknown-provenance assets or third-party anatomy artwork.

`PROVENANCE.md` records authorship, creation date, that no third-party artwork was incorporated, the canonical group naming convention, and the generation command. The focused verifier checks that both source SVGs and generated runtime data agree.

### 7.2 Canonical muscle taxonomy

V2 defines a separate `V2MuscleId` union:

```text
chest
upper_chest
front_delts
side_delts
rear_delts
traps
lats
lower_back
biceps
triceps
forearms
abs
obliques
glutes
quads
hamstrings
calves
adductors
hip_flexors
```

Each ID owns localized name keys, major-group membership, visible front/back views, and one or more source SVG region IDs. Bilateral paths share the same logical muscle ID but retain unique region IDs. A legacy adapter maps coarse production IDs into V2 without changing production types.

### 7.3 Visual state authority

Anatomy has two explicit modes so role highlighting and strength coloring cannot conflict:

- `exercise`: `NEUTRAL`, `PRIMARY`, `SECONDARY`, `STABILIZER`;
- `strength`: `NO_DATA`, `LEVEL_1` through `LEVEL_5`.

Tokens are centralized and use GetFlow’s theme vocabulary: neutral charcoal, lime for primary/progression, controlled cyan for secondary, and controlled orange for stabilizers. Labels, patterns/borders, and the legend supplement color so color is never the sole indicator.

Tapping any region selects its logical muscle. The compact detail surface exposes the localized muscle name and mode-relevant explanation. Front/back controls have selected state and at least a 44 dp practical target.

## 8. Canonical exercise catalog

The V2 catalog is strongly typed and uses stable IDs. User-visible names and descriptions are i18n keys, not embedded Romanian strings.

Each entry contains:

- stable exercise ID;
- movement family;
- strength/bodyweight/isometric/cardio/mobility kind;
- equipment;
- primary, secondary, and optional stabilizer V2 muscle IDs;
- measurement contract;
- bodyweight load factor when applicable;
- safe default sets, reps or duration, rest, and optional weight;
- whether the exercise is eligible for e1RM and Strength Rank.

The initial catalog covers horizontal and vertical push/pull, squat, hinge, lunge, carry, arm isolation, shoulder isolation, calves, core flexion/anti-extension/anti-rotation, common bodyweight movements, and cardio entries. Legacy exercise IDs are retained where semantically correct; ambiguous legacy rows are adapted explicitly instead of guessed at runtime.

Catalog validation fails tests for duplicate IDs, missing locale keys, unknown muscle IDs, invalid role weights, or incompatible measurement settings.

## 9. Templates and workout builder

### 9.1 Presets

The immutable seed definitions are:

- Push
- Pull
- Legs
- Upper
- Lower
- Full Body
- Beginner
- Home Dumbbells

Selecting a preset creates an editable draft copy. Presets are never mutated directly.

### 9.2 Template model

A template has an ID, owner ID, localized or custom name, schema version, ordered exercise blocks, and timestamps. Each strength block stores the exercise ID, planned sets/reps/weight/rest, and optional note. Each cardio block stores only fields appropriate to its measurement contract, such as duration, distance, pace, or resistance.

Supported operations are add, remove, reorder, duplicate exercise, edit fields, rename template, duplicate template, save, reopen, update, and delete.

### 9.3 Persistence and account isolation

A new idempotent Supabase migration creates `public.workout_templates` with `user_id`, versioned JSON content, timestamps, `ON DELETE CASCADE`, RLS, and explicit authenticated grants. Every query also filters by the authenticated user ID as defense in depth.

The repository abstraction accepts an explicit user ID. Local draft/cache keys include that user ID. Anonymous preview uses a separate in-memory repository and cannot read or write authenticated data. Mutation failures remain visible; the UI must not claim a successful save that did not persist.

### 9.4 Template versus active session

Templates contain plans. Active sessions contain an immutable source-template reference plus a mutable snapshot, actual set results, completion state, and timing. Starting a workout copies the template; subsequent template edits cannot mutate the active session.

The active draft is stored under a user-scoped key for crash recovery. Only finishing a session writes a completed `antrenamente` row. Canceling a session removes only the active draft.

## 10. Active workout and history

The active screen prioritizes the current exercise and its sets. Each set shows planned values alongside editable actual reps/weight/duration, completion toggle, and add-set action without requiring a modal for routine entry.

Adding/removing/reordering exercises remains available during the active workout. Cardio is logged through its own measurement fields. The finish action validates required fields, persists once, confirms the returned row, clears the draft, and only then shows success/navigation feedback.

Existing `antrenamente.exercitii` JSON remains readable. V2 writes a versioned, backward-compatible payload containing canonical exercise IDs and actual set fields. History normalization handles both legacy and V2 payloads.

Edit and delete operations update persisted history first. Strength and progression metrics are derived from the resulting history, so no stale rank cache needs invalidation.

## 11. Strength Map, original Flow Rank, and Progress Momentum

### 11.1 Two independent product metrics

The displayed e1RM is explicitly labeled “estimated 1RM.” Two independent metrics are calculated and displayed:

- **Strength Score / Flow Rank** represents how much current strength the user has demonstrated through recent valid lifting performances. It is the authority for exercise rank, muscle rank, overall rank, and Anatomy V2 strength colors.
- **Progress Momentum** represents improvement, active-week consistency, and evidence accumulated over time. It appears in details and history but never increases Strength Score.

Neither metric is a population percentile or medical measure. Muscle scores are described as GetFlow training-performance strength contributions, not isolated muscle measurements, muscle size, or hypertrophy.

### 11.2 Estimated 1RM

Eligible weighted sets use the public Epley estimate:

```text
e1RM = effectiveLoadKg × (1 + repetitions / 30)
```

Only completed working sets with 1–12 reps and positive effective load qualify. Warmups, cardio, timed holds, invalid values, and unsupported exercise kinds do not produce e1RM.

For bodyweight movements:

```text
effectiveLoad = bodyWeight × catalogBodyweightFactor
              + addedExternalWeight
              - assistanceWeight
```

Missing bodyweight produces a limited/unranked state. No default bodyweight is invented for rank calculations.

### 11.3 Current demonstrated Exercise Strength Score

For each eligible exercise, the engine selects the highest valid e1RM demonstrated during the most recent 90 days. Performances older than 90 days remain visible in history but are marked stale and do not establish current Strength Rank. The rolling window and stale state are centralized configuration.

Absolute load is not used alone. Each eligible catalog entry declares an auditable `strengthNormalizationAnchor`, expressed as an e1RM-to-bodyweight ratio that maps to 50 GetFlow Strength points for that specific movement. It is a product normalization anchor for comparing different movement mechanics, not a population standard, percentile, or sex/age curve. Coefficients and rationale are committed with the catalog and can be revised centrally. An exercise without an approved anchor remains unranked rather than receiving a guessed coefficient.

```text
relativeStrength = recentBestE1RM / currentBodyweightKg
normalizedStrength = relativeStrength / strengthNormalizationAnchor
strengthScore = round(100 × clamp(normalizedStrength / 2, 0, 1))
```

Therefore the declared anchor maps to 50 points and twice the anchor maps to the 100-point ceiling. This deliberately simple original 0–100 model has no fitted population curve, sex coefficient, percentile claim, or hidden dataset. At the same bodyweight a heavier valid lift scores higher; for the same lift a lighter athlete scores higher. Bodyweight remains a normalization input, so a heavier user is not rewarded merely for moving a larger absolute number.

Strength Score depends only on the current valid performance, bodyweight, exercise mechanics, and catalog anchor. Attendance, historical improvement, and consistency contribute zero points to Strength Score.

The V1 ranked set is intentionally limited to movements whose load is reasonably comparable. Initial anchors are internal product constants, not human-performance standards:

| Movement | Load interpretation | Bodyweight factor | Strength anchor |
|---|---|---:|---:|
| Barbell bench press | total bar load | — | 1.00 |
| Incline dumbbell press | combined dumbbell load | — | 0.75 |
| Standing overhead press | total bar load | — | 0.65 |
| Barbell row | total bar load | — | 0.90 |
| Back squat | total bar load | — | 1.25 |
| Front squat | total bar load | — | 1.05 |
| Conventional deadlift | total bar load | — | 1.50 |
| Romanian deadlift | total bar load | — | 1.20 |
| Weighted lunge | combined external load | — | 0.60 |
| Pull-up / chin-up | bodyweight plus added load minus assistance | 1.00 | 1.10 |
| Parallel-bar dip | bodyweight plus added load minus assistance | 0.90 | 0.95 |
| Push-up | estimated supported bodyweight plus added load | 0.69 | 0.60 |
| Dumbbell curl | combined dumbbell load | — | 0.35 |
| Dumbbell lateral raise | combined dumbbell load | — | 0.20 |

Machine and cable exercises are excluded from Strength Rank V1 because stack labels and leverage vary across equipment. They remain loggable and may show their own historical progress. New ranked exercises require an explicit reviewed anchor and load interpretation; no generic category fallback is permitted.

### 11.4 Muscle score

Current Exercise Strength Scores contribute through centralized role weights:

```text
PRIMARY     1.00
SECONDARY   0.45
STABILIZER  0.15
```

For a muscle, current contributions are sorted, the top four are aggregated as a normalized weighted mean, and a coverage factor limits sparse evidence:

```text
1 contributing exercise: 0.65
2 contributing exercises: 0.85
3 or more:                1.00
```

This prevents a single compound lift from unrealistically granting a whole-body maximum. The detail view lists exactly which current performances contributed, their e1RM, exercise score, and role.

### 11.5 Overall Flow Score and ranks

Muscles aggregate into six equal-weight major regions: chest, back, shoulders, arms, core, and legs. Overall Strength Score is the mean of regions with current evidence multiplied by coverage across all six. Fewer than three represented regions yields a limited state without an overall rank.

Central rank configuration uses these original internal keys and localized names:

```text
NO_DATA    0
FOUNDATION 1–19
FORGE      20–39
DRIVE      40–59
SURGE      60–79
FLOW       80–100
```

These names describe demonstrated strength rather than attendance or momentum. Thresholds, localized names, descriptions, and visual levels live in one configuration file. Exercise, muscle, and overall ranks use the same configuration but are clearly labeled by scope.

### 11.6 Separate Progress Momentum

Progress Momentum is calculated independently for each eligible exercise and may be summarized across exercises. History is sorted chronologically and recalculated from source sessions.

- Baseline performance: median of the first up to three valid session-best e1RM values.
- Recent performance: median of the latest up to three valid session-best e1RM values.
- Recent improvement: signed percentage change from baseline to recent performance.
- Progress signal: positive improvement capped when it reaches 30%.
- Consistency signal: distinct trained weeks, capped at eight.
- Evidence signal: valid sessions, capped at six.

```text
momentumScore = round(100 × (
  0.65 × progressSignal +
  0.25 × consistencySignal +
  0.10 × evidenceSignal
))
```

The UI presents the useful facts directly—such as `+8.4%`, `6 active weeks`, and `9 valid sessions`—alongside the optional 0–100 Momentum summary. A high Momentum score cannot change exercise, muscle, or overall Strength Rank.

### 11.7 Recalculation rules

The engine is a pure function of canonical catalog data, current bodyweight, current time, and persisted workout history. Tests inject the current time for determinism. It writes no rank cache. Editing or deleting history and then refetching necessarily produces new Strength and Momentum results. Cardio never enters Strength Rank V1.

## 12. Preview experience

The isolated preview offers deterministic mock profiles for no data, lower demonstrated strength with strong recent improvement, high demonstrated strength with little recent improvement, and high strength plus high progress. It proves that the high-strength/low-progress user has the higher Strength Rank while the lower-strength/high-progress user may have the higher Momentum score.

Additional comparison fixtures cover the same bodyweight with different lifts, the same lift with different bodyweights, a bodyweight movement, an assisted bodyweight movement, and missing bodyweight. The preview supports front/back, exercise-role visualization, strength visualization, muscle selection, muscle detail, preset editing, a disposable active workout, and separate Strength/Momentum summaries.

Mocks are deterministic fixtures injected into repositories. Preview operations cannot access Supabase or production AsyncStorage keys.

## 13. UX, responsiveness, and accessibility

The final V2 screen uses compact obsidian/charcoal surfaces, lime primary actions, and restrained cyan/orange accents. Workout content remains dominant; no giant dashboard cards or decorative emoji are introduced.

Layouts are validated at 320×568, 360×640, 360×800, 390×844, and 412×915 with font scales 1.0, 1.2, and 1.4. Editable screens use the existing keyboard-aware and safe-area patterns. Lists use stable keys and virtualized rendering where appropriate. Anatomy data and score inputs are memoized; SVG arrays and rank tokens are module constants rather than per-render allocations.

Interactive controls expose translated accessibility labels, roles, selected/checked states, and stable test IDs. Reordering has accessible move-up/move-down alternatives. Muscle states use text/legend/borders as well as color.

RO, EN, FR, and DE must have parity for all V2 keys. Raw keys are not acceptable user-visible fallbacks.

## 14. Testing strategy

### Phase 1

- original SVG provenance and source/runtime parity;
- unique canonical muscle IDs and region IDs;
- complete front/back mapping;
- role and strength state resolution;
- tap selection, front/back controls, accessibility, responsiveness;
- proof that production anatomy imports remain unchanged.

### Phase 2

- catalog uniqueness and locale parity;
- valid exercise-to-muscle roles;
- all eight presets and editable-copy behavior;
- add/remove/reorder/duplicate and all editable fields;
- cardio field contracts;
- save/reopen/update/rename/duplicate/delete;
- account isolation and preview isolation;
- strict template/active-session separation;
- truthful persistence failure behavior.

### Phase 3

- Epley e1RM boundaries and invalid inputs;
- weighted, bodyweight, assisted, and missing-bodyweight cases;
- current demonstrated exercise score and strength-rank transitions;
- same-bodyweight/different-lift and same-lift/different-bodyweight normalization;
- explicit catalog normalization anchors and unranked behavior without one;
- primary/secondary/stabilizer contribution weights;
- one-exercise dominance cap;
- overall coverage rules and no-data states;
- separate Progress Momentum and proof it cannot alter Strength Rank;
- low-strength/high-progress versus high-strength/low-progress preview ordering;
- cardio exclusion;
- edit/delete recalculation;
- front/back strength colors and muscle detail provenance.

### Phase 4

- preset → edit → save → start → record → finish → history → recalculation;
- responsive and keyboard matrix;
- accessibility contracts;
- targeted render-count/performance assertions where stable;
- current anatomy/navigation/i18n tests;
- focused regression checks for Home, Journal, Photo AI, Custom Foods, Coach, Premium, Billing, Flow Credits, and Ads without modifying those systems;
- TypeScript and frontend lint.

No test may rely only on source-string assertions when a production component or pure domain contract can be exercised directly.

## 15. Reports and release state

The implementation produces:

1. `GETFLOW_ANATOMY_V2_FOUNDATION_REPORT.md`
2. `GETFLOW_WORKOUT_BUILDER_TEMPLATES_REPORT.md`
3. `GETFLOW_STRENGTH_MAP_FLOW_RANK_REPORT.md`
4. `GETFLOW_WORKOUT_ANATOMY_V2_FINAL_REPORT.md`

Reports distinguish automated evidence from native-device evidence and never declare third-party ProductDetails-style runtime facts by analogy. The final V2 state is:

- `READY TO ENABLE` only if all automated gates pass, persistence schema is available, and required native matrix validation exists;
- `PREVIEW ONLY` when source and automated tests pass but native validation or live migration remains pending;
- `BLOCKED` when a functional or legal gate fails.

The expected status for this source-only task is at most `PREVIEW ONLY`; no AAB is run.

## 16. Implementation safety

Before each phase, inspect the dirty worktree and the exact target-file diffs. Use focused new files and small integration edits. Never reset, clean, stash, rebase, merge, mass-format, or discard unrelated work. If a concurrently modified file becomes necessary, re-read it immediately before patching and preserve all unrelated changes.
