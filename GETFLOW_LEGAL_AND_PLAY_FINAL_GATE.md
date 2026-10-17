# GETFLOW — LEGAL, COMPLIANCE & GOOGLE PLAY FINAL RELEASE GATE
## DEVELOPER IDENTITY • PRIVACY POLICY • GDPR • DATA SAFETY • PLAY CONSOLE

**App Name:** GetFlow — Smart Nutrition & Fitness  
**Package:** `com.totsrl.getflo`  
**Operating Entity:** Individual Developer (Tudor Tone) — *Not an SRL*  
**Date:** 18 October 2026  
**Auditor:** Mobile Legal & Google Play Compliance Auditor  

---

## 1. DEVELOPER IDENTITY CORRECTION (CRITICAL NOTICE)

- **Official Operating Identity:** GetFlow is owned and operated by an **individual independent developer** (Tudor Tone).
- **Prohibition on Fictional Corporate Entities:** Previous historical references in code artifacts to corporate forms (e.g. "TOT SRL") have been audited and corrected. No fictional legal entities, fake company registration numbers, or unauthorized company names are published in public store listings or legal terms.
- **Support & Legal Contact:** Contact email configured in store listing details is the verified developer address (`tone.tudor@gmail.com`).

---

## 2. LEGAL DOCUMENTS & PUBLIC URL ACCESSIBILITY

All legal documents have been published and verified accessible:

1. **Privacy Policy (Politica de Confidențialitate):**
   - Public URL: `https://getflow.ro/politica-de-confidentialitate`
   - Compliant with GDPR (EU 2016/679) and Romanian Law no. 190/2018.
   - Covers: Account data, nutrition logs, uploaded meal photographs, AdMob consent, Google Play Billing, analytics.
   - Contains explicit disclosure that meal photos are analyzed via AI processors (Groq / Gemini) solely for food recognition and nutrition estimation, and never sold to third-party data brokers.

2. **Terms and Conditions (Termeni și Condiții):**
   - Public URL: `https://getflow.ro/termeni-si-conditii`
   - Explicit Medical Disclaimer:
     > *"GetFlow oferă estimări nutriționale orientative și suport pentru stil de viață sănătos. Aplicația NU oferă diagnostic medical, tratament nutrițional clinic și nu înlocuiește consultația unui medic specialist sau a unui dietetician autorizat."*
   - Redesigned Photo AI 2.0 views clearly display "AI Estimate" label and never promise medical accuracy or fabricated percentages.

3. **Account Deletion & Data Subject Rights (GDPR Art. 17 & 20):**
   - In-App Deletion: Accessible directly in `profil.tsx` via `DeleteAccountModal`.
   - Web Deletion Request Link: `https://getflow.ro/stergere-cont`
   - Automated GDPR Deletion Worker (`gdpr_worker.js`) deletes:
     - User auth profile in Supabase Auth;
     - All user nutrition logs in `mese`;
     - All custom foods in `alimente_personalizate`;
     - Cached images in ImageKit;
     - Flow Credits transactions;
     - Sentry identifier scrubbed.
   - Verified via automated test suite `tests/gdpr_worker.test.js` (PASS).

---

## 3. GOOGLE PLAY CONSOLE DECLARATIONS

| Declaration Section | Declared Value in Play Console | Verification Notes |
|---|---|---|
| **Contains Ads** | **YES** | Google Mobile Ads (AdMob) SDK integrated for rewarded ads (Flow Credits). |
| **In-App Purchases** | **YES** | Google Play Billing Library integrated for GetFlow Premium monthly/annual subscriptions. |
| **App Access** | **All functionality available without special credentials** | Reviewer demo account provided with pre-seeded Flow Credits. |
| **Financial Features** | **None** | App does not provide banking, loans, or cryptocurrency trading. |
| **Health Apps Declaration** | **Health & Fitness / Nutrition Management** | Declared as general fitness & wellness tool, not medical device. |
| **Target Audience** | **18+ years (Adults)** | Not directed to children; COPA/family policy exemptions not required. |
| **Data Safety: Photos & Videos** | **Collected for App Functionality (Optional)** | User-uploaded meal photos for food analysis; not shared with brokers; encrypted in transit. |
| **Data Safety: Financial Info** | **Processed by Google Play Billing** | App developer does not store raw credit cards. |
| **Data Safety: Personal Info** | **Name, Email address** | Used for account creation, authentication, and communication. |

---

## 4. ADMOB CONSENT & EU USER CONSENT POLICY (EEA / UK)

- Google User Messaging Platform (UMP) SDK initialized on app startup (`MobileAds.initialize()`).
- In EEA and UK jurisdictions, UMP presents the standard Google-certified CMP consent dialog before requesting ads.
- Flow Credits reward callback (`onUserEarnedReward`) strictly validates server-side reward signals before granting +3 Flow Credits to prevent client-side manipulation.

---

## 5. GATE CONCLUSION

**LEGAL & PLAY COMPLIANCE GATE:** **CLEARED (PASS)**  
No blocking legal liabilities, false corporate identities, or Google Play policy violations exist. Ready for submission to Google Play Internal Testing.
