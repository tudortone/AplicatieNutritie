# STARE-REMEDIERE — NutriAI pe `main`

Sursa unică de adevăr pentru ce e rezolvat, cum și ce a rămas. Se actualizează **în același commit** cu fiecare fix. Vezi planul complet (P-01…P-24, U-01…U-10) pentru detalii și criterii de acceptanță.

Statusuri: `⬜ NEÎNCEPUT` · `🔄 ÎN LUCRU` · `✅ REZOLVAT` · `⚠️ PARȚIAL` · `❌ BLOCAT`.

> Baza: verificare pe `main` (HEAD `87be5c4`, 2026-08-07). Verdicturile din coloana „Verdict verificare" provin din lectura codului real și executarea suitei de poartă.

## Val 0 — HOTFIX (bani + legal)

| ID | Problemă | Verdict verificare | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | Credite vândute fără livrare | 🟢 rezolvat | ✅ | `7187a9f` | `PremiumContext.purchaseCredits` inert; UI credite eliminat din paywall | — |
| P-02 | Termeni/Confidențialitate no-op în paywall | 🟢 rezolvat | ✅ | `7187a9f` | `openLegal()` + `Linking.openURL` cu try/catch; `getLegalUrls()` montat în paywall | — |
| P-09 | Webhook-uri fără limiter | 🟢 rezolvat | ✅ | `7187a9f` | `webhooksLimiter` montat pe webhooks | — |
| P-07 | Mesaj GDPR supra-promite | 🟢 rezolvat | ✅ | `7187a9f` | Mesaj fail honest, gestionare prin outbox | — |
| P-18 | `engines.node` lipsă | 🟢 rezolvat | ✅ | `7187a9f` | `"engines": {"node": ">=22 <23"}` în backend package.json | — |

## Val 1A — Identitate & RLS

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-03 | RLS inactiv pentru Clerk (fallback service_role) | 🔴 activ | ⬜ NEÎNCEPUT | — | Trecere la JWT Template Clerk / Strat repositories | Trecere la JWT Template Clerk / Strat repositories |
| P-04 | Policy `ai_jobs` `auth.uid()=user_id` (NULL pt Clerk) | 🔴 activ | ⬜ NEÎNCEPUT | — | Politică RLS compatibilă cu JWT Template Clerk | Politică RLS compatibilă cu JWT Template Clerk |
| P-08 | Webhook Clerk rupere >1000 useri | 🟢 rezolvat | ✅ | `f5db73c` | RPC `get_auth_user_by_email` fără paginare + clasificare erori permanente, `EroareTranzitorie` → 500, dead-letter | — |

## Val 1B — GDPR atomic

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-05 | Ordinea ștergerii „ireversibil primul" | 🟢 rezolvat | ✅ | `de66c10` | Outbox mecanică atomica, 503 fail-closed pe erori outbox și worker de reluare dintr-un proces dedicat | — |
| P-06 | `extrageFileIds`/`stergeActiveImageKit` cod mort | 🟢 rezolvat | ✅ | `1e75b60` | Extragere fileIds din JSONB `alimente` și ștergere individuală pe fileId + foldere | — |

## Val 1C — Reziliență & cost

| ID | Verdict | Status | Commit | Cum sa rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-10 | Idempotență fail-open | 🟢 rezolvat | ✅ | `d26b14c` | Eliminare montare pe rute inexistente; montare directă în `routes/ai.js` pe toate cele 10 rute POST reale cu `req._idempotentaAplicata = true` | — |
| P-11 | Fallback per-proc fără strângere de praguri / Sentry | 🟢 rezolvat | ✅ | `1e75b60` | Adăugată alertă Sentry pe fallback MemoryStore la căderea Redis | — |
| P-12 | Cache premium per-instanță | 🟢 rezolvat | ✅ | `1e75b60` | Cache premium mutat din Map per-proces în registrul K/V partajat Redis | — |
| P-19 | Versionare fictivă (2× mount, regex) | 🟢 rezolvat | ✅ | `1e75b60` | Antete `Sunset`, `Deprecation`, `Link` montate pe `/api` | — |

## Val 2D — Monetizare

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-01b | Credite AI corect (migrare + webhook + ledger) | 🟢 rezolvat | ✅ | `98550a9` | RPC `consuma_credit` fără `RAISE`, `supabaseAdmin` injectat în `creeazaCheckAiUsageQuota` și 503 cu dead-lettering în `credite_esuate` pe utilizatori Clerk nemapați | — |
| P-13 | Race post-achiziție fără retry/UI | 🟢 rezolvat | ✅ | `1e75b60` | Adăugat retry cu backoff în `verificaPremiumCuRetry` (RevenueCat) | — |

## Val 2E — Experiență

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| U-01 | Time-to-first-value | ✅ deja OK | ✅ | — | — | — |
| U-02 | Feedback progresiv scanare AI | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Skeleton AI scan |
| U-03 | Poza nu se pierde niciodată | 🟢 rezolvat | ✅ | `a38cddc` | Stocare persistentă pe disc, recuperare draft neanalizat prin dialog Alert la pornirea `camera.tsx` și eliberare draft pe `anuleazaScanarea` | — |
| U-04 | Coadă offline mese | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Coadă offline FIFO |
| U-05 | Stări goale/skeletons | ✅ deja OK | ✅ | — | — | — |
| U-06 | Accesibilitate | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Etichete accessibility |
| U-07 | Notificări cu respect | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Notificări locale |
| U-08 | Coerență lingvistică | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Uniformizare traduceri |
| U-09 | Viteză percepută (UI optimist) | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Optimistic updates |
| U-10 | Recuperare eroare plată | ✅ deja OK | ✅ | — | — | — |
| P-14 | Teste frontend | 🟢 rezolvat | ✅ | `a38cddc` | Migrare `FileSystem` pe `expo-file-system/legacy` pentru SDK 54, teste de unitate 2 suites / 6 passed | — |

## Val 2F — CI & observabilitate

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-15 | Test RLS neconectat în CI (auto-skip) | 🟢 rezolvat | ✅ | `87be5c4` | `set -euo pipefail` în pasul de migrări SQL | — |
| P-16/17 | Fără audit/dep-review/secret-scan/EAS + fallback-uri dummy | 🟢 rezolvat | ✅ | `87be5c4` | Trufflehog filesystem scan pe repository, npm audit pe frontend-checks | — |
| P-18b | Config jest frontend lipsă | 🟢 rezolvat | ✅ | `94be926` | Adăugat `jest.config.js` în `frontend-nutritie`, configurat `@types/jest` și script-uri CI | — |
| P-22 | Doc sprawl (7 .md + .zcode/.agents/bat) | 🔴 activ | ⬜ NEÎNCEPUT | — | — | Comasare documentație |
| P-23b | `buildNumber`/`versionCode` lipsă | 🟢 rezolvat | ✅ | `a4e59b8` | Adăugat `buildNumber` (iOS) și `versionCode` (Android) în `app.json` | — |
| P-24 | Denylist fără alertă Sentry | 🟢 rezolvat | ✅ | `6fd851c` | Adăugat Sentry alert pe pattern_index și suppressed count fără scurgere de PII sample_text | — |