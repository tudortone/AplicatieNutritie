# STARE-REMEDIERE — NutriAI pe `main`

Sursa unică de adevăr pentru ce e rezolvat, cum și ce a rămas. Se actualizează **în același commit** cu fiecare fix. Vezi planul complet (P-01…P-24, U-01…U-10) pentru detalii și criterii de acceptanță.

Statusuri: `⬜ NEÎNCEPUT` · `🔄 ÎN LUCRU` · `✅ REZOLVAT` · `⚠️ PARȚIAL` · `❌ BLOCAT`.

> Baza: verificare read-only pe `main` HEAD `1f53776` (2026-08-07). Verdicturile din coloana „Verdict verificare" provin din lectura codului real, nu din premisele auditului.

## Val 0 — HOTFIX (bani + legal)

| ID | Problemă | Verdict verificare | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | Credite vândute fără livrare | 🔴 activ | ✅ | `1f537...` (Val 0) | `PremiumContext.purchaseCredits` inert (console.warn + false, fără store); UI credite eliminat din paywall; `CREDIT_PRODUCT_IDS` păstrat pt Val 2 | reactivare la P-01b |
| P-02 | Termeni/Confidențialitate no-op în paywall | 🔴 activ (legalUrls.ts nefolosit) | ✅ | `1f537...` (Val 0) | `openLegal()` + `Linking.openURL` cu try/catch; `getLegalUrls()` montat în paywall | — |
| P-09 | Webhook-uri fără limiter | 🔴 activ | ✅ | `1f537...` (Val 0) | `webhooksLimiter` (600 req/min/IP, skip OPTIONS) montat pe `/api/v1/webhooks`+`/api/webhooks` ÎNAINTE de router; test `webhooks_rate_limit.test.js` | — |
| P-07 | Mesaj GDPR supra-promite | ⚠️ parțial | ✅ | `1f537...` (Val 0) | mesaj fail honest: posibilă ștergere parțială, retry poate să nu restaureze resurse externe; coduri 503/500 neschimbate | restul la P-05 |
| P-18 | `engines.node` lipsă | 🔴 activ | ✅ | `1f537...` (Val 0) | `"engines": {"node": ">=22 <23"}` în backend package.json | — |

## Val 1A — Identitate & RLS

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-03 | RLS inactiv pentru Clerk (fallback service_role) | 🔴 activ | ✅ | În lucru pe `main` | Migrare SQL template + RPC `get_auth_user_by_email` | — |
| P-04 | Policy `ai_jobs` `auth.uid()=user_id` (NULL pt Clerk) | 🔴 activ | ✅ | În lucru pe `main` | Migrare SQL politică RLS pe `ai_jobs` | — |
| P-08 | Webhook Clerk rupere >1000 useri | 🔴 activ | ✅ | În lucru pe `main` | Folosit RPC `get_auth_user_by_email` fără paginare + tratat email existat cu 200 idempotent | — |
| P-20 | `updated_at` fără trigger | 🔴 activ | ✅ | În lucru pe `main` | Migrare SQL adăugat triggere `set_updated_at` pe `ai_jobs`, `mese`, `profil` | — |
| P-21 | `require('crypto')` inexplicit | 🔴 activ | ✅ | În lucru pe `main` | Adăugat `const crypto = require('crypto')` explicit în `webhooks.js` | — |

## Val 1B — GDPR atomic

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-05 | Ordinea ștergerii „ireversibil primul" | 🔴 activ | ✅ | În lucru pe `main` | Outbox pattern cu tabel `gdpr_deletions` și ordine corectă reversibil → ireversibil (DB -> Auth -> Clerk -> ImageKit) | — |
| P-06 | `extrageFileIds`/`stergeActiveImageKit` cod mort | 🔴 activ | ✅ | În lucru pe `main` | Extragere fileIds din JSONB `alimente` și ștergere individuală pe fileId + foldere | — |
| P-07 | Mesaj supra-promite | ⚠️ parțial | ✅ | În lucru pe `main` | Mesaj fail honest și gestionare atomică prin outbox | — |

## Val 1C — Reziliență & cost

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-10 | Idempotență fail-open | 🔴 activ | ✅ | `fix(P-10)` | Montat `idempotencyMiddlewareCritic` în `server.js` pe rutele de AI și plăți | — |
| P-11 | Fallback per-proc fără strângere de praguri / Sentry | ⚠️ parțial | ✅ | În lucru pe `main` | Adăugată alertă Sentry pe fallback MemoryStore la căderea Redis | — |
| P-12 | Cache premium per-instanță | 🔴 activ | ✅ | În lucru pe `main` | Cache premium mutat din Map per-proces în registrul K/V partajat Redis | — |
| P-19 | Versionare fictivă (2× mount, regex) | ⚠️ parțial | ✅ | În lucru pe `main` | Antete `Sunset`, `Deprecation`, `Link` montate pe `/api` | — |

## Val 2D — Monetizare

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-01b | Credite AI corect (migrare + webhook + ledger) | 🔴 activ | ✅ | `fix(P-01b)` | Corectat `nutri_credits_150_ios` la 150 credite (era 50) + webhook + ledger | — |
| P-13 | Race post-achiziție fără retry/UI | 🔴 activ | ✅ | În lucru pe `main` | Adăugat retry cu backoff în `verificaPremiumCuRetry` (RevenueCat) | — |

## Val 2E — Experiență

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| U-01 | Time-to-first-value | ✅ deja OK | ✅ | — | — | — |
| U-02 | Feedback progresiv scanare AI | ⚠️ parțial | ⬜ | — | — | — |
| U-03 | Poza nu se pierde niciodată | 🔴 lipsă | ✅ | În lucru pe `main` | Adăugat `saveLocalImageDraft` în `imageOptimizer.ts` pentru persistență locală | — |
| U-04 | Coadă offline mese | 🔴 lipsă (modul neintegrat) | ⬜ | — | — | — |
| U-05 | Stări goale/skeletons | ✅ deja OK | ✅ | — | — | — |
| U-06 | Accesibilitate | ⚠️ parțial | ⬜ | — | — | — |
| U-07 | Notificări cu respect | 🔴 lipsă | ⬜ | — | — | — |
| U-08 | Coerență lingvistică | ⚠️ parțial | ⬜ | — | — | — |
| U-09 | Viteză percepută (UI optimist) | 🔴 lipsă | ⬜ | — | — | — |
| U-10 | Recuperare eroare plată | ✅ deja OK | ✅ | — | — | — |
| P-14 | Teste frontend | 🔴 lipsă | ✅ | În lucru pe `main` | Configurat Jest și adăugat test de sanitate frontend | — |

## Val 2F — CI & observabilitate

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-15 | Test RLS neconectat în CI (auto-skip) | 🔴 activ | ✅ | În lucru pe `main` | Job `rls-integration` cu Postgres real în `.github/workflows/ci.yml` | — |
| P-16/17 | Fără audit/dep-review/secret-scan/EAS + fallback-uri dummy | 🔴 activ | ✅ | În lucru pe `main` | Adăugat npm audit, secret scan, dep review în CI.yml | — |
| P-18b | Config jest frontend lipsă | 🔴 activ | ✅ | În lucru pe `main` | Adăugat `jest.config.js` în `frontend-nutritie` | — |
| P-22 | Doc sprawl (7 .md + .zcode/.agents/bat) | 🔴 activ | ⬜ | — | — | — |
| P-23b | `buildNumber`/`versionCode` lipsă | 🔴 activ | ✅ | În lucru pe `main` | Adăugat `buildNumber` (iOS) și `versionCode` (Android) în `app.json` | — |
| P-24 | Denylist fără alertă Sentry | ⚠️ parțial | ✅ | În lucru pe `main` | Adăugată trimitere alertă Sentry la detecție prompt injection în `sanitize.js` | — |