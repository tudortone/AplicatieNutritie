/**
 * Contract tipizat de API între Frontend (React Native) și Backend (Express Node.js).
 */

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ProfilRequest {
  varsta: number;
  greutate: number;
  inaltime: number;
  sex: 'Masculin' | 'Feminin';
  activitate: 'Sedentar' | 'Moderat' | 'Foarte Activ';
  obiectiv: 'Slăbire' | 'Menținere' | 'Masă Musculară';
}

export interface ProfilResponse {
  caloriiTinta: number;
  proteineTinta: number;
  grasimiTinta: number;
  carbiTinta: number;
}

export interface IngredientAi {
  nume: string;
  calorii_per_100g: number;
  proteine_per_100g: number;
  carbohidrati_per_100g: number;
  grasimi_per_100g: number;
  estimare_grame: number;
}

export interface VisionFallbackResponse {
  action_taken: 'replaced' | 'appended';
  ingredients: IngredientAi[];
  new_totals: {
    kcal: number;
    proteine: number;
    grasimi: number;
    carbohidrati: number;
  };
}

export interface ProdusBarcode {
  codBare: string;
  nume: string;
  brand: string;
  cantitate: string;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  imagine_url?: string | null;
}

export interface ProdusBarcodeResponse {
  source: 'cache' | 'openfoodfacts' | 'estimare_ai';
  estimat?: boolean;
  produs: ProdusBarcode;
}

export interface MasaItem {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  fibre: number;
  tip_masa?: string;
  alimente: IngredientAi[];
  data?: string;
  ora?: string;
  created_at: string;
}
