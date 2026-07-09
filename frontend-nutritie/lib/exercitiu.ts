import { EXERCITII, Exercitiu, Categorie, GrupaMusculara, Dificultate } from '../constants/exercitii';

export function calculeazaCaloriiArse(met: number, greutateKg: number, durataMin: number): number {
  if (!met || !greutateKg || !durataMin) return 0;
  return Math.round(met * greutateKg * (durataMin / 60));
}

export function calculeazaDurataEstimata(
  serii: number,
  repetari: number,
  timpPauzaSec: number = 60
): number {
  if (!serii || !repetari) return 0;
  const timpExecutieSeriiSec = serii * (repetari * 3); // ~3 secunde pe repetare
  const timpPauzeSec = Math.max(0, serii - 1) * timpPauzaSec;
  return Math.max(1, Math.round((timpExecutieSeriiSec + timpPauzeSec) / 60));
}

export function calculeazaCaloriiEx(
  exercitiu: Exercitiu,
  greutateKg: number,
  serii: number = exercitiu.seriiDefault,
  repetari: number = exercitiu.repetariDefault,
  timpPauzaSec: number = 60
): number {
  const durataMin = calculeazaDurataEstimata(serii, repetari, timpPauzaSec);
  return calculeazaCaloriiArse(exercitiu.met, greutateKg, durataMin);
}

export function cautaExercitii(filtre: {
  query?: string;
  categorie?: Categorie | 'toate';
  grupaMusculara?: GrupaMusculara;
  dificultate?: Dificultate;
}): Exercitiu[] {
  return EXERCITII.filter((ex) => {
    if (filtre.query && filtre.query.trim() !== '') {
      const q = filtre.query.toLowerCase().trim();
      const matchNume = ex.nume.toLowerCase().includes(q);
      const matchGrupe = ex.grupe.some((g) => g.toLowerCase().includes(q));
      if (!matchNume && !matchGrupe) return false;
    }
    if (filtre.categorie && filtre.categorie !== 'toate') {
      if (ex.categorie !== filtre.categorie) return false;
    }
    if (filtre.grupaMusculara && !ex.grupe.includes(filtre.grupaMusculara)) {
      return false;
    }
    if (filtre.dificultate && ex.dificultate !== filtre.dificultate) {
      return false;
    }
    return true;
  });
}
