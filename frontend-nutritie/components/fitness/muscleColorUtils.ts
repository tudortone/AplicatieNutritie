/**
 * muscleColorUtils.ts — Funcție UNIFICATĂ de colorare pentru harta musculară
 * Folosită atât de MuscleMapFront cât și de MuscleMapBack.
 * Păstrează culorile originale, folosește heatColor() partajat,
 * și păstrează umplerile de tip gradient (url(#...)).
 */

import { heatColor } from './heatColor';
import { toCanonicalMuscle } from './exerciseIntensity';
import { muscleForMeshName } from './muscleMeshMap';

/**
 * Determină culoarea de fill pentru un path SVG pe baza intensității și mușchilor activi.
 *
 * @param rawId       - ID-ul path-ului SVG (ex: "lats_left", "Vector_12", "semimembranosus_right")
 * @param originalFill - Culoarea originală din SVG (ex: "#FF0000", "url(#paint0_linear)")
 * @param intensity   - Hartă de intensitate pe mușchi canonici (0..1)
 * @param activeMuscles - Listă simplă de mușchi activi (highlight binar)
 * @param activeColor - Culoare pentru mușchi activi când nu există intensity
 * @param inactiveColor - Culoare pentru mușchi inactivi
 * @returns Culoarea de fill (hex, rgb(), sau url(#...))
 */
export function getMuscleFill(
  rawId: string,
  originalFill: string,
  intensity?: Record<string, number | undefined>,
  activeMuscles?: string[],
  activeColor: string = '#3B82F6',
  inactiveColor: string = '#1E293B',
): string {
  // Dacă nu există ID, păstrează culoarea originală
  if (!rawId) return originalFill;

  // Păstrează întotdeauna umplerile de tip gradient și "none"
  if (!originalFill || originalFill === 'none' || originalFill.startsWith('url(')) {
    return originalFill;
  }

  // Încearcă să canonizezi ID-ul
  const canonical = toCanonicalMuscle(rawId) || muscleForMeshName(rawId) || rawId.toLowerCase().trim();

  // Verifică dacă există intensitate pentru acest mușchi
  if (intensity && Object.keys(intensity).length > 0) {
    // Caută în harta de intensitate
    let maxVal: number | undefined = undefined;

    // Verificare directă
    if (intensity[canonical] !== undefined && intensity[canonical]! > 0) {
      maxVal = intensity[canonical]!;
    }

    // Verificare cu sufix _left/_right eliminat
    if (maxVal === undefined) {
      const strippedId = rawId.replace(/_left$|_right$/i, '').toLowerCase().trim();
      if (intensity[strippedId] !== undefined && intensity[strippedId]! > 0) {
        maxVal = intensity[strippedId]!;
      }
    }

    // Caută în toate cheile pentru potrivire parțială (fuzzy match)
    if (maxVal === undefined) {
      for (const [key, val] of Object.entries(intensity)) {
        if (val === undefined || val <= 0) continue;
        const keyLower = key.toLowerCase().trim();
        const idLower = canonical.toLowerCase().trim();
        if (idLower.includes(keyLower) || keyLower.includes(idLower)) {
          if (maxVal === undefined || val > maxVal) {
            maxVal = val;
          }
        }
      }
    }

    if (maxVal !== undefined && maxVal > 0) {
      return heatColor(Math.min(1, Math.max(0, maxVal)));
    }

    // Dacă nu s-a găsit intensitate, returnează culoarea inactivă
    return inactiveColor;
  }

  // Fallback: verifică dacă mușchiul e în lista de active
  if (activeMuscles && activeMuscles.length > 0) {
    const isActive = activeMuscles.some(m => {
      const mNorm = m.toLowerCase().trim();
      const idNorm = canonical.toLowerCase().trim();
      return idNorm.includes(mNorm) || mNorm.includes(idNorm) || idNorm === mNorm;
    });

    if (isActive) return activeColor;
  }

  // Păstrează culoarea originală pentru mușchi neactivi
  return originalFill;
}

/**
 * Extrage activeMuscles dintr-o hartă de intensitate.
 */
export function extractActiveMuscles(
  intensity?: Record<string, number | undefined>,
): string[] {
  if (!intensity) return [];
  if (Array.isArray(intensity)) return intensity as unknown as string[];
  return Object.keys(intensity).filter((k) => (intensity[k] ?? 0) > 0);
}
