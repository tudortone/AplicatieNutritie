# GETFLOW — FLOW CREDITS, ADS & BILLING VERIFICATION REPORT

**Status:** VERIFIED & COMPLIANT  
**Target Environment:** Android / Google Play Billing / AdMob  
**Package:** `com.totsrl.getflo`  
**Monetization Engine:** Supabase PostgreSQL Atomic Ledger + AdMob SSV + RevenueCat / Play Billing  

---

## 1. Monetization Architecture Overview

GetFlow implements a multi-tier, sustainable monetization model designed to balance user delight, operational sustainability, and strict cost controls:
1. **Daily Free Allowance:** 3 Photo AI analyses per day for all active registered users.
2. **Rewarded Ad Engagement:** Users can earn up to 5 additional credits per day (+1 credit per verified video ad) via Google AdMob rewarded ads.
3. **Daily Maximum for Free Users:** 8 total AI analyses (3 base + 5 ad-supported).
4. **Premium Subscription:** Unlimited Photo AI analyses, elevated Groq coaching quota (150 msgs/day), and complete ad removal.
5. **Credit Conservation Guarantee:** Retrying a failed journal save, editing meal ingredients, or re-opening a completed result **never** consumes an additional credit.

---

## 2. Server-Side Atomic Credit Ledger

### 2.1 Database Operations & RPC
- Credit operations are executed server-side via Supabase PostgreSQL RPC:
  - `rezerva_credit(p_user_id)`: Atomically decrements active balance and issues a reservation lock token.
  - `confirma_credit(p_user_id, p_token)`: Finalizes the debit upon successful Trigger.dev inference and validated payload delivery.
  - `anuleaza_credit(p_user_id, p_token)`: Reverts the reservation immediately if the image contains no food, if the provider times out, or if the network disconnects.
- **Account Isolation:** Row-Level Security (RLS) ensures credit rows are strictly scoped to `auth.uid() = user_id`.

### 2.2 Balance Hierarchy
When debited, credits are consumed in strict priority order:
1. Expiring Daily Free Allowance (reset daily at 00:00 UTC).
2. Ad-Earned Credits (reset daily at 00:00 UTC).
3. Non-Expiring Purchased Credit Packages (if configured).

---

## 3. Google AdMob Rewarded Ads & SSV

### 3.1 Ad Unit Configuration
- **AdMob App ID:** Configured in `app.json` (`react-native-google-mobile-ads`).
- **Test Ad Units:** Verified using official Google test ad unit IDs for development and QA builds.
- **UMP (User Messaging Platform) Consent:** Fully integrated; displays GDPR/EEA consent modal before initializing mobile ad SDKs.

### 3.2 Server-Side Verification (SSV)
- Ad rewards are validated through cryptographic Server-Side Verification callbacks to prevent client-side spoofing.
- The backend verifies AdMob ECDSA signatures before granting the `+1` credit.
- Daily ad limit is enforced server-side: requests exceeding 5 rewarded ad grants in a 24-hour period return HTTP 429 (`LIMITA_RECLAME_ATINSA`).

---

## 4. Google Play Subscription Management

### 4.1 In-App "Gestionează abonamentul" Flow
- In `frontend-nutritie/components/profile/SubscriptionManagementModal.tsx` and `app/(tabs)/profile.tsx`:
  - Verified the presence of the dedicated "Gestionează abonamentul" action.
  - Direct deep link: `https://play.google.com/store/account/subscriptions?sku=getflow_premium_monthly&package=com.totsrl.getflo`
  - Fallback URL: `https://play.google.com/store/account/subscriptions`

### 4.2 Lifecycle State Transitions
- **Active Subscription:** `status = 'ACTIVE'`, entitlement valid.
- **Canceled Subscription (In Grace / Active Period):** If a user cancels in Google Play, the entitlement remains fully active until the pre-paid billing cycle concludes (`expires_at > NOW()`).
- **Expired / Revoked:** Entitlement safely reverts to Free tier, restoring the 3 free daily photo credit ceiling and 10 chat messages limit without data loss.

---

## 5. Verification Matrix

| Flow | Mechanism | Status |
| :--- | :--- | :--- |
| Daily 3 Credit Reset | PostgreSQL Scheduled Function / Cron | **VERIFIED** |
| AdMob Rewarded Ad Grant | SSV Callback + Atomic Credit RPC | **VERIFIED** |
| 5 Ad Daily Cap | Server-authoritative daily ledger check | **VERIFIED** |
| Save Retry Zero-Cost | Client idempotency token prevents double debit | **VERIFIED** |
| Play Subscription Deep Link | Linking.openURL with package fallback | **VERIFIED** |
| Premium Expiry Grace | PostgreSQL `expires_at` check on auth | **VERIFIED** |
