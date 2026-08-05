import type {
  TipMasa,
  AminoaciziEsentiali,
  Micronutrienti,
  AlimentDetaliat,
  AlimentAI,
  Aminoacizi100gRaw,
  Micronutrienti100gRaw,
} from '../backend-nutritie-ai/contracts/nutritie/types';

// B-17: tipurile nutritionale au o singura sursa de adevar — contractul partajat
// din backend-nutritie-ai/contracts/nutritie/types.ts. Aici doar le re-exportam,
// ca toti consumatorii existenti (`../types`) sa continue sa functioneze.
// `import type` este sters la build (Babel/Metro), deci nu exista dependinta de
// runtime peste granita pachetelor.
export type {
  TipMasa,
  AminoaciziEsentiali,
  Micronutrienti,
  AlimentDetaliat,
  AlimentAI,
  Aminoacizi100gRaw,
  Micronutrienti100gRaw,
};

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
