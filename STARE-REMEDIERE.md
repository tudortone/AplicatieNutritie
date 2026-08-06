# STARE-REMEDIERE — NutriAI pe `main`

Sursa unică de adevăr pentru ce e rezolvat, cum și ce a rămas. Se actualizează **în același commit** cu fiecare fix. Vezi planul complet (P-01…P-24, U-01…U-10) pentru detalii și criterii de acceptanță.

Statusuri: `⬜ NEÎNCEPUT` · `🔄 ÎN LUCRU` · `✅ REZOLVAT` · `⚠️ PARȚIAL` · `❌ BLOCAT`.

> Baza: verificare pe `main` (HEAD `58e6f10`, 2026-08-07). Verdicturile din coloana „Verdict verificare" provin din lectura codului real și executarea suitei de poartă.

## Val 0 — HOTFIX (bani + legal)

| ID | Problemă | Verdict verificare | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | Credite vândute fără livrare | 🔴 activ | ✅ | `7187a9f` | `PremiumContext.purchaseCredits` inert; UI credite eliminat din paywall | Reactivat în Val 2 (P-01b) |
| P-02 | Termeni/Confidențialitate no-op în paywall | 🔴 activ | ✅ | `7187a9f` | `openLegal()` + `Linking.openURL` cu try/catch; `getLegalUrls()` montat în paywall | — |
| P-09 | Webhook-uri fără limiter | 🔴 activ | ✅ | `7187a9f` | `webhooksLimiter` montat pe webhooks | — |
| P-07 | Mesaj GDPR supra-promite | ⚠️ parțial | ✅ | `7187a9f` | Mesaj fail honest, gestionare prin outbox | — |
| P-18 | `engines.node` lipsă | 🔴 activ | ✅ | `7187a9f` | `"engines": {"node": ">=22 <23"}` în backend package.json | — |

## Val 1A — Identitate & RLS

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-03 | RLS inactiv pentru Clerk (fallback service_role) | 🔴 activ | ⬜ NEÎNCEPUT | — | Trecere la JWT Template Clerk / Strat repositories | — |
| P-04 | Policy `ai_jobs` `auth.uid()=user_id` (NULL pt Clerk) | 🔴 activ | ⬜ NEÎNCEPUT | — | Politică RLS compatibilă cu JWT Template Clerk | — |
| P-08 | Webhook Clerk rupere >1000 useri | 🔴 activ | ✅ | `293da72` | Folosit RPC fara paginare, 5xx pe erori tranzitorii, 200 pe erori permanente + alertă Sentry | — |
| P-20 | `updated_at` fără trigger | 🔴 activ | ✅ | `1e75b60` | Migrare SQL adăugat triggere `set_updated_at` pe `ai_jobs`, `mese`, `profil` | — |
| P-21 | `require('crypto')` inexplicit | 🔴 activ | ✅ | `1e75b60` | Adăugat `const crypto = require('crypto')` explicit în `webhooks.js` | — |

## Val 1B — GDPR atomic

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-05 | Ordinea ștergerii „ireversibil primul" | 🔴 activ | ✅ | `f4272b1` | Outbox pattern (`gdpr_deletions`) cu ordine reversibil -> ireversibil + docstring corectat | — |
| P-06 | `extrageFileIds`/`stergeActiveImageKit` cod mort | 🔴 activ | ✅ | `1e75b60` | Extragere fileIds din JSONB `alimente` și ștergere individuală pe fileId + foldere | — |
| P-07 | Mesaj supra-promite | ⚠️ parțial | ✅ | `1e75b60` | Mesaj fail honest și gestionare atomică prin outbox | — |

## Val 1C — Reziliență & cost

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-10 | Idempotență fail-open | 🔴 activ | ✅ | `3d9590e` | Montat `idempotencyMiddlewareCritic` pe rute AI/plăți + cod `IDEMPOTENCY_STORE_UNAVAILABLE` + test HTTP | — |
| P-11 | Fallback per-proc fără strângere de praguri / Sentry | ⚠️ parțial | ✅ | `1e75b60` | Adăugată alertă Sentry pe fallback MemoryStore la căderea Redis | — |
| P-12 | Cache premium per-instanță | 🔴 activ | ✅ | `1e75b60` | Cache premium mutat din Map per-proces în registrul K/V partajat Redis | — |
| P-19 | Versionare fictivă (2× mount, regex) | ⚠️ parțial | ✅ | `1e75b60` | Antete `Sunset`, `Deprecation`, `Link` montate pe `/api` | — |

## Val 2D — Monetizare

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-01b | Credite AI corect (migrare + webhook + ledger) | 🔴 activ | ✅ | `4f558dd` | Mapat app_user_id Clerk la Supabase UUID, securizat timingSafeEqual, debitat credite platite inainte de cota | — |
| P-13 | Race post-achiziție fără retry/UI | 🔴 activ | ✅ | `1e75b60` | Adăugat retry cu backoff în `verificaPremiumCuRetry` (RevenueCat) | — |

## Val 2E — Experiență

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| U-01 | Time-to-first-value | ✅ deja OK | ✅ | — | — | — |
| U-02 | Feedback progresiv scanare AI | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Skeleton AI scan |
| U-03 | Poza nu se pierde niciodată | 🔴 lipsă | ✅ | `51f18fc` | Implementat `saveLocalImageDraft` în `documentDirectory/drafts/` + legat în `camera.tsx` | — |
| U-04 | Coadă offline mese | 🔴 lipsă (modul neintegrat) | ⬜ NEÎNCEPUT | — | — | Coadă offline FIFO |
| U-05 | Stări goale/skeletons | ✅ deja OK | ✅ | — | — | — |
| U-06 | Accesibilitate | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Etichete accessibility |
| U-07 | Notificări cu respect | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Notificări locale |
| U-08 | Coerență lingvistică | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Uniformizare traduceri |
| U-09 | Viteză percepută (UI optimist) | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Optimistic updates |
| U-10 | Recuperare eroare plată | ✅ deja OK | ✅ | — | — | — |
| P-14 | Teste frontend | 🔴 lipsă | ✅ | `1f475de` | Adăugat `jest-expo`, `jest.config.js`, script `test:ci` și teste reale în `__tests__/` | — |

## Val 2F — CI & observabilitate

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-15 | Test RLS neconectat în CI (auto-skip) | 🔴 activ | ✅ | `3ad0362` | Aplicat migrările SQL din `supabase/migrations/*.sql` pe containerul Postgres din CI prin `psql` cu `ON_ERROR_STOP=1` | — |
| P-16/17 | Fără audit/dep-review/secret-scan/EAS + fallback-uri dummy | 🔴 activ | ⚠️ PARȚIAL | `58e6f10` | Adaptat truffleHog `base: ${{ github.event.before }}` și rulate testele frontend cu `npm run test:ci` | Job EAS build automatizat rămas de integrat |
| P-18b | Config jest frontend lipsă | 🔴 activ | ✅ | `1f475de` | Adăugat `jest.config.js` în `frontend-nutritie` și configurat @types/jest | — |
| P-22 | Doc sprawl (7 .md + .zcode/.agents/bat) | 🔴 activ | ⬜ NEÎNCEPUT | — | — | Comasare documentație |
| P-23b | `buildNumber`/`versionCode` lipsă | 🔴 activ | ✅ | `a4e59b8` | Adăugat `buildNumber` (iOS) și `versionCode` (Android) în `app.json` | — |
| P-24 | Denylist fără alertă Sentry | ⚠️ parțial | ✅ | `6fd851c` | Adăugat Sentry alert pe pattern_index și suppressed count fără scurgere de PII sample_text | — |