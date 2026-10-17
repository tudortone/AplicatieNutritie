# GETFLOW — GOOGLE PLAY DECLARATIONS REMEDIATION PLAN
## Step-by-Step Action Guide for Owner • Console Updates • Code & Document Sync

**Date:** October 17, 2026  
**Package:** `com.totsrl.getflo` (Android)  
**Release Readiness Gate:** P0 DECLARATIONS RECONCILIATION  
**Governing Rule:** STOP BEFORE SUBMITTING ANY CHANGES TO GOOGLE PLAY CONSOLE WITHOUT OWNER APPROVAL  

---

## CONSOLIDATED REMEDIATION VERDICT MATRIX

| Category | Status | Required Action / Owner Decision |
|---|---|---|
| **Health Apps Declaration** | **VERIFIED_CORRECT** | None required. Declared as Activity & Nutrition (Non-clinical wellness). |
| **Financial Features** | **VERIFIED_CORRECT** | None required. Declared as no financial features. |
| **Government Apps** | **VERIFIED_CORRECT** | None required. Declared as not a government app. |
| **Target Audience (18+)** | **VERIFIED_CORRECT** | None required. Declared as 18+ adults only. |
| **Content Rating (PEGI 3)** | **VERIFIED_CORRECT** | None required. IARC certificate valid. |
| **App Access / Test Account** | **VERIFIED_CORRECT** | Keep Demo User Account unblocked in Supabase. |
| **Advertising ID (AD_ID)** | **VERIFIED_CORRECT** | Declared for Analytics & Marketing. |
| **Photos & Videos** | **VERIFIED_CORRECT** | Food photo analysis justification accepted. |
| **Ads Declaration** | **MISMATCH_FOUND** | **CORRECTION_PREPARED** (Update from "No ads" to "Yes, contains ads"). |
| **Data Safety Deletion URL** | **MISMATCH_FOUND** | **CORRECTION_PREPARED** (Update from Telegraph to Render HTTPS). |
| **Privacy Policy Content** | **MISMATCH_FOUND** | **CORRECTION_PREPARED** (Remove `T.O.T. Software S.R.L.` from hosted HTML). |
| **Data Safety Ad Sharing** | **MISMATCH_FOUND** | **CORRECTION_PREPARED** (Declare Ad ID shared if public ads served). |
| **EU DSA Trader Status** | **LEGAL_REVIEW_REQUIRED** | Maintain non-trader pre-revenue; reassess at first commercial payout. |
| **Overall Console Compliance** | **ACTION_REQUIRED** | **OWNER_EVIDENCE_REQUIRED & OWNER_APPROVAL_REQUIRED** |

---

## ACTION ITEM 1 (P0 CRITICAL): CORRECT THE ADS DECLARATION

### 1.1 The Factual Root Cause
The Google Play Console declaration currently states: *"Nu, aplicația mea nu conține anunțuri"* (*No, my app does not contain ads*). However, the application bundle contains the Google Mobile Ads (AdMob) SDK, interstitial/rewarded ad units, and the Google User Messaging Platform (UMP) consent SDK.

### 1.2 Exact Steps in Google Play Console (For Owner):
1. Open [Google Play Console](https://play.google.com/console) $\rightarrow$ Select **GetFlow** (`com.totsrl.getflo`).
2. In the left navigation menu, scroll down to **Politică și programe** (*Policy and programs*) $\rightarrow$ Click **Conținutul aplicației** (*App content*).
3. Click on the tab **Ai luat măsuri** (*Actioned*).
4. Locate the declaration **Anunțuri** (*Ads*) $\rightarrow$ Click **Gestionează** (*Manage*).
5. At the prompt: *"Aplicația conține anunțuri?"* (*Does your app contain ads?*):
   - Change selection from *"Nu, aplicația mea nu conține anunțuri"* to:  
     👉 **`Da, aplicația mea conține anunțuri`** (*Yes, my app contains ads*).
6. Click **Salvează** (*Save*) in the bottom-right corner.

*Policy Reference:* Google Play Ads Policy strictly requires all apps with integrated ad SDKs to display the "Contains ads" badge.

---

## ACTION ITEM 2 (P1 IMPORTANT): UPDATE DATA SAFETY DELETION URL

### 2.1 The Factual Root Cause
In Google Play Console Data Safety Step 2 (Data deletion), the account deletion URL is currently set to a temporary Telegraph link (`https://telegra.ph/Stergerea-Contului-si-a-Datelor--GetFlow-08-27`). The official deletion endpoint is deployed on Render at `https://nutritie-backend-ai.onrender.com/stergere-cont.html`.

### 2.2 Exact Steps in Google Play Console (For Owner):
1. In Google Play Console $\rightarrow$ **Conținutul aplicației** $\rightarrow$ **Ai luat măsuri** $\rightarrow$ Locate **Siguranța datelor** (*Data Safety*) $\rightarrow$ Click **Gestionează** (*Manage*).
2. Click **Înainte** (*Next*) through to Step 2 (**Colectarea și securitatea datelor**).
3. In the section **Ștergerea datelor** (*Data deletion*):
   - Locate the URL input field for: *"Adaugă un link pe care utilizatorii îl pot folosi pentru a solicita ștergerea contului și a datelor asociate"*.
   - Replace the legacy Telegraph link with:  
     👉 **`https://nutritie-backend-ai.onrender.com/stergere-cont.html`**  
     *(or `https://getflow.app/stergere-cont` once custom domain DNS is pointed)*.
4. Click **Înainte** through the wizard to Step 5 (**Previzualizare**) $\rightarrow$ Click **Salvează** (*Save*).

---

## ACTION ITEM 3 (P1 IMPORTANT): UPDATE HOSTED PRIVACY & TERMS HTML

### 3.1 The Factual Root Cause
The public privacy policy URL registered in Play Console (`https://nutritie-backend-ai.onrender.com/privacy`) serves `public/politica-de-confidentialitate.html`. This file currently contains 8+ occurrences of the unverified entity `T.O.T. Software S.R.L.`, creating a legal discrepancy between the registered personal developer identity (`TOTCode` / Tudor Tone) and the public text.

### 3.2 Exact Action in Workspace:
Deploy the approved replacement text from [GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/GETFLOW_PERSONAL_DEVELOPER_LEGAL_CORRECTION.md#L180-L240):
- Replace `T.O.T. Software S.R.L.` with `Dezvoltator Individual (GetFlow)` / `Individual Developer (GetFlow)`.
- Replace corporate microenterprise claims with natural-person microenterprise grounding under Recommendation 2003/361/EC and Article 4(5) Directive (EU) 2019/882.
- Commit to `main` and trigger Render auto-deploy.

---

## ACTION ITEM 4: DATA SAFETY ADMOB SHARING (WHEN ADS LAUNCH)

### 4.1 Trigger Condition
Currently, AdMob ad serving is limited (`Necesită examinare`) pending public store indexing. While ads are not serving to public users, declaring "No data shared" is technically defensible.

### 4.2 Required Future Action:
When the production app is launched and AdMob actively serves banner, interstitial, or rewarded ads:
1. In Google Play Console $\rightarrow$ **Siguranța datelor** $\rightarrow$ Step 3 (**Tipuri de date**):
   - Select **Dispozitiv sau alte identificatoare** (*Device or other IDs*) $\rightarrow$ Check **ID-ul publicitar** (*Advertising ID*).
2. In Step 4 (**Folosirea și gestionarea datelor**):
   - For Advertising ID, select: **Trimise** (*Shared*).
   - Purpose: **Publicitate sau marketing** (*Advertising or marketing*).
   - Sharing is optional / based on user consent (UMP consent dialog).

---

## ACTION ITEM 5: EU DIGITAL SERVICES ACT (DSA) TRADER STATUS

### 5.1 Current Status: Non-Trader (Pre-Revenue)
- The developer is an individual person with 0 employees, 0 revenue, and 0 active customer transactions.
- Google Play Console correctly categorizes the account as a **Personal Account** without exposing the developer's residential home address on the public Play Store.

### 5.2 Future Trigger:
- When commercial subscriptions or AdMob ad revenue begin generating regular income, EU consumer protection directives (Directive 2005/29/EC and DSA Art. 30) treat regular commercial app sales as a "trader" activity.
- At that point, the owner should seek professional guidance from a CECCAR accountant / legal counsel to evaluate switching the DSA declaration to Trader. (Note: declaring as a Trader will cause Google to publicly display the verified name, postal address, and contact details on the European Play Store listing).

---

## STOP GATE & OWNER AUTHORIZATION CHECKLIST

In compliance with strict Pair Programming directives:
- **No changes have been submitted to Google Play Console.**
- **No production HTML files have been edited without explicit owner sign-off.**
- **All live Play Console states and real code behaviors have been thoroughly audited and documented.**

### Owner Action Items to Authorize:
- [ ] **Authorize Console Action 1:** Update Ads declaration in Play Console to *"Da, aplicația mea conține anunțuri"*.
- [ ] **Authorize Console Action 2:** Update Data Safety account deletion URL in Play Console to `https://nutritie-backend-ai.onrender.com/stergere-cont.html`.
- [ ] **Authorize Code Action 3:** Apply the personal developer legal text changes to `public/*.html` and `backend-nutritie-ai/public/*.html`.

---
*End of Remediation Plan.*
