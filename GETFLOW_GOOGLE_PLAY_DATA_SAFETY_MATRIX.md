# GETFLOW — GOOGLE PLAY DATA SAFETY COMPLIANCE MATRIX
## Comprehensive Mapping of Code Architecture, Data Flows & Play Console Disclosures

**Date:** October 17, 2026  
**Package:** `com.totsrl.getflo` (Android)  
**Status:** EVIDENCE-RECONCILED AUDIT MATRIX  

---

## 1. DATA SAFETY DECLARATION RECONCILIATION SUMMARY

| Google Play Data Category | Play Console Declared State | Actual Code Reality | Processor / Destination | Discrepancy / Action |
|---|---|---|---|---|
| **Name** (*Informații personale*) | **COLLECTED** (App functionality, Account management) | `profiles.full_name`, `profiles.display_name` | Supabase (PostgreSQL) | **MATCH (ACCURATE)** |
| **Email Address** (*Informații personale*) | **COLLECTED** (App functionality, Account management) | `auth.users.email`, Supabase Auth | Supabase (PostgreSQL) | **MATCH (ACCURATE)** |
| **User Identifiers** (*Informații personale*) | **COLLECTED** (App functionality, Account management) | Supabase UUID, Google SSO subject ID | Supabase (PostgreSQL) | **MATCH (ACCURATE)** |
| **Purchase History** (*Informații financiare*) | **COLLECTED** (App functionality, Fraud prevention) | Token hashes, SKU, order verification | Google Play Billing, Supabase | **MATCH (ACCURATE)** |
| **Photos** (*Fotografii și videoclipuri*) | **COLLECTED** (App functionality) | Meal food pictures for AI nutrition analysis | ImageKit CDN, Google Gemini API | **MATCH (ACCURATE)** |
| **Fitness Info** (*Sănătate și fitness*) | **COLLECTED** (App functionality, Personalization) | Step counts, workout sets, reps, weight logs | Health Connect (Local), Supabase | **MATCH (ACCURATE)** |
| **Crash Logs** (*Informații despre aplicație*) | **COLLECTED** (Analytics, Diagnostics) | Sentry error reports with PII sanitization | Sentry (Functional Software Inc.) | **MATCH (ACCURATE)** |
| **Advertising ID** (*Dispozitiv sau alte ID-uri*) | **NOT DECLARED IN DATA SAFETY** (Only in AD_ID section) | `AD_ID` accessed by Google Mobile Ads SDK | Google AdMob (Google LLC) | **MISMATCH (MUST DISCLOSE IF ADS ACTIVE)** |
| **Chat / Messages** (*Mesaje*) | **NOT DECLARED** | AI nutritional chat queries | Render, Google Gemini API | **REVIEW: EPHEMERAL PROCESSING EXEMPTION** |

---

## 2. DETAILED DATA CATEGORY FLOW MATRIX

### A. Personal Information (`Informații personale`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Name** | Optional (User provided) | App Functionality, User Profile | YES (HTTPS / TLS 1.3) | Cascaded via in-app account delete / RLS | Supabase (EU Central) | `frontend-nutritie/app/onboarding/profile-setup.tsx` |
| **Email Address** | Mandatory for registration | Account management, Authentication, Security | YES (HTTPS / TLS 1.3) | Deleted upon account deletion request | Supabase Auth | `frontend-nutritie/context/AuthContext.tsx` |
| **User Identifiers** | Mandatory (Generated) | Session mapping, Data isolation, RLS enforcement | YES (HTTPS / TLS 1.3) | Deleted on account deletion | Supabase PostgreSQL | `backend-nutritie-ai/utils/identitate.js` |

---

### B. Health and Fitness (`Sănătate și fitness`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Calorie & Macro Targets** | Mandatory for personalized plan | Nutritional planning, Macro calculation | YES (HTTPS / TLS 1.3) | Deleted with account / editable in profile | Supabase | `frontend-nutritie/context/NutritionContext.tsx` |
| **Meal Logs & Ingredients** | Optional (User logged) | Food journaling, Daily calorie aggregation | YES (HTTPS / TLS 1.3) | Granular deletion per meal or account delete | Supabase (`mese`, `alimente`) | `frontend-nutritie/app/(tabs)/jurnal.tsx` |
| **Body Weight History** | Optional (User logged) | Weight progress tracking | YES (HTTPS / TLS 1.3) | Editable per log / deleted with account | Supabase (`istoric_greutate`) | `frontend-nutritie/app/(tabs)/progres.tsx` |
| **Workout Logs & Volume** | Optional (User logged) | Workout journaling, Muscle heatmap scoring | YES (HTTPS / TLS 1.3) | Editable per session / deleted with account | Supabase (`workouts_v2`) | `frontend-nutritie/components/workout-v2/` |
| **Daily Step Counts** | Optional (Health Connect permission) | Movement quest tracking | Read-only local OS query; synced | Local OS / Supabase daily sync | Google Health Connect | `frontend-nutritie/lib/healthConnect.ts` |

---

### C. Photos and Videos (`Fotografii și videoclipuri`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Meal Plate Photos** | Optional (User captures camera/gallery) | AI computer vision food recognition | YES (HTTPS / TLS 1.3) | Auto-deleted from ImageKit when meal is deleted; erased on account deletion | ImageKit CDN, Google Gemini Vision API | `frontend-nutritie/components/photo-ai/FoodCameraModal.tsx` |

**Data Handling Safeguards:**
- Images are uploaded to ImageKit with private account-scoped paths.
- Google Gemini processes images ephemerally in memory to extract ingredients and grams.
- Images are **NEVER used to train public AI foundation models**.
- Users can delete any meal photo immediately from their journal, triggering an asynchronous cleanup worker in `backend-nutritie-ai/services/gdprServices.js`.

---

### D. Financial Information (`Informații financiare`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Purchase History** | Optional (Premium purchasers) | Purchase verification, Entitlement gating, Fraud prevention | YES (HTTPS / TLS 1.3) | User linkage unlinked upon account deletion | Google Play Billing, Supabase | `backend-nutritie-ai/routes/billing.js` |
| **Flow Credit Ledger** | Mandatory for Photo AI | Balance durability, Consumption audit | YES (HTTPS / TLS 1.3) | Deleted on account deletion | Supabase (`credite_ai`) | `backend-nutritie-ai/services/flowCreditService.js` |

**Security Note:** GetFlow **NEVER receives or stores credit card numbers, CVVs, or bank accounts**. All monetary transactions are processed exclusively by Google Play Billing.

---

### E. App Information and Performance (`Informații despre aplicație și performanță`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Crash Logs & Stack Traces** | Automatic (Operational) | App stability, Bug diagnostics, Error monitoring | YES (HTTPS / TLS 1.3) | Retained according to Sentry 90-day rolling policy | Sentry (Functional Software Inc.) | `frontend-nutritie/lib/telemetryPrivacy.ts` |

**PII Sanitization Guarantee:**
- Sentry telemetry is scrubbed by `sentrySanitize.js` and `telemetryPrivacy.ts`.
- IP addresses, email addresses, meal photos, and auth tokens are stripped before leaving the device.

---

### F. Device Identifiers & Advertising (`Dispozitiv sau alte identificatoare`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **Advertising ID (GAID / AD_ID)** | Optional (Free users after UMP consent) | Ad serving, Frequency capping, Fraud prevention | YES (TLS) | Managed via Google Account privacy settings | Google AdMob | `frontend-nutritie/lib/ads/` |

**Reconciliation Note:**
- Currently, Data Safety states *"Nu sunt trimise date terțelor părți"* because AdMob serving is limited.
- Once AdMob is linked and public ads serve, Google Play policy requires declaring the **Advertising ID as Shared** with third-party advertising partners for free users.

---

### G. In-App Communications & AI Prompts (`Mesaje`)

| Data Field | Collection Type | Purpose | Encrypted | Deletion Path | Processor | Source Location in Code |
|---|---|---|---|---|---|---|
| **AI Nutrition Chat Messages** | Optional (User chat queries) | Real-time nutritional advice and recipe generation | YES (HTTPS / TLS 1.3) | Stored locally / ephemeral API inference | Render, Google Gemini API | `frontend-nutritie/app/(tabs)/coach.tsx` |

**Ephemeral Processing Exemption:**
- Google Play Data Safety defines *Ephemeral Processing* as data accessed and processed strictly in memory to fulfill a real-time request and not retained on disk.
- If chat messages are stored persistently in Supabase, they must be declared under `Mesaje în aplicație` (*In-app messages*).
- In GetFlow, chat sessions operate on a rolling daily memory and are deleted with the user account.

---

## 3. THIRD-PARTY DATA PROCESSORS INVENTORY

| Processor Name | Entity & Jurisdiction | Role | DPA / Contract In Place | Data Categories Processed |
|---|---|---|---|---|
| **Supabase Inc.** | Supabase Inc. (USA / AWS EU-Central Frankfurt) | Primary Database & Auth | Standard Contractual Clauses (SCC) | Personal info, Health logs, Workout history |
| **Render Services Inc.** | Render Services Inc. (USA / AWS Frankfurt) | Backend API Compute | Data Processing Addendum (DPA) | API requests, Webhooks, Image upload proxy |
| **Google Cloud (Gemini)** | Google LLC (USA / EU endpoints) | AI Computer Vision & Chat | Google Cloud Data Processing Terms | Meal photos (ephemeral), Nutrition queries |
| **ImageKit Inc.** | ImageKit Inc. (USA / AWS CDN) | Media Storage & Optimization | Data Processing Agreement | User meal photos (access-controlled) |
| **Google Mobile Ads (AdMob)** | Google LLC (USA / Ireland) | Ad Monetization & Mediation | Google Controller-to-Controller Terms | Advertising ID, Device telemetry |
| **Functional Software (Sentry)** | Functional Software Inc. (USA) | Error Diagnostics & Monitoring | Data Processing Addendum | Scrubbed stack traces, Device OS version |
| **Trigger.dev** | TriggerDotDev Inc. (USA / Cloud) | Background Task Orchestration | Cloud Terms & DPA | Job metadata, User UUID (ephemeral) |

---

## 4. DATA ENCRYPTION & SECURITY PRACTICES

1. **Encryption in Transit:**
   - Enforced across 100% of network traffic using **HTTPS with TLS 1.2 and TLS 1.3**.
   - Cleartext HTTP traffic is blocked via Android Network Security Configuration (`android:usesCleartextTraffic="false"`).
2. **Encryption at Rest:**
   - Supabase databases are encrypted at rest using AES-256.
   - ImageKit media storage volumes are encrypted at rest.
3. **Data Isolation:**
   - PostgreSQL Row Level Security (RLS) policies enforce strict user-level data segregation.
   - Users cannot read or modify another user's nutritional records.

---

## 5. SUMMARY OF REQUIRED DATA SAFETY CONSOLE UPDATES

1. **Update Account Deletion URL:**  
   Replace `https://telegra.ph/Stergerea-Contului-si-a-Datelor--GetFlow-08-27` with:  
   **`https://nutritie-backend-ai.onrender.com/stergere-cont.html`**
2. **Update Ads Data Sharing (When AdMob Launches):**  
   Declare **Advertising ID** as *Shared* with third parties for *Advertising or marketing*.
3. **Confirm Data Deletion Option:**  
   Confirm that users can delete their entire account and all associated data directly from within the app and via the external web form.

---
*End of Data Safety Matrix.*
