# Local Samsung QA fixtures

Fixture-only API and Supabase-shaped endpoints for `com.totsrl.getflo.qa`. They use synthetic identity and in-process data, never a provider or Production proxy. Supported: login/session, fixed profile/targets and manual meal create/read/edit/delete. Duplicate meal IDs return 409 without overwriting the first meal. Unsupported AI, rewarded ads, real purchases and other writes return explicit failures; they are not E2E evidence.

Use the repository's pinned Node 22.23.4. From the repository root, after approval to start the local session:

```powershell
node tools/android-qa/fixture-server.cjs
```

The server binds only `127.0.0.1:3000` and `127.0.0.1:54321`, checks Host/Origin, caps request bodies and does not persist meals. Restarting discards synthetic meals. Login: `samsung.qa@example.invalid`; synthetic fixture password: `Fixture-only-2026!`. The profile is already initialized: first-account onboarding and profile writes are not simulated. Use the focused tests to verify that real onboarding data reaches the shared dashboard/Chat hook; physical onboarding remains unverified.

Prepare these commands only; device network changes and installation require owner approval. Confirm the selected authorized Samsung serial privately and target it explicitly:

```powershell
adb -s <authorized-Samsung-serial> reverse tcp:3000 tcp:3000
adb -s <authorized-Samsung-serial> reverse tcp:54321 tcp:54321
```

After a single approved QA build, verify the APK package and public signer against the recorded QA credential before an approved `adb -s <serial> install -r <verified-QA.apk>`. Never uninstall, clear or replace `com.totsrl.getflo`. QA has a distinct package and signer. No APK has been built or installed by these instructions.

Tests use the installed real Supabase client against ephemeral local ports:

```powershell
node --test tools/android-qa/fixture-server.test.cjs tools/android-qa/manual-meals.test.cjs
node --test tools/android-qa/fingerprint.test.cjs
```

Ads and native Billing initialization, Sentry and OTA are disabled in the QA app configuration. Native SDKs can remain autolinked; package configuration and a historical merged manifest do not prove all device traffic is inert. Verify transport and UI on the actual QA APK before claiming device acceptance.

Build from a clean temporary checkout of the approved commit, with only private verified dependencies linked locally. EAS CLI20.5.1 reads archive exclusions at the Git root: the nested app `.easignore` must not be assumed to exclude root render/browser/test caches. Inspect the actual archive before upload. Use a short private TEMP path and process-only Git core.longpaths on Windows; do not alter global Git configuration or skip fingerprinting. The regression runs both actual legacy/modern glob contracts and the real Expo Android fingerprint.
