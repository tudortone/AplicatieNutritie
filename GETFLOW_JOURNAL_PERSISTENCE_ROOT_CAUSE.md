# GETFLOW — JOURNAL PERSISTENCE ROOT CAUSE ANALYSIS
## FORENSIC INVESTIGATION OF P0-03 & P0-04 MEAL SAVE FAILURES

**Package:** `com.totsrl.getflo`  
**Database Architecture:** Supabase PostgreSQL (`tfqcihbjgmscsseyzifs.supabase.co`)  
**Target Table:** `mese` (Meal entries)  
**Reported Issues:**  
- **P0-03**: Photo AI results cannot be reliably added to the Journal.  
- **P0-04**: Manual food entry also fails to save correctly in the Journal.  

---

### 1. SHARED BOUNDARY IDENTIFICATION

A systematic trace of both code paths was conducted to isolate their common persistence boundary:

```
[Photo AI Review Flow]
  └─ camera.tsx: adaugaInJurnal()
      └─ construiestePayloadMasaCamera()
          └─ insereazaMasaCuPoza(supabase, payload)
              └─ supabase.from('mese').insert(payloadCurat).select()

[Manual Add Flow]
  └─ AddMealBottomSheet.tsx: handleSave()
      └─ construiestePayloadMasaManuala()
          └─ insereazaMasaCuPoza(supabase, payload)
              └─ supabase.from('mese').insert(payloadCurat).select()
```

Both flows converge on the exact same adapter function: **`insereazaMasaCuPoza`** in `frontend-nutritie/lib/mealUtils.ts`, which sends the payload directly to PostgreSQL via Supabase REST.

---

### 2. REAL DATABASE SCHEMA VERIFICATION

The live database schema for table `mese` was queried via Supabase REST OpenAPI definition (`/rest/v1/?`):

```json
{
  "id": {
    "description": "Note:\nThis is a Primary Key.<pk/>",
    "format": "bigint",
    "type": "integer"
  },
  "user_id": {
    "default": "gen_random_uuid()",
    "format": "uuid",
    "type": "string"
  },
  "nume": { "format": "text", "type": "string" },
  "calorii": { "format": "integer", "type": "integer" },
  "proteine": { "format": "integer", "type": "integer" },
  "carbohidrati": { "default": 0, "format": "integer", "type": "integer" },
  "grasimi": { "default": 0, "format": "integer", "type": "integer" },
  "fibre": { "default": 0, "format": "numeric", "type": "number" },
  "tip_masa": { "format": "text", "type": "string" },
  "data": { "format": "date", "type": "string" },
  "ora": { "format": "time without time zone", "type": "string" },
  "created_at": { "default": "timezone('utc'::text, now())", "format": "timestamp with time zone", "type": "string" },
  "alimente": { "format": "jsonb" },
  "imagine_url": { "format": "text", "type": "string" }
}
```

### 3. THE TWO FATAL DEFECTS

#### Defect A: Client String UUID sent to `bigint` Primary Key (`22P02`)
- **What happened:** In commit `761feb93`, an agent erroneously assumed `mese.id` was a client-generated UUID column and added comments stating `// Schema canonică mese.id este UUID`. The client payload builders (`construiestePayloadMasaManuala`, `construiestePayloadMasaCamera`) began injecting `id: idMasaDinOperatie(user_id, idOperatie)` (a 36-character string UUID like `'a0a5a427-d085-434b-b5ea-48ef59a242a7'`).
- **Postgres response:** When Supabase PostgREST executed the insert statement:
  ```json
  {
    "code": "22P02",
    "message": "invalid input syntax for type bigint: \"a0a5a427-d085-434b-b5ea-48ef59a242a7\""
  }
  ```
- **Result:** HTTP 400 Bad Request on EVERY INSERT. The meal was rejected by the database.

#### Defect B: Decimal Floating-Point Numbers sent to `integer` Macro Columns (`22P02`)
- **What happened:** Portion scaling and nutrient calculation routinely produce decimal values (e.g., an apple containing `20.7g` carbohydrates or `0.4g` protein).
- **Schema mismatch:** The PostgreSQL columns `calorii`, `proteine`, `carbohidrati`, and `grasimi` are defined as `INTEGER`. Only `fibre` is defined as `NUMERIC`.
- **Empirical test:**
  - `calorii: 10.5` $\to$ `Status: 400 invalid input syntax for type integer: "10.5"`
  - `proteine: 10.5` $\to$ `Status: 400 invalid input syntax for type integer: "10.5"`
  - `carbohidrati: 10.5` $\to$ `Status: 400 invalid input syntax for type integer: "10.5"`
  - `grasimi: 10.5` $\to$ `Status: 400 invalid input syntax for type integer: "10.5"`
  - `fibre: 10.5` $\to$ `Status: 201 SUCCESS (id=88)`
- **Result:** Any meal containing non-integer macro values immediately failed with HTTP 400 (`22P02`).

---

### 4. REPAIR IMPLEMENTATION & VERIFICATION

1. **`lib/mealUtils.ts` (`insereazaMasaCuPoza`)**:
   - Clamps and rounds `calorii`, `proteine`, `carbohidrati`, and `grasimi` to integer (`Math.round`), and `fibre` to 1 decimal place.
   - Detects `22P02` (bigint syntax error) and automatically retries the insert without `id`, allowing PostgreSQL's identity sequence to assign the bigint primary key.
2. **`lib/payloadMese.ts` (`randulPersistatCorespundePayloadului` & `verificaReluareMasa`)**:
   - Handles the comparison between server-assigned bigint `rand.id` and client tracking IDs without false conflict rejections.
3. **Live Database Integration Test**:
   - Executed live against Supabase REST endpoint: returned `201 Created` with integer `id: 89`, successfully confirmed, and cleaned up.
