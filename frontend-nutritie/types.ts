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
}

export interface Masa {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  created_at: string;
  tip_masa?: TipMasa;
  fibre?: number;
  alimente?: AlimentDetaliat[];
}

export interface AlimentAI {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
  aminoacizi_per_100g?: AminoaciziEsentiali;
}

