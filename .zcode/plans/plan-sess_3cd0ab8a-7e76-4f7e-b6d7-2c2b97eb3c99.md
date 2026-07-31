# Plan: Integrare Hartă Musculară Anatomică NutriAI

## Situația curentă
- **SVG-urile** există în `assets/body/` (nu `assets/anatomy/`): `front_body.svg` (667 path-uri, viewBox 0 0 427 808) și `back_body.svg` (~877 path-uri, viewBox 0 0 431 807)
- **Componente vechi** de șters: `MuscleMapFront.tsx` (646KB, 1439 path-uri inline), `MuscleMapBack.tsx` (wrapper), `LiveMuscleBody.tsx`
- **`heatColor.ts`** există dar trebuie rescris conform specificației noi
- **`fitnessEngine.ts`** are bug-uri în `mapToCanonicalMuscleIds` (lipsă `abductori`, `brate` mapează greșit, etc.)

---

## PASUL 1: `scripts/buildAnatomy.mjs` — Script de build
- Citește `assets/body/front_body.svg` și `assets/body/back_body.svg`
- Parsează cu regex toate `<path>` cu `d`, `fill`, și determină `g`-ul părinte pe baza `id`-ului
- **Normalizează ambele SVG-uri** la viewBox `0 0 431 808` (adaugă offset X +2 pe față)
- **Șterge** `<rect width=... fill="#1E1E1E"/>` (fundalul) și `<defs>`/`<linearGradient>`
- **Slugifică** toate id-urile: lowercase, fără diacritice, spații → `_`, trim
- **Clasifică** path-uri: `role: "outline"` dacă luminanța fill-ului < 0.18, altfel `role: "fill"`
- **Mapează** fiecare id slugificat la `MuscleId` canonic conform MUSCLE_MAP din specificație (cu toate cele 90+ mapping-uri pentru față și spate)
- **Generează** `components/fitness/anatomyPaths.generated.ts` cu tipurile `AnatomyPath`, `VIEWBOX`, `FRONT_PATHS`, `BACK_PATHS`
- **Raportează**: câte path-uri per `muscleId`, id-uri nemapate, erori dacă vreun MuscleId are 0 path-uri pe ambele vederi
- Adaugă script `"build:anatomy": "node scripts/buildAnatomy.mjs"` în `package.json`
- Rulează scriptul pentru a genera fișierul

## PASUL 2: `components/fitness/heatColor.ts` — Rescris
- Păstrează `MuscleId` cu cele 18 ID-uri existente + adaugă `'abductori'`
- Setează constantele noi: `COLOR_REST = '#38BDF8'`, `COLOR_STAB = '#FACC15'`, `COLOR_SECONDARY = '#FF7B00'`, `COLOR_PRIMARY = '#FF003C'`
- Stops: 0.00→COLOR_REST, 0.40→COLOR_STAB, 0.75→COLOR_SECONDARY, 1.00→COLOR_PRIMARY
- **Regulă critică**: `intensity` undefined/null/NaN/≤0 → `COLOR_REST`
- `heatOpacity(t)`: 0.55 la repaus → 1.0 la 100%
- Array-ul `ALL_MUSCLE_IDS` cu toate 19 ID-urile

## PASUL 3: `components/fitness/MuscleBody.tsx` — Componenta UNICĂ
- Înlocuiește complet componenta existentă
- Importă `FRONT_PATHS`, `BACK_PATHS`, `VIEWBOX` din fișierul generat
- Props: `side`, `intensity`, `width`, `height`, `neutralColor`, `onMusclePress`
- Desenează întâi toate `role: "fill"` (cu `heatColor`/`heatOpacity`), apoi toate `role: "outline"` (cu `baseColor`, `pointerEvents="none"`)
- Exportă `React.memo(MuscleBody)`

## PASUL 4: Ștergere și înlocuire componente vechi

### 4a. Șterge:
- `components/MuscleMapFront.tsx`
- `components/MuscleMapBack.tsx`
- `components/fitness/LiveMuscleBody.tsx`

### 4b. `app/(tabs)/index.tsx` (Home)
- Schimbă import: `LiveMuscleBody` → `MuscleBody`
- `<MuscleBody side={viewSideHome} intensity={dailyIntensityHome} width={200} height={260} />`
- **BUG FIX** `dailyIntensityHome`: elimină dubla numărare (normalizare ×100 + tonaj brut). Folosește DOAR o sursă:
  ```
  if (hasServerLoad) → normalizeMuscleLoadToIntensity(map)
  else → computeDailyMuscleIntensity(sesiuniAzi, exercitii)
  ```

### 4c. `app/(tabs)/antrenamente.tsx`
- Elimină `MuscleMapFront`/`MuscleMapBack` și `activeMuscles` (string array)
- Calculează `exerciseIntensity` real prin `mapToCanonicalMuscleIds`
- Randează `<MuscleBody side="front" .../>` și `<MuscleBody side="back" .../>`
- **FIX LAYOUT**: `height: '100%'` → `flex: 1`, mărește `MAP_HEIGHT` la 380
- Legendă: numără doar mușchii cu intensitate ≥ 0.25

### 4d. `app/exercitiu/[id].tsx`
- Păstrează `<MuscleBody>` dar **FIX**: adaugă `useEffect(() => setViewSide(initialSide), [initialSide])` ca să se actualizeze la schimbarea exercițiului
- Șterge codul mort: `getGroupColor`, `pieptColor`, `umeriColor`, `brateColor`, `spateColor`, `picioareColor`, `absColor`, `Holographic3DAnatomyBody` (dacă e doar wrapper), importuri nefolosite din `react-native-svg`

## PASUL 5: Repară `lib/fitnessEngine.ts` → `mapToCanonicalMuscleIds`
- Adaugă `'abductori'` în `validIds` și `MuscleId`
- Repară ordinea regex-urilor (specific înainte de generic):
  ```
  /antebrate|antebraț|brahioradial/i → [{ id: 'antebrate', weight: 1.0 }]
  /^brate$|^brațe$|brahial/i → [{ id: 'biceps', 0.7 }, { id: 'triceps', 0.7 }, { id: 'antebrate', 0.4 }]
  /^spate$/i → [{ id: 'dorsali', 1.0 }, { id: 'trapez', 0.6 }, { id: 'romboizi', 0.6 }, { id: 'lombari', 0.4 }]
  /^picioare$/i → [{ id: 'cvadriceps', 1.0 }, { id: 'ischiogambieri', 0.7 }, { id: 'fesieri', 0.7 }, { id: 'gambe', 0.4 }]
  /^umeri$|deltoizi/i → [{ id: 'deltoid_anterior', 0.8 }, { id: 'deltoid_lateral', 0.8 }, { id: 'deltoid_posterior', 0.5 }]
  /abductori|fesier mijlociu/i → [{ id: 'abductori', weight: 1.0 }] // LIPSEA COMPLET
  /adductori/i → [{ id: 'adductori', weight: 1.0 }]
  ```
- La `return []` final, în `__DEV__` adaugă `console.warn('[muscle] cheie nemapată:', key)`

## PASUL 6: `scripts/verifyAnatomy.mjs` — Test de verificare
- Verifică: fiecare `MuscleId` are ≥1 path pe cel puțin o vedere
- Verifică: nu există `d` duplicat cu `muscleId` diferit
- Verifică: `heatColor(undefined) === COLOR_REST` și `heatColor(0) === COLOR_REST`
- Verifică: ambele vederi au același `VIEWBOX`
- Rulează și raportează output-ul

---

## Ordinea execuției
1. PASUL 1 (build script) → rulează → generează fișierul
2. PASUL 2 (heatColor.ts) 
3. PASUL 5 (fitnessEngine.ts) — necesar pentru ca screen-urile să funcționeze corect
4. PASUL 3 (MuscleBody.tsx) — componenta nouă
5. PASUL 4 (ștergere + actualizare screen-uri)
6. PASUL 6 (verificare) → TypeScript check → raport final