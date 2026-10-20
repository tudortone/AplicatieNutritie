# GETFLOW — SECOND-ROUND SECURITY REMEDIATION REPORT
## P0 PHOTO AI REPLAY • GDPR FENCING • IMAGEKIT RECOVERY • LEASE SAFETY • PLAY INTEGRITY • CLEAN BOOT

**Date:** 2026-10-20  
**Model / Role:** Argon 4 High — Principal Security Remediation Engineer  
**Worktree:** `C:\Users\tudor\OneDrive\Desktop\AplicatieNutritie\.gemini-worktrees\argon-security-remediation`  
**Branch:** `argon/getflow-security-p0-p1-remediation`  
**Previous Reviewed HEAD:** `5176a147d5cccf877a988a76f4f19f054d45ff42` (preserving `6bfe65a3`, `28c138a3`, `5176a147`)

---

## 1. Executive Verdict

**`SECOND_ROUND_SECURITY_REMEDIATION_READY_FOR_GPT_RE_REVIEW`**

All 6 blocking findings identified by GPT Codex's independent security acceptance review (`GETFLOW_ARGON_SECURITY_INDEPENDENT_ACCEPTANCE.md` and `argon-review-replay-proof.js`) have been reproduced, covered by deterministic RED → GREEN regression tests, and surgically remediated without resetting or discarding existing commits (`6bfe65a3`, `28c138a3`, `5176a147`) and without touching Gemini `main` or any Training V2 worktrees.

- **GPT Standalone Exploit Proof (`argon-review-replay-proof.js`) Output After Remediation:**
  `{"first":200,"replay":409,"reserveCalls":2,"inferenceCalls":1,"commitCalls":1}`
  (Previously: `{"first":200,"replay":200,"reserveCalls":2,"inferenceCalls":2,"commitCalls":2}`)
- **Full Backend Jest Suite:** **81/81 test suites passed (819/819 tests passed)**, `npm run lint` passed (0 errors).
- **Targeted Frontend Jest Suite, Lint & Typecheck:** **4/4 test suites passed (31/31 tests passed)**, `npm run lint` (`expo lint`) passed, `npm run typecheck` (`tsc --noEmit`) passed.

---

## 2. Finding-by-Finding Resolution Table

| Priority / ID | GPT Independent Review Blocker | Root Cause Verified in Source | Remediation Implemented | Verification / Regression Proof |
| :--- | :--- | :--- | :--- | :--- |
| **Priority 1 (P0)** — Photo AI Reservation Replay & Settlement | `reserve_flow_photo_credit` returns `{ ok: true, status: 'COMMITTED' \| 'RELEASED' \| 'RESERVED', replay: true }` when `logical_analysis_id` already exists. Legacy routes (`routes/ai.js`) and `photoJobService.js` only checked `reservation?.ok`, allowing a committed or released reservation to authorize a second unbilled Vision LLM inference. Additionally, `routes/ai.js` set `settled = true` BEFORE `flowCredits.commitPhoto` succeeded. | `routes/ai.js:322, 474` and `services/ai/photoJobService.js:116` checked `!reservation?.ok` without validating `status === 'RESERVED' && replay !== true` or `reservationId`. `routes/ai.js:581` set `settled = true` before `await flowCredits.commitPhoto(...)`. | Added `valideazaRezervareProaspataFoto(reservation, userId)` in `routes/ai.js` and `validateFreshPhotoReservation` + `validateExistingJobForReplay` in `photoJobService.js`. Only a fresh `{ ok: true, status: 'RESERVED', replay: false, reservationId }` authorizes new inference. `COMMITTED` / `RELEASED` / `RESERVED` replays, malformed/expired reservations, and cross-account mismatches return controlled terminal `409` / `403` / `503` without invoking AI or releasing active reservations. Added in-flight concurrency guards (`operatiiFotoInCurs`, `utilizatoriFotoSincronInCurs`). Moved `settled = true` strictly AFTER verifying `commitPhoto` returned `{ ok: true, status: 'COMMITTED', replay !== true }`; on commit error, releases the reservation (`COMMIT_FAILED`) and returns `503 CREDIT_SETTLEMENT_FAILED`. Hardened `settlePhotoCredit` in `src/trigger/analiza-mancare-ai.js`. | `tests/security_p0_legacy_photo_ai.test.js` (Tests 8–11), `tests/photo_job_service.test.js`, and GPT's `argon-review-replay-proof.js` (`first: 200, replay: 409, inferenceCalls: 1`). |
| **Priority 2 (P0/P1)** — GDPR Boolean Claim Must Fail Closed | `revendicaRandOutbox` in `utils/gdprWorker.js` accepted legacy boolean `true` from `claim_gdpr_deletion` with `fencingToken: null`, and `asiguraLeaseActiv` returned `null` without stopping destructive steps. | `utils/gdprWorker.js:76-82` had `if (res.data === true) return { success: true, fencingToken: null }`, and `actualizeazaStatusOutbox` skipped `.eq('fencing_token', ...)` when `fencingToken` was null. | Removed legacy boolean fallback in `revendicaRandOutbox` (`utils/gdprWorker.js`) and `routes/gdpr.js`. Enforced strict validation: `data` must be a non-null object with `success === true`, integer `fencing_token > 0`, valid future `lease_expires_at` timestamp, and matching `id` / `claimed_by` / `status`. `actualizeazaStatusOutbox` and `asiguraLeaseActiv` now throw immediately if `workerId`, `fencingToken > 0`, or future `leaseExpiresAt` is missing. | `tests/security_p1_gdpr_recovery.test.js` (Test 5: boolean `true`, boolean `false`, malformed object, `fencing_token: 0/null`, expired lease, RPC error/exception, owner mismatch → 0 table deletes, 0 Clerk/ImageKit/Auth calls). |
| **Priority 3 (P0/P1)** — GDPR ImageKit IDs Must Survive Partial Deletion | `gdprWorker.js` deleted all user DB rows (`mese`) at `pending` without first enumerating and persisting ImageKit `file_ids` into `gdpr_deletions`, and `routes/gdpr.js` could overwrite previously persisted `file_ids` with `[]` if `mese` had already been deleted on an earlier attempt. | `utils/gdprWorker.js` called `stergeRanduriDbUtilizator` directly at `status === 'pending'` without calling `extrageFileIdsUtilizator` or persisting `file_ids`. | Created canonical `pregatesteSiPersistaFileIdsOutbox` in `utils/gdprWorker.js` and shared it with `routes/gdpr.js`. Before any DB deletion in `pending`, both route and worker verify active lease, paginate through `mese` (`extrageFileIdsUtilizator`), read and union with existing `gdpr_deletions.file_ids` (never overwriting non-empty persisted `file_ids` with `[]`), and durably persist the merged `file_ids` into `gdpr_deletions` under fencing (`claimed_by`, `fencing_token`, `expectedStatus: 'pending'`, `lease_expires_at`). | `tests/security_p1_gdpr_recovery.test.js` (Test 6: crash between enumeration and persistence → `mese` untouched; crash after `mese` deleted before `db_done` → resuming worker recovers `file_ids` from outbox and deletes owned ImageKit files). |
| **Priority 4 (P1)** — Lease Safety Through Destructive Stages | Destructive operations (multi-table DB deletion, ImageKit batch inspection/deletion, Clerk deletion, Supabase Auth deletion) could outlive a lease or proceed after lease loss without mid-stage verification or lease renewal. | Lease checks only occurred once between top-level stages and did not renew during long operations or verify ownership before each table / ImageKit batch / Auth call. | Added `reinoiesteLeaseOutbox` (`renew_gdpr_lease` RPC with strict validation), `asiguraLeaseActiv` (verifies `leaseExpiresAt > now` and renews when `< 120s` remaining), `cuReinnoireLeaseContinua` (periodic lease heartbeat during long stages), and `onBeforeStep` hooks inside `stergeRanduriDbUtilizator`, `filtreazaFileIdsProprii`, and `stergeActiveImageKit` + pre-stage checks before Clerk and `auth.admin.deleteUser`. All outbox transitions enforce `.eq('claimed_by', workerId).eq('fencing_token', fencingToken).gte('lease_expires_at', nowIso)`. | `tests/security_p1_gdpr_recovery.test.js` (Test 7: Worker 1 lease expires mid-ImageKit stage while Worker 2 reclaims with `fencing_token: 2`; Worker 1 aborts before `auth.admin.deleteUser` and cannot overwrite Worker 2's state). |
| **Priority 5 (P0/P1)** — Play Integrity Multipart Request Binding | On `/analiza-foto` and `/analizeaza-mancare-structurat`, `submitAnalizaFotoIntegrity` ran BEFORE `upload.single('imagine')`, so `req.body` was empty and image bytes were unparsed; request hash did not bind to the uploaded image. | Middleware order in `routes/ai.js` placed `submitAnalizaFotoIntegrity` before `upload.single('imagine')`, and `utils/playIntegrity.js` did not bind `expectedRequestHash` to server-computed image bytes. | Reordered `/analiza-foto` and `/analizeaza-mancare-structurat` so `upload.single('imagine')` and `atasareAmprentaImagineMultipart` run BEFORE `submitAnalizaFotoIntegrity`. Server computes `req.imageContentSha256` (`sha256(imageBytes)`) and `req.imageLegacyFingerprint` (`sha256("analiza-foto\|md5:<md5>:<len>\|<provider>\|<limba>")`) from actual uploaded bytes and guarantees temp file cleanup on 403/abort. Hardened `utils/playIntegrity.js` (`requireImageDigest: true`) to validate any client digest header/field against server-computed digests and bind `expectedRequestHash` to the verified image digest. | `tests/security_p0_legacy_photo_ai.test.js` (Test 12: Play Integrity token minted for Photo A fails closed with `403 PLAY_INTEGRITY_REJECTED` when submitted with Photo B bytes, both with and without spoofed `X-Payload-Fingerprint`, while valid Photo A succeeds with `200`). |
| **Priority 6 (P1)** — Clean Checkout Must Boot (`versionCheck.js`) | `backend-nutritie-ai/server.js` (modified in base commit `86f8dff7`) requires `./routes/versionCheck`, which was left untracked in the working tree along with `tests/versionCheck.test.js`. Also `server.js` used `res.sendFile(caleFisier)` without `{ root: calePublic }`, causing Express `send` to treat `.gemini-worktrees` as a dotfile directory during `legal_routes.test.js`. | `git show 86f8dff7 -- backend-nutritie-ai/server.js` confirmed `server.js` added `require('./routes/versionCheck')` in `86f8dff7` while omitting `routes/versionCheck.js` from `git add`. | Audited and staged `backend-nutritie-ai/routes/versionCheck.js` and `backend-nutritie-ai/tests/versionCheck.test.js`. Added a clean-checkout boot test in `tests/versionCheck.test.js` verifying every local `require('./...')` in `server.js` exists and is tracked in Git (`git ls-files --error-unmatch`). Updated `server.js:541` to `res.sendFile(numeFisier, { root: calePublic })`. | `tests/versionCheck.test.js` (5/5 passed) & `tests/legal_routes.test.js` (5/5 passed). |

---

## 3. Exact Files Changed

1. [`backend-nutritie-ai/routes/ai.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/routes/ai.js)
   - Added `valideazaRezervareProaspataFoto(reservation, userId)` requiring `reservation.ok === true`, `reservation.status === 'RESERVED'`, `reservation.replay !== true`, non-empty `reservationId`, matching `userId`, and non-expired timestamp.
   - Added `operatiiFotoInCurs` and `utilizatoriFotoSincronInCurs` in-flight concurrency guards.
   - Updated `handleAnalizaFoto` settlement so `settled = true` is set ONLY after `flowCredits.commitPhoto` returns `{ ok: true, status: 'COMMITTED', replay !== true }`; on failure or exception, releases the reservation (`COMMIT_FAILED`) and returns `503 CREDIT_SETTLEMENT_FAILED`.
   - Added `atasareAmprentaImagineMultipart` and placed `upload.single('imagine')` + `atasareAmprentaImagineMultipart` before `submitAnalizaFotoIntegrity` and `submitStructuratIntegrity` (`requireImageDigest: true`).
2. [`backend-nutritie-ai/services/ai/photoJobService.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/services/ai/photoJobService.js)
   - Added `validateExistingJobForReplay(existingJob, { userId, imageUrl, imageFileId })` and `validateFreshPhotoReservation(reservation, userId)`.
   - Prevented replayed/existing reservations from triggering a new Trigger.dev run or releasing an active reservation on failure.
3. [`backend-nutritie-ai/services/monetization/flowCreditsService.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/services/monetization/flowCreditsService.js)
   - Forwarded optional `reason` parameter in `releasePhoto` (`p_reason: reason`).
4. [`backend-nutritie-ai/src/trigger/analiza-mancare-ai.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/src/trigger/analiza-mancare-ai.js)
   - Hardened `settlePhotoCredit` to verify `data?.ok === true` and `data.status === expectedStatus` (`COMMITTED` / `RELEASED`).
5. [`backend-nutritie-ai/utils/playIntegrity.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/utils/playIntegrity.js)
   - Updated `createPlayIntegrityGuard` and `createPlayIntegrityVerifier` to support `requireImageDigest`, verify any client-supplied digest (`X-Payload-Fingerprint`, `imageSha256`, `imageDigest`) against server-computed `req.imageContentSha256` / `req.imageLegacyFingerprint`, and bind `expectedRequestHash` to the verified image digest.
6. [`backend-nutritie-ai/utils/gdprServices.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/utils/gdprServices.js)
   - Added `onBeforeStep` lease-verification hook support to `filtreazaFileIdsProprii` and `stergeActiveImageKit`.
   - Hardened `extrageFileIdsUtilizator` with pagination safety cap (`GDPR_MEDIA_ENUMERATION_INCOMPLETE`).
7. [`backend-nutritie-ai/utils/gdprWorker.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/utils/gdprWorker.js)
   - Hardened `revendicaRandOutbox` to reject legacy boolean `true`/`false`, malformed payloads, non-positive `fencing_token`, and missing/expired `lease_expires_at`.
   - Added `reinoiesteLeaseOutbox`, `asiguraLeaseActiv`, `cuReinnoireLeaseContinua`, and canonical `pregatesteSiPersistaFileIdsOutbox`.
   - Enforced pre-stage and mid-stage lease checks and fencing across all DB, Clerk, ImageKit, and Supabase Auth deletion stages.
8. [`backend-nutritie-ai/routes/gdpr.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/routes/gdpr.js)
   - Unified pre-delete preparation with `gdprWorker.js` via `pregatesteSiPersistaFileIdsOutbox`, strict claim validation, continuous lease renewal (`cuReinnoireLeaseContinua`), and fenced status transitions.
9. [`backend-nutritie-ai/server.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/server.js)
   - Changed `res.sendFile(caleFisier)` to `res.sendFile(numeFisier, { root: calePublic })` so legal static routes work inside dot-prefixed worktree paths (`.gemini-worktrees`).
10. [`backend-nutritie-ai/routes/versionCheck.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/routes/versionCheck.js) & [`backend-nutritie-ai/tests/versionCheck.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/versionCheck.test.js)
    - Tracked the `versionCheck` route required by `server.js` since commit `86f8dff7` and added clean-checkout module tracking verification.
11. **Test Suites Updated / Expanded:**
    - [`backend-nutritie-ai/tests/security_p0_legacy_photo_ai.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/security_p0_legacy_photo_ai.test.js)
    - [`backend-nutritie-ai/tests/photo_job_service.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/photo_job_service.test.js)
    - [`backend-nutritie-ai/tests/security_p1_gdpr_recovery.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/security_p1_gdpr_recovery.test.js)
    - [`backend-nutritie-ai/tests/p112_ai_replay_idempotency.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/p112_ai_replay_idempotency.test.js)
    - [`backend-nutritie-ai/tests/photo_40_user_capacity.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/photo_40_user_capacity.test.js)
    - [`backend-nutritie-ai/tests/gdpr_worker.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/gdpr_worker.test.js)
    - [`backend-nutritie-ai/tests/gdpr_imagekit.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/gdpr_imagekit.test.js)
    - [`backend-nutritie-ai/tests/gdpr_gpt_remediation.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/gdpr_gpt_remediation.test.js)
    - [`backend-nutritie-ai/tests/training_v2_gdpr.test.js`](file:///C:/Users/tudor/OneDrive/Desktop/AplicatieNutritie\.gemini-worktrees/argon-security-remediation/backend-nutritie-ai/tests/training_v2_gdpr.test.js)

---

## 4. SQL / RPC Contract Analysis

We inspected the authoritative SQL migrations before deciding whether a new migration was needed:

1. **Flow Credits & Photo Jobs (`20260920090000_flow_credits_photo_jobs.sql` & `20260922090000_flow_credits_40_user_hardening.sql`)**:
   - `public.reserve_flow_photo_credit(p_user_id, p_logical_analysis_id, p_entitlement)` already uses `pg_advisory_xact_lock` + `UNIQUE (user_id, logical_analysis_id)` on `public.flow_credit_reservations` and returns:
     - Fresh reservation: `{ ok: true, status: 'RESERVED', reservationId: <uuid>, source: <source>, replay: false }`
     - Existing reservation for same `(user_id, logical_analysis_id)`: `{ ok: true, status: existing.status ('RESERVED' | 'COMMITTED' | 'RELEASED'), reservationId: existing.id, source: existing.credit_source, replay: true }`
     - Concurrent active reservation (`status = 'RESERVED'`): `{ ok: false, reason: 'PHOTO_IN_PROGRESS', reservationId: active.id }`
   - `public.commit_flow_photo_credit(p_user_id, p_reservation_id)` and `public.release_flow_photo_credit(p_user_id, p_reservation_id, p_reason)` already lock the row `FOR UPDATE` and return `{ ok: true, status: 'COMMITTED' | 'RELEASED', replay: true | false }`.
   - **Conclusion**: No new SQL migration is required for Priority 1. The bug was purely in the Node.js callers (`routes/ai.js` and `services/ai/photoJobService.js`) treating `replay: true` / `status: 'COMMITTED' | 'RELEASED'` as authorization for a new inference.

2. **GDPR Outbox Leasing & Fencing (`20260902120000_gdpr_outbox_leasing.sql`)**:
   - `public.claim_gdpr_deletion(p_id, p_worker_id, p_expected_status, p_lease_seconds)` already increments `fencing_token` and returns JSONB `{ success: true, fencing_token: <int>, lease_expires_at: <timestamptz> }`.
   - `public.renew_gdpr_lease(p_id, p_worker_id, p_fencing_token, p_lease_seconds)` already verifies `claimed_by = p_worker_id AND fencing_token = p_fencing_token AND lease_expires_at > now()` and returns JSONB `{ success: true, lease_expires_at: <timestamptz> }`.
   - **Conclusion**: No new SQL migration is required for Priorities 2, 3, or 4, provided migration `20260902120000_gdpr_outbox_leasing.sql` is applied in Production. Any pre-`20260902120000` database returning a legacy boolean from `claim_gdpr_deletion` now fails closed (`LEGACY_BOOLEAN_CLAIM_REJECTED`).

---

## 5. Concurrency & Failure Matrix

| Scenario | Layer Enforcing Invariant | Expected & Verified Behavior |
| :--- | :--- | :--- |
| **Replay of already `COMMITTED` photo reservation** | `valideazaRezervareProaspataFoto` (`routes/ai.js`) & `validateFreshPhotoReservation` (`photoJobService.js`) | Rejects with `409 PHOTO_RESERVATION_ALREADY_COMMITTED`. Vision LLM inference is NOT called (`inferenceCalls === 1`); credit is NOT double-debited or released. |
| **Replay of `RELEASED` photo reservation** | `valideazaRezervareProaspataFoto` & `validateExistingJobForReplay` | Rejects with `409 PHOTO_RESERVATION_RELEASED`. Requires a new independent logical operation with a fresh reservation. |
| **Replay of `RESERVED` (`replay: true`) or concurrent same-user request** | `operatiiFotoInCurs`, `utilizatoriFotoSincronInCurs`, & `valideazaRezervareProaspataFoto` | Rejects second request with `409 PHOTO_IN_PROGRESS`. Active reservation is NOT released by the rejected duplicate request. |
| **Reused `logicalAnalysisId` with different `imageUrl` or `imageFileId`** | `validateExistingJobForReplay` (`photoJobService.js`) | Rejects with `409 LOGICAL_ID_IMAGE_MISMATCH`. |
| **`commitPhoto` throws or returns `{ ok: false }` / `status !== 'COMMITTED'`** | `handleAnalizaFoto` (`routes/ai.js`) & `settlePhotoCredit` (`analiza-mancare-ai.js`) | `settled` remains `false`; calls `releasePhoto(..., 'COMMIT_FAILED')` and returns `503 CREDIT_SETTLEMENT_FAILED` (never returns a free 200 analysis). |
| **GDPR `claim_gdpr_deletion` returns boolean `true`/`false`, `fencing_token <= 0`, or expired `lease_expires_at`** | `revendicaRandOutbox` (`gdprWorker.js`, `routes/gdpr.js`) | Fails closed (`LEGACY_BOOLEAN_CLAIM_REJECTED` / `INVALID_FENCING_TOKEN` / `INVALID_OR_EXPIRED_LEASE`). Zero DB, Clerk, ImageKit, or Auth deletions occur. |
| **GDPR worker crashes between `mese` enumeration and `file_ids` persistence** | `pregatesteSiPersistaFileIdsOutbox` (`gdprWorker.js`) | Throws `GDPR_OUTBOX_FILE_IDS_PERSIST_FAILED` before `stergeRanduriDbUtilizator` starts. `mese` rows remain intact for the next retry. |
| **GDPR worker crashes mid-DB delete AFTER `mese` is deleted but BEFORE `db_done`** | `pregatesteSiPersistaFileIdsOutbox` (`gdprWorker.js`) | `file_ids` were already durably persisted in `gdpr_deletions` before `mese` was deleted; resuming worker unions persisted `file_ids` with any remaining `mese` rows and deletes all owned ImageKit files. |
| **GDPR worker loses lease mid-stage (reclaimed by another worker)** | `asiguraLeaseActiv`, `onBeforeStep` hooks, & fenced `actualizeazaStatusOutbox` | Stale worker detects expired lease / mismatched `fencing_token`, aborts before irreversible steps (`auth.admin.deleteUser`), and is blocked by `.eq('fencing_token', ...)` from overwriting the reclaiming worker's state. |

> [!NOTE]
> Concurrency and race tests were executed deterministically against stateful in-memory/RPC simulation harnesses in Jest (`security_p0_legacy_photo_ai.test.js`, `security_p1_gdpr_recovery.test.js`, `gdpr_gpt_remediation.test.js`). Live disposable PostgreSQL instance verification is marked **pending** (no local PostgreSQL server is running in this environment).

---

## 6. Play Integrity Binding Proof

1. **Vulnerability**: Previously, on `POST /api/v1/analiza-foto` and `POST /api/v1/analizeaza-mancare-structurat`, `submitAnalizaFotoIntegrity` executed before `upload.single('imagine')`. Consequently, Multer had not yet parsed the multipart stream (`req.file` and `req.body` were undefined), and an integrity token minted for Photo A could be replayed with Photo B's multipart upload.
2. **Fix**:
   - In `backend-nutritie-ai/routes/ai.js`, `upload.single('imagine')` and `atasareAmprentaImagineMultipart` now execute **before** `submitAnalizaFotoIntegrity` / `submitStructuratIntegrity`.
   - `atasareAmprentaImagineMultipart` reads the actual uploaded bytes (`req.file.buffer` or `req.file.path`), attaches `req.fileBuffer`, and computes:
     - `req.imageContentSha256 = sha256(buffer)`
     - `req.imageLegacyFingerprint = sha256("analiza-foto|md5:<md5>:<byteLength>|<provider>|<limba>")` (matching `frontend-nutritie/lib/imageOptimizer.ts:112`).
   - It registers `finish`/`close` cleanup hooks so temporary upload files are always unlinked even when `submitAnalizaFotoIntegrity` rejects with `403`.
   - In `backend-nutritie-ai/utils/playIntegrity.js`, `createPlayIntegrityGuard({ requireImageDigest: true })` and `createPlayIntegrityVerifier`:
     - Require `req.imageContentSha256` to be present on multipart routes (`MISSING_VERIFIED_IMAGE_DIGEST` if absent).
     - Verify any client-supplied `X-Payload-Fingerprint`, `imageSha256`, or `imageDigest` against `{ req.imageContentSha256, req.imageLegacyFingerprint }` (`PLAY_INTEGRITY_IMAGE_DIGEST_MISMATCH` if mismatched).
     - Construct `expectedRequestHash` using the server-verified image digest (`imageSha256`), binding the Google Play Integrity `requestDetails.requestHash` directly to the authenticated `userId`, canonical action/path, and the exact uploaded image bytes.
3. **Backwards Compatibility & Client Transition Note**:
   - Mobile clients on the canonical V2 async flow (`POST /api/v1/photo-jobs/upload-auth` → ImageKit upload → `POST /api/v1/photo-jobs/submit`) already include `imageUrl` and `imageFileId` in the JSON body hashed by `buildPlayIntegrityRequestHash` (`frontend-nutritie/lib/playIntegrity.ts:53`).
   - Any legacy client calling multipart `/analiza-foto` or `/analizeaza-mancare-structurat` when `PLAY_INTEGRITY_MODE=enforce` must include the image digest (`X-Payload-Fingerprint` or `imageSha256`) in its attested request hash. Production `PLAY_INTEGRITY_MODE` was not changed.

---

## 7. Clean-Checkout Boot Proof

- **Provenance Investigation**: `git show 86f8dff7 -- backend-nutritie-ai/server.js` confirmed that base commit `86f8dff7` (`feat(release): v36 physical device acceptance, GDPR concurrency & export remediation, and Play release gate`) added `const createVersionCheckRouter = require('./routes/versionCheck')` to `backend-nutritie-ai/server.js` while leaving `backend-nutritie-ai/routes/versionCheck.js` and `backend-nutritie-ai/tests/versionCheck.test.js` untracked.
- **Remediation**:
  - Reviewed and staged `backend-nutritie-ai/routes/versionCheck.js` and `backend-nutritie-ai/tests/versionCheck.test.js` on `argon/getflow-security-p0-p1-remediation`.
  - Added Test 5 in `backend-nutritie-ai/tests/versionCheck.test.js` which parses all local `require('./...')` calls in `backend-nutritie-ai/server.js`, resolves each file on disk, and verifies via `git ls-files --error-unmatch` that every required local module is tracked in Git.
  - Updated `backend-nutritie-ai/server.js:541` to `res.sendFile(numeFisier, { root: calePublic })` so Express static legal routes (`/privacy`, `/terms`, `/app-ads.txt`) do not fail when checked out inside a dot-prefixed directory such as `.gemini-worktrees`.

---

## 8. Full Test Matrix

### Backend (`backend-nutritie-ai`)
| Command | Result | Details |
| :--- | :--- | :--- |
| `node argon-review-replay-proof.js` | **EXPLOIT BLOCKED** | `{"first":200,"replay":409,"reserveCalls":2,"inferenceCalls":1,"commitCalls":1}` |
| `npx jest tests/security_p0_legacy_photo_ai.test.js` | **PASS** | 12/12 tests passed (Tests 1–12 including GPT replay proof, settlement failure, concurrency, Play Integrity Photo A vs Photo B) |
| `npx jest tests/photo_job_service.test.js` | **PASS** | All tests passed (including `LOGICAL_ID_IMAGE_MISMATCH`, `PHOTO_RESERVATION_RELEASED`, non-fresh reservation rejection) |
| `npx jest tests/photo_flow_routes.test.js` | **PASS** | All tests passed |
| `npx jest tests/security_p1_gdpr_recovery.test.js` | **PASS** | 7/7 tests passed (Tests 1–7 including boolean claim fail-closed, durable `file_ids` crash recovery, and mid-stage lease loss) |
| `npx jest tests/gdpr_worker.test.js` | **PASS** | All tests passed |
| `npx jest tests/gdpr_imagekit.test.js` | **PASS** | All tests passed |
| `npx jest tests/gdpr_gpt_p0_regression.test.js` | **PASS** | All tests passed |
| `npx jest tests/gdpr_gpt_remediation.test.js` | **PASS** | All tests passed |
| `npx jest tests/training_v2_gdpr.test.js` | **PASS** | All tests passed |
| `npx jest tests/chat_quota.test.js` | **PASS** | All tests passed |
| `npx jest tests/play_integrity.test.js` | **PASS** | All tests passed |
| `npx jest tests/p112_ai_replay_idempotency.test.js` | **PASS** | All tests passed |
| `npx jest tests/versionCheck.test.js` | **PASS** | 5/5 tests passed (including `git ls-files --error-unmatch` check for all `server.js` local requires) |
| `npm test` | **PASS** | **81/81 test suites passed, 819/819 tests passed** |
| `npm run lint` | **PASS** | 0 errors, 0 warnings |

### Frontend (`frontend-nutritie`)
| Command | Result | Details |
| :--- | :--- | :--- |
| `npx jest flowCreditsRollback FlowIcon playIntegrity photoJobs cameraPhotoFlow deleteAccountCleanup gdprDeleteAccount` | **PASS** | **4/4 matching suites passed, 31/31 tests passed** |
| `npm run lint` (`expo lint`) | **PASS** | 0 errors, 0 warnings |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | 0 errors |

### Skills Consulted & Device Verification Disclosure
- **UI Design Skills Consulted**: `apple-design` and `swiftui-design-skill` were consulted and preserved from Round 1 (`28c138a3`); no UI files were modified in Round 2.
- **Engineering Skills Applied**: `systematic-debugging`, `test-driven-development`, `verification-before-completion`, and `ponytail`.
- **Device Verification**: Actual Android physical device / emulator verification was not performed in this backend security remediation session; all checks were verified via Jest, ESLint, and TypeScript (`tsc --noEmit`).

---

## 9. Residual Risks & Production Prerequisites

1. **PostgreSQL Migration Prerequisite (`20260902120000_gdpr_outbox_leasing.sql` & `20260922090000_flow_credits_40_user_hardening.sql`)**:
   - Ensure both migrations are applied in Production before deploying the backend. Because `revendicaRandOutbox` now fails closed on legacy boolean responses (`LEGACY_BOOLEAN_CLAIM_REJECTED`), `claim_gdpr_deletion` and `renew_gdpr_lease` must be at the `20260902120000` JSONB contract.
2. **Live Disposable PostgreSQL Concurrency Verification**:
   - Database concurrency invariants were verified against deterministic stateful harnesses in Jest; live disposable PostgreSQL concurrency testing (`rls_integration.test.js` / `rls_postgrest.test.js`) remains pending an environment with a live local/staging Supabase Postgres instance.
3. **Trigger.dev Worker Deployment Synchronization**:
   - Deploy the updated `analiza-mancare-ai` Trigger.dev task (`backend-nutritie-ai/src/trigger/analiza-mancare-ai.js`) alongside the backend service on Render so worker-side `requireOwnedJob` and `settlePhotoCredit` status verification are active simultaneously.
