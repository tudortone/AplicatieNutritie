# GetFlow Post-Limit Recovery — Final Evidence

Date: 2026-10-11
Repository: `tudortone/AplicatieNutritie`
Branch: `ci-integration/verified-fixes`
Starting workspace HEAD: `f199e9e480e28df1578b89ce2ffcfa1f84312dec`
Recovery source commit: `fbf4e0741f102f37f6bcfc009383a4a9c0a2793b`

## Executive result

Existing dirty work was preserved; no reset, cleanup, stash, branch switch, production change, deployment, remote build, Play upload, or database operation was performed. The recovery produced useful local fixes and test evidence, but the v27 incident's original production root cause remains unproven, the dependency gate remains red, and release readiness is not established.

The workspace was already substantially dirty: 35 tracked files modified and hundreds of untracked reports, caches, QA outputs, and artifacts. Two Git worktrees were present, including `.codex-worktrees/admob-ssv-deploy`; neither was altered. The integration branch has no upstream tracking ref. A live GitHub ref check failed on DNS resolution, so remote synchronization and CI state are unverified. `git diff --check` passes (only line-ending normalization warnings).

## Recovered work and local fixes

### Photo AI → Journal (v27)

The actual historical user incident cannot be attributed to a specific app flow from current evidence: no production telemetry/record was inspected and no physical-device reproduction was available. The code change is therefore a fail-safe mitigation, not proof of the original root cause.

Current dirty source implements a user-scoped, durable local retry snapshot of the exact reviewed meal payload and idempotency operation, validates owner, operation-derived UUID, canonical required fields and payload shape, and fails closed on malformed/incomplete pending snapshots. It preserves selected category and meal date. A successful save is accepted only from the canonical insert response or owner-scoped readback matching the canonical fields; account-generation checks prevent stale saves crossing accounts. AI output still does not auto-save; the editable confirmation remains required.

Fresh focused verification: `photoJobs.test.ts` and `payloadMese.test.ts` — **2 suites / 46 tests PASS**. This is mock/source evidence only; real v27 server records and Android persistence remain unverified. Retry/idempotency and category/date behavior were covered in source tests, but no Production retry or database inspection was performed.

### AdMob / Flow Credits

The local contract was reviewed end-to-end: authenticated intent creation and owner-scoped status polling, native `intentId` handoff, signature-verified SSV as the sole grant path, SQL idempotency/cap enforcement, and stale-account operation guards. A balance-owner guard now prevents one account's previously loaded Flow Credits from flashing in another account while its refresh is pending.

Focused frontend tests — **3 suites / 58 tests PASS**. OpenAPI plus backend rewarded-route tests — **2 suites / 44 tests PASS**. Backend source changes and the new status route are local only; the compatible backend and frontend revisions have not been deployed together. AdMob's external verification remains unresolved; no live ads or purchases were generated.

### GDPR worker regression

The failing test was a stale ImageKit mock: it omitted the owner-valid `filePath` response required by current cleanup code and asserted against `/details` instead of the actual DELETE target. The fixture now models the owner-valid path and checks the real deletion URLs/methods. The worker implementation was not changed for this regression. GDPR focused tests — **3 suites / 35 tests PASS**; no Production deletion was exercised.

### Backblaze FormatException

The prior owner-run transcript localized failure to `b2_list_buckets`, after account authorization and before the script's explicit child-key creation confirmation. At that time the generic catch hid status, B2 error code, exception type and stack location. The exact original expression/root cause therefore cannot be reconstructed from that output.

The shared B2 wrapper now distinguishes sanitized HTTP/API, transport, and PowerShell/runtime errors; it reports only operation, valid HTTP status/stable B2 code or exception class/inner class and safe file:line. Mock B2 tests pass **33 assertions**; backup script tests pass **33 assertions**. Independent review found that the synthetic `FormatException` test injects an exception through the mock invoker and checks redaction only; it does **not** reproduce the actual default `Invoke-RestMethod` code path. Thus the diagnostic improvement is verified, but the FormatException root fix and live authentication are **NOT VERIFIED**.

Backup preflight is blocked because the isolated WSL restore target is not operational (no Docker CLI/socket or local PostgreSQL cluster; `pg_isready` reports no response). No credential was re-entered in this turn, no live Backblaze API request/key creation occurred, and no Production export, Restic upload, or restore occurred. The prior masked credential attempt must not be treated as authenticated.

## Verification results

All Node-based checks below ran under Node 22.23.3 unless a subprocess caveat is stated.

| Gate | Result |
|---|---|
| Full backend Jest, excluding `rls_integration` and `postgrest` integration files | **PASS — 75 suites / 733 tests** |
| Isolated RLS/PostgREST integration | **BLOCKED / NOT RUN** — isolated integration environment unavailable; not counted as pass |
| Backend lint | **PASS** |
| Full frontend Jest | **FAIL — 157 suites passed, 1 failed; 1,344 tests passed, 1 failed (1,345 total)**. The sole failing `p05CrossLayerAndEntrypoint.test.ts` expectation requires a clean dependency audit, but the actual fail-closed audit reports 44 unpermitted entries (47 total, 3 permitted). Its child process also resolved Node 24.18.0 despite the Node 22 parent; project engine requires Node 22. The test must not be made green by weakening the audit. |
| Focused Photo/Journal tests | **PASS — 2 suites / 46 tests** |
| Focused AdMob/Flow Credits tests | **PASS — 3 suites / 58 tests** |
| OpenAPI + rewarded route tests | **PASS — 2 suites / 44 tests** |
| Focused GDPR tests | **PASS — 3 suites / 35 tests** |
| Frontend TypeScript | **PASS** |
| Frontend lint | **PASS — 0 errors, 1 existing `AppSplashScreen.tsx:151` hook-dependency warning** |
| B2 API mocked contract/diagnostics | **PASS — 33 assertions**, with the FormatException reproduction limitation above |
| Backup script tests | **PASS — 33 assertions** |
| Backup preflight / synthetic WSL restore | **BLOCKED** at restore-target probe; no database was created |
| Dependency audit gate | **FAIL / fail-closed** — 44 unpermitted findings; `braces@3.0.3` / `GHSA-vfj7-8cjw-p6xm` remains unresolved. The dirty `osv-scanner.toml` removes broad ignores but the scanner binary was not available to validate the edited policy. |
| Expo Doctor, EAS remote config/counter, Android manifest build, emulator/physical-device tests | **NOT VERIFIED in this recovery run** |

## Production and release state

- Render: current live commit and deployment state were not freshly verified in this turn. Previous handoff reports document source containment but an unverified/possibly legacy Render revision; do not infer that the Clerk hotfix is live.
- Trigger.dev: the latest available authenticated inspection recorded Production version `20261007.1` with legacy `user-sync`; no deployment was performed. Local hardening is not live containment.
- AdMob: local hardening only; status remains unverified here and prior evidence says the public `getflow.app/app-ads.txt` endpoint serves HTML rather than the seller record.
- Android: no build, install, upload, or physical-device test was performed. Historical v27 AAB predates these local changes. No release candidate is cleared.
- Production data/configuration, billing, migrations, Play tracks, and user records: unchanged by this recovery.

## Changed-file inventory

The 35 tracked dirty paths at final inspection were:

`GETFLOW_AUTONOMOUS_TASK_LEDGER.md`, `GETFLOW_FINAL_RELEASE_STATUS.md`, `osv-scanner.toml`; `contracts/openapi.yaml`; backend `repositories/rewardedRepo.js`, `routes/rewarded.js`, `services/monetization/rewardedService.js`, `tests/gdpr_worker.test.js`, `tests/rewarded_routes.test.js`, `tests/rewarded_service.test.js`; frontend `app/camera.tsx`, `context/AdsContext.tsx`, `context/FlowCreditsContext.tsx`, `i18n/locales/{de,en,fr,ro}.json`, `lib/ads/{adsConfig.ts,adsService.ts,adsService.web.ts}`, `lib/{mealUtils.ts,payloadMese.ts,photoJobs.ts}`, and tests `adsConfig.test.ts`, `galleryPermissionBehavior.test.tsx`, `meallUtils.test.ts`, `offlineQueue.test.ts`, `p101AddMealSheet23505.test.tsx`, `p101CursaTimeoutOffline.test.ts`, `p101Decizie23505.test.ts`, `p101ReluareSiConflict.test.ts`, `p104SemnalDupaSalvare.test.tsx`, `p109AdsEdgeSemantics.test.ts`, `payloadMese.test.ts`, `photoJobs.test.ts`.

Task-related untracked additions include `frontend-nutritie/__tests__/flowCreditsRewardOwnership.test.tsx`, `tools/backup/GetFlowB2Api.psm1`, `tools/backup/tests/Test-GetFlowB2Api.ps1`, the corrected `GETFLOW_BACKBLAZE_AUTH_DEBUG_REPORT.md`, and this report. Other pre-existing untracked material was left untouched. The independent review found no additional actionable issue in the reviewed app/API changes; it specifically retained the B2 reproduction limitation above.

## Git/commit status

The selected 36 task-related source, test, and corrected B2 diagnostic-report paths were committed locally as `fbf4e0741f102f37f6bcfc009383a4a9c0a2793b` (`fix: finalize verified GetFlow recovery changes`) on `ci-integration/verified-fixes`. This recovery report is versioned in a separate documentation-only follow-up commit. No push was attempted. Other dirty tracked and untracked work—including `GETFLOW_AUTONOMOUS_TASK_LEDGER.md`, `GETFLOW_FINAL_RELEASE_STATUS.md`, and `osv-scanner.toml`—was intentionally not staged or changed by the source commit.

## Verdict and next owner actions

**V27 verdict:** mitigation and mock regression coverage are present locally; actual incident root cause and Android/server persistence are not proven.

**Backblaze verdict:** sanitized diagnostics and mocks pass; original FormatException root cause, real auth, key creation, backup, and restore remain unverified/blocked.

**Android readiness:** NOT READY for a new internal candidate from this workspace; dependency gate remains red and physical-device validation is pending.

Remaining actions:

1. Resolve the `braces` advisory through a supported upstream-compatible fix, then rerun the unchanged audit gate; do not convert the audit failure into a passing test expectation.
2. Provide an operational isolated WSL Docker/Supabase-compatible restore target. Only after that preflight succeeds should the already-authorized read-only encrypted backup workflow proceed; never send credentials in chat.
3. Re-run the restricted-key script locally with the rotated credentials only when ready. Capture only sanitized operation/status/code/runtime location; check for an existing key before any creation retry.
4. Separately authorize and verify Render/Trigger Production deployments before claiming Clerk containment or releasing frontend changes that depend on the new backend endpoint.
5. Complete Android/emulator or physical-device validation and a fresh release gate after dependencies and compatible backend deployment are resolved.
6. The validated changes remain uncommitted because `.git` is read-only to this session. A local authorized environment with write access to the repository's `.git` metadata is required to commit the selected, reviewed paths; do not stage the entire dirty workspace.
