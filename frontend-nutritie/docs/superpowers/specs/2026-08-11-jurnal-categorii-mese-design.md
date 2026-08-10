# Jurnal — Categorii de mese cu detaliu nutrițional (design)

Data: 2026-08-11 · Stare: aprobat de utilizator · Branch: `main-modif-v2`

## 1. Scop

Refacerea jurnalului de mese (`app/(tabs)/istoric.tsx`) pe **4 categorii fixe**
(Mic Dejun / Prânz / Gustări / Cină), fiecare cu antet apăsabil care arată
**fibre + proteine + calorii** (plus carbohidrați/grăsimi). Atingerea unui antet
deschide un **bottom sheet de drill-down** cu mesele/felurile acelei categorii,
poze + ingrediente, iar fiecare fel poate fi deschis în **detaliu complet
(minerale, vitamine, aminoacizi)**. Fotografiile se pot activa/dezactiva global,
doar în jurnal. Toate tranzițiile smooth (fără ecran alb / flicker).

## 2. Surse de date nutriționale (Hibrid)

Ordinul surselor pentru a completa profilul detaliat (fibre, aminoacizi, micro):

1. **Alimentul are deja `aminoacizi`/`micronutrienti`** în JSONB → nemodificat.
2. **Tabel static per-100g** — `lib/nutritieTabel.ts` (~70+ alimente românești),
   cheie = `normalizeazaNumeAliment(nume)` (`lib/normalizareAliment.ts`).
3. **Cache AsyncStorage** (`nutritie_profil:<nume_normalizat>`, TTL 60 zile).
4. **Backend nou** `POST /profil-nutritiv` (per-100g, contract `AlimentDetaliat`),
   doar dacă suntem online. Răspunsul se pune în cache.
5. Altfel → aliment nemodificat (best-effort; **nu blochează salvarea mesei**).

Macro-urile mesei rămân întotdeauna **autoritare**; sursa aduce doar ce lipsește
(`combinaProfil` din `lib/imbogatesteAliment.ts`), scalează per-100g → porție.

## 3. Componente noi

- **`lib/normalizareAliment.ts`** ✅ (pure, testat 6/6)
- **`lib/nutritieTabel.ts`** (date statice per-100g; în lucru)
- **`lib/imbogatesteAliment.ts`** ✅ (pure + async best-effort; test scris)
- **`components/jurnal/CategorieDetailSheet.tsx`** — bottom sheet Gorhom, drill-down:
  antet (icon, nume categorie, calorii+proteine+carbs+grăsimi+fibre), listă de feluri
  cu poze (dacă activate) + ingrediente, apăsabil → `FoodDetailModal`.

## 4. Modificări de fișiere existente

- **`app/(tabs)/istoric.tsx`** — antetele categorii (renderSectionHeader) devin
  apăsabile; adaugă `fibre` în sumar; cazul gol → CategorieDetailSheet care
  arată doar header-ul + „adaugă".
- **`components/MasaCard.tsx`** — adaugă dala de `fibre` (după grăsimi); prop nouă
  `afisarePoze: boolean` (când false, blocul foto e ascuns — fără strikes la Lock upscale).
- **Comutator poze** — AsyncStorage `jurnal_poze_activate`; toggle în istoric
  (header sau acțiune); se aplică DOAR în jurnal.
- **`components/food/FoodDetailModal.tsx`**, **`components/MealDetailsModal.tsx`**,
  **`components/EditAlimentModal.tsx`** — migrare de la RN `Modal` la
  `BottomSheetModal` Gorhom (pattern `WatchSelectorSheet.tsx`) → elimină ecranul
  alb/flicker la deschidere-închidere. Wiring: `imbogatesteAliment` înainte de
  afișarea detaliului.

## 5. Backend (gated — NU se deployează fără confirmare separată)

- **`POST /profil-nutritiv`** în `routes/ai.js` + `profilNutritiv` în
  `services/ai/chat.js` (Groq llama-3.3-70b-versatile, JSON strict, per-100g,
  schema `AlimentDetaliat`). Gărzi: `requireAuth, aiLimiter, idempotencyCritic,
  checkAiUsageQuota`. Dezvoltat + testat LOCAL; niciun deploy.

## 6. Refactor din SU1 (offline add meal) — paralel, fișiere dezoalate

Root cause: supabase insert fără timeout + fallback offline doar la eroare
rezolvată → hang pe „conectat dar fără net real". Fix: timeout db (10s), guard de
hang în `handleSave` → pushOfflineMeal, și drenaj al cozii la reconnect.

## 7. Criterii de acceptare

- Antetele celor 4 categorii afișează calorii+proteine+carbs+grăsimi+fibre.
- Atingere antet → sheet drill-down smooth (fără flicker/ecran alb).
- Fel apăsat → detaliu complet (macro, fibre, aminoacizi, vitamine, minerale).
- Toggle poze funcționează doar în jurnal (persistă).
- `npx tsc --noEmit` + suitele jest verzi; offline nu blochează salvarea.

## 8. Nexte pasi (plan)

1. Aterizează cei 3 subagenți (backend endpoint, offline fix, tabel static).
2. Rulează testele de date; corectează dacă e nevoie.
3. `CategorieDetailSheet` + wiring `istoric.tsx` + `MasaCard` (task #28).
4. Migrare modale → sheets + wiring `imbogatesteAliment` (task #29).
5. Checkpoint git + raport.