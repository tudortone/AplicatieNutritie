export interface Masa {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  created_at: string;
}

export interface AlimentAI {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
}
