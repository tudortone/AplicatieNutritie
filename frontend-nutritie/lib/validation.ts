/**
 * Validari de formular cu mesaje in romana.
 *
 * MUST-FIX #8 (audit productie): singura verificare pe formularul de profil era
 * "campul e gol", deci se acceptau valori absurde (greutate 0 sau -5, calorii
 * 99999) care corup calculele si graficele.
 *
 * Fiecare validator intoarce `null` daca valoarea e buna, altfel mesajul de
 * eroare care trebuie afisat inline, sub camp.
 */

export type ValidationResult = string | null;

/** Limite fiziologic rezonabile, folosite si de backend. */
export const LIMITE = {
  greutate: { min: 25, max: 350, unitate: 'kg' },
  inaltime: { min: 100, max: 250, unitate: 'cm' },
  varsta: { min: 13, max: 100, unitate: 'ani' },
  calorii: { min: 800, max: 8000, unitate: 'kcal' },
  proteine: { min: 20, max: 500, unitate: 'g' },
  carbohidrati: { min: 20, max: 1000, unitate: 'g' },
  grasimi: { min: 10, max: 400, unitate: 'g' },
} as const;

export type CampNumeric = keyof typeof LIMITE;

/** Accepta atat `70.5` cat si `70,5` (tastatura romaneasca). */
export function parseNumar(valoare: string | number | null | undefined): number | null {
  if (typeof valoare === 'number') return Number.isFinite(valoare) ? valoare : null;
  if (!valoare) return null;
  const normalizat = String(valoare).replace(',', '.').trim();
  if (!/^-?\d*\.?\d+$/.test(normalizat)) return null;
  const numar = Number(normalizat);
  return Number.isFinite(numar) ? numar : null;
}

/**
 * Valideaza un camp numeric in raport cu limitele definite mai sus.
 * @param obligatoriu daca `false`, un camp gol este acceptat.
 */
export function valideazaNumar(
  camp: CampNumeric,
  valoare: string | number | null | undefined,
  obligatoriu = true,
): ValidationResult {
  const gol = valoare === null || valoare === undefined || String(valoare).trim() === '';
  if (gol) return obligatoriu ? 'Acest câmp este obligatoriu.' : null;

  const numar = parseNumar(valoare);
  if (numar === null) return 'Introdu doar cifre (ex: 72.5).';

  const { min, max, unitate } = LIMITE[camp];
  if (numar < min) return `Valoarea minimă este ${min} ${unitate}.`;
  if (numar > max) return `Valoarea maximă este ${max} ${unitate}.`;
  return null;
}

export function valideazaNume(valoare: string | null | undefined): ValidationResult {
  const nume = (valoare ?? '').trim();
  if (!nume) return 'Introdu un nume sau un pseudonim.';
  if (nume.length < 2) return 'Numele trebuie să aibă cel puțin 2 caractere.';
  if (nume.length > 40) return 'Numele nu poate depăși 40 de caractere.';
  if (/[<>{}\\]/.test(nume)) return 'Numele conține caractere nepermise.';
  return null;
}

export function valideazaEmail(valoare: string | null | undefined): ValidationResult {
  const email = (valoare ?? '').trim();
  if (!email) return 'Introdu adresa de email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Adresa de email nu pare validă.';
  return null;
}

export function valideazaParola(valoare: string | null | undefined): ValidationResult {
  const parola = valoare ?? '';
  if (!parola) return 'Introdu o parolă.';
  if (parola.length < 8) return 'Parola trebuie să aibă minim 8 caractere.';
  if (!/[a-zA-Z]/.test(parola) || !/\d/.test(parola))
    return 'Parola trebuie să conțină cel puțin o literă și o cifră.';
  return null;
}

/**
 * Verificare de coerenta intre macronutrienti si caloriile tinta.
 * Intoarce un avertisment (nu blocheaza salvarea) daca diferenta > 15%.
 */
export function verificaCoerentaMacro(
  calorii: number | null,
  proteine: number | null,
  carbi: number | null,
  grasimi: number | null,
): ValidationResult {
  if (!calorii || !proteine || !carbi || !grasimi) return null;
  const caloriiDinMacro = proteine * 4 + carbi * 4 + grasimi * 9;
  const diferenta = Math.abs(caloriiDinMacro - calorii) / calorii;
  if (diferenta > 0.15) {
    return `Macronutrienții însumează ~${Math.round(caloriiDinMacro)} kcal, diferit de ținta de ${calorii} kcal.`;
  }
  return null;
}

/** Valideaza un set de campuri si intoarce harta de erori (camp -> mesaj). */
export function valideazaFormular(
  campuri: Partial<Record<CampNumeric, string | number | null | undefined>>,
  obligatorii: CampNumeric[] = [],
): Record<string, string> {
  const erori: Record<string, string> = {};
  (Object.keys(campuri) as CampNumeric[]).forEach((camp) => {
    const eroare = valideazaNumar(camp, campuri[camp], obligatorii.includes(camp));
    if (eroare) erori[camp] = eroare;
  });
  return erori;
}
