# GETFLOW — LEGAL, COMPLIANCE & GOOGLE PLAY FINAL RELEASE GATE
## DEVELOPER IDENTITY • PRIVACY POLICY • GDPR • DATA SAFETY • PLAY CONSOLE

**App Name:** GetFlow — Smart Nutrition & Fitness  
**Package:** `com.totsrl.getflo`  
**Operating Entity:** Individual Developer (GetFlow) — *Not an SRL*  
**Date:** 18 October 2026  
**Auditor:** Principal Android Release Engineer & Compliance Lead  

---

## 1. DEVELOPER IDENTITY & DATA CONTROLLER NOTICE

- **Official Operating Identity:** GetFlow is owned and operated by an **individual independent developer**.
- **Prohibition on Fictional Corporate Entities:** No corporate form (such as a fictional SRL) or fabricated company registration number is represented in public store listings or legal terms.
- **Data Controller Identity & Support Contact:** Configured as `Individual Developer (GetFlow)` with support contact `supportgetflow@gmail.com`. (Note: The owner's personal name appeared in some historical reports; any public disclosure of personal real names in live legal pages must be confirmed by the owner before modification).

---

## 2. LEGAL DOCUMENTS & PUBLIC WEB RESOURCES

All legal documents are published in `backend-nutritie-ai/public` and served statically via Express:

1. **Privacy Policy (Politica de Confidențialitate):**
   - Served routes: `/politica-de-confidentialitate`, `/privacy`, `/politica-de-confidentialitate.html`
   - Compliant with GDPR (EU 2016/679), UK GDPR, and US State Health Privacy Laws (WA My Health My Data Act, NV SB 370).
   - Covers: Supabase Auth credentials, physical metrics, meal logs, uploaded meal photographs, AdMob consent, Google Play Billing, Sentry error telemetry.
   - AI Image Processing Disclosure: Meal photos sent to Gemini are processed ephemerally solely for food recognition and nutrition estimation under commercial API terms, never sold or shared with data brokers.

2. **Terms of Service (Termeni și Condiții):**
   - Served routes: `/termeni-si-conditii`, `/terms`, `/termeni-si-conditii.html`
   - Explicit Medical & AI Disclaimer:
     > *"GetFlow este un instrument orientativ de wellness și fitness, NU un dispozitiv medical. Sugestiile nutriționale nu constituie diagnostic sau tratament clinic și nu înlocuiesc consultația unui medic sau dietetician autorizat."*
   - Redesigned Photo AI 2.0 views clearly display "AI Estimate" label and never promise clinical precision.
   - Statutory Consumer Disclaimers: Explicitly disclaims limitation of mandatory consumer rights across 32 launch markets (EU Directive 2011/83/EU, UK Consumer Rights Act 2015).

3. **Account Deletion & Data Subject Rights (GDPR Art. 17 & 20):**
   - Served routes: `/stergere-cont`, `/delete-account`, `/stergere-cont.html`
   - In-App Deletion: Accessible directly in `profil.tsx` via `DeleteAccountModal`.
   - Web Deletion Request Link: Provides explicit guidance for email-based requests (`supportgetflow@gmail.com`) for users who have uninstalled the app.
   - Subscription Disclaimer: Clearly notifies users that account deletion does not automatically cancel Google Play subscriptions; provides direct link to `https://play.google.com/store/account/subscriptions`.
   - Automated GDPR Deletion Worker (`backend-nutritie-ai/utils/gdprWorker.js`) with atomic CAS claim prevents concurrent worker race conditions.

4. **Accessibility Statement (Declarație de Accesibilitate):**
   - Served route: `/declaratie-accesibilitate.html`
   - European Accessibility Act (EAA Directive 2019/882 Art. 4(5) / Legea 232/2022 Art. 4(6)): Microenterprise exemption accurately cited for services.
   - Voluntary Standards: App voluntarily adopts EN 301 549 and WCAG 2.1 AA recommendations (TalkBack/VoiceOver labels, touch targets $\ge 48\times 48$ dp, Reduced Motion detection, contrast $\ge 4.5:1$).

---

## 3. GOOGLE PLAY CONSOLE DECLARATIONS

| Declaration Section | Declared Value in Play Console | Verification Notes | Status |
|---|---|---|---|
| **Contains Ads** | **YES** | Google Mobile Ads (AdMob) SDK integrated for rewarded ads (Flow Credits). | **VERIFIED** |
| **In-App Purchases** | **YES** | Google Play Billing Library integrated for GetFlow Premium monthly/annual subscriptions. | **VERIFIED** |
| **App Access** | **All functionality available without special credentials** | Reviewer demo account provided with pre-seeded Flow Credits. | **VERIFIED** |
| **Financial Features** | **None** | App does not provide banking, loans, or cryptocurrency trading. | **VERIFIED** |
| **Health Apps Declaration** | **Health & Fitness / Nutrition Management** | Declared as general fitness & wellness tool, not medical device. | **VERIFIED** |
| **Target Audience** | **18+ years (Adults)** | Not directed to children; COPPA/family policy exemptions not required. | **VERIFIED** |
| **Data Safety: Photos & Videos** | **Collected for App Functionality (Optional)** | User-uploaded meal photos for food analysis; not shared with brokers; encrypted in transit. | **VERIFIED** |
| **Data Safety: Financial Info** | **Processed by Google Play Billing** | App developer does not receive or store raw card numbers. | **VERIFIED** |
| **Data Safety: Personal Info** | **Email address, nickname** | Used for account creation, authentication, and communication. | **VERIFIED** |
| **Live Play Console Dashboard** | **Direct Console Inspection** | Console access requires owner Google credentials. | **OWNER_VERIFICATION_REQUIRED** |
| **End-to-End Subscription Expiry** | **Google Play License Tester Track** | In-app subscription cancellation navigation verified; lifecycle entitlement verification requires closed testing track. | **OWNER_VERIFICATION_REQUIRED** |

---

## 4. ADMOB CONSENT & EU USER CONSENT POLICY (EEA / UK)

- Google User Messaging Platform (UMP) SDK initialized on app startup (`MobileAds.initialize()`).
- In EEA and UK jurisdictions, UMP presents the standard Google-certified CMP consent dialog before requesting ads.
- Flow Credits reward callback (`onUserEarnedReward`) strictly validates server-side reward signals before granting +3 Flow Credits to prevent client-side manipulation.

---

## 5. GATE CONCLUSION

**GATE A (Google Play Internal Testing):** **CLEARED (PASS)**  
No blocking legal liabilities, false corporate identities, or code policy violations exist. Ready for submission to Google Play Internal Testing.

**GATE B (Production Staged Rollout):** **HOLD PENDING OWNER & CLOSED TRACK CHECKS**  
Requires Play-distributed license tester verification of subscription lifecycle, deployed backend/Trigger services, and explicit owner sign-off.
