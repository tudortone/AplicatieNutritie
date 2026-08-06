/**
 * Contract partajat de tipuri nutritionale (B-17).
 *
 * Sursa unica de adevar pentru formele de date care traverseaza granita
 * backend <-> frontend. Backend-ul (CommonJS) o referentiaza prin JSDoc
 * (`@typedef {import(...)}`), frontend-ul prin `import type` — ambele fara
 * runtime. Zero cod executabil in acest fisier: doar tipuri.
 *
 * Mutat verbatim din frontend-nutritie/types.ts:1-85.
 */

export type TipMasa = 'mic_dejun' | 'pranz' | 'cina' | 'gustare';

export interface AminoaciziEsentiali {
  leucina?: number;
  izoleucina?: number;
  valina?: number;
  lizina?: number;
  metionina?: number;
  fenilalanina?: number;
  treonina?: number;
  triptofan?: number;
  istidina?: number;
}

/** Micronutrienti per 100g (toate valorile opționale) */
export interface Micronutrienti {
  // Vitamine
  vitamina_a?: number;       // µg
  vitamina_c?: number;       // mg
  vitamina_d?: number;       // µg
  vitamina_e?: number;       // mg
  vitamina_k?: number;       // µg
  vitamina_b1?: number;      // mg (tiamina)
  vitamina_b2?: number;      // mg (riboflavina)
  vitamina_b3?: number;      // mg (niacina)
  vitamina_b6?: number;      // mg
  vitamina_b9?: number;      // µg (folat/acid folic)
  vitamina_b12?: number;     // µg
  // Minerale
  calciu?: number;           // mg
  fier?: number;             // mg
  magneziu?: number;         // mg
  fosfor?: number;           // mg
  potasiu?: number;          // mg
  sodiu?: number;            // mg (sare)
  zinc?: number;             // mg
  cupru?: number;            // mg
  mangan?: number;           // mg
  seleniu?: number;          // µg
  iod?: number;              // µg
  // Alte
  zaharuri?: number;         // g
  grasimi_saturate?: number; // g
  grasimi_trans?: number;    // g
  colesterol?: number;       // mg
  fibra?: number;            // g (duplicat cu fibre pentru consistență)
}

export interface AlimentDetaliat {
  id?: string;
  nume: string;
  grame?: number;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  fibre?: number;
  aminoacizi?: AminoaciziEsentiali;
  micronutrienti?: Micronutrienti;
  // Poza mesei (ImageKit CDN), persistata in JSONB `alimente`. `imageKitFileId`
  // permite stergearea assetului de pe CDN la request-ul GDPR, nu doar URL-ul.
  imageUrl?: string;
  imageKitFileId?: string;
}

export interface AlimentAI {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
  aminoacizi_per_100g?: AminoaciziEsentiali;
  micronutrienti_per_100g?: Micronutrienti;
}

/**
 * Obiectul brut `nutriments` de la OpenFoodFacts, asa cum il emite backend-ul
 * verbatim pe ambele chei `aminoacizi_100g` / `micronutrienti_100g` (surse
 * ne-normalizate, chei cu unitati: `energy-kcal_100g`, `fat_100g`, `sodium_100g`...).
 * Colapsul celor doua chei intr-un singur camp e un ticket separat — nu se atinge aici.
 */
export type Aminoacizi100gRaw = Record<string, number | string | null | undefined>;
export type Micronutrienti100gRaw = Record<string, number | string | null | undefined>;
