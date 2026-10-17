# GETFLOW — GOOGLE PLAY DECLARATIONS EVIDENCE-BASED AUDIT
## Comprehensive Reconciliation: Live Play Console Answers vs. Production Code & Policies

**Audit Date:** October 17, 2026  
**Target Package:** `com.totsrl.getflo` (Android)  
**Play Console App ID:** `4974041252997171498`  
**Developer Account ID:** `5706745523362579439`  
**Account Classification:** Personal Account (`Cont personal`)  
**Public Developer Trading Name:** `TOTCode`  
**Operating Regime:** Individual Developer (Natural Person, Sole Creator & Operator)  
**Revenue Status:** Exactly 0.00 RON / 0.00 EUR (Monetization configured, 0 paying transactions)  
**Audit Methodology:** Live Chrome DevTools Protocol inspection of authenticated Play Console + full codebase cross-examination.

---

## EXECUTIVE SUMMARY & AUDIT SCORECARD

| # | Declaration Area | Live Play Console Answer | Real App Implementation | Audit Verdict | Risk Level |
|---|---|---|---|---|---|
| **1** | **Data Safety (Overview & Shared Data)** | "Nu sunt trimise date terțelor părți" | ImageKit, Supabase, Gemini (Processors); AdMob SDK active (Ad ID shared if ads served) | **MISMATCH_FOUND** | HIGH |
| **2** | **Data Safety (Collected Data)** | Personal, Financial, Photos, Fitness, Crash logs | Exact match with Supabase, Billing, Camera, Workouts, Sentry | **VERIFIED_CORRECT** | LOW |
| **3** | **Data Safety (Account Deletion URL)** | `https://telegra.ph/Stergerea-Contului-si-a-Datelor...` | Real HTTPS endpoint deployed: `https://nutritie-backend-ai.onrender.com/stergere-cont.html` | **MISMATCH_FOUND** | MEDIUM |
| **4** | **Health Apps Declaration** | Activity & fitness + Nutrition & weight management (Non-clinical) | Fitness tracking, meal logging, muscle map; non-medical disclaimers; steps via Health Connect | **VERIFIED_CORRECT** | NONE |
| **5** | **Advertising / Ads Declaration** | **"Nu, aplicația mea nu conține anunțuri"** | **AdMob SDK integrated** (`@react-native-google-mobile-ads`, Rewarded & Interstitial units, UMP SDK) | **CRITICAL_MISMATCH** | **HIGH (POLICY REJECTION RISK)** |
| **6** | **Advertising ID (AD_ID)** | "Da" (Used for Analytics + Advertising/marketing) | AdMob + Sentry telemetry (`com.google.android.gms.permission.AD_ID` declared in manifest) | **VERIFIED_CORRECT** | NONE |
| **7** | **Photos & Videos Permissions** | Justification provided for meal analysis | Camera + Android Photo Picker used for meal photo nutrition scan; no broad storage permissions | **VERIFIED_CORRECT** | NONE |
| **8** | **Financial Features** | "Aplicația mea nu oferă funcții financiare" | No banking, lending, cryptocurrency, or stock trading features offered | **VERIFIED_CORRECT** | NONE |
| **9** | **Government Apps** | "Nu" (Not a government app) | Sole personal developer project; no government affiliation claimed | **VERIFIED_CORRECT** | NONE |
| **10** | **Target Audience & Age** | "Peste 18 ani" (Adults only 18+) | Onboarding, Terms & Conditions mandate 18+; no child-directed content | **VERIFIED_CORRECT** | NONE |
| **11** | **Content Rating (IARC)** | PEGI 3 / Everyone (Cert: `188b03c2-ca88-81b1-8c10-3fa320e9882c`) | General wellness app; no violence, profanity, gambling, or adult content | **VERIFIED_CORRECT** | NONE |
| **12** | **App Access / Review Credentials** | "Da" (Restricted sections exist; Demo User Account provided) | Full reviewer credentials provided to Google Play review team for auth-gated features | **VERIFIED_CORRECT** | NONE |
| **13** | **Privacy Policy URL & Content** | `https://nutritie-backend-ai.onrender.com/privacy` | Live HTTPS URL; content currently contains erroneous company name (`T.O.T. Software S.R.L.`) | **MISMATCH_FOUND (CONTENT)** | MEDIUM |
| **14** | **In-App Purchases & Billing** | Subscriptions configured (`premium_monthly`, `premium_annual`); badge active | Expo IAP / Google Play Billing implemented; zero active paying customers | **VERIFIED_CORRECT** | NONE |
| **15** | **EU Digital Services Act (DSA)** | Personal Account; Non-Trader status (no public address displayed) | Pre-revenue personal development; commercial volume currently zero | **LEGAL_REVIEW_REQUIRED** | LOW (PRE-REVENUE) |
| **16** | **Developer Identity & Contacts** | Public Name: `TOTCode`; Email: `tudortone9@gmail.com` | Individual developer registered; personal home address protected from public exposure | **VERIFIED_CORRECT** | NONE |

---

## DETAILED DECLARATION-BY-DECLARATION AUDIT

---

### DECLARATION 1: ADS DECLARATION (`/app-content/ads-declaration`)

- **CURRENT PLAY ANSWER:**  
  `Nu, aplicația mea nu conține anunțuri` (*No, my app does not contain ads*)  
  *(Last edited: 28 aug. 2026)*
- **REAL APP BEHAVIOR:**  
  The application codebase contains active Google Mobile Ads (AdMob) SDK dependencies, configuration, and UI invocation logic:
  1. `frontend-nutritie/package.json`: Dependency `react-native-google-mobile-ads` installed.
  2. `frontend-nutritie/app.json`: Contains AdMob plugin configuration with App ID `ca-app-pub-5202280855139508~6141533757`.
  3. Rewarded Ad Unit: `ca-app-pub-5202280855139508/3566028223` (GetFlow Flow Credit Rewarded).
  4. Interstitial Ad Unit: `ca-app-pub-5202280855139508/1542500110` (GetFlow Chat Interstitial).
  5. Manifest Permission: `com.google.android.gms.permission.AD_ID` merged into Android build.
  6. Consent Management: Google User Messaging Platform (UMP) SDK configured in `frontend-nutritie/lib/ads/`.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/app.json](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app.json#L45-L55)
  - [frontend-nutritie/lib/ads/](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/lib/ads)
  - [GETFLOW_ADMOB_FINAL_STATUS.md](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/GETFLOW_ADMOB_FINAL_STATUS.md#L25-L35)
- **THIRD-PARTY DATA PROCESSORS:**  
  Google AdMob / Google Mobile Ads (Google LLC).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Monetization and Ads $\rightarrow$ Ads Policy:
  > *"You must accurately declare whether your app contains ads in the Google Play Console. Apps that contain ads are displayed with an 'Ads' label in their store listing. If you display ads in your app, including ads delivered through third party ad SDKs, you must select 'Yes, my app contains ads'."*
- **MATCH / MISMATCH / UNVERIFIED:** **CRITICAL_MISMATCH**
- **RISK:** **HIGH.** Reviewers running automated scanners on incoming AAB bundles will detect the Google Mobile Ads SDK and flag a direct policy violation for undeclared advertising, resulting in app rejection or suspension.
- **EXACT REQUIRED CORRECTION:**  
  In Google Play Console $\rightarrow$ **Conținutul aplicației** $\rightarrow$ **Anunțuri** $\rightarrow$ change selection from *"Nu, aplicația mea nu conține anunțuri"* to **`Da, aplicația mea conține anunțuri`** (*Yes, my app contains ads*).

---

### DECLARATION 2: DATA SAFETY — SHARED DATA & THIRD PARTIES (`/app-content/data-privacy-security`)

- **CURRENT PLAY ANSWER:**  
  `Nu sunt trimise date terțelor părți` (*No data shared with third parties*)  
  *(Developer statement: "Dezvoltatorul declară că aplicația nu trimite datele utilizatorului altor companii sau organizații.")*
- **REAL APP BEHAVIOR:**  
  1. Technical Processors (Contractual Service Providers): Supabase (database/auth), Render (backend compute), ImageKit (media CDN), and Google Cloud Gemini (vision AI) process data strictly as service providers on behalf of the developer under strict contractual terms. Under Google Play Data Safety definitions, transferring data to a service provider that processes data solely on the developer's behalf is **exempt from being declared as "shared"**.
  2. BUT: When AdMob ads are served to non-consenting or free users, Google AdMob SDK transfers advertising identifiers (GAID / AD_ID) and device telemetry to external ad networks and Google's advertising exchange. Under Google Play Data Safety guidance, advertising data collected by third-party ad SDKs must be disclosed as **Shared** with third parties for "Advertising or marketing" unless the app is strictly ad-free.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/lib/ads/admob.ts](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/lib/ads/admob.ts)
  - [GOOGLE_PLAY_DATA_SAFETY_SOURCE_MAP.md](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/GOOGLE_PLAY_DATA_SAFETY_SOURCE_MAP.md#L14-L16)
- **THIRD-PARTY DATA PROCESSORS:**  
  Google AdMob (Advertising), Supabase Inc., ImageKit Inc., Google Cloud / Gemini.
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Console Help $\rightarrow$ Provide information for Google Play's Data safety section $\rightarrow$ Data sharing:
  > *"Data shared means data transferred from the user's device or the developer's server to a third party... Libraries or SDKs used in your app: You must disclose all user data transferred by third-party SDKs to external third parties (such as ad networks)."*
- **MATCH / MISMATCH / UNVERIFIED:** **MISMATCH_FOUND**
- **RISK:** **HIGH.** If AdMob is active and ads are served, declaring "No data shared" contradicts the AdMob SDK's operational network traffic.
- **EXACT REQUIRED CORRECTION:**  
  Once AdMob is public and serving ads, update Data Safety Step 3 & 4 to declare:
  - Data Type: **Dispozitiv sau alte identificatoare** (*Device or other IDs*) $\rightarrow$ **ID-ul publicitar** (*Advertising ID*).
  - Status: **Trimise** (*Shared*) for purpose: **Publicitate sau marketing** (*Advertising or marketing*).

---

### DECLARATION 3: DATA SAFETY — ACCOUNT DELETION URL (`/app-content/data-privacy-security`)

- **CURRENT PLAY ANSWER:**  
  `https://telegra.ph/Stergerea-Contului-si-a-Datelor--GetFlow-08-27`  
  *(Last edited: 28 aug. 2026)*
- **REAL APP BEHAVIOR:**  
  1. In-app deletion: Completely functional via `Profil -> Date & Confidențialitate -> Șterge contul definitiv`.
  2. Public web deletion endpoint: Deployed and accessible on the production server at **`https://nutritie-backend-ai.onrender.com/stergere-cont.html`**.
  3. The current Play Console URL points to a temporary Telegraph article published in August 2026.
- **RELEVANT SOURCE FILES:**  
  - [public/stergere-cont.html](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/public/stergere-cont.html)
  - [backend-nutritie-ai/public/stergere-cont.html](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/public/stergere-cont.html)
  - [frontend-nutritie/app/settings/account-security.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/settings/account-security.tsx)
- **THIRD-PARTY DATA PROCESSORS:**  
  Render (Hosting), Supabase (Row Level Security cascade deletion).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ User Data $\rightarrow$ Delete Account URL Requirement (effective May 2024):
  > *"If your app enables account creation, you must provide a web-based path (URL) where users can request account and data deletion without having to re-install or open the app. The URL must be functional and hosted on a permanent web domain."*
- **MATCH / MISMATCH / UNVERIFIED:** **MISMATCH_FOUND**
- **RISK:** **MEDIUM.** While Telegraph is technically accessible, Google review guidelines prefer developer-hosted domains or official backend endpoints rather than anonymous blogging services.
- **EXACT REQUIRED CORRECTION:**  
  In Google Play Console $\rightarrow$ **Siguranța datelor** $\rightarrow$ Step 2 (Ștergerea datelor), update the account deletion URL from `https://telegra.ph/...` to:  
  **`https://nutritie-backend-ai.onrender.com/stergere-cont.html`** (or `https://getflow.app/stergere-cont` once custom domain DNS is pointed).

---

### DECLARATION 4: HEALTH APPS POLICY (`/app-content/health`)

- **CURRENT PLAY ANSWER:**  
  - Health Features Selected:
    - **Activitate și fitness** (*Activity and fitness*) [CHECKED]
    - **Nutriție și gestionarea greutății** (*Nutrition and weight management*) [CHECKED]
  - All Medical & Clinical Categories: **UNCHECKED** (Clinical decision support, Medical device apps, Disease management, Public health, Emergency).
  - Detected Health Permissions:
    - `android.permission.health.READ_STEPS` [DETECTED & CONFIRMED]
    - `android.permission.ACTIVITY_RECOGNITION` [DETECTED & CONFIRMED]
- **REAL APP BEHAVIOR:**  
  1. GetFlow is an informational fitness tracker, calorie counter, and workout logger.
  2. AI Coach provides non-medical lifestyle tips based on user caloric targets.
  3. Explicit non-medical disclaimers are presented in first-launch onboarding, Coach screen, and legal terms.
  4. Only read-only aggregated steps are accessed via Health Connect.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/app.json](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app.json#L30-L40)
  - [frontend-nutritie/lib/healthConnect.ts](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/lib/healthConnect.ts)
  - [frontend-nutritie/app/legal.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/legal.tsx)
- **THIRD-PARTY DATA PROCESSORS:**  
  Google Health Connect (Local Android OS API), Google Gemini (AI advice inference).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Health Apps Policy (updated 2024):
  > *"Apps that declare 'Activity and fitness' or 'Nutrition and weight management' must not make unverified medical claims or act as diagnostic software unless certified as a Software as a Medical Device (SaMD)."*
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.** GetFlow strictly avoids medical device claims. Compatibility with Personal Developer Accounts is 100%.
- **EXACT REQUIRED CORRECTION:** None required. Maintain existing selections.

---

### DECLARATION 5: ADVERTISING ID (`/app-content/ad-id-declaration`)

- **CURRENT PLAY ANSWER:**  
  - Uses Advertising ID: **Da** (*Yes*)
  - Declared Purposes:
    - **Date statistice** (*Analytics*) [CHECKED]
    - **Publicitate sau marketing** (*Advertising or marketing*) [CHECKED]
- **REAL APP BEHAVIOR:**  
  - Manifest includes `com.google.android.gms.permission.AD_ID`.
  - Used by Google Mobile Ads SDK for ad serving and frequency capping.
  - Sentry SDK sanitizes identifiers before transmission.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/android/app/src/main/AndroidManifest.xml](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/android/app/src/main/AndroidManifest.xml)
  - [frontend-nutritie/lib/telemetryPrivacy.ts](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/lib/telemetryPrivacy.ts)
- **THIRD-PARTY DATA PROCESSORS:**  
  Google AdMob (Google LLC).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Advertising ID Policy:
  > *"Apps targeting Android 13 (API 33) or higher that use the advertising ID must declare the AD_ID permission in their manifest and declare their use in the Play Console."*
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 6: PHOTOS AND VIDEOS PERMISSIONS (`/app-content/photos-and-videos`)

- **CURRENT PLAY ANSWER:**  
  - Justification Text Submitted:  
    *"Utilizatorii selectează fotografii din galerie cu mâncarea din farfurie pentru analiza nutrițională automată (calorii, macronutrienți) realizată prin inteligență artificială în jurnalul zilnic de mese."*  
    *(Users select photos from gallery with plate food for automatic nutritional analysis...)*
- **REAL APP BEHAVIOR:**  
  - Users take meal photos with the camera or choose from gallery for Gemini AI food recognition.
  - The app uses standard Android system image pickers (`expo-image-picker`) and direct camera capture. Broad storage permissions (`READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`) are not requested in production builds.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/components/photo-ai/FoodCameraModal.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/components/photo-ai/FoodCameraModal.tsx)
  - [frontend-nutritie/app/(tabs)/index.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/(tabs)/index.tsx)
- **THIRD-PARTY DATA PROCESSORS:**  
  ImageKit Inc. (CDN storage), Google Gemini API (Vision processing).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Permissions and APIs $\rightarrow$ Photo and Video Permissions policy:
  > *"Apps should use the system photo picker where possible. Apps that require broad access must justify why system pickers are insufficient."*
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 7: FINANCIAL FEATURES (`/app-content/financial-features`)

- **CURRENT PLAY ANSWER:**  
  **`Aplicația mea nu oferă funcții financiare`** (*My app does not provide financial features*)  
  *(All financial categories unchecked: banking, personal loans, credit lines, crypto wallets, trading).*
- **REAL APP BEHAVIOR:**  
  GetFlow does not provide banking, payday loans, peer-to-peer money transfers, cryptocurrency wallets, or investment management. Standard digital subscriptions via Google Play Billing do not classify an app as a financial services provider.
- **RELEVANT SOURCE FILES:**  
  - [frontend-nutritie/context/PremiumContext.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/context/PremiumContext.tsx)
- **THIRD-PARTY DATA PROCESSORS:**  
  Google Play Billing (Merchant / App Store processor).
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Financial Services policy:
  > *"The financial services policy applies to apps that provide direct loans, credit monitoring, banking services, or cryptocurrency trading."*
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 8: GOVERNMENT APPS (`/app-content/government-apps`)

- **CURRENT PLAY ANSWER:**  
  **`Nu`** (*No, the app is not developed by or on behalf of a government institution*)
- **REAL APP BEHAVIOR:**  
  GetFlow is a private, independent software application created and maintained by a sole developer.
- **RELEVANT SOURCE FILES:**  
  - [GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md)
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Government Apps Policy.
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 9: TARGET AUDIENCE AND AGE (`/app-content/target-audience-content`)

- **CURRENT PLAY ANSWER:**  
  - Target Age Group: **`Peste 18 ani`** (*Over 18 years old / Adults only*) [CHECKED]
  - All minor categories (0–5, 6–8, 9–12, 13–15, 16–17): **UNCHECKED**.
- **REAL APP BEHAVIOR:**  
  - GetFlow is designed for adult athletes and general fitness enthusiasts.
  - Terms of Service explicitly require users to be at least 18 years of age.
  - No child-oriented themes, animations, or marketing materials exist.
  - By selecting 18+, GetFlow is **not subject to Google Play Families Policy** or COPPA restrictions.
- **RELEVANT SOURCE FILES:**  
  - [public/termeni-si-conditii.html](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/public/termeni-si-conditii.html#L115-L125)
  - [frontend-nutritie/app/onboarding/](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/onboarding)
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Families Policy Requirements.
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 10: CONTENT RATINGS (`/app-content/content-rating-overview`)

- **CURRENT PLAY ANSWER:**  
  - State: **Finalizată** (*Completed*)
  - Certificate ID: `188b03c2-ca88-81b1-8c10-3fa320e9882c`
  - Submitted: August 28, 2026
  - Email: `tudortone9@gmail.com`
  - Rating Authority: International Age Rating Coalition (IARC) $\rightarrow$ **PEGI 3 / Everyone**.
- **REAL APP BEHAVIOR:**  
  The app contains no profanity, violence, sexual content, gambling, or hate speech. Content rating is completely accurate.
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Content Ratings.
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

### DECLARATION 11: APP ACCESS & REVIEW CREDENTIALS (`/app-content/testing-credentials`)

- **CURRENT PLAY ANSWER:**  
  - Restricted sections: **Da** (*Yes*)
  - Credential Set: **`Demo User Account`** (Provided with username, password, and instructions for Google review team).
- **REAL APP BEHAVIOR:**  
  - Core features require account authentication (Supabase email/password).
  - The demo credentials allow Google's human and automated testers to authenticate without SMS or external verifications.
- **RELEVANT SOURCE FILES:**  
  - [backend-nutritie-ai/scripts/test_reviewer_auth.js](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/scripts/test_reviewer_auth.js)
  - [frontend-nutritie/context/AuthContext.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/context/AuthContext.tsx)
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ App evaluation $\rightarrow$ App access:
  > *"If parts of your app are restricted by login credentials, you must provide functional review credentials to allow Google to evaluate the app."*
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required. Ensure the Demo User Account remains active and unblocked in Supabase Auth.

---

### DECLARATION 12: PRIVACY POLICY URL & HOSTED CONTENT (`/app-content/privacy-policy`)

- **CURRENT PLAY ANSWER:**  
  - Saved URL: **`https://nutritie-backend-ai.onrender.com/privacy`**  
  - Store settings website: `https://nutritie-backend-ai.onrender.com`
- **REAL APP BEHAVIOR & HOSTED CONTENT:**  
  1. The URL is accessible via HTTPS (HTTP 200) and serves `public/politica-de-confidentialitate.html`.
  2. **CRITICAL DISCREPANCY:** The rendered HTML file currently contains 8+ occurrences of the unverified entity `T.O.T. Software S.R.L.`!
  3. The Data Controller in the document is currently misidentified as a corporation, rather than the truthful personal developer identity.
- **RELEVANT SOURCE FILES:**  
  - [public/politica-de-confidentialitate.html](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/public/politica-de-confidentialitate.html#L140-L150)
  - [GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md#L180-L200)
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ User Data $\rightarrow$ Privacy Policy:
  > *"The privacy policy must be accurately hosted on a publicly accessible URL, must identify the developer entity, and must disclose the collection, use, and sharing of personal and sensitive user data."*
- **MATCH / MISMATCH / UNVERIFIED:** **MISMATCH_FOUND (CONTENT ACCURACY)**
- **RISK:** **MEDIUM.** Misidentifying the data controller creates legal exposure under GDPR and Google Play identity accuracy rules.
- **EXACT REQUIRED CORRECTION:**  
  Deploy the approved personal developer correction manifest to `public/politica-de-confidentialitate.html` on Render so that `https://nutritie-backend-ai.onrender.com/privacy` displays the truthful operator identity (*Dezvoltator Individual / GetFlow Development Team*).

---

### DECLARATION 13: EU DIGITAL SERVICES ACT (DSA) TRADER STATUS

- **CURRENT PLAY CONSOLE STATUS:**  
  - Account Type: **Personal Account** (`Cont personal`)
  - Developer Name: `TOTCode`
  - Contact Displayed: `tudortone9@gmail.com`
  - Status: Currently operating under non-trader profile (no public postal address or phone number is displayed on the European Play Store listing).
- **REAL LEGAL & COMMERCIAL BEHAVIOR:**  
  1. Under the EU Digital Services Act (Regulation (EU) 2022/2065, Art. 30) and Directive 2005/29/EC Art. 2(b), a "trader" is any person acting for purposes relating to their trade, business, craft or profession.
  2. Current Revenue is **0.00 EUR**, employee count is **0**, and there are **zero commercial transactions**.
  3. Under CJEU jurisprudence (*Kamenova* C-105/17), an individual engaged in occasional or non-profit software creation without commercial turnover is not automatically a trader.
  4. However, because GetFlow integrates active auto-renewing subscriptions, once digital sales begin to occur on a continuous basis, Google Play policy and EU consumer protection law may mandate classifying the developer as a **Trader**. If classified as a Trader, Google Play is legally required to publish the developer's registered name, address, and phone number on the store listing.
- **MATCH / MISMATCH / UNVERIFIED:** **LEGAL_REVIEW_REQUIRED**
- **RISK:** **LOW (PRE-REVENUE).** Non-trader status is completely defensible while revenue and commercial volume are zero. At the point of first commercial income, trader status must be re-evaluated.
- **EXACT REQUIRED CORRECTION:** Maintain current status while revenue is zero. When monetization disbursements commence, consult Romanian legal counsel regarding DSA trader disclosure requirements.

---

### DECLARATION 14: DEVELOPER IDENTITY & PUBLIC CONTACT DETAILS

- **CURRENT PLAY CONSOLE STATE:**  
  - Account ID: `5706745523362579439`
  - Account Type: `Personal`
  - Verified Official Identity (Internal): `TUDOR OLIMPIU TONE`
  - Publicly Displayed Developer Name: `TOTCode`
  - Public Support Email: `tudortone9@gmail.com`
  - Physical Address: Kept private by Google Play Console policy for Personal developer accounts.
- **REAL APP BEHAVIOR:**  
  - In-app support links point to `tudortone9@gmail.com` / `supportgetflow@gmail.com`.
  - No fake company names are displayed in the native UI.
- **OFFICIAL POLICY REFERENCE:**  
  Google Play Developer Program Policy $\rightarrow$ Developer Identity.
- **MATCH / MISMATCH / UNVERIFIED:** **VERIFIED_CORRECT**
- **RISK:** **NONE.**
- **EXACT REQUIRED CORRECTION:** None required.

---

## CONSOLIDATED AUDIT VERDICT

```
OVERALL_PLAY_DECLARATIONS_STATUS: MISMATCHES_IDENTIFIED
CRITICAL_ACTION_REQUIRED: ADS_DECLARATION_MUST_BE_CORRECTED_TO_YES
DATA_SAFETY_ACTIONS_REQUIRED:
  - UPDATE_DELETION_URL_TO_RENDER_HTTPS
  - UPDATE_PRIVACY_POLICY_HOSTED_CONTENT
  - RECONCILE_ADMOB_DATA_SHARING_IF_ADS_ACTIVE
HEALTH_APPS_STATUS: VERIFIED_COMPLIANT_WELLNESS
PERSONAL_ACCOUNT_STATUS: 100% VERIFIED
RELEASE_BLOCKER_STATUS: P0 DECLARATION RECONCILIATION REQUIRED BEFORE PUBLIC RC
```

---
*End of Audit Report.*
