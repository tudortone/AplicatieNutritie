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
- În funcția de citire paginată `citesteTotPaginat`, s-a adăugat toleranță explicită la migrări etapizate (`CODURI_TABELA_INEXISTENTA` = `42P01`, `PGRST205`, `PGRST106`). Dacă un mediu de test sau un branch nu are încă migrarea aplicată, citirea returnează `[]` în loc să arunce excepție fatală. Erorile reale de conexiune sau autorizare continuă să eșueze controlat (fail-loud).

### 3. `backend-nutritie-ai/routes/gdpr.js`
- În handler-ul rutei `GET /api/v1/user/export-data`:
  - Adăugat `citeste('workout_templates')` în `Promise.all`.
  - Adăugat `workoutTemplates` în destructuring.
  - Returnat `workout_templates: workoutTemplates` în JSON-ul final de export.

### 4. `contracts/openapi.yaml`
- Actualizat `components.schemas.GdprExportResponse`:
  - Adăugat `workout_templates` în lista `required`.
  - Definit `workout_templates: { type: array, items: { type: object } }` în `properties`.

### 5. `backend-nutritie-ai/tests/f06_f07_gdpr_completeness.test.js`
- Actualizat testul canonic de completitudine a exportului pentru a aserta prezența cheii `workout_templates`.

### 6. `backend-nutritie-ai/tests/training_v2_gdpr.test.js`
- Adăugat o suită completă de 12 teste de regresie și securitate:
  1. User A export returnează template-urile lui User A.
  2. User A export nu include NICIODATĂ template-urile lui User B.
  3. User B export nu include NICIODATĂ înregistrările lui User A.
  4. Paginare completă pentru volume mari (>1000 template-uri) fără trunchiere la limita PostgREST.
  5. Seturile goale exportă corect `workout_templates: []`.
  6. Cererile malformate fără context/identitate eșuează protejat (500).
  7. Ștergerea contului elimină explicit template-urile utilizatorului corect.
  8. Ștergerea contului nu atinge template-urile altui utilizator.
  9. Exportul existent (V1 antrenamente, mese, profil) rămâne intact.
  10. Toleranță la migrări în etape (tabel inexistent pe schema veche returnează `[]`).
  11. Erorile reale de bază de date pe export sunt raportate (500) fără ignorare silențioasă.
  12. Ștergerea repetată/idempotentă rămâne sigură.

---

## 4. Test Verification Results

### Teste dedicate Training V2 GDPR:
```bash
npx jest tests/training_v2_gdpr.test.js
```
**Rezultat:**
```
PASS tests/training_v2_gdpr.test.js
  Training 2.0 GDPR Backend Support — workout_templates
    Registru tabele utilizator
      √ workout_templates este înregistrat în TABELE_CU_RLS_UTILIZATOR
      √ workout_templates este inclus în TABELE_STERGERE_GDPR_UTILIZATOR
    Izolare A/B și integritate export
      √ 1. User A export returnează template-urile lui User A
      √ 2 & 3. User A export nu include niciodată datele lui B, iar User B nu include datele lui A
      √ 4. Paginarea completă exportă peste 1000 template-uri fără trunchiere
      √ 5. Seturile goale exportă corect workout_templates: []
      √ 6. Cererile malformate fără contextDate/userId eșuează protejat
      √ 9. Exportul existent (antrenamente V1, mese, profil) rămâne intact
      √ 10. Toleranță la migrare în etape (tabel inexistent nu blochează exportul)
      √ 11. Erorile reale de bază de date pe export sunt raportate (500)
    Ștergere cont și izolare A/B
      √ 7 & 8. Ștergerea contului elimină template-urile lui A și nu atinge pe cele ale lui B
      √ 12. Ștergerea repetată/idempotentă rămâne sigură

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### Suita completă Backend:
```bash
npm test
```
**Rezultat:**
```
Test Suites: 77 passed, 77 total
Tests:       761 passed, 761 total
Snapshots:   0 total
Time:        7.616 s
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
3. **Finalizează Task 7:**
   - Marchează Task 7 ca complet în ledger-ul de sarcini.
   - Procedează la integrarea componentelor UI (`WorkoutV2Experience`, `ActiveWorkout`, `AnatomyV2Map`, `templateRepository`).
4. **Nu modifica logica comună de securitate backend:**
   - Orice ajustare la logica de autentificare, GDPR sau tabele RLS trebuie coordonată cu Gemini.
