# GetFlow Phase 1 — Code Readiness

Date: 2026-10-11  
Branch: `ci-integration/verified-fixes`  
Implementation commit: `84894c2c8c4733c069884ce286e079caae4e579f`  
Parent: `f13105dd3b9d25dc086cdd2b9b9d062ac25c6c20`

## Verdict

**CODE_BLOCKED** for a new Android release candidate. The task-scoped fixes are committed and their relevant automated checks pass, but the dependency gate remains red, the complete frontend Jest run did not finish, the Android permission verifier could not install its isolated dependencies, and no real isolated RLS or device validation was available. No production deployment, database write, AAB build, or Play Console action was performed.

## Photo-to-Journal finding

The historical source at `2d32af` destructured only `{ error }` from `insereazaMasaCuPoza()` and treated `error === null` as a successful insert. It did not verify that an inserted row was returned or that an owner-scoped readback found the saved row. An empty/incomplete insert representation could therefore reach the success transition, dismissing the photo result without reliable evidence that Journal had a row. This is a reproducible source-level cause consistent with the reported disappearance; no production trace or physical-device reproduction was available to prove that this was the specific user's incident.

The current integration source requires the returned row or an exact operation-ID readback before clearing the pending photo draft. Failed/ambiguous saves retain the operation and allow retry; selected meal category and the stored local meal date remain in the canonical payload. This commit additionally takes a synchronous save lock before the first `await`, prevents duplicate taps, and checks account ownership after the asynchronous pending-snapshot save so an account A continuation cannot write into account B's shared camera state.

Regression evidence: the camera tests cover double taps, account switching while a snapshot is pending, B's recovered photo remaining usable, and no insert by A's stale operation. Relevant photo, meal, Journal, category/payload and persistence tests are included in the 25-suite focused run below. These are mocked/client-level tests, not a real Supabase/RLS persistence test. The already-published v27 binary predates the current source and was not changed or independently installed during this task.

## Rewarded ads and entitlements

The client now hides the rewarded-ad action for full-access accounts, disables it while entitlement/balance state is loading, rechecks the current Premium context around intent creation and ad presentation, and exits the busy state if entitlement revalidation blocks an in-flight request. Tests use new context objects to exercise updates and verify a free user can retry after a transient loading state.

The backend `/rewarded/intents` endpoint now checks the authenticated account's admin/tester flags and the owner-scoped paid entitlement before creating an intent. Paid/full-access users receive a controlled rejection; an unknown entitlement fails closed. Server wiring uses the current Google billing service. The existing API path and response for eligible free accounts remain unchanged. No real ad impression, purchase, entitlement mutation, or production request was generated. This validates source and mocks only; frontend/backend production compatibility still requires a coordinated deployment, which was not authorized here.

## GDPR regression

The reported 724/725 failure was traced to a stale ImageKit deletion mock: the current worker validates owner-specific `filePath` metadata before issuing a deletion, while the fixture returned only generic `ok/status` fields. The fixture/assertion correction is already in parent commit `fbf4e07`; the worker and legitimate GDPR deletion behavior were not weakened. The final backend suite passes. Historical failure output did not retain the exact original assertion trace, so this attribution is supported by the fixture/code mismatch and focused regression evidence, not by a preserved failing stack trace.

## Validation evidence

- Frontend focused regression: **25 suites, 292 tests passed** (`--runInBand`), covering camera/photo, meal saving, Journal, ads, Flow Credits and entitlement paths.
- Flow Credits ownership recheck after the final retry assertion: **1 suite, 8 tests passed**.
- Frontend TypeScript: `npm run typecheck` — **PASS**.
- Frontend lint: `npm run lint` — **0 errors**, one existing unrelated warning in `components/ui/AppSplashScreen.tsx` (`startExit` missing from a hook dependency list).
- Backend regression: `npm test -- --runInBand --json --outputFile .qa-phase1-backend-final.json` — **75 suites, 737 tests passed**. The backend script explicitly excludes `rls_integration.test.js` and `rls_postgrest.test.js`.
- Backend lint: `npm run lint` — **PASS**.
- Android JS export: `node node_modules/expo/bin/cli export --platform android --output-dir .tmp/phase1-android-js-export-20261011` — **PASS**, Metro bundled 4,451 modules and emitted an 11.7 MB Hermes bundle plus metadata. This is not a native build or AAB.
- Independent review: a separate reviewer inspected all nine task-scoped diffs; no commit-blocking issue remained. A nonblocking coverage suggestion to make the retry assertion exercise a second request was incorporated and the focused Flow Credits suite rerun successfully.
- `git diff --cached --check` before commit — **PASS**.

## Release and infrastructure blockers

- Frontend full Jest was attempted but stopped making observable progress after several suites and produced no final result artifact; the run was stopped, so it is **incomplete**, not PASS or a confirmed test failure.
- `npm run audit:gate` — **FAIL**: 47 vulnerable package entries, 3 explicitly permitted and **44 unpermitted**, including `braces` (GHSA-VFJ7-8CJW-P6XM), plus Expo/Metro/Jest dependency families. No audit exception or gate change was added.
- Node available for the runs was `v24.18.0`; frontend package declares `>=22 <23`. Tests and TypeScript completed under the available runtime, but a Node 22 run remains required for the release gate.
- `permissions:verify` failed while the disposable workspace ran `npm ci`: `registry.npmjs.org` returned `ENOTFOUND`; it did not reach a permission verdict. Expo Doctor and native permission verification therefore remain unverified.
- No isolated PostgreSQL/PostgREST environment was available. RLS suites remain unrun; Production was not used as a substitute.
- No physical Android validation occurred. Journal relaunch persistence, real camera behavior, ad consent/device behavior, and real account isolation still need device/integration verification.
- The branch's cached `origin/ci-integration/verified-fixes` ref is `f212e42d5fedcf7dd16c82d58d22c9d4b327f754`; local HEAD was four commits ahead before this task commit. No fetch or push was performed, so current remote synchronization/CI is not verified.

## Files in implementation commit

- `frontend-nutritie/app/camera.tsx`
- `frontend-nutritie/__tests__/galleryPermissionBehavior.test.tsx`
- `frontend-nutritie/context/FlowCreditsContext.tsx`
- `frontend-nutritie/components/FlowCreditsModalHost.tsx`
- `frontend-nutritie/__tests__/flowCreditsRewardOwnership.test.tsx`
- `frontend-nutritie/__tests__/flowCreditsUi.test.tsx`
- `backend-nutritie-ai/routes/rewarded.js`
- `backend-nutritie-ai/server.js`
- `backend-nutritie-ai/tests/rewarded_routes.test.js`

Other dirty workspace files were left untouched and unstaged. The implementation commit is local to `ci-integration/verified-fixes`; nothing was pushed.

## Next required actions

1. Resolve the 44 unpermitted dependency entries without weakening `audit:gate`.
2. Run the full frontend suite and final gates under Node 22 with registry access.
3. Run isolated RLS/PostgREST tests and physical Android validation.
4. Review and deploy the frontend/backend rewarded-intent contract together in a separately authorized deployment task.
5. Only then reconsider a new Internal Testing AAB. The v27 release remains unchanged.
