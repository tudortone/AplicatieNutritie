# GETFLOW — ADMOB ANDROID RECOVERY REPORT
**Date:** October 17, 2026  
**Target Package:** `com.totsrl.getflo`  
**Device:** Samsung Galaxy S24 Ultra (`R5CX120W81K`, Android 16 / One UI 8.0)  
**AdMob SDK Version:** `react-native-google-mobile-ads@16.3.4` (Google Play Services Ads 23.x)

---

## 1. EXECUTIVE SUMMARY & REAL-DEVICE FINDINGS

During physical device testing on the Samsung Galaxy S24 Ultra, attempting to open Flow Credits and load rewarded or interstitial ads resulted in the button getting stuck on "Loading..." followed by an error: `"Ad unavailable. Retry later."`

Real sanitized `logcat` inspection revealed the exact failing boundary:

```text
10-17 20:20:29.884  2844  2844 W UserMessagingPlatform: Publisher misconfiguration: Failed to read publisher's account configuration; this could be caused by an invalid app ID or lack of configured form(s). Verify that your app ID is correct and that you have configured one or more forms for this application, then try again. Received app ID: `ca-app-pub-1234567890123456~1234567890`.
```

### Exact Root Cause Breakdown

1. **Manifest Hardcoded Placeholder:**
   In `frontend-nutritie/android/app/src/main/AndroidManifest.xml`, line 37 contained:
   ```xml
   <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-1234567890123456~1234567890" tools:replace="android:value"/>
   ```
   Because of `tools:replace="android:value"`, Gradle manifest merger forcibly injected the dummy placeholder `ca-app-pub-1234567890123456~1234567890` into the compiled binary, ignoring the production configuration.

2. **UMP Failure & Fail-Closed Cascade:**
   When `resolveAdsConsent()` called Google's User Messaging Platform (`AdsConsent.gatherConsent()`), the Google UMP backend rejected the request with HTTP 400 because `ca-app-pub-1234567890123456~1234567890` is an invalid account.  
   Under GetFlow's fail-closed compliance policy (`adsConsent.ts`), an unsuccessful consent resolution sets `canRequestAds = false`.

3. **SDK Initialization Blocked:**
   Because `canRequestAds = false`, `initializeAdsSdk()` in `adsService.ts` aborted before calling `MobileAds().initialize()`.

4. **Ad Requests Rejected at Native Boundary:**
   `showRewardedAdWithSsv()` and `showPreloadedInterstitial()` checks `if (!isAdsAvailable() || !getCanRequestAds())`, immediately returning `'unavailable'`.

---

## 2. SEPARATE VERIFICATION DIMENSIONS

| Dimension | Verification Status | Evidence / Notes |
|---|---|---|
| **AdMob Account Approval** | **APPROVED** | Authoritative Publisher ID: `pub-5202280855139508`. Account verified in Google AdMob Console. |
| **Individual App Readiness** | **NEEDS REVIEW / PENDING LINK** | App `ca-app-pub-5202280855139508~6141533757` was registered in AdMob. Production ad serving requires linking to live Google Play listing. |
| **Policy Center Restrictions** | **CLEAN (0 Violations)** | No active policy strikes, copyright strikes, or child-directed violations in Google AdMob Console. |
| **Configured AdMob App ID** | `ca-app-pub-5202280855139508~6141533757` | Verified canonical App ID for Android. |
| **Rewarded Ad Unit ID** | `ca-app-pub-5202280855139508/3566028223` | Server-Side Verification (SSV) callback configured pointing to Render backend. |
| **Chat Interstitial Unit ID** | `ca-app-pub-5202280855139508/1542500110` | Frequency capped (every 15 chat messages, 10-minute cooldown). |
| **app-ads.txt Status** | **VALID (HTTP 200)** | `https://nutritie-backend-ai.onrender.com/app-ads.txt` serves `google.com, pub-5202280855139508, DIRECT, f08c47fec0942fa0`. |
| **Physical Samsung Registration** | **REGISTERED AS TEST DEVICE** | Device Hashed ID: `182025E7F769CEBC220B2CA72371661A` configured in `AdsConsent` and `MobileAds.setRequestConfiguration`. |
| **Server-Side Verification (SSV)** | **VERIFIED** | Backend `/rewarded/intents` and `/rewarded/verify` handle cryptographic callback verification with Google public keys. |

---

## 3. REMEDIATION IMPLEMENTED

1. **AndroidManifest.xml Fix:**
   Updated `com.google.android.gms.ads.APPLICATION_ID` from the placeholder `ca-app-pub-1234567890123456~1234567890` to the genuine production App ID `ca-app-pub-5202280855139508~6141533757`.
2. **Physical Device Hashed ID Registration:**
   Added `testDeviceIdentifiers: ['182025E7F769CEBC220B2CA72371661A']` to:
   - `lib/ads/adsConsent.ts` (`AdsConsent.gatherConsent`)
   - `lib/ads/adsService.ts` (`MobileAds().setRequestConfiguration`)
   This guarantees that ad requests on the owner's Samsung Galaxy S24 Ultra serve test ads from Google without generating invalid impressions or risking policy strikes.
3. **Automated Unit & Regression Tests:**
   All 5 ads test suites (61 tests) and 12 UMP consent tests pass cleanly.

---

## 4. PHYSICAL DEVICE VERIFICATION EVIDENCE (SAMSUNG GALAXY S24 ULTRA)

The release APK (`app-release.apk`) was assembled using the official production keystore and installed via `adb install -r` on the connected Samsung S24 Ultra:

1. **Google UMP GDPR Consent Modal:**
   - On app launch, `AdsConsent.gatherConsent()` executed with the authentic App ID.
   - Google servers returned the GDPR consent dialogue in Romanian.
   - Native dialog rendered: *"GetFlow vă solicită consimțământul pentru folosirea datelor dvs..."* with *"Consimțământ"* and *"Refuz acordarea consimțământului"* options.
   - User consented. Logcat confirmed: `Action[dismiss]: {"status":"CONSENT_SIGNAL_SUFFICIENT"}`, writing IABTCF consent signals.

2. **AdMob SDK Initialization:**
   - Immediately following consent, `MobileAds().initialize()` completed successfully without warning.
   - Hashed test device `182025E7F769CEBC220B2CA72371661A` was recognized.

3. **Flow Credits UI Activation:**
   - Navigated to Flow Credits modal from Home header.
   - The *"Watch ad • +1"* button loaded in bright lime green and fully interactive (previously disabled/dimmed).

4. **Rewarded Ad Playback:**
   - Tapped *"Watch ad • +1"*.
   - Google AdMob `AdActivity` entered full screen.
   - Live rewarded test ad played (*"Anunț de probă"* - *"Cealaltă mamă"*).

5. **Reward Earned & Balanced Incremented:**
   - Watched ad through completion. Banner displayed: *"Ați câștigat o recompensă"*.
   - Closed ad.
   - Flow Credits balance incremented on real device from **3 to 4 available** (`Daily: 3 Bonus: 1 Purchased: 0`).
   - Home header pill updated immediately to **`FLOW 4`**.

---

## 5. FIELD REPORT VALUES

```text
ADMOB_ACCOUNT_STATUS: APPROVED
ADMOB_APP_READINESS: PENDING_GOOGLE_PLAY_STORE_LINK (Standard for pre-launch apps)
ADMOB_POLICY_CENTER: CLEAN_ZERO_VIOLATIONS
ADMOB_ROOT_CAUSE: HARDCODED_PLACEHOLDER_APP_ID_IN_ANDROID_MANIFEST (ca-app-pub-1234567890123456~1234567890) CAUSED UMP HTTP 400 REJECTION
TEST_AD_LOAD: DEVICE_PASS (Test device 182025E7F769CEBC220B2CA72371661A registered and verified)
REWARDED_AD_TEST: DEVICE_PASS (Rewarded video played, completed, reward received)
SSV_VERIFICATION: BACKEND_CRYPTO_VERIFIED (Render SSV Endpoint)
PRODUCTION_AD_SERVING_STATUS: READY (Will serve production ads as soon as Google Play Internal Testing/Production listing is linked)
```
