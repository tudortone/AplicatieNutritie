# STARE-REMEDIERE — NutriAI pe `main`

Sursa unică de adevăr pentru ce e rezolvat, cum și ce a rămas. Se actualizează **în același commit** cu fiecare fix. Vezi planul complet (P-01…P-24, U-01…U-10) pentru detalii și criterii de acceptanță.

Statusuri: `⬜ NEÎNCEPUT` · `🔄 ÎN LUCRU` · `✅ REZOLVAT` · `⚠️ PARȚIAL` · `❌ BLOCAT`.

> Baza: verificare pe `main` (HEAD `dd4d2bd`, 2026-08-07). Valul C1 (RLS activ + CI) în curs la această actualizare: `15d5130` (C1-S2+S4), `0ce98c1` (C1-S3), `b76e3e0` (C1-S1 teste), `dd4d2bd` (P-10 fail-closed). Ridică-ți înainte: remote `0714f05` (P-08d search_path), `2ee9fd3` (P-05c gardă GDPR worker). Verdicturile din coloana „Verdict verificare" provin din lectura codului real și executarea suitei de poartă.

## Val C1 — RLS activ pentru toate căile

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| C1-S1 | Identitate supabase-first (calea RLS) | 🟢 rezolvat | `b76e3e0` | Teste regresie pe `rezolvaIdentitate`: token Supabase valid → `provider:'supabase'` (RLS activ), admin doar din `app_metadata.rol`, până GoTrue 5xx/0 → 503 (nu deconectare), 4xx → 401. Frontend e 100% Supabase Auth (zero Clerk în app/lib) → trafic real deja pe RLS. | Pas extern (Clerk Dashboard + GoTrue): JWT Template Clerk pentru a activa calea Clerk pe viitor, dacă apare vreodată un client Clerk. Documentat, nu blocant pentru traficul real. |
| C1-S2 | Politici `ai_jobs`/`credite_ai` + înregistrare RLS | ✅ rezolvat | `15d5130` | `ai_jobs` + `credite_ai` adăugate în `TABELE_CU_RLS_UTILIZATOR` (clientUtilizator.js) + teste. Politici `auth.uid()=user_id` confirmate pe toate tabelele; `barcode_cache`/`clerk_user_map` corect admin-only. | — |
| C1-S3 | Eliminare by-pass RLS prin ESLint | ✅ rezolvat | `0ce98c1` | Regulă `no-restricted-syntax` care interzice `supabaseAdmin.from('<tabel-utilizator>')` în `routes/**`+`utils/**`, cu excepții documentate (webhooks, gdpr, ai.js joburi service-only, gdprWorker). | — |
| C1-S4 | Observabilitate RLS | ✅ rezolvat | `15d5130` | `getStatisticiClientDate()` (cereri RLS vs modAdmin) expus pe `/api/ai-status`; `X-Protectie-RLS` deja setat active/inactiv. | Target: cereriModAdmin → 0 (vezi C1-S1). |
| P-10 | Idempotență fail-open | ✅ rezolvat (fix C1) | `dd4d2bd` | `req._idempotentaAplicata = true` mutat după revendicare reușită: globalul fail-open nu mai bloca garda critică, rutele critice cu store căzut raspund acum 503. | — |

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
| P-03 | RLS inactiv pentru Clerk (fallback service_role) | 🟢 rezolvat (vezi C1-S1) | ⚠️ PARȚIAL | `b76e3e0` | Frontend real e 100% Supabase Auth → traficul RLS activ. Calea Clerk rămâne dar fără client în repo; teste blochează regresia supabase-first. | Dacă apare un client Clerk, activare JWT Template (pas Clerk Dashboard, extern) |
| P-04 | Policy `ai_jobs` `auth.uid()=user_id` (pt Clerk mapping) | ✅ rezolvat (vezi C1-S2) | ✅ | `15d5130` | Politicile confirmate pe toate tabelele; `ai_jobs`+`credite_ai` înregistrate în clientul RLS | — |
| P-08 | Webhook Clerk rupere >1000 useri | 🟢 rezolvat | ✅ | `9a7aadef` | RPC `get_auth_user_by_email` fără paginare + clasificare erori permanente, `EroareTranzitorie` → 500, dead-letter | — |

## Val 1B — GDPR atomic

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-05 | Ordinea ștergerii „ireversibil primul" | 🟢 rezolvat | ✅ | `cfe15a60` + `353f9a64` | Outbox mecanică atomica, 503 fail-closed pe erori outbox și worker de reluare dintr-un proces dedicat | — |
| P-05b | Erori de ștergere GDPR înghițite de catch {} | 🟢 rezolvat | ✅ | `353f9a64` | Erori PostgREST tratate explicit în gdprWorker.js și webhooks.js | — |
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
| U-03 | Poza nu se pierde niciodată | 🟢 rezolvat | ✅ | `a38cddc` + `67d61b32` + `f9729b3c` | Stocare persistentă pe disc, recuperare draft neanalizat prin dialog Alert la pornirea `camera.tsx` și eliberare draft pe `anuleazaScanarea` | — |
| U-04 | Coadă offline mese | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Coadă offline FIFO |
| U-05 | Stări goale/skeletons | ✅ deja OK | ✅ | — | — | — |
| U-06 | Accesibilitate | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Etichete accessibility |
| U-07 | Notificări cu respect | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Notificări locale |
| U-08 | Coerență lingvistică | ⚠️ parțial | ⬜ NEÎNCEPUT | — | — | Uniformizare traduceri |
| U-09 | Viteză percepută (UI optimist) | 🔴 lipsă | ⬜ NEÎNCEPUT | — | — | Optimistic updates |
| U-10 | Recuperare eroare plată | ✅ deja OK | ✅ | — | — | — |
| P-14 | Teste frontend | 🟢 rezolvat | ✅ | `7e1f68b9` | Migrare `FileSystem` pe `expo-file-system/legacy` pentru SDK 54, teste de unitate 2 suites / 6 passed | — |

## Val 2F — CI & observabilitate

| ID | Verdict | Status | Commit | Cum s-a rezolvat | Ce a rămas |
| --- | --- | --- | --- | --- | --- |
| P-15 | Test RLS neconectat în CI (auto-skip) | 🔴 activ | ❌ BLOCAT | `87be5c4` | `set -euo pipefail` în pasul de migrări SQL | `INTEGRATION_SUPABASE_URL` lipsă din ci.yml + `RLS_TESTS_REQUIRED=1` + fără PostgREST în CI → testele nu pot trece prin design |
| P-16/17 | Fără audit/dep-review/secret-scan/EAS + fallback-uri dummy | ⚠️ parțial | ⚠️ PARȚIAL | `87be5c4` + `a219c6e` | Trufflehog filesystem scan, npm audit pe frontend-checks, osv-scanner dep-scan adăugat | Rămâne: verificare efectivă EAS channel |
| P-08b | Alertă dead-letter doar pe calea de excepție | 🟢 rezolvat | ✅ | `353f9a64` | Erori PostgREST tratate explicit și alertă Sentry pe DEAD_LETTER_WRITE_FAILED | — |
| P-08c | `created_at` se rescria la conflict în dead-letter | 🟢 rezolvat | ✅ | `656435f` | Migrare `20260810000001_dead_letter_created_at.sql`: trigger `BEFORE UPDATE` care forțează `NEW.created_at := OLD.created_at` | Fără test pe trigger (suita p08 mockuiește Supabase, nu execută SQL); `incercari` tot nu se incrementează la conflict |
| P-18b | Config jest frontend lipsă | 🟢 rezolvat | ✅ | `94be926` | Adăugat `jest.config.js` în `frontend-nutritie`, configurat `@types/jest` și script-uri CI | — |
| P-22 | Doc sprawl (7 .md + .zcode/.agents/bat) | 🔴 activ | ⬜ NEÎNCEPUT | — | — | Comasare documentație |
| P-23b | `buildNumber`/`versionCode` lipsă + `appVersionSource` + `autoIncrement` | 🟢 rezolvat | ✅ | `a1d86ab` | `appVersionSource: remote` și `autoIncrement: true` în eas.json pentru preview și production | De confirmat la primul build EAS real că numerele se incrementează; nu e lipsă de cod |
| P-24 | Denylist fără alertă Sentry | 🟢 rezolvat | ✅ | `6fd851c` | Adăugat Sentry alert pe pattern_index și suppressed count fără scurgere de PII sample_text | — |
