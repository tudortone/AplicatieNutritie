# Android / Play acceptance handoff

24 October 2026. **No physical PASS, EAS build or Play upload in this execution.** Source fix2680eaf381604713d6bdefff084c2b3ea97f4e13; separate fixture-QA sourcea5c3414bae308042f5048dca08f8bbc17afff867 retained unchanged. Neither is an installed artifact. Owner reports Samsung SM-S928B Android16/API36 and sideloaded Production code37. No uninstall/clear/data loss.

| Journey on final distributed artifact | Local evidence | Samsung / Play |
|---|---|---|
|Same-package in-place upgrade, login and local drafts retained|Local v37 APK/signature metadata read; Play comparison pending|UNVERIFIED; observed installation failure unresolved|
|Native version policy, offline/timeout, malformed policy, dismiss, Play retry, resume|31 focused frontend tests including root routing; canonical affected lint/typecheck PASS|UNVERIFIED visual/touch/font scaling/resume on native build|
|Supabase sign-in/signup, refresh, logout/relogin, account switch isolation|Existing auth fixtures retained;4 root routing scenarios freshly PASS|UNVERIFIED actual identity provider/SecureStore/account change|
|Onboarding/profile save, duplicate Continue, Back and form preservation|Prior accepted onboarding regressions retained, not rerun|UNVERIFIED Android hardware/gesture Back and restarted app|
|Search/manual add, quantity edit/delete, totals and day boundary|Existing journal/math/timezone evidence retained, unchanged source|UNVERIFIED final artifact/cloud persistence and timezone transition|
|Photo camera/gallery/barcode, analysis→review→journal|103 backend selected regressions include worker/service safety; fixture only|UNVERIFIED camera permission, bad image, paid provider, journal persistence|
|Zero credit/failure/retry/unknown outcome, airplane mode/background|Backend reservation/claim/outcome/exactly-once selected tests PASS|UNVERIFIED end-to-end credit count and recovery without duplicate charge|
|Chat and quota exhaustion/provider timeout|Existing server admission tests in103 selection; broader retained tests unchanged|UNVERIFIED actual provider, UX timeout, app restart|
|Existing workout routines/session history/numeric dates|Prior evidence retained; no Training2 source integrated|UNVERIFIED save/reopen/recovery on phone|
|Purchase/entitlement/restore/refund|Server Billing service/routes fixtures PASS|UNVERIFIED licensed-test purchase/RTDN/refund/restore; needs approval|
|Reward/SSV/consent/Integrity|Signature and reward service fixtures PASS; source consent ordering inspected|UNVERIFIED actual test ad, callback, exactly-one reward, Integrity compatibility|
|GDPR export/delete and wrong-user denial|Selected GDPR recovery fixtures PASS|UNVERIFIED approved disposable account only; never real-user deletion|
|Crash/ANR, memory, font scaling, background/poor network, process restart|No fresh native build/profiling; new notice has48dp controls, safe inset, scroll/font scaling|UNVERIFIED Android16 and Play-delivered split APK|

Production config inspected unchanged: com.totsrl.getflo, app.json code38, target/compile36. Remote source=eas remote, so source38 is **not an allocated free Play code**. Production EAS signing fingerprint retained; current delivered Play signer/code needs owner evidence. No counter/signing key changed. No new APK/AAB, build ID or Play track can be reported.

The frozen QA package stays com.totsrl.getflo.qa, loopback fixtures only, Ads/Billing native startup/Sentry/OTA disabled with its accepted QA environment and signing. New production-source clone intentionally does not replace that already-verified QA source; its old qa profile lacks the two later URL integrations. Do not build that profile from this clone assuming it equals a5. Any new QA integration must be explicitly source-bound and tested. Test-only package cannot prove Production upgrade.

Owner capture session after separately approved build/install: use an authenticated synthetic account, no private photos/history/push notifications. Record source SHA/build ID/code/package/track/signer and before/after data counts. Run the matrix; record PASS/FAIL with actual repro/log timestamps. No pm clear, reinstall or signature substitution as a shortcut. Start fixtures/ADB reverse3000/54321 only in the approved QA session; none were started here.

## Console compliance — no Console PASS from source

| Item | Repository/current evidence | Status |
|---|---|---|
|App signing and upload key|Local APK/EAS digest comparison in PLAY_UPDATE_FIX|OWNER Play App Signing/rotation and actual v38 split required|
|Track/testers/regions/device eligibility/review status|Owner sees Update then install failure|OWNER evidence required; no promotion|
|Android target and permissions|Source compile/target36; camera preserved; mic/broad media blocked, Health/steps permission declarations exist|Final signed merged manifest, justifications and native permission prompts UNVERIFIED; no Gradle rerun|
|Data safety|Source uses identity, nutrition/fitness, photos, AI providers, ads/Billing/diagnostic SDKs|OWNER compare actual collection/sharing/retention/security and all SDKs to Console form; no blanket no-sharing claim|
|Privacy/terms/support|Configured backend /privacy, /terms; supportgetflow@gmail.com; public /delete-account route exists in source|Current live content/availability, in-app links and Console deletion URL require acceptance|
|Account deletion|Authenticated GDPR route and public instructions in source|Disposable test account / associated media / deferred deletion behavior pending|
|Health declaration|Nutrition/weight and activity/fitness functionality in source|OWNER declaration accuracy pending; do not select no-health merely because app is not a medical device|
|Ads, subscriptions, consent, restore and consumer rights|expo-iap/Play and AdMob source, unchanged IDs/prices|OWNER Console product/ads declarations/terms plus actual test transactions and UMP acceptance|
|AI disclosure and reporting|Listing draft explains estimates; Chat is a real generative feature|Policy applicability and an accessible in-app inappropriate-content report path need explicit validation; not inferred from a support mail link. Narrow chat search did not locate a report control; no unapproved feature was added|
|Crash/ANR/quality|Focused tests, no new final artifact/device session|Play Vitals/current native crash baseline UNVERIFIED|
|Store localization/assets|RO/EN drafts, real branded stills and original icon supplied|Owner approval pending; native captures/video missing|
|Release/support/staged rollout|No approved Production artifact or canary|Separate track/rollout/support approval after all critical gates|

Current primary references: [Play listing/limits](https://support.google.com/googleplay/android-developer/answer/9859152?rd=1), [preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [health declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en), [health content policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en), [AI content policy](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en-EN). Checked24Oct2026; they supply acceptance criteria, not proof of Console compliance. Health, AI and Data safety declarations require owner review against actual release behavior; no legal/medical compliance certification is asserted.
