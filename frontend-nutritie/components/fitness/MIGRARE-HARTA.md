# Migrarea la `MuscleMap` — ghid de inlocuire

## De ce

Existau **5 renderere paralele** pentru aceeasi harta musculara, fiecare cu
propria interpretare a datelor si propriile bug-uri:

| Fisier | Marime | Stare |
|---|---|---|
| `BodyHeatmap.tsx` | 18,6 KB | ❌ de sters |
| `MuscleHeatmap.tsx` | 3,6 KB | ❌ de sters |
| `MuscleHeatmapSVG.tsx` | 4,4 KB | ❌ de sters |
| `MuscleHeatmap3D.tsx` | 9,2 KB | ❌ de sters (aduce `three`) |
| `MuscleBody.tsx` | 3,5 KB | ❌ de sters |
| `anatomyPaths.generated.ts` | **575 KB** | ❌ de sters |
| `anatomyPaths.ts` | 3,7 KB | ❌ de sters |
| `muscleRegions.ts` | 4,8 KB | ❌ de sters |
| `muscleZones.ts` | 5,5 KB | ❌ de sters |
| `muscleMeshMap.ts` | 8,2 KB | ❌ de sters (doar pentru 3D) |
| `muscleColorUtils.ts` | 4,0 KB | ⚠️ verifica, apoi sterge |
| `heatColor.ts` | 4,9 KB | ✅ pastrat |
| `exerciseIntensity.ts` | 2,0 KB | ✅ pastrat |
| `lib/muscleMapping.ts` | 8,8 KB | ✅ pastrat |

**Total sters: ~640 KB. Total adaugat: ~30 KB.**

## Cum se inlocuieste

### Inainte

```tsx
import MuscleHeatmapSVG from '@/components/fitness/MuscleHeatmapSVG';

<MuscleHeatmapSVG muscleLoad={incarcare} />
```

Problema: `MuscleHeatmapSVG` trebuia sa **ghiceasca** daca `incarcare` contine
kilograme sau procente (`Math.max(...values) <= 1`).

### Dupa

```tsx
import MuscleMap from '@/components/fitness/MuscleMap';

<MuscleMap load={{ tip: 'tonaj', valori: incarcare }} />
```

Tipul este declarat, deci nu se mai ghiceste nimic.

| Ce ai in ecran | Ce trimiti |
|---|---|
| kilograme ridicate | `{ tip: 'tonaj', valori }` |
| valori deja 0..1 | `{ tip: 'ratio', valori }` |
| numar de serii | `{ tip: 'serii', valori }` |

Cheile pot fi orice denumire (`piept`, `chest`, `lats`, `picioare`) — sunt
traduse automat catre `MuscleId` canonic.

## Ecrane de migrat

- [ ] `app/(tabs)/index.tsx` — harta de pe Acasa
- [ ] `app/(tabs)/antrenamente.tsx`
- [ ] `app/progres-antrenamente.tsx`
- [ ] `app/(tabs)/statistici.tsx`
- [ ] `app/exercitiu/*` — evidentierea muschilor tinta

## Dupa migrare

1. Sterge fisierele marcate ❌ in tabelul de mai sus.
2. Dezinstaleaza `three`, `@react-three/fiber`, `@react-three/drei`, `expo-gl`
   (erau folosite doar de `MuscleHeatmap3D`).
3. Sterge `scripts/buildAnatomy.mjs` — nu mai genereaza nimic.
4. Ruleaza `npx tsc --noEmit` ca sa prinzi importurile ramase.

## Functii noi disponibile

```tsx
// Muschi neglijati — pentru sugestii de antrenament
import { muschiNeglijati, topMuschi } from '@/lib/muscleIntensity';

const neglijati = muschiNeglijati(intensitati); // ex: ['dorsali', 'triceps']
const top = topMuschi(intensitati, 3);

// Atingere pe muschi — filtreaza exercitiile pentru grupa respectiva
<MuscleMap
  load={{ tip: 'serii', valori: seriiSaptamana }}
  onMusclePress={(id) => router.push(`/exercitiu?muschi=${id}`)}
/>
```
