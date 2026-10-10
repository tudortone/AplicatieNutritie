# GetFlow — Google Play Store Rebranding & Asset Package

## Executive Summary

- **App Name:** Updated to **`GetFlow`** in Google Play Console (removed `- Nutriție & Fitness` suffix).
- **Package Identifier:** `com.totsrl.getflo` (strictly preserved).
- **Review Status:** **Modificări care se examinează** (Changes under review in Google Play Console).
- **Production Screenshots:** 8 authentic high-resolution screenshots (1080 × 1920 px, 9:16 portrait) based exclusively on live application UI captures. Zero synthetic or AI-fabricated interfaces.
- **Feature Graphic:** 1024 × 500 px high-resolution branded product graphic meeting all Play Console requirements.
- **AAB Rebuild Status:** Not required. Android application code already defines `@string/app_name` = `GetFlow`. Title and screenshot updates were executed entirely through Google Play Console Store Listing workflow.

---

## Production Asset Inventory

| # | Asset File | Screen Type | Headline (RO) | Underlying Real App Feature |
|---|---|---|---|---|
| 01 | `01-home-dashboard.png` | Home Dashboard | Ziua ta, pe scurt | Calorie ring (520 kcal rămase, 74%), bare macronutrienți, buton scanare AI, apă (1850 ml), pași (6.420), preview hartă musculară. |
| 02 | `02-photo-ai.png` | AI Food Scan | Analiză foto cu AI | Scanare reală farfurie mâncare (Bol cu pui și legume), estimare automată 540 kcal, 42g proteine, 56g carbohidrați, 18g grăsimi. |
| 03 | `03-meal-journal.png` | Meal Diary | Jurnal complet de mese | Selector calendar (SÂM, 10 OCT), inel caloric 1480 / 2000 kcal, 102g proteine, detaliu mese Mic Dejun, Prânz, Cină. |
| 04 | `04-workouts-anatomy.png` | Muscle Anatomy | Hartă musculară & sport | Hartă anatomică interactivă Neon Lime (față & spate), grupe musculare vizate (Piept, Spate, Cvadriceps, Umeri), catalog exerciții. |
| 05 | `05-progress-stats.png` | Analytics | Evoluție și consistență | Grafic săptămânal aport caloric (Vin 1550 kcal, Sâm 1480 kcal), medie zilnică, consecvență nutrițională. |
| 06 | `06-daily-habits.png` | Habits & Themes | Obiceiuri & Sincronizare | Switcher temă Midnight Neon, orar memento-uri mese, sincronizare ceas / wearable, insigne de consecvență. |
| 07 | `07-flow-credits.png` | Flow Credits | Credite Flow & Recompense | Modal oficial Credite Flow: 3 analize foto zilnice gratuite, buton opțional recompensă reclamă (+1 credit), fără promisiuni false. |
| 08 | `08-personalized-targets.png` | Targets Calculator | Calcul nutrițional personalizat | Formular profil biologic (sex, vârstă, înălțime, greutate), obiectiv fitness (slăbire, menținere, masă musculară), calcul AI. |

### Feature Graphic
- **Dimensions:** 1024 × 500 px
- **File:** `assets/feature-graphic-1024x500.png`
- **Branding:** GetFlow typography, Midnight Neon palette, vibrant fresh nutritional composition, clear mobile UI focus.

### Contact Sheets
- Romanian: `assets/contact-sheet-RO-PRODUCTION.png`
- English: `assets/contact-sheet-EN-PRODUCTION.png`

---

## AdMob & app-ads.txt Audit Status

1. **AdMob App Association:** Complete (`com.totsrl.getflo` linked to Play Store listing).
2. **Ad Units:** Configured & preserved (Rewarded `/3566028223`, Interstitial `/1542500110`, App ID `ca-app-pub-5202280855139508~6141533757`).
3. **Rewarded SSV:** Verified and active on Render backend (`https://nutritie-backend-ai.onrender.com/api/admob/rewarded-ssv`).
4. **app-ads.txt Status:**
   - **Render backend:** `https://nutritie-backend-ai.onrender.com/app-ads.txt` returns HTTP 200 with valid record `google.com, pub-5202280855139508, DIRECT, f08c47fec0942fa0`.
   - **Store Listing Developer Website:** Currently configured as `https://telegra.ph/Politica-de-Confidentialitate--GetFlow-08-27`. AdMob crawls `https://telegra.ph/app-ads.txt` and fails (Telegraph cannot serve static txt files).
   - **Branded Domain (`getflow.app`):** Currently returns a Squarespace parking page with `<meta name="robots" content="noindex">`.
   - **Diagnosis:** `BLOCKED / INVALID` in AdMob crawler until either:
     a) `getflow.app` DNS / hosting is pointed to the backend/static host serving `app-ads.txt`, or
     b) The Play Console Developer Website is updated to `https://nutritie-backend-ai.onrender.com`.
