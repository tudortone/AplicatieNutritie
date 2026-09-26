# GetFlow Workout / Anatomy V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reversible Workout V2 preview that joins original anatomy artwork, a canonical exercise catalog, editable templates, active workout tracking, demonstrated-strength Flow Rank, and a separate Progress Momentum metric.

**Architecture:** New V2 domain modules and components remain isolated from the production workout/anatomy implementation. Pure functions own taxonomy, templates, sessions, strength calculations, and visual-state resolution; thin hooks own user-scoped persistence; one feature-gated preview route composes the experience. Completed workouts remain compatible with `antrenamente`, while a new RLS-protected `workout_templates` table stores user templates.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript 5.9 strict, Expo Router 6, React Native SVG 15, Supabase, AsyncStorage, Jest 29, Testing Library React Native, i18next.

**Spec:** `docs/superpowers/specs/2026-09-26-getflow-workout-anatomy-v2-design.md`

## Global Constraints

- Preserve `components/fitness/BodyMap.tsx`, current anatomy assets, and the production workout tab as fallback.
- Enable V2 only for `__DEV__` or `EXPO_PUBLIC_ENABLE_WORKOUT_V2_PREVIEW=true`.
- Do not add a dependency unless the repository lacks an SDK 54-compatible solution.
- All user-visible copy must exist in RO, EN, FR, and DE; no raw key fallback.
- All interactive controls need role, translated label, state where applicable, stable test ID, and a practical 44 dp target.
- Strength Score measures current demonstrated performance; Progress Momentum is separate and contributes zero Strength points.
- No population percentile, medical, hypertrophy, or comparative-human claim.
- Do not modify billing, subscriptions, ads, SSV, UMP, Flow Credits monetization, nutrition, Photo AI, Journal business logic, OAuth, or GDPR.
- Never reset, clean, stash, rebase, merge, discard unrelated work, or mass-format the repository.
- No AAB, deploy, production switch, or live migration execution.

---

### Task 1: Anatomy V2 taxonomy and original vector sources

**Files:**
- Create: `frontend-nutritie/constants/workout-v2/muscles.ts`
- Create: `frontend-nutritie/assets/anatomy-v2/front.svg`
- Create: `frontend-nutritie/assets/anatomy-v2/back.svg`
- Create: `frontend-nutritie/assets/anatomy-v2/PROVENANCE.md`
- Create: `frontend-nutritie/__tests__/workoutV2Muscles.test.ts`

**Interfaces:**
- Produces: `V2_MUSCLE_IDS`, `V2MuscleId`, `V2_MUSCLES`, `V2MuscleRegionId`, `v2RegionId()`.
- Guarantees: 19 canonical muscle IDs, unique region IDs, explicit front/back visibility, no import from production anatomy.

- [ ] **Step 1: Write the failing taxonomy test**

```ts
import { V2_MUSCLE_IDS, V2_MUSCLES } from '../constants/workout-v2/muscles';

it('defines 19 unique canonical muscles with drawable views', () => {
  expect(new Set(V2_MUSCLE_IDS).size).toBe(19);
  expect(V2_MUSCLE_IDS).toEqual(expect.arrayContaining([
    'upper_chest', 'front_delts', 'side_delts', 'rear_delts', 'hip_flexors',
  ]));
  for (const id of V2_MUSCLE_IDS) expect(V2_MUSCLES[id].views.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --runInBand __tests__/workoutV2Muscles.test.ts` from `frontend-nutritie`  
Expected: FAIL because the V2 taxonomy does not exist.

- [ ] **Step 3: Implement the typed taxonomy**

```ts
export const V2_MUSCLE_IDS = [
  'chest', 'upper_chest', 'front_delts', 'side_delts', 'rear_delts',
  'traps', 'lats', 'lower_back', 'biceps', 'triceps', 'forearms', 'abs',
  'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'adductors',
  'hip_flexors',
] as const;
export type V2MuscleId = typeof V2_MUSCLE_IDS[number];
export type AnatomyV2View = 'front' | 'back';
export type V2MuscleRegionId = `${V2MuscleId}:${AnatomyV2View}:${'left' | 'right' | 'center'}`;
```

- [ ] **Step 4: Draw original front/back SVGs**

Use only authored Bézier paths with IDs matching the region convention. Include neutral silhouette paths and bilateral muscle groups; do not trace `fata.svg`, `spate.svg`, or external artwork. Record exact authorship and non-derivation in `PROVENANCE.md`.

- [ ] **Step 5: Run GREEN and checkpoint**

Run the focused test and `git diff --check` on the five task files. Commit only these files with `feat(workout-v2): add original anatomy taxonomy`.

### Task 2: Anatomy build verifier and generated runtime data

**Files:**
- Create: `frontend-nutritie/scripts/buildAnatomyV2.mjs`
- Create: `frontend-nutritie/scripts/verifyAnatomyV2.mjs`
- Create: `frontend-nutritie/components/workout-v2/anatomyV2Front.ts`
- Create: `frontend-nutritie/components/workout-v2/anatomyV2Back.ts`
- Create: `frontend-nutritie/components/workout-v2/anatomyV2Types.ts`
- Create: `frontend-nutritie/__tests__/workoutV2AnatomyPipeline.test.ts`
- Modify: `frontend-nutritie/package.json`

**Interfaces:**
- Produces: `AnatomyV2Shape`, `AnatomyV2Source`, `ANATOMY_V2_FRONT`, `ANATOMY_V2_BACK`.
- Commands: `npm run anatomy:v2:build`, `npm run anatomy:v2:verify`.

- [ ] **Step 1: Write pipeline RED tests**

```ts
const result = spawnSync(process.execPath, ['scripts/verifyAnatomyV2.mjs'], { cwd: root, encoding: 'utf8' });
expect(result.status).toBe(0);
expect(result.stdout).toContain('ANATOMY V2 PIPELINE OK');
expect(readFileSync(resolve(root, 'components/fitness/BodyMap.tsx'), 'utf8'))
  .not.toContain('anatomyV2Front');
```

- [ ] **Step 2: Run RED**

Expected: FAIL because scripts and runtime data do not exist.

- [ ] **Step 3: Implement deterministic parsing and generation**

Parse only `<path>` nodes with known `data-muscle`, `data-side`, and `id`. Sort nothing; preserve source order. Reject unknown muscles, duplicate region IDs, empty paths, missing views, and source/runtime count drift.

- [ ] **Step 4: Generate and verify**

Run `npm run anatomy:v2:build`, `npm run anatomy:v2:verify`, and the focused test. Commit sources, scripts, generated modules, test, and package script together.

### Task 3: Anatomy visual states and accessible component

**Files:**
- Create: `frontend-nutritie/lib/workout-v2/anatomyState.ts`
- Create: `frontend-nutritie/components/workout-v2/AnatomyV2Map.tsx`
- Create: `frontend-nutritie/components/workout-v2/AnatomyV2Legend.tsx`
- Create: `frontend-nutritie/components/workout-v2/MuscleDetailSheet.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2AnatomyComponent.test.tsx`

**Interfaces:**
- Produces: `ExerciseHighlightRole`, `StrengthLevel`, `AnatomyV2DisplayState`, `resolveAnatomyV2State()`, `AnatomyV2Map`.
- Consumes: Task 1 taxonomy and Task 2 runtime shapes.

- [ ] **Step 1: Write state and interaction RED tests**

```ts
expect(resolveAnatomyV2State({ mode: 'exercise', primary: ['chest'], secondary: [], stabilizers: [] }, 'chest'))
  .toBe('PRIMARY');
expect(resolveAnatomyV2State({ mode: 'strength', scores: { chest: 81 } }, 'chest'))
  .toBe('LEVEL_5');
fireEvent.press(view.getByTestId('anatomy-v2-region-chest-front-left'));
expect(onSelectMuscle).toHaveBeenCalledWith('chest');
```

- [ ] **Step 2: Run RED, implement minimal pure resolver, then component**

Use theme-derived state tokens, group paths by logical muscle, memoize static source data, and expose front/back controls plus text legend. Do not allocate path arrays inside render.

- [ ] **Step 3: Run GREEN and commit**

Run the Task 3 test plus existing `p108AnatomyComponent.test.tsx` to prove fallback stability.

### Task 4: Feature-gated isolated preview and Phase 1 report

**Files:**
- Create: `frontend-nutritie/lib/workout-v2/featureFlag.ts`
- Create: `frontend-nutritie/app/workout-v2-preview.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2PreviewGate.test.tsx`
- Modify: `frontend-nutritie/app/_layout.tsx`
- Modify: `frontend-nutritie/i18n/locales/ro.json`
- Modify: `frontend-nutritie/i18n/locales/en.json`
- Modify: `frontend-nutritie/i18n/locales/fr.json`
- Modify: `frontend-nutritie/i18n/locales/de.json`
- Create: `GETFLOW_ANATOMY_V2_FOUNDATION_REPORT.md`

**Interfaces:**
- Produces: `isWorkoutV2PreviewEnabled(env, isDev): boolean` and route `/workout-v2-preview`.

- [ ] **Step 1: Add RED tests for flag, route isolation, locale parity, and fallback imports**

```ts
expect(isWorkoutV2PreviewEnabled({}, false)).toBe(false);
expect(isWorkoutV2PreviewEnabled({ EXPO_PUBLIC_ENABLE_WORKOUT_V2_PREVIEW: 'true' }, false)).toBe(true);
expect(readFileSync(bodyMapPath, 'utf8')).toContain("from './anatomyFront'");
```

- [ ] **Step 2: Implement the flag and preview route**

Disabled route uses `<Redirect href="/(tabs)/antrenamente" />`. Enabled route renders front/back, role-mode controls, deterministic mock muscle selection, and no persistence hook.

- [ ] **Step 3: Verify Phase 1**

Run all `workoutV2*Anatomy*` tests, existing P1-07/P1-08 suites, locale parity, typecheck, lint, and `npm run anatomy:v2:verify`. Record exact results in the Phase 1 report, inspect the dirty worktree, then continue.

### Task 5: Canonical V2 exercise catalog and validation

**Files:**
- Create: `frontend-nutritie/constants/workout-v2/exercises.ts`
- Create: `frontend-nutritie/lib/workout-v2/catalog.ts`
- Create: `frontend-nutritie/lib/workout-v2/measurement.ts`
- Create: `frontend-nutritie/lib/workout-v2/legacyAdapter.ts`
- Create: `frontend-nutritie/__tests__/workoutV2Catalog.test.ts`
- Modify: four locale JSON files

**Interfaces:**
- Produces: `WorkoutV2Exercise`, `WorkoutV2ExerciseId`, `ExerciseMuscleRole`, `ExerciseMeasurement`, `WORKOUT_V2_EXERCISES`, `getWorkoutV2Exercise()`, `validateWorkoutV2Catalog()`.

- [ ] **Step 1: Write RED catalog invariants**

```ts
expect(() => validateWorkoutV2Catalog(WORKOUT_V2_EXERCISES)).not.toThrow();
expect(new Set(WORKOUT_V2_EXERCISES.map((item) => item.id)).size).toBe(WORKOUT_V2_EXERCISES.length);
expect(getWorkoutV2Exercise('barbell-bench-press')?.muscles.primary).toContain('chest');
expect(getWorkoutV2Exercise('running')?.strengthEligible).toBe(false);
```

- [ ] **Step 2: Implement catalog types and a curated catalog**

Cover all required movement families, bodyweight movements, isometrics, mobility, and cardio. Store `nameKey`, equipment, measurement, defaults, role arrays, optional bodyweight factor, and optional reviewed normalization anchor. Machine/cable exercises remain strength-ineligible V1.

- [ ] **Step 3: Implement explicit legacy adapters**

Use a static `Record<string, WorkoutV2ExerciseId>` for known IDs. Return a typed unsupported result for unknown IDs; do not infer rank eligibility from free text.

- [ ] **Step 4: Run GREEN, locale parity, and commit**

### Task 6: Presets and immutable builder domain

**Files:**
- Create: `frontend-nutritie/constants/workout-v2/presets.ts`
- Create: `frontend-nutritie/lib/workout-v2/templateModel.ts`
- Create: `frontend-nutritie/__tests__/workoutV2Templates.test.ts`
- Modify: four locale JSON files

**Interfaces:**
- Produces: `WorkoutTemplate`, `TemplateExerciseBlock`, `TemplateCardioBlock`, `WORKOUT_V2_PRESETS`, `instantiatePreset()`, `addTemplateExercise()`, `removeTemplateBlock()`, `moveTemplateBlock()`, `duplicateTemplateBlock()`, `renameTemplate()`.

- [ ] **Step 1: Write RED tests for all eight presets and mutations**

```ts
expect(WORKOUT_V2_PRESETS.map((item) => item.id)).toEqual([
  'push', 'pull', 'legs', 'upper', 'lower', 'full-body', 'beginner', 'home-dumbbells',
]);
const draft = instantiatePreset(WORKOUT_V2_PRESETS[0], 'user-1', 'template-1');
expect(renameTemplate(draft, 'Push A').name).toBe('Push A');
expect(WORKOUT_V2_PRESETS[0].nameKey).toBe('workoutV2.presets.push');
```

- [ ] **Step 2: Implement immutable operations with stable IDs**

All operations return new objects; preset constants remain frozen. Reorder clamps destination indexes. Cardio and strength blocks validate different fields.

- [ ] **Step 3: Run GREEN and commit**

### Task 7: Template persistence with RLS and truthful failures

**Files:**
- Create: `supabase/migrations/20260926090000_workout_v2_templates.sql`
- Create: `frontend-nutritie/lib/workout-v2/storageKeys.ts`
- Create: `frontend-nutritie/lib/workout-v2/templateRepository.ts`
- Create: `frontend-nutritie/hooks/workout-v2/useWorkoutTemplates.ts`
- Create: `frontend-nutritie/__tests__/workoutV2TemplateRepository.test.ts`
- Create: `supabase/tests/workout_v2_templates_rls.test.sql`

**Interfaces:**
- Produces: `WorkoutTemplateRepository` with `list`, `create`, `update`, `rename`, `duplicate`, `remove`; `templateCacheKey(userId)`; `useWorkoutTemplates()`.

- [ ] **Step 1: Write RED repository tests**

```ts
await expect(repo.list('user-b')).resolves.toEqual([]);
await expect(repo.create('user-a', templateForUserB)).rejects.toThrow('OWNER_MISMATCH');
await expect(repo.remove('user-a', 'missing')).rejects.toThrow('TEMPLATE_NOT_FOUND');
```

- [ ] **Step 2: Write the idempotent migration**

Create UUID primary key, non-null `user_id`, schema version, name, JSONB blocks, timestamps, FK cascade, RLS policy `auth.uid() = user_id`, index `(user_id, updated_at desc)`, and explicit authenticated grants. Revoke anonymous access.

- [ ] **Step 3: Implement repository and hook**

All Supabase queries include `.eq('user_id', userId)`. Cache keys are `getflow:workout-v2:templates:${userId}`. Preview gets an in-memory repository. Return errors to UI; never convert failure into success.

- [ ] **Step 4: Run Jest and SQL static/RLS tests, then commit**

Do not apply the migration to the live project in this task.

### Task 8: Active-session model and crash-safe user isolation

**Files:**
- Create: `frontend-nutritie/lib/workout-v2/sessionModel.ts`
- Create: `frontend-nutritie/hooks/workout-v2/useActiveWorkout.ts`
- Create: `frontend-nutritie/__tests__/workoutV2ActiveSession.test.ts`

**Interfaces:**
- Produces: `ActiveWorkoutSession`, `ActiveExerciseBlock`, `ActualWorkoutSet`, `startWorkoutFromTemplate()`, `completeSet()`, `addActualSet()`, `validateSessionForFinish()`, `activeSessionKey(userId)`.

- [ ] **Step 1: Write RED separation and isolation tests**

```ts
const active = startWorkoutFromTemplate(template, 'session-1', now);
const renamed = renameTemplate(template, 'Changed later');
expect(active.name).not.toBe(renamed.name);
expect(activeSessionKey('a')).not.toBe(activeSessionKey('b'));
```

- [ ] **Step 2: Implement versioned active snapshots**

Strength sets store planned and actual values separately. Cardio stores duration/distance/pace/resistance only when supported. Completion is explicit. Persist each mutation to the current user’s draft key.

- [ ] **Step 3: Run GREEN and commit**

### Task 9: Builder and active workout components

**Files:**
- Create: `frontend-nutritie/components/workout-v2/ExercisePicker.tsx`
- Create: `frontend-nutritie/components/workout-v2/TemplateBuilder.tsx`
- Create: `frontend-nutritie/components/workout-v2/ActiveWorkout.tsx`
- Create: `frontend-nutritie/components/workout-v2/WorkoutSetRow.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2BuilderUi.test.tsx`
- Modify: `frontend-nutritie/app/workout-v2-preview.tsx`
- Modify: four locale JSON files

**Interfaces:**
- Consumes: Tasks 5–8.
- Produces: accessible builder and active-workout surfaces driven entirely by passed domain objects/callbacks.

- [ ] **Step 1: Write RED component tests using real production components**

Assert exercise add/remove, move up/down, duplicate, field editing, cardio fields, save error visibility, actual set completion, and add-set behavior. Test at narrow width with font scaling mocks.

- [ ] **Step 2: Implement compact components**

Use existing `KeyboardAwareScreen`, theme tokens, Lucide icons, 44 dp controls, and list virtualization. Routine set edits remain inline rather than modal.

- [ ] **Step 3: Run GREEN, typecheck, lint, and commit**

### Task 10: Complete-workout persistence adapter and Phase 2 report

**Files:**
- Create: `frontend-nutritie/lib/workout-v2/historyAdapter.ts`
- Create: `frontend-nutritie/__tests__/workoutV2HistoryAdapter.test.ts`
- Modify: `frontend-nutritie/hooks/useAntrenamente.ts`
- Modify: `frontend-nutritie/app/workout-v2-preview.tsx`
- Create: `GETFLOW_WORKOUT_BUILDER_TEMPLATES_REPORT.md`

**Interfaces:**
- Produces: `toAntrenamentPayload(session)`, `fromAntrenament(row)`, and a truthful finish workflow that persists before clearing the draft.

- [ ] **Step 1: Write RED compatibility tests**

```ts
const payload = toAntrenamentPayload(completedSession);
expect(payload.exercitii?.[0].exercitiuId).toBe('barbell-bench-press');
expect(fromAntrenament(legacyRow).kind).toBe('legacy');
await expect(finishWithFailingRepository()).rejects.toThrow();
expect(await storage.getItem(activeSessionKey('user-1'))).not.toBeNull();
```

- [ ] **Step 2: Add the smallest hook integration**

Extend saved set typing for `time_seconds`, assistance, planned/actual values, and schema version without changing existing consumers. Persist, confirm returned workout, then clear the V2 draft and notify success.

- [ ] **Step 3: Verify Phase 2**

Run catalog, template, repository, active-session, builder UI, history adapter, account-isolation, typecheck, and lint. Record exact evidence and pending live migration in the Phase 2 report.

### Task 11: Pure demonstrated-strength and Progress Momentum engine

**Files:**
- Create: `frontend-nutritie/constants/workout-v2/ranks.ts`
- Create: `frontend-nutritie/lib/workout-v2/strengthEngine.ts`
- Create: `frontend-nutritie/__tests__/workoutV2StrengthEngine.test.ts`
- Modify: four locale JSON files

**Interfaces:**
- Produces: `estimateE1rm()`, `effectiveLoadForSet()`, `computeExerciseStrength()`, `computeProgressMomentum()`, `computeMuscleStrength()`, `computeOverallFlowRank()`, `computeStrengthMap()`.

- [ ] **Step 1: Write RED e1RM and normalization tests**

```ts
expect(estimateE1rm(100, 6)).toBeCloseTo(120);
expect(estimateE1rm(100, 13)).toBeNull();
expect(score({ e1rm: 120, bodyweight: 80, anchor: 1 })).toBe(75);
expect(score({ e1rm: 120, bodyweight: 60, anchor: 1 })).toBe(100);
```

- [ ] **Step 2: Write RED bodyweight and eligibility tests**

Cover added weight, assistance subtraction, missing bodyweight, warmup exclusion, cardio exclusion, machine/cable no-anchor behavior, and 90-day staleness with injected `now`.

- [ ] **Step 3: Write RED separation tests**

Construct user A with low current strength/high improvement and user B with high current strength/flat improvement. Assert B Strength Rank > A and A Momentum > B. Assert attendance-only sessions never change Strength Score.

- [ ] **Step 4: Implement minimal pure engine**

Use exactly the spec formulas, top-four muscle aggregation, coverage factors `.65/.85/1`, six-region overall coverage, centralized bands `NO_DATA/FOUNDATION/FORGE/DRIVE/SURGE/FLOW`, and no persistent cache.

- [ ] **Step 5: Run GREEN and commit**

### Task 12: Strength Map UI, details, and deterministic preview fixtures

**Files:**
- Create: `frontend-nutritie/lib/workout-v2/previewFixtures.ts`
- Create: `frontend-nutritie/hooks/workout-v2/useStrengthMap.ts`
- Create: `frontend-nutritie/components/workout-v2/StrengthSummary.tsx`
- Modify: `frontend-nutritie/components/workout-v2/MuscleDetailSheet.tsx`
- Modify: `frontend-nutritie/app/workout-v2-preview.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2StrengthPreview.test.tsx`

**Interfaces:**
- Produces deterministic fixtures and UI displaying separate Strength Rank, Strength Score, recent progress, active weeks, contributors, best performances, and last trained.

- [ ] **Step 1: Write RED preview/UI tests**

Test the A/B ordering, same-weight/different-lift, same-lift/different-weight, bodyweight, assisted, and missing-bodyweight selectors. Assert legend text does not mention size, percentile, or medical strength.

- [ ] **Step 2: Implement fixtures, hook, summary, and muscle details**

Map strength scores to neutral plus five controlled levels. Display contributor evidence and textual level in addition to color.

- [ ] **Step 3: Run GREEN and commit**

### Task 13: Edit/delete recalculation and Phase 3 report

**Files:**
- Create: `frontend-nutritie/__tests__/workoutV2StrengthRecalculation.test.ts`
- Modify: `frontend-nutritie/hooks/workout-v2/useStrengthMap.ts`
- Modify: `frontend-nutritie/app/workout-v2-preview.tsx`
- Create: `GETFLOW_STRENGTH_MAP_FLOW_RANK_REPORT.md`

**Interfaces:**
- Consumes updated history arrays; produces new results without invalidation calls.

- [ ] **Step 1: Write RED edit/delete tests**

Compute from three rows, edit the best set, recompute and assert decrease; delete the best row, recompute and assert its contribution disappears. Assert account B rows cannot affect account A.

- [ ] **Step 2: Make hook dependencies explicit**

Memoize only on canonical history, bodyweight, and injected/current day bucket. Do not persist computed scores.

- [ ] **Step 3: Verify Phase 3**

Run all strength tests, Anatomy state tests, typecheck, and lint. Record formula, anchors, legal independence, exact tests, and no-AAB state in the Phase 3 report.

### Task 14: End-to-end V2 preview integration

**Files:**
- Create: `frontend-nutritie/components/workout-v2/WorkoutV2Experience.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2EndToEnd.test.tsx`
- Modify: `frontend-nutritie/app/workout-v2-preview.tsx`
- Modify: four locale JSON files

**Interfaces:**
- Composes anatomy, presets, builder, active session, history adapter, strength summary, and detail sheet through explicit props/repositories.

- [ ] **Step 1: Write RED end-to-end test**

Drive preset selection → edit → save custom template → start → complete sets → add cardio → finish → history refresh → changed Strength Map/Flow Rank. Use in-memory repositories; assert no production key or Supabase call in preview.

- [ ] **Step 2: Implement the experience state machine**

Use explicit states `browse | build | active | summary | strength`. Prevent dead ends with visible back/close actions and restore active draft when present.

- [ ] **Step 3: Run GREEN and commit**

### Task 15: Responsive, accessibility, performance, and regression QA

**Files:**
- Create: `frontend-nutritie/__tests__/workoutV2ResponsiveA11y.test.tsx`
- Create: `frontend-nutritie/__tests__/workoutV2RegressionBoundary.test.ts`
- Modify: V2 components only when a reproduced failure requires it

**Interfaces:**
- Verifies, rather than redesigns, the integrated module.

- [ ] **Step 1: Add matrix tests**

Cover 320, 360, 390, and 412 widths; font scales 1.0, 1.2, and 1.4; keyboard open/closed; front/back; long FR/DE labels. Assert no fixed width exceeds usable width and all primary actions remain reachable.

- [ ] **Step 2: Add accessibility and allocation tests**

Assert roles, labels, selected/checked state, move alternatives, textual legends, and no per-render rebuilding of static anatomy/catalog arrays.

- [ ] **Step 3: Run affected regression suites**

Run V2 suites, P1-07, P1-08, navigation, i18n, Home, Journal, Photo AI, Custom Foods, Coach, Premium, Billing, Flow Credits, and Ads focused suites. Do not fix unrelated failures; document them with evidence.

- [ ] **Step 4: Run static gates**

Run `npm run typecheck`, `npm run lint`, `npm run anatomy:v2:verify`, and target-file `git diff --check`.

### Task 16: Final report and controlled-switch decision

**Files:**
- Create: `GETFLOW_WORKOUT_ANATOMY_V2_FINAL_REPORT.md`
- Update: phase reports only with final exact evidence if a later test supersedes it

**Interfaces:**
- Produces auditable `READY TO ENABLE`, `PREVIEW ONLY`, or `BLOCKED` decision.

- [ ] **Step 1: Inventory exact source state**

Record branch, HEAD, target files, migrations not applied, flag default, production fallback preservation, and no AAB.

- [ ] **Step 2: Record exact results**

Include suite/test counts, typecheck, lint warnings/errors, responsive evidence, accessibility evidence, provenance result, and any native/live-schema work still pending.

- [ ] **Step 3: Apply the decision rule**

Use `READY TO ENABLE` only with automated gates, available persistence schema, and required native matrix evidence. Source-only success with unapplied migration or missing native validation is `PREVIEW ONLY`. Any functional/legal failure is `BLOCKED`.

- [ ] **Step 4: Final targeted diff review**

Confirm protected systems were not modified, production anatomy remains imported by `BodyMap`, no raw user copy exists, no third-party artwork entered the repository, and no AAB/build/deploy command ran.
