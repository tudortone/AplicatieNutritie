// REMED-030: modalul legacy „Mâncare identificată" a fost înlocuit de foaia de
// review editabilă din app/camera.tsx — componenta default nu mai e referențiată
// nicăieri ca valoare (grep repo: doar importuri de TIP `AlimentScanat`).
//
// Fișierul NU e șters integral fiindcă e gazda tipului `AlimentScanat`, importat
// ca tip de: app/camera.tsx, lib/payloadMese.ts, IngredientCorrectionInput.tsx
// și __tests__/payloadMese.test.ts. Ștergerea ar rupe acele importuri (unele în
// fișiere aflate sub alt workstream), iar animație de exit pe cod nebănuit e
// pagubă inutilă.

export interface AlimentScanat {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
}