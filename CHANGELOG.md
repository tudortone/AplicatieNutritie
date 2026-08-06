# CHANGELOG

> **Preview V2** — ramura `integration/consolidare` este rezultatul consolidării arhitecturale: **audit** (bază securitate `fail-closed`) + **fixes** (strat feature și compatibilitate). Parcurge [ARHITECTURA.md](./ARHITECTURA.md) pentru deciziile arhitecturale (§1–6), harta serviciilor și tabelul de arhivare a ramurilor.

---

## V2 — Consolidare arhitecturală (branch `integration/consolidare`)

Branch-ul adună peste `fix/alfa-remediation-v1-fixes` stratul de audit securitate (`audit/zero-compromise-2026-08-06`) prin **5 commit-uri atomice**, pe principiul: audit = bază securitate (`fail-closed`), fixes = strat feature și compatibilitate. Verificare externă (Agent E / Adversar): **VERDICT GREEN** — Jest 17 suite-uri / 148 pass + 4 skip (`rls_integration`, condiționat `INTEGRATION` creds), ESLint 0 erori / 1 warning (pre-existent `check_schema.js`), `tsc` exit 0. Zero defecte Critical/High.

### Commit-uri

| Hash | Mesaj | Zonă |
|------|-------|------|
| `711c647` | `adopt(audit): fișierele pur-securitate` | Securitate (backend) |
| `354f368` | `merge(audit+fixes): fișierele hibride` | Securitate + compat |
| `699d701` | `test(audit): suite-uri de securitate, runner-i Windows și svix` | Teste / CI |
| `0281d5d` | `feat(frontend): poze ImageKit în alimente JSONB` | Feature (frontend) |
| `dacfd37` | `delete: artefacte noi nu mai relevante` | Curățare |

### 711c647 — adopt(audit): fișierele pur-securitate
Fișierele care aparțin integral auditului (fără delta fixes), adoptate verbatim din `audit/zero-compromise-2026-08-06`:
- `config/env.js` — securitate config.
- `routes/barcode.js`, `routes/profil.js` — validare SSRF / parametri.
- `scripts/create-admin.js` — fără parolă default.
- `services/ai/chat.js` — fail-closed fără cheie Groq (`throw`, refuză `Bearer undefined`).
- `utils/{idempotency.js,promptSafety.js,semafor.js,storePartajat.js,validareMese.js}` — idempotency atomică, semafor corect la abort, validare strictă.

### 354f368 — merge(audit+fixes): fișierele hibride
Fișierele care traversează atât audit cât și fixes, integrate manual: **baza = audit** (fail-closed) + **delta fixes reîncărcată** (strat compat/feature):
- `server.js` — inițializare Sentry PII-safe, montare rute.
- `routes/ai.js` — `B-17` unifică validatorul SSRF; restaurări `/log-food*` și `/estimeaza-mancare-text`.
- `routes/gdpr.js` — ștergere GDPR completă ImageKit (folder + `fileId` + legacy `/meals/`).
- `routes/user.js` — entitlement Premium fail-closed.
- `src/trigger/analiza-mancare-ai.js` — task „brain lent”, `needs_config` pe env lipsă.

### 699d701 — test(audit): suite-uri de securitate, runner-i Windows și svix
- Suite-uri: `audit_hardening`, `gdpr_imagekit`, `idempotency_concurrency`, `create_admin`, `user_isolation`; extinderi `aiUsageQuota`, `idempotency`, `utils`.
- Runner-ele Jest/ESLint adaptate pentru Windows (`runJestWithAnnotations.js`, `runEslintWithAnnotations.js`).
- Evaluare `package.json` — dependența `svix` (verificare semnătură webhook Clerk).

### 0281d5d — feat(frontend): poze ImageKit în `alimente` JSONB
- `frontend/lib/imagekit.ts` — upload/folder unic `/mancare/<userId>/`, transformări thumbnails.
- `frontend/app/camera.tsx`, `lib/imageOptimizer.ts` — procesare poză, stocare meta în JSONB `alimente`.
- `frontend/types.ts` + `backend/contracts/nutritie/types.ts` — tipuri `imageKitFileId`/`imageUrl`.

### dacfd37 — delete: ștergere artefacte noi nu mai relevante (justificată)
- `CODEBASE_CONSOLIDATED_FOR_AI.md` — rulat (51K linii), înlocuit de documentele de urmă ale consolidării.
- `supabase/migrations/20260806000001_add_mese_imagine_url.sql` — model poză = JSONB `alimente`; coloana `mese.imagine_url` nu se aplică. Migrarea fiind ștearsă, nu mai există nicio aplicare a acesteia în bazele de date.

### Observații LOW (non-blocante, acceptate)
- `frontend/lib/mealUtils.ts:41` — comentariu stale care menționa migrarea ștearsă (drift). Fără referințe funcționale.
- `backend/contracts/nutritie/types.ts` — 4 linii adăugate, nimeni nu-l mai referențiază (artefact fără consumator, nu break).
- `services/ai/chat.js:92-126` — Gemini folosit ca fallback pe chat general (permis explicit, E5).

---