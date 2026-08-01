# Raport: Supabase + Harta corporală + Catalog exerciții

Data: 31.07.2026 · Repo: `tudortone/AplicatieNutritie` · Branch recomandat: `fix/supabase-harta-exercitii`

---

## 1. PARTEA SUPABASE — de ce apăreau erori la introducerea datelor

### 1.1 BUG CRITIC — antrenamentele NU ajungeau NICIODATĂ în cloud
**Fișier:** `frontend-nutritie/hooks/useAntrenamente.ts`

Codul genera id-ul local:
```
id: `local_workout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
```
și trimitea exact acest id către Supabase. Dar în schemă:
```sql
CREATE TABLE antrenamente ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ... )
```
=> Postgres respingea **fiecare** insert cu eroarea `22P02 invalid input syntax for type uuid`.

Eroarea era complet invizibilă, pentru că:
- reacția la rezultat era doar `if (!error && data) { ... }` — ramura `error` nu era tratată;
- totul era învelit în `catch { /* Fallback silențios */ }`.

**Efect real:** toate antrenamentele existau doar în AsyncStorage. La reinstalare / alt telefon = pierdere totală. Nici `muscle_load`, nici scorul de sesiune nu ajungeau în baza de date, deci harta corporală nu avea date istorice.

**Fix aplicat:** generare de UUID v4 valid + logare explicită a erorii de insert și a excepției.

### 1.2 Mesele: coloanele `data` și `ora` rămâneau mereu NULL
- `app/adauga-manual.tsx` calcula `todayStr` și `oraStr` … și nu le folosea niciodată în insert (variabile moarte).
- `app/(tabs)/chat.tsx` insera fără `data` și fără `ora`.
- `app/camera.tsx` trimitea doar `data`, fără `ora`.

Între timp **toate** citirile filtrează pe `created_at` (`useMeseAzi`, `useZileCuMese`, `statistici`). Coloanele erau practic zgomot write-only, iar endpointul de backend care le popula nu e apelat de aplicație.

**Fix aplicat:** toate inserturile trimit acum `data` (zi locală) și `ora`, consistent, plus index nou `mese_user_data_idx`.

### 1.3 Valorile AI puteau declanșa erori brute de constrângere
Schema are `CHECK (calorii <= 15000)` și `<= 2000` pe macro. O valoare halucinată de AI făcea insertul să eșueze, iar `error.message` de la Postgres era afișat direct utilizatorului.

**Fix aplicat:** `clampVal()` în `chat.tsx` limitează valorile înainte de insert (calorii ≤ 15000, macro ≤ 2000).

### 1.4 Zecimalele macronutrienților se pierdeau
`adauga-manual.tsx` folosea `parseInt(proteine) || 0` (fără radix) — „12.5 g proteine” se salva ca **12**.

**Fix aplicat:** helper `numar()` la nivel de componentă, cu `parseFloat`, acceptă și virgula ca separator zecimal (tastatură românească). Înlocuit în **13 locuri** (inclusiv în obiectul salvat la favorite, unde `parseInt` era folosit separat).

### 1.5 Ștergerea meselor se baza exclusiv pe RLS
`app/(tabs)/istoric.tsx`: `.delete().eq('id', masa.id)` — fără filtru pe `user_id`.

**Fix aplicat:** s-a adăugat `.eq('user_id', masa.user_id)` (defense in depth).

### 1.6 Cămara: coloane existente în schemă, dar netrimise
`hooks/useCamara.ts` insera produsul fără `cantitate`, `data_expirare`, `zile_valabilitate`, `is_congelat`, `updated_at` — deși coloanele există. Datele de expirare trăiau doar local. În plus `catch {}` ascundea orice eșec.

**Fix aplicat:** payload complet + logare eroare.

### 1.7 Gamificare: upsert fără `onConflict`
`context/GamificareContext.tsx` făcea `.upsert({...})` fără `onConflict`, iar în schemă nu exista constrângere UNIQUE pe `user_id` => risc de rânduri duplicate pentru același utilizator.

**Fix aplicat:** `{ onConflict: 'user_id' }` + în SQL, deduplicare urmată de `CREATE UNIQUE INDEX gamificare_user_id_key`.

### 1.8 Observație de arhitectură (nu e bug, dar contează)
Aplicația scrie **direct** în Supabase din frontend. Rutele hardened din backend (`POST/PUT/DELETE /api/mese`) nu sunt apelate niciodată — cod mort. Recomandare: fie se rutează scrierile prin backend (validare centralizată), fie se scot rutele.

---

## 2. HARTA CORPORALĂ — revizuire

### 2.1 BUG — mușchiul abductor nu se aprindea NICIODATĂ
În `constants/exercitii.ts`, funcția de derivare a mușchilor țintă nu avea ramură pentru `abductori`, iar regexul `/adductori/` prinde și șirul „abductori”. Rezultat: orice exercițiu de abductori colora **adductorii** — mușchi greșit pe hartă.

**Fix aplicat:** ramură `abductori` verificată ÎNAINTE de `adductori` (exact ca în `fitnessEngine.ts`, unde ordinea era deja corectă).

### 2.2 Listă de mușchi duplicată manual
`lib/fitnessEngine.ts` redeclara manual cele 19 `MuscleId`, deși `heatColor.ts` exportă `ALL_MUSCLE_IDS`. Orice mușchi adăugat în heatColor rămânea nerecunoscut aici => zonă moartă pe hartă.

**Fix aplicat:** `validIds` folosește acum `ALL_MUSCLE_IDS` — o singură sursă de adevăr.

### 2.3 Zone permanent reci — cauza reală
Catalogul vechi aproape nu conținea exerciții pentru `deltoid_posterior`, `romboizi`, `antebrate`, `oblici`, `lombari`, `abductori`, `adductori`, `gambe`. Harta nu era ruptă — nu avea ce colora. Rezolvat prin catalogul nou (secțiunea 3), care acoperă toți cei 19 mușchi canonici.

### 2.4 Zgomot în consolă
Cheile de tip `mobilitate` / `stretching` cădeau pe ramura finală și emiteau `console.warn('[muscle] cheie nemapată')` la fiecare calcul.

**Fix aplicat:** ramură explicită care returnează listă goală, fără avertisment.

### 2.5 Recomandări care cer decizia ta (NU le-am aplicat)
1. **Semantica culorii de repaus.** În `components/fitness/heatColor.ts`, `COLOR_REST = '#38BDF8'` (albastru viu) la intensitate 0, cu opacitate 0.55. Un corp neantrenat arată „aprins”. Sugerez gri neutru pentru 0 real:
   ```ts
   export const COLOR_INACTIVE = '#3F3F46';
   // în heatColor(): if (x <= 0.001) return COLOR_INACTIVE;
   ```
   Nu am modificat fișierul pentru că `components/` nu era în exportul de cod pe care îl am local și nu vreau să generez un patch care să nu se aplice curat.
2. **Patru implementări paralele de heatmap:** `BodyHeatmap.tsx` (18 KB), `MuscleHeatmap.tsx`, `MuscleHeatmapSVG.tsx`, `MuscleHeatmap3D.tsx` + `MuscleBody.tsx`. Trebuie păstrată una singură; restul sunt datorie tehnică (și surse de inconsistență vizuală).
3. **`anatomyPaths.generated.ts` = 574 KB** inclus în bundle. Merită încărcat lazy sau redus (simplificare de path-uri SVG).
4. Cele două funcții de mapare nume→mușchi (`deriveMuschiTinta` în `exercitii.ts` și `mapToCanonicalMuscleIds` în `fitnessEngine.ts`) au reguli diferite pentru aceleași chei (ex. „spate” distribuie în 4 mușchi într-una și doar în dorsali în cealaltă). Ideal: un singur modul comun `lib/muscleMapping.ts`.

---

## 3. CATALOG DE EXERCIȚII — de la 185 la 349

| | Înainte | După |
|---|---|---|
| ID-uri unice în `EXERCITII_DB` | **185** | **349** |
| Fișiere sursă | 3 | 4 |
| Duplicate de id | 11 (numărate dublu) | 0 (deduplicare la merge) |

Fișier nou: `frontend-nutritie/constants/new_exercises_v3.ts` — **164 exerciții**, generate cu id-uri slug unice (0 coliziuni cu cele existente), toate cele 10 câmpuri obligatorii, `categorie` și `dificultate` validate față de tipurile existente.

Acoperire pe mușchi (doar din exercițiile noi):

| Mușchi | Nr. | Mușchi | Nr. |
|---|---|---|---|
| pectorali | 28 | dorsali | 29 |
| deltoid_anterior | 20 | lombari | 15 |
| deltoid_lateral | 7 | romboizi | 18 |
| deltoid_posterior | 12 | fesieri | 35 |
| biceps | 13 | cvadriceps | 37 |
| triceps | 20 | ischiogambieri | 14 |
| antebrate | 15 | gambe | 10 |
| abdomen | 37 | adductori | 8 |
| oblici | 15 | abductori | 7 |
| trapez | 22 | | |

**0 grupe nemapate** — fiecare `grupe[]` folosește o cheie recunoscută de mapare, deci fiecare exercițiu contribuie corect la heatmap și la `muscle_load`.

În `constants/exercitii.ts` s-a adăugat importul + merge-ul cu deduplicare pe `id`.

---

## 4. Cum aplici

```bash
git checkout -b fix/supabase-harta-exercitii
git apply --check fix-supabase-harta-exercitii.patch
git apply fix-supabase-harta-exercitii.patch
```

Apoi, în Supabase SQL Editor, rulează secțiunea **12** nou adăugată din `supabase_rls_policies.sql` (unique index pe `gamificare.user_id` + index `mese_user_data_idx`).

Dacă patch-ul nu se aplică (ai modificat între timp fișierele), folosește direct fișierele din folderul `fisiere-corectate/`.

Patch-ul include și fixurile din auditul anterior (backend `server.js`, `.env.example`, teste, `config.ts`) — este cumulativ.
