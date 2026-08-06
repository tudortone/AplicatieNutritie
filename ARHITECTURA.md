# ARHITECTURA — consolidare arhitecturală (branch `integration/consolidare`)

Stare faptică la `2026-08-06`. Ramura reunește **audit** (bază securitate `fail-closed`) + **fixes** (strat feature & compatibilitate). Verificare externă (Agent E): VERDICT GREEN.

## 1. Arhitectura contract (§1 — adoptată și curentă)

Patru servicii externe + un strat de observabilitate. Fail-closed este regula implicită.

### 1.1 Trigger.dev — „creier lent” (background)
- Task-uri: `analiza-mancare-ai` + `user-sync`.
- Retry 3 / 1000ms / 5000ms / factor 2; `fail-closed` pe env lipsă → răspunde `{ status: 'needs_config' }` (nu `500`).
- Coduri de eșec stabile (ex: `INDIRECT_INTERZIS`).
- **Fără fallback sincron sync**: analiza/pozele nu au variantă sincronă; background-ul e vectorul unic.
- **AI job queue**: tabela `public.ai_jobs` (schema `public`) urmărește ciclul de viață la `analiza-mancare-ai` (queued→processing→completed/failed); backendul scrie via service_role, clientul vede doar propriile rânduri (RLS select-own), realtime activ.

### 1.2 Groq — chat (services/ai/chat.js)
- Doar chat general.
- Fail-closed fără cheie: `if (!groqApiKey) throw` — **refuză** explicit, NU trimite `Bearer undefined` la API.
- `/log-food`, `/log-food-chat`, `/estimeaza-mancare-text`: 503 onest la lipsa cheii.
- Excepție permisă (E5): fallback **Gemini** pe chat general (`chat.js:92-126`) când Groq indisponibil; pe log-food / estimeaza nu există alternativă — eșuează cinstit.

### 1.3 Gemini — vision doar
- Analizează imagini (poze mâncare), fără variantă sincronă.
- Chat-fallback excepțional permis (vezi §1.2); vision rămâne responsabilitatea principală.

### 1.4 ImageKit — strat vizual (poze mâncare)
- Upload/folder **unic**: `/mancare/<userId>/`.
- Harta în JSONB `alimente` (bază audit + compat fixes): extrage `imageKitFileId` / `imageUrl`.
- Transformări thumbnails (frontend `imagekit.ts`).
- GDPR `routes/gdpr.js`: ștergere folder `/mancare/<userId>/` + `fileId` din JSONB (`extrageFileIds` traversează `fileId`/`imageKitFileId`/`imagekit_file_id`) + legacy `/meals/`. Fail-closed.
- GDPR delete-account șterge și identitatea Clerk cu `redirect:'error'` (împiedică scurgerea de `CLERK_SECRET_KEY` la redirect); idempotent (404 = deja șters) și fail-closed. Sentry redaction §1.5.
- Migrarea `mese.imagine_url` NU se aplică (vezi decizia 2).

### 1.5 Sentry — observabilitate (Redaction PII)
- `sendDefaultPii: false`.
- `beforeSend`: redactează `${PI}`; `event.user = undefined`; strip-query; breadcrumbs limitate (~50, fără `data`/`variables`).
- `tracesSampleRate`: `0.1` în producție, `1.0` în dev.

## 2. Deciziile arhitecturale

1. **Folder ImageKit UNIC** `/mancare/<userId>/`; legacy `/meals/<userId>/*` e curățat la GDPR.
2. **Model poza masa = JSONB `aliment`** cu `imageUrl` + `imageKitFileId`; coloana `mese.imagine_url` NU e aplicată (migrarea `20260806000001_add_mese_imagine_url` e ȘTERSĂ — confirmat prin `git ls-tree`).
3. **Entitlement Premium server-only, fail-closed**: `isPremium` = verdict `/user/premium-status`, cu `entitlementEsteActiv` pe bază de expirare.
4. **Idempotency atomică**: `registru.setIfAbsent(key, valoare, ttlMs)` + fingerprint payload + `409 IDEMPOTENCY_IN_PROGRESS` / `IDEMPOTENCY_KEY_REUSED`; replay; `multipart/form-data` bypass idempotency (poze).
5. **Webhook Clerk + `user-sync` RESTAURATE** (din fixes) — Trigger „creier lent” per §1.1.
6. **Rute `/log-food` + `/log-food-chat` restaurate** — backward compat pe `/api/v1` și `/api`.

## 3. Stare verificare

- Agent E (Adversar): toate E1–E10 trecute.
- Jest: **17 suite-uri / 148 pass + 4 skip** (`rls_integration`, condiționat creds `INTEGRATION`).
- ESLint: **0 erori / 1 warning** (pre-existent `check_schema.js`).
- `tsc` (frontend): exit 0. Zero defecte Critical/High.
- Observații LOW acceptate: comentariu stale `mealUtils.ts:41`, `contracts/nutritie/types.ts` fără consumator, fallback Gemini pe chat permis.

## 4. Tabel de arhivare ramuri

Ordine recomandată: **1)** PR `integration-consolidare` → `main` merged; **2)** confirmare umană; **3)** `git tag archive/<nume>` ÎNAINTE de orice `git branch -D`. Comenzile de arhivare sunt listate; **nu se execută** ștergeri fără confirmare umană.

| Ramură (reală, locală) | Stadiu final | Comandă de arhivare (înainte de `branch -D`) |
|------------------------|--------------|----------------------------------------------|
| `main` | RĂMÂNE | — (principal, protejat) |
| `integration/consolidare` | ARHIVEAZĂ după confirmare umană (după merge PR) | `git tag archive/integration-consolidare` apoi `git branch -D integration/consolidare` |
| `fix/alfa-remediation-v1-fixes` („fixes”) | ARHIVEAZĂ + ȘTERGE după confirmare (înghitit în consolidare) | `git tag archive/fix-alfa-remediation-v1-fixes` apoi `git branch -D fix/alfa-remediation-v1-fixes` (local), iar ramura `origin` doar după merge |
| `audit/zero-compromise-2026-08-06` („audit”) | ARHIVEAZĂ + ȘTERGE după confirmare (straturile adoptate în consolidare) | `git tag archive/audit-zero-compromise-2026-08-06` apoi `git branch -D audit-...` |
| `release/production-v2` | RĂMÂNE (rampă release) | — |
| `alfa` | ARHIVEAZĂ după confirmare (înlocuit de `release/production-v2`) | `git tag archive/alfa` apoi `git branch -D alfa` (după confirmare) |
| `fix/alfa-remediation-v1` | ARHIVEAZĂ + ȘTERGE după confirmare | `git tag archive/fix-alfa-remediation-v1` apoi `git branch -D fix/...` |
| `backup` | RĂMÂNE (ochi de siguranță) — decizie umană | `git tag archive/backup` (save înainte de orice curățare) |
| `testing/staging` | RĂMÂNE (ramură de testare) | — |

Reguli:
- Se face **`.git tag`** ÎNAINTE de orice `git branch -D` pentru fiecare ramură arhivată.
- `main` = ramura protejată; PR-ul consolidării se merge către `main`.
- Nicio ramură „fixes”/`fix/alfa-remediation-v1-fixes` locală nu există separat — ramura de proveniență e pe `origin`; punctul de revenire e tag-ul de arhivă.