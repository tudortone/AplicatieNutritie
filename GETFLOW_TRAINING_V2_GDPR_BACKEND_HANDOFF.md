# GETFLOW — TRAINING 2.0 GDPR BACKEND HANDOFF (TASK 7 UNBLOCK)

**Data finalizării:** 17 Octombrie 2026  
**Agent:** Gemini (Backend Security & Core Services Owner)  
**Destinatar:** GPT Codex (Frontend Training 2.0 Feature Owner)  
**Status Task 7:** **UNBLOCKED ON BACKEND / READY FOR FRONTEND VERIFICATION**

---

## 1. Executive Summary

Task 7 (GDPR Completeness for Training 2.0) was previously blocked because the shared backend registry (`backend-nutritie-ai/utils/clientUtilizator.js`) and the GDPR export handler (`backend-nutritie-ai/routes/gdpr.js`) did not recognize `workout_templates`.

Gemini has completed the backend remediation, test-driven validation, and contract synchronization on `main`:
- **Tabelul `workout_templates`** este acum un tabel RLS de prim rang în `TABELE_CU_RLS_UTILIZATOR`, accesibil prin clientul utilizator (`tabelUtilizator`).
- **Exportul GDPR (`GET /api/v1/user/export-data`)** citește complet și paginat `workout_templates` pentru utilizatorul autentificat, garantând izolare strictă multi-tenant (User A nu poate vedea niciodată template-urile lui User B).
- **Ștergerea contului (`DELETE /api/v1/user/delete-account` & GDPR outbox worker)** include explicit `workout_templates` în lista unică `TABELE_STERGERE_GDPR_UTILIZATOR`.
- **Contractul OpenAPI (`contracts/openapi.yaml`)** a fost actualizat pentru a documenta schema `workout_templates` în `GdprExportResponse`.
- **Toate cele 77 de suite de test și 761 de teste** din backend trec cu succes (100% verde).

---

## 2. Verified Scope: Architecture & Schema

### A. Tabelul `public.workout_templates`
- **Origine migrare:** `supabase/migrations/20260926090000_workout_v2_templates.sql`
- **Cheie primară:** `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Cheie externă:** `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- **Coloane:**
  - `id` (UUID)
  - `user_id` (UUID)
  - `schema_version` (INTEGER DEFAULT 1)
  - `name` (TEXT NOT NULL)
  - `source_preset_id` (TEXT NULL)
  - `blocks` (JSONB NOT NULL DEFAULT '[]'::jsonb)
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT now())
  - `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT now())
- **Index:** `idx_workout_templates_user_updated ON public.workout_templates(user_id, updated_at DESC)`
- **Row Level Security (RLS):**
  - RLS activat (`ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;`)
  - Politică: `workout_templates_owner_all FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- **Permisiuni acordate (Grants):**
  - `REVOKE ALL ON TABLE public.workout_templates FROM anon, authenticated;`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_templates TO authenticated;`
  - `GRANT ALL ON TABLE public.workout_templates TO service_role;`

### B. Structura completă Training V2
- **Template-uri:** Stocate în tabela `public.workout_templates`.
- **Blocuri de exerciții:** Stocate direct în câmpul `blocks` (JSONB) al fiecărui template.
- **Sesiuni finalizate:** Stocate în tabela existentă `public.antrenamente` (câmpul `exercitii` JSONB), care participă deja la export și ștergere GDPR.
- **Sesiuni active (în desfășurare):** Gestionate local în storage-ul dispozitivului (`AsyncStorage`) până la finalizare sau salvare ca template.

---

## 3. Code Changes Made by Gemini

### 1. `backend-nutritie-ai/utils/clientUtilizator.js`
- Adăugat `'workout_templates'` în `TABELE_CU_RLS_UTILIZATOR`.
- Deoarece `TABELE_STERGERE_GDPR_UTILIZATOR` este derivat automat prin `Object.freeze([...TABELE_CU_RLS_UTILIZATOR, 'google_play_subscriptions'])`, adăugarea include automat tabela în toate ciclurile de ștergere GDPR (atât pe calea sincronă din rută, cât și pe calea asincronă din worker-ul outbox).

### 2. `backend-nutritie-ai/utils/gdprServices.js`
- **PGRST106 Fail-Loud:** `PGRST106` a fost eliminat din `CODURI_TABELA_INEXISTENTA`. PostgREST `PGRST106` reprezintă o schemă neexpusă sau o eroare de configurare a serverului, nu o tabelă lipsă; mascarea lui risca generarea de exporturi trunchiate prezentate eronat ca HTTP 200. Toleranța la migrări etapizate a fost restrânsă strict la tabele inexistente autentice (`42P01` și `PGRST205`). Orice eroare de schemă PostgREST eșuează acum garantat zgomotos (fail-loud 500).

### 3. `backend-nutritie-ai/routes/gdpr.js`
- În handler-ul rutei `GET /api/v1/user/export-data`:
  - Adăugat `citeste('workout_templates')` în `Promise.all`.
  - Adăugat `workoutTemplates` în destructuring.
  - Returnat `workout_templates: workoutTemplates` în JSON-ul final de export.
- În handler-ul rutei `DELETE /api/v1/user/delete-account`:
  - Aliniată mașina de stări outbox la granularitatea strictă: `pending` → `db_done` → `clerk_done` → `imagekit_done` → `auth_done` → `completed`.
  - Fiecare tranziție de stare verifică atomic `{ data: updatedRow, error }` via `.select('id').maybeSingle()`; eșecul persistării în outbox aruncă `GDPR_OUTBOX_STATUS_UPDATE_FAILED` și blochează trecerea la pasul următor.
  - În `catch (err)`, eroarea primară persistă `last_error` pe rândul din outbox fără a masca codul de eroare HTTP (503/500).

### 4. `backend-nutritie-ai/utils/gdprWorker.js`
- **Fail-Closed pe Credențiale Lipsă:** Worker-ul asincron `reiaStergerileBlocate` nu mai ignoră `CLERK_NOT_CONFIGURED` sau `IMAGEKIT_NOT_CONFIGURED`. Dacă un utilizator are identitate Clerk sau fișiere ImageKit iar cheile lipsesc din mediu, worker-ul oprește execuția înainte de ștergerea ireversibilă din `auth.users`, înregistrează `last_error` și incrementează `retry_count`.
- **Protecție Actualizare Outbox:** `actualizeazaStatusOutbox` validează existența rândului actualizat; starea din memorie este avansată strict DUPĂ confirmarea persistării durabile. Eșecurile secundare din blocul `catch` sunt capturate în Sentry fără a prăbuși bucla worker-ului.

### 5. `contracts/openapi.yaml`
- Actualizat `components.schemas.GdprExportResponse`:
  - Adăugat `workout_templates` în lista `required`.
  - Definit `workout_templates: { type: array, items: { type: object } }` în `properties`.

### 6. `backend-nutritie-ai/tests/f06_f07_gdpr_completeness.test.js`
- Adăugate teste axate pe comportamentul fail-loud pentru `PGRST106` și toleranța strictă pentru `42P01` și `PGRST205` pe `citesteTotPaginat`, `stergeDeadLetterUtilizator` și endpoint-ul de export.

### 7. `backend-nutritie-ai/tests/gdpr_imagekit.test.js`
- Adăugate teste pentru eșecul actualizării outbox pe `clerk_done` și `imagekit_done` în ruta sincronă.
- Parametrizat testul M2 de persistare `file_ids` pentru ambele moduri de eșec (excepție aruncată și obiect de eroare returnat de clientul DB).

### 8. `backend-nutritie-ai/tests/gdpr_worker.test.js`
- Adăugat test ce verifică faptul că identitatea Supabase Auth NU este ștearsă dacă lipsesc credențialele Clerk sau ImageKit.

### 9. `backend-nutritie-ai/tests/training_v2_gdpr.test.js`
- Suită completă de 12 teste de regresie și securitate (izolare A/B, export paginat >1000 template-uri, ștergere atomică, idempotență).

---

## 4. Test Verification Results

### Teste dedicate GDPR & Outbox State Machine:
```bash
npx jest tests/training_v2_gdpr.test.js tests/f06_f07_gdpr_completeness.test.js tests/gdpr_worker.test.js tests/gdpr_imagekit.test.js
```
**Rezultat:**
```
PASS tests/training_v2_gdpr.test.js (12 passed)
PASS tests/f06_f07_gdpr_completeness.test.js (17 passed)
PASS tests/gdpr_worker.test.js (10 passed)
PASS tests/gdpr_imagekit.test.js (23 passed)
Test Suites: 4 passed, 4 total
Tests:       62 passed, 62 total
```

### Suita completă Backend:
```bash
npm test
```
**Rezultat:**
```
Test Suites: 77 passed, 77 total
Tests:       769 passed, 769 total
Snapshots:   0 total
Time:        7.239 s
```

---

## 5. Contract & Mobile Compatibility

1. **Clienți mobili existenți (v31, v33, candidați v34 fără Training 2.0 activat):**
   - Schimbarea este pur aditivă. Câmpul `workout_templates: []` este inclus în exportul JSON. Nicio rută existentă nu și-a schimbat semnătura sau contractul de eroare.
2. **Clienți mobili noi (cu Training 2.0 activat):**
   - Pot folosi direct `workout_templates` returnat de `/api/v1/user/export-data` pentru import/backup/arhivare.
3. **Google Play Data Safety Alignment:**
   - Datele despre template-urile de antrenament sunt stocate exclusiv în baza de date Supabase sub UUID-ul utilizatorului autentificat.
   - Categoria Data Safety asociată este: **Fitness and Health info** (opțional, funcționalitatea aplicației, criptat în tranzit HTTPS, stocat securizat, supus mecanismului de ștergere a contului).
   - Nu există partajare cu terți (No Third-Party Sharing).
   - Declarația Data Safety curentă a aplicației GetFlow din Google Play Console acoperă deja colectarea datelor de fitness pentru scopul funcționalității aplicației și ștergerea lor completă la cerere. Nicio modificare suplimentară a formularelor de Data Safety nu este necesară pentru Training 2.0.

---

## 6. Next Steps for GPT Codex (Frontend Worktree)

1. **Re-bazează sau sincronizează branch-ul `codex/getflow-training-2-0` cu `main`:**
   - Preia modificările din `backend-nutritie-ai/` și `contracts/openapi.yaml`.
2. **Verifică testele din frontend:**
   - Rulează testele `frontend-nutritie/__tests__/` relevante pentru template-uri și experiența de antrenament.
3. **Acceptanță Task 7:**
   - Toate cele 3 constatări formulate de GPT Codex au fost investigate, corectate fail-closed și acoperite prin teste automate în commits `d634392` și `9b02a91`.
   - GPT Codex poate proceda la acceptanța tehnică a componentei de backend GDPR pentru deblocarea sigură a Task-ului 7.
4. **Nu modifica logica comună de securitate backend:**
   - Orice ajustare la logica de autentificare, GDPR sau tabele RLS trebuie coordonată cu Gemini.

