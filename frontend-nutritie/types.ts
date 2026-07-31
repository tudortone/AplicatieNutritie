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

/** Micronutrienți per 100g (toate valorile opționale) */
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
  micronutrienti_per_100g?: Micronutrienti;
}
