# GetFlow Backblaze B2 Authentication Debug

Date: 2026-10-11

## Outcome

The previous generic failure is now localized to `b2_list_buckets`: the run had passed the separate `b2_authorize_account` call and stopped before the script displayed its exact `CREATE getflow-backup-restic` confirmation. Therefore the failing run did not issue `b2_create_key`. The former helper suppressed the only evidence that could distinguish an HTTP/API rejection from a network or PowerShell error, so its exact HTTP status and B2 code cannot be recovered from that transcript.

The current API contract was checked against Backblaze's official documentation. The implemented flow uses Basic authentication with Base64 of `applicationKeyId:applicationKey`, the v4 authorization endpoint, `POST /b2api/v4/b2_list_buckets` with the authorization token and required `accountId`, and the v4 create-key payload with `bucketIds`, `namePrefix`, `options: ["s3"]`, and file-only capabilities. Creating a key requires `writeKeys`; listing keys for duplicate prevention requires `listKeys`. See [authorization](https://www.backblaze.com/apidocs/b2-authorize-account), [list buckets](https://www.backblaze.com/apidocs/b2-list-buckets), [create key](https://www.backblaze.com/apidocs/b2-create-key), and [list keys](https://www.backblaze.com/apidocs/b2-list-keys).

The API contract itself does not explain the prior rejection: the next authorized local run is required to expose the sanitized HTTP status and stable B2 error code. It will never print response messages, bodies, headers, tokens, or credential values.

## Changes made

- Added `tools/backup/GetFlowB2Api.psm1` for validated Basic-auth construction, HTTPS-only requests, sanitized operation/status/code diagnostics, network-vs-runtime error classification, and paginated read-only key listing.
- Updated `tools/backup/New-GetFlowRestrictedB2Key.ps1` to use the shared API wrapper for both master and child authorization. Before creation it now requires `listBuckets`, `listKeys`, and `writeKeys`, verifies the exact private bucket ID/name, and refuses to create if an active key named `getflow-backup-restic` already exists.
- Creation is never retried automatically. If the create response is ambiguous, the script makes one read-only key-list check and instructs the owner to inspect Backblaze before rerunning.
- Added `tools/backup/tests/Test-GetFlowB2Api.ps1` with synthetic request and error fixtures, including secret/body suppression checks.
- Updated `tools/backup/tests/Run-GetFlowBackupTests.ps1` so a stopped local restore lab is reported as BLOCKED rather than turning a preflight failure into a passing test.

## Verification

- PowerShell parser: PASS, 8 `.ps1`/`.psm1` files.
- B2 API mock tests: PASS, 33 assertions in the latest run covering Basic auth, v4 routes/methods, request bodies, key scope, pagination, HTTPS enforcement, sanitized HTTP/API diagnostics, and transport diagnostics. The synthetic FormatException fixture validates redaction/classification only; it does not reproduce the actual default `Invoke-RestMethod` failure.
- Backup script tests: PASS, 33 assertions. This includes the synthetic Windows DPAPI/current-user ACL round trip, pinned client flags, schema allowlist, binary pipe checks, and scoped child-process environment checks.
- Backup preflight: BLOCKED. The existing WSL restore probe could not verify a running compatible local Supabase/PostgreSQL target.
- Synthetic WSL restore: BLOCKED at its initial restore-target probe; no test database was created.
- WSL2 Ubuntu-24.04 is running. The Supabase CLI and PostgreSQL 17.11 client utilities exist, but Docker CLI and `/var/run/docker.sock` are absent; `pg_lsclusters` reports no local cluster and `pg_isready` reports no response. The local Supabase stack therefore cannot run yet.
- Protected B2 credential file: MISSING. The key material entered in the earlier failed attempt was not retained.
- Restricted B2 key: NOT CREATED by the observed failed run. A read-only check of the authenticated Backblaze dashboard showed the verified bucket as Private in EU Central (`s3.eu-central-003.backblazeb2.com`), encryption enabled, and no files in the bucket; the `Your Application Keys` section had no listed child key. The updated script still performs an authoritative API `b2_list_keys` duplicate check before any creation attempt.
- Production export/backup: NOT RUN. No Production database connection, database modification, migration, dump, or B2 upload occurred.

In the earlier owner-run attempt, the rotated Master Application Key ID and key were entered into masked prompts. The request then failed at the old generic error boundary (`New-GetFlowRestrictedB2Key.ps1:36`) while listing buckets. That helper suppressed the status, response code, exception type and stack location, so the exact root cause cannot be reconstructed from that output. In the current recovery turn, no credential was re-entered and no live Backblaze API request was made. The new diagnostics and mocks have not yet been exercised against the real request path; no restricted key creation is confirmed.

## Safe continuation

1. After confirming the rotated master key remains active and available only to the owner, run the command below in the local terminal. Enter credentials only in the masked prompts. The script must first pass authorization, verify the approved private EU bucket, and perform a read-only active-key duplicate check. Do not paste credentials or unredacted terminal output into chat. If it fails, record only its sanitized operation, HTTP status/code or runtime exception type and source location. Do not retry a key-creation operation after an ambiguous result until a read-only key listing resolves whether it succeeded.

   ```powershell
   & "C:\Users\tudor\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoProfile -File ".\tools\backup\New-GetFlowRestrictedB2Key.ps1"
   ```

2. Install or start Docker Desktop and enable WSL integration for `Ubuntu-24.04` (administrator approval may be required). Verify from that distro that `docker info` succeeds, then start the already-configured local Supabase restore lab. Do not use a remote project as the restore target.

3. After the local restore preflight passes and the restricted key is DPAPI-stored, the previously approved read-only Production backup can proceed using the existing runner, which excludes the entire `vault` schema and streams the database dump directly into encrypted Restic. The current blockers mean that export/upload must not start yet.
