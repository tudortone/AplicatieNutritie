# Play update — local fix and remaining evidence

24 October 2026. Source fix: `2680eaf381604713d6bdefff084c2b3ea97f4e13`. **Physical upgrade UNVERIFIED. Installation root cause SUSPECTED, not confirmed.**

| Identity | Actual evidence | Comparison |
|---|---|---|
| Installed Samsung v37 | OWNER: com.totsrl.getflo, versionName1.0.0, installer=null, initiatingPackage=com.android.shell | Installed certificate still missing; sideload provenance does not itself prove incompatibility |
| Local release APK v37 | READ locally: com.totsrl.getflo, code37/name1.0.0, target/compile36; apksigner verifies | SHA256 certificate **e4336e887a1b7f384382509b96fbbb98c4db87715e313e64fd3379e23194fea4** |
| APK bytes | Protected existing android/app/build/outputs/apk/release/app-release.apk, read only | SHA256 **AC1207AAC6032DA50A1A0E62615E2E551D070A4EBEFE42096B0CC37769E179C2**; no proof these bytes are installed |
| Production EAS certificate | RETAINED public fingerprint e4336e887a1b7f384382509b96fbbb98c4db87715e313e64fd3379e23194fea4 | MATCH local v37 APK; may be the upload key rather than Play distribution key |
| QA EAS certificate | RETAINED 0d32f59b93ec6d37a82040f75545227e409790845d50d3701d76f8dc7fbc1837 | Different key and package com.totsrl.getflo.qa; cannot upgrade Production |
| Play App Signing | Owner evidence pending | UNKNOWN |
| Play v38 distributed APK | Owner reports an eligible update, installation fails | Signer/version/track/device tuple UNKNOWN |

The first apksigner BAT invocation stalled with the system Java launcher. Explicit installed JDK17 + build-tools36 apksigner.jar returned signature verification exit0. No keystore/private-key operation. No phone daemon, installation or data access was performed.

Gemini code was located in commit `51bc8f4fd9b9907f95947c37f20cde883bd00b96`. Its whole 15-file commit was NOT imported: it included unrelated camera/modal/draft changes. Its version service was ported and corrected with RED-first regressions. The current implementation is smaller than the historical service plus force-update modal.

Changes: frontend/lib/versionCheck.ts uses expo-application nativeBuildVersion (never OTA app config or guessed31), rejects malformed policy and arbitrary store destinations, bounds timeout even if fetch ignores abort, and skips QA/non-Android/unknown package identity. hooks/useAppUpdate.ts checks once at ready startup and at most once/minute on resume; ignores late unmounted responses and remembers dismissal during the session. AppUpdateNotice.tsx exposes Play retry/support and remains dismissible. Root gating waits for storage/auth/biometric readiness. Play links are canonical HTTPS/market for com.totsrl.getflo.

Minimum-version and force flags are parsed and produce stronger **required advice**, not a hard blocker. **Mandatory enforcement is deliberately NOT IMPLEMENTED/ACCEPTED** until availability for this user's Play account can be established. This is a safety limitation, not a claim of a completed mandatory-update gate. Native Play Core supports flexible/immediate updates, but this Expo source has no existing supported bridge; adding a new native bridge was not needed for the permitted initial safe deep-link release. See [official flows](https://developer.android.com/guide/playcore/in-app-updates).

Backend retains the public /api/v1/version-check and /api/version-check aliases. Defaults min31/latest32/forcefalse unchanged; malformed client codes return400 and incoherent configured policies return503 without force. No live minimum/latest/versionCode was changed. Updating policy to actual Play availability requires separately authorized configuration and deployment. A new client cannot repair the currently installed v37 binary retroactively.

Evidence: 31/31 frontend tests, 103/103 backend tests in focused cross-service selection, typecheck and affected canonical lint exit0; release-proof/VERIFICATION.md and JSON. No fresh native build, visual device review or in-place update PASS.

Owner next: provide redacted Play APP SIGNING SHA256 (and rotation lineage if relevant), actual delivered track/code/status/device eligibility, and installed APK certificate digest if available through approved read-only extraction. Compare application ID, signer/lineage and eligible code. [Android requirements](https://developer.android.com/google/play/app-updates) require package/signature compatibility; a different installer alone is insufficient to diagnose failure.

If signers differ without valid rotation, an in-place update is blocked. Do not change signing to guess a solution or uninstall automatically. First inventory server-synced versus device-only drafts/offline writes, obtain an approved recoverable data-transfer plan and explicit reinstall authorization if unavoidable. Never promise recovery of private app-local data from an incompatible-signature uninstall.

A newly signed release is needed to ship these new source fixes, but necessity for resolving the existing Play installation error remains unknown until the comparison. Existing native API36 evidence is retained; source app/version counters were not arbitrarily incremented.
