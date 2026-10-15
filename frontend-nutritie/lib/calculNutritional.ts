export type SexBiologic = 'Masculin' | 'Feminin';
export type NivelActivitate = 'Sedentar' | 'Moderat' | 'Foarte Activ';
export type ObiectivNutritional = 'Slăbire' | 'Menținere' | 'Masă Musculară';

export interface DateCalculProfil {
  varsta: number;
  greutate: number;
  inaltime: number;
  sex: SexBiologic;
  activitate: NivelActivitate;
  obiectiv: ObiectivNutritional;
}

export interface RezultatCalculProfil {
  bmr: number;
  tdee: number;
  caloriiTinta: number;
  proteineTinta: number;
  carbiTinta: number;
  grasimiTinta: number;
  ajustare: number;
  limitatLaMinim: boolean;
}

export const FACTORI_ACTIVITATE: Record<NivelActivitate, number> = {
  Sedentar: 1.2,
  Moderat: 1.55,
  'Foarte Activ': 1.725,
};

export const AJUSTARE_OBIECTIV: Record<ObiectivNutritional, number> = {
  'Slăbire': -550,
  'Menținere': 0,
  'Masă Musculară': 550,
};

export const CALORII_MINIME_SEX: Record<SexBiologic, number> = {
  Masculin: 1500,
  Feminin: 1200,
};

/**
 * Calculează BMR, TDEE, caloriile țintă și împărțirea pe macronutrienți
 * conform formulei Mifflin-St Jeor, în paritate matematică 100% cu backend-ul.
 */
export function calculeazaProfilLocal(d: DateCalculProfil): RezultatCalculProfil | null {
  if (
    !Number.isFinite(d.varsta) || d.varsta < 18 || d.varsta > 100 ||
    !Number.isFinite(d.greutate) || d.greutate < 30 || d.greutate > 300 ||
    !Number.isFinite(d.inaltime) || d.inaltime < 100 || d.inaltime > 250
  ) {
    return null;
  }

  const baza = 10 * d.greutate + 6.25 * d.inaltime - 5 * d.varsta;
  const bmr = d.sex === 'Masculin' ? baza + 5 : baza - 161;

  const factor = FACTORI_ACTIVITATE[d.activitate] ?? 1.2;
  const tdee = bmr * factor;

  const ajustare = AJUSTARE_OBIECTIV[d.obiectiv] ?? 0;
  const brut = tdee + ajustare;
  const minim = CALORII_MINIME_SEX[d.sex] ?? 1200;
  const limitatLaMinim = brut < minim;
  const caloriiTinta = Math.round(limitatLaMinim ? minim : brut);

  // Distribuție macronutrienți: 30% Proteine (4 kcal/g), 40% Carbohidrați (4 kcal/g), 30% Grăsimi (9 kcal/g)
  const proteineTinta = Math.round((caloriiTinta * 0.3) / 4);
  const carbiTinta = Math.round((caloriiTinta * 0.4) / 4);
  const grasimiTinta = Math.round((caloriiTinta * 0.3) / 9);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    caloriiTinta,
    proteineTinta,
    carbiTinta,
    grasimiTinta,
    ajustare: Math.round(ajustare),
    limitatLaMinim,
  };
}
