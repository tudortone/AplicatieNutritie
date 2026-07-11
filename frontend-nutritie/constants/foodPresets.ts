export interface FoodPreset {
  id: string;
  nume: string;
  categorie: 'fructe' | 'mic-dejun' | 'pranz' | 'cina' | 'gustare' | 'bautura' | string;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  gramajDefault: number;
  icon: string; // emoji
  gramajImplicit?: number;
  mergeDirectLaGramaj?: boolean;
  unitati?: Array<{
    label: string;
    grame: number;
  }>;
}

export const foodPresets: FoodPreset[] = [
  // ==========================================
  // FRUCTE (30+ fructe cu portii/unitati rapide)
  // ==========================================
  {
    id: 'mar',
    nume: 'Măr proaspăt',
    categorie: 'fructe',
    calorii: 78,
    proteine: 0.4,
    carbohidrati: 20.7,
    grasimi: 0.3,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍎',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 măr', grame: 75 },
      { label: '1 măr mic', grame: 120 },
      { label: '1 măr mediu', grame: 150 },
      { label: '1 măr mare', grame: 200 }
    ]
  },
  {
    id: 'banana',
    nume: 'Banană proaspătă',
    categorie: 'fructe',
    calorii: 107,
    proteine: 1.3,
    carbohidrati: 27.4,
    grasimi: 0.4,
    gramajDefault: 120,
    gramajImplicit: 120,
    icon: '🍌',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 banană', grame: 60 },
      { label: '1 banană mică', grame: 100 },
      { label: '1 banană medie', grame: 120 },
      { label: '1 banană mare', grame: 150 }
    ]
  },
  {
    id: 'para',
    nume: 'Pară proaspătă',
    categorie: 'fructe',
    calorii: 85,
    proteine: 0.6,
    carbohidrati: 22.5,
    grasimi: 0.2,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍐',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 pară mică', grame: 120 },
      { label: '1 pară medie', grame: 150 },
      { label: '1 pară mare', grame: 200 }
    ]
  },
  {
    id: 'piersica',
    nume: 'Piersică suculentă',
    categorie: 'fructe',
    calorii: 58,
    proteine: 1.4,
    carbohidrati: 14.3,
    grasimi: 0.4,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍑',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 piersică mică', grame: 110 },
      { label: '1 piersică medie', grame: 150 },
      { label: '1 piersică mare', grame: 180 }
    ]
  },
  {
    id: 'nectarina',
    nume: 'Nectarină proaspătă',
    categorie: 'fructe',
    calorii: 62,
    proteine: 1.5,
    carbohidrati: 15,
    grasimi: 0.4,
    gramajDefault: 140,
    gramajImplicit: 140,
    icon: '🍑',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 buc mică', grame: 110 },
      { label: '1 buc medie', grame: 140 },
      { label: '1 buc mare', grame: 180 }
    ]
  },
  {
    id: 'prune',
    nume: 'Prune proaspete',
    categorie: 'fructe',
    calorii: 46,
    proteine: 0.7,
    carbohidrati: 11.4,
    grasimi: 0.3,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🫐',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '3 prune', grame: 90 },
      { label: '5 prune', grame: 150 },
      { label: '1 castronel (~200g)', grame: 200 }
    ]
  },
  {
    id: 'struguri',
    nume: 'Struguri albi sau negri',
    categorie: 'fructe',
    calorii: 104,
    proteine: 1.1,
    carbohidrati: 27,
    grasimi: 0.2,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍇',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 ciorchine mic (~100g)', grame: 100 },
      { label: '1 porție medie (~150g)', grame: 150 },
      { label: '1 ciorchine mare (~250g)', grame: 250 }
    ]
  },
  {
    id: 'cirese',
    nume: 'Cireșe proaspete',
    categorie: 'fructe',
    calorii: 63,
    proteine: 1.1,
    carbohidrati: 16,
    grasimi: 0.2,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🍒',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 pumn (~100g)', grame: 100 },
      { label: '1 bol mic (~150g)', grame: 150 },
      { label: '1 bol mediu (~250g)', grame: 250 }
    ]
  },
  {
    id: 'visine',
    nume: 'Vișine proaspete',
    categorie: 'fructe',
    calorii: 50,
    proteine: 1.0,
    carbohidrati: 12,
    grasimi: 0.3,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🍒',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 pumn (~100g)', grame: 100 },
      { label: '1 bol mic (~150g)', grame: 150 },
      { label: '1 bol mediu (~200g)', grame: 200 }
    ]
  },
  {
    id: 'afine',
    nume: 'Afine proaspete',
    categorie: 'fructe',
    calorii: 57,
    proteine: 0.7,
    carbohidrati: 14.5,
    grasimi: 0.3,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🫐',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 caserolă mică (125g)', grame: 125 },
      { label: '1 pumn (~50g)', grame: 50 },
      { label: '1 bol (~100g)', grame: 100 }
    ]
  },
  {
    id: 'zmeura',
    nume: 'Zmeură proaspătă',
    categorie: 'fructe',
    calorii: 52,
    proteine: 1.2,
    carbohidrati: 12,
    grasimi: 0.6,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🍓',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 caserolă (125g)', grame: 125 },
      { label: '1 pumn (~60g)', grame: 60 },
      { label: '1 porție (~100g)', grame: 100 }
    ]
  },
  {
    id: 'mure',
    nume: 'Mure proaspete',
    categorie: 'fructe',
    calorii: 43,
    proteine: 1.4,
    carbohidrati: 9.6,
    grasimi: 0.5,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🫐',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 caserolă (125g)', grame: 125 },
      { label: '1 pumn (~60g)', grame: 60 },
      { label: '1 porție (~100g)', grame: 100 }
    ]
  },
  {
    id: 'capsuni',
    nume: 'Căpșuni proaspete',
    categorie: 'fructe',
    calorii: 48,
    proteine: 1.0,
    carbohidrati: 11.5,
    grasimi: 0.4,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍓',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '5 căpșuni', grame: 75 },
      { label: '10 căpșuni', grame: 150 },
      { label: '1 caserolă (250g)', grame: 250 }
    ]
  },
  {
    id: 'pepene-rosu-buc',
    nume: 'Pepene roșu (felie)',
    categorie: 'fructe',
    calorii: 90,
    proteine: 1.8,
    carbohidrati: 22,
    grasimi: 0.4,
    gramajDefault: 300,
    gramajImplicit: 300,
    icon: '🍉',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 felie mică (~200g)', grame: 200 },
      { label: '1 felie medie (~300g)', grame: 300 },
      { label: '1 felie mare (~450g)', grame: 450 }
    ]
  },
  {
    id: 'pepene-galben',
    nume: 'Pepene galben (felie)',
    categorie: 'fructe',
    calorii: 68,
    proteine: 1.6,
    carbohidrati: 16,
    grasimi: 0.3,
    gramajDefault: 200,
    gramajImplicit: 200,
    icon: '🍈',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 felie mică (~150g)', grame: 150 },
      { label: '1 felie medie (~200g)', grame: 200 },
      { label: '1 felie mare (~300g)', grame: 300 }
    ]
  },
  {
    id: 'kiwi',
    nume: 'Kiwi proaspăt',
    categorie: 'fructe',
    calorii: 46,
    proteine: 0.8,
    carbohidrati: 11,
    grasimi: 0.4,
    gramajDefault: 75,
    gramajImplicit: 75,
    icon: '🥝',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 kiwi (~75g)', grame: 75 },
      { label: '2 kiwi (~150g)', grame: 150 }
    ]
  },
  {
    id: 'portocala',
    nume: 'Portocală proaspătă',
    categorie: 'fructe',
    calorii: 70,
    proteine: 1.4,
    carbohidrati: 17.5,
    grasimi: 0.2,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍊',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 portocală mică', grame: 120 },
      { label: '1 portocală medie', grame: 150 },
      { label: '1 portocală mare', grame: 200 }
    ]
  },
  {
    id: 'mandarina',
    nume: 'Mandarină / Clementină',
    categorie: 'fructe',
    calorii: 40,
    proteine: 0.6,
    carbohidrati: 10,
    grasimi: 0.2,
    gramajDefault: 80,
    gramajImplicit: 80,
    icon: '🍊',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 mandarină (~80g)', grame: 80 },
      { label: '2 mandarine (~160g)', grame: 160 },
      { label: '3 mandarine (~240g)', grame: 240 }
    ]
  },
  {
    id: 'grapefruit',
    nume: 'Grapefruit roz / alb',
    categorie: 'fructe',
    calorii: 84,
    proteine: 1.5,
    carbohidrati: 21,
    grasimi: 0.3,
    gramajDefault: 200,
    gramajImplicit: 200,
    icon: '🍊',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 grapefruit (~120g)', grame: 120 },
      { label: '1 grapefruit (~220g)', grame: 220 }
    ]
  },
  {
    id: 'ananas',
    nume: 'Ananas proaspăt',
    categorie: 'fructe',
    calorii: 75,
    proteine: 0.8,
    carbohidrati: 19.5,
    grasimi: 0.2,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍍',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 felie (~100g)', grame: 100 },
      { label: '2 felii (~200g)', grame: 200 }
    ]
  },
  {
    id: 'mango',
    nume: 'Mango proaspăt',
    categorie: 'fructe',
    calorii: 90,
    proteine: 1.2,
    carbohidrati: 22.5,
    grasimi: 0.6,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🥭',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 mango (~100g)', grame: 100 },
      { label: '1 mango mediu (~200g)', grame: 200 }
    ]
  },
  {
    id: 'papaya',
    nume: 'Papaya proaspătă',
    categorie: 'fructe',
    calorii: 64,
    proteine: 0.9,
    carbohidrati: 16,
    grasimi: 0.4,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🍈',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 porție (~150g)', grame: 150 },
      { label: '1/2 papaya (~250g)', grame: 250 }
    ]
  },
  {
    id: 'rodie',
    nume: 'Rodie (boabe proaspete)',
    categorie: 'fructe',
    calorii: 83,
    proteine: 1.7,
    carbohidrati: 19,
    grasimi: 1.2,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🍎',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 rodie (~80g)', grame: 80 },
      { label: '1 rodie (~150g)', grame: 150 }
    ]
  },
  {
    id: 'smochine',
    nume: 'Smochine proaspete',
    categorie: 'fructe',
    calorii: 74,
    proteine: 0.8,
    carbohidrati: 19,
    grasimi: 0.3,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🫐',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '2 smochine (~100g)', grame: 100 },
      { label: '3 smochine (~150g)', grame: 150 }
    ]
  },
  {
    id: 'curmale',
    nume: 'Curmale uscate',
    categorie: 'fructe',
    calorii: 140,
    proteine: 1.2,
    carbohidrati: 37,
    grasimi: 0.2,
    gramajDefault: 50,
    gramajImplicit: 50,
    icon: '🫒',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '3 curmale (~30g)', grame: 30 },
      { label: '5 curmale (~50g)', grame: 50 }
    ]
  },
  {
    id: 'avocado',
    nume: 'Avocado proaspăt',
    categorie: 'fructe',
    calorii: 240,
    proteine: 3.0,
    carbohidrati: 12.8,
    grasimi: 22,
    gramajDefault: 150,
    gramajImplicit: 150,
    icon: '🥑',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1/2 avocado (~75g)', grame: 75 },
      { label: '1 avocado mediu (~150g)', grame: 150 }
    ]
  },
  {
    id: 'lamaie',
    nume: 'Lămâie proaspătă (suc)',
    categorie: 'fructe',
    calorii: 15,
    proteine: 0.5,
    carbohidrati: 4.5,
    grasimi: 0.1,
    gramajDefault: 50,
    gramajImplicit: 50,
    icon: '🍋',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 jumătate (~30g)', grame: 30 },
      { label: '1 lămâie (~60g)', grame: 60 }
    ]
  },
  {
    id: 'lime',
    nume: 'Lime / Lămâie verde',
    categorie: 'fructe',
    calorii: 12,
    proteine: 0.3,
    carbohidrati: 3.5,
    grasimi: 0.1,
    gramajDefault: 40,
    gramajImplicit: 40,
    icon: '🍋',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '1 lime (~40g)', grame: 40 }
    ]
  },
  {
    id: 'caisa',
    nume: 'Caise proaspete',
    categorie: 'fructe',
    calorii: 48,
    proteine: 1.4,
    carbohidrati: 11,
    grasimi: 0.4,
    gramajDefault: 100,
    gramajImplicit: 100,
    icon: '🍑',
    mergeDirectLaGramaj: true,
    unitati: [
      { label: '2 caise (~70g)', grame: 70 },
      { label: '3 caise (~105g)', grame: 105 },
      { label: '5 caise (~175g)', grame: 175 }
    ]
  },
  // ==========================================
  // MIC DEJUN (25+ preparate)
  // ==========================================
  { id: 'ou-fiert', nume: 'Ou fiert (1 buc ~50g)', categorie: 'mic-dejun', calorii: 70, proteine: 6, carbohidrati: 0.6, grasimi: 5, gramajDefault: 50, icon: '🥚' },
  { id: 'omleta-2-oua', nume: 'Omletă simplă (2 ouă ~120g)', categorie: 'mic-dejun', calorii: 180, proteine: 12, carbohidrati: 2, grasimi: 14, gramajDefault: 120, icon: '🍳' },
  { id: 'omleta-scordolea', nume: 'Omletă cu șuncă și cașcaval (~180g)', categorie: 'mic-dejun', calorii: 320, proteine: 20, carbohidrati: 3, grasimi: 25, gramajDefault: 180, icon: '🍳' },
  { id: 'ochiuri-prajite', nume: 'Ouă ochiuri prăjite (2 buc ~110g)', categorie: 'mic-dejun', calorii: 210, proteine: 13, carbohidrati: 1, grasimi: 17, gramajDefault: 110, icon: '🍳' },
  { id: 'ovaz-lapte', nume: 'Fulgi de ovăz cu lapte (~250g)', categorie: 'mic-dejun', calorii: 220, proteine: 10, carbohidrati: 38, grasimi: 4, gramajDefault: 250, icon: '🥣' },
  { id: 'ovaz-fructe-nuci', nume: 'Porridge ovăz cu fructe și nuci (~300g)', categorie: 'mic-dejun', calorii: 350, proteine: 12, carbohidrati: 52, grasimi: 11, gramajDefault: 300, icon: '🥣' },
  { id: 'paine-prajita-unt', nume: 'Pâine prăjită cu unt (1 felie ~50g)', categorie: 'mic-dejun', calorii: 120, proteine: 3, carbohidrati: 15, grasimi: 5, gramajDefault: 50, icon: '🍞' },
  { id: 'paine-avocado', nume: 'Avocado toast (1 felie mare ~120g)', categorie: 'mic-dejun', calorii: 240, proteine: 5, carbohidrati: 22, grasimi: 15, gramajDefault: 120, icon: '🥑' },
  { id: 'croissant-unt', nume: 'Croissant cu unt (1 buc ~60g)', categorie: 'mic-dejun', calorii: 280, proteine: 5, carbohidrati: 30, grasimi: 16, gramajDefault: 60, icon: '🥐' },
  { id: 'croissant-ciocolata', nume: 'Croissant cu ciocolată (1 buc ~80g)', categorie: 'mic-dejun', calorii: 350, proteine: 6, carbohidrati: 42, grasimi: 18, gramajDefault: 80, icon: '🥐' },
  { id: 'iaurt-grecesc-10', nume: 'Iaurt grecesc 10% (1 cutie ~150g)', categorie: 'mic-dejun', calorii: 190, proteine: 10, carbohidrati: 6, grasimi: 15, gramajDefault: 150, icon: '🥣' },
  { id: 'iaurt-fructe-cereale', nume: 'Iaurt cu fructe și cereale (~200g)', categorie: 'mic-dejun', calorii: 210, proteine: 7, carbohidrati: 35, grasimi: 4, gramajDefault: 200, icon: '🥣' },
  { id: 'pancakes-sirop', nume: 'Pancakes cu sirop de arțar (2 buc ~120g)', categorie: 'mic-dejun', calorii: 260, proteine: 6, carbohidrati: 45, grasimi: 6, gramajDefault: 120, icon: '🥞' },
  { id: 'clatite-gem', nume: 'Clătite românești cu gem (2 buc ~150g)', categorie: 'mic-dejun', calorii: 290, proteine: 6, carbohidrati: 48, grasimi: 8, gramajDefault: 150, icon: '🥞' },
  { id: 'clatite-fineti', nume: 'Clătite cu Fineti / Nutella (2 buc ~160g)', categorie: 'mic-dejun', calorii: 380, proteine: 7, carbohidrati: 52, grasimi: 16, gramajDefault: 160, icon: '🥞' },
  { id: 'sandvis-sunca-cascaval', nume: 'Sandviș cu șuncă și cașcaval (~150g)', categorie: 'mic-dejun', calorii: 320, proteine: 16, carbohidrati: 32, grasimi: 14, gramajDefault: 150, icon: '🥪' },
  { id: 'sandvis-club', nume: 'Club Sandwich cu pui și bacon (~220g)', categorie: 'mic-dejun', calorii: 480, proteine: 26, carbohidrati: 42, grasimi: 22, gramajDefault: 220, icon: '🥪' },
  { id: 'branza-telemea-rosii', nume: 'Telemea cu roșii și castraveți (~200g)', categorie: 'mic-dejun', calorii: 180, proteine: 12, carbohidrati: 8, grasimi: 11, gramajDefault: 200, icon: '🧀' },
  { id: 'cereale-lapte', nume: 'Cereale corn flakes cu lapte (~200g)', categorie: 'mic-dejun', calorii: 230, proteine: 7, carbohidrati: 44, grasimi: 2, gramajDefault: 200, icon: '🥣' },
  { id: 'budinca-chia', nume: 'Budincă de chia cu lapte vegetal (~180g)', categorie: 'mic-dejun', calorii: 190, proteine: 6, carbohidrati: 20, grasimi: 9, gramajDefault: 180, icon: '🍮' },
  { id: 'waffles-fructe', nume: 'Gofre (Waffles) cu fructe (~140g)', categorie: 'mic-dejun', calorii: 310, proteine: 7, carbohidrati: 46, grasimi: 11, gramajDefault: 140, icon: '🧇' },
  { id: 'shakshuka', nume: 'Shakshuka (ouă în sos de roșii ~250g)', categorie: 'mic-dejun', calorii: 280, proteine: 14, carbohidrati: 16, grasimi: 18, gramajDefault: 250, icon: '🍳' },
  { id: 'crenvursti-mustar', nume: 'Crenvurști pui cu muștar (2 buc ~120g)', categorie: 'mic-dejun', calorii: 240, proteine: 12, carbohidrati: 3, grasimi: 20, gramajDefault: 120, icon: '🌭' },
  { id: 'pate-paine', nume: 'Pateu de pui pe pâine prăjită (~100g)', categorie: 'mic-dejun', calorii: 220, proteine: 9, carbohidrati: 24, grasimi: 10, gramajDefault: 100, icon: '🍞' },

  // ==========================================
  // PRÂNZ (35+ preparate, Fast Food & Tradițional)
  // ==========================================
  { id: 'pizza-margherita-felie', nume: 'Pizza Margherita (1 felie ~120g)', categorie: 'pranz', calorii: 280, proteine: 11, carbohidrati: 32, grasimi: 12, gramajDefault: 120, icon: '🍕' },
  { id: 'pizza-margherita-intreaga', nume: 'Pizza Margherita (întreagă ~450g)', categorie: 'pranz', calorii: 1050, proteine: 42, carbohidrati: 120, grasimi: 45, gramajDefault: 450, icon: '🍕' },
  { id: 'pizza-diavola-felie', nume: 'Pizza Diavola / Salam (1 felie ~130g)', categorie: 'pranz', calorii: 330, proteine: 14, carbohidrati: 30, grasimi: 17, gramajDefault: 130, icon: '🍕' },
  { id: 'pizza-diavola-intreaga', nume: 'Pizza Diavola (întreagă ~500g)', categorie: 'pranz', calorii: 1280, proteine: 54, carbohidrati: 115, grasimi: 66, gramajDefault: 500, icon: '🍕' },
  { id: 'pizza-quattro-felie', nume: 'Pizza Quattro Formaggi (1 felie ~130g)', categorie: 'pranz', calorii: 350, proteine: 15, carbohidrati: 29, grasimi: 19, gramajDefault: 130, icon: '🍕' },
  { id: 'pizza-capricciosa-felie', nume: 'Pizza Capricciosa / Prosciutto (1 felie ~130g)', categorie: 'pranz', calorii: 310, proteine: 13, carbohidrati: 31, grasimi: 14, gramajDefault: 130, icon: '🍕' },
  { id: 'shaorma-pui-medie', nume: 'Shaorma cu pui în lipie (medie ~350g)', categorie: 'pranz', calorii: 650, proteine: 38, carbohidrati: 55, grasimi: 30, gramajDefault: 350, icon: '🌯' },
  { id: 'shaorma-vita-medie', nume: 'Shaorma cu vită/berbecuț (~350g)', categorie: 'pranz', calorii: 720, proteine: 42, carbohidrati: 52, grasimi: 38, gramajDefault: 350, icon: '🌯' },
  { id: 'shaorma-farfurie', nume: 'Shaorma la farfurie cu cartofi prăjiți (~500g)', categorie: 'pranz', calorii: 950, proteine: 48, carbohidrati: 75, grasimi: 50, gramajDefault: 500, icon: '🍽️' },
  { id: 'burger-vita', nume: 'Burger de vită / Cheeseburger (1 buc ~200g)', categorie: 'pranz', calorii: 520, proteine: 28, carbohidrati: 42, grasimi: 26, gramajDefault: 200, icon: '🍔' },
  { id: 'burger-dublu', nume: 'Burger dublu vită cu bacon (~300g)', categorie: 'pranz', calorii: 820, proteine: 48, carbohidrati: 45, grasimi: 48, gramajDefault: 300, icon: '🍔' },
  { id: 'burger-pui', nume: 'Chicken Burger / McChicken (1 buc ~180g)', categorie: 'pranz', calorii: 440, proteine: 22, carbohidrati: 46, grasimi: 18, gramajDefault: 180, icon: '🍔' },
  { id: 'cartofi-prajiti-portie', nume: 'Cartofi prăjiți (1 porție medie ~150g)', categorie: 'pranz', calorii: 450, proteine: 5, carbohidrati: 58, grasimi: 22, gramajDefault: 150, icon: '🍟' },
  { id: 'cartofi-wedges', nume: 'Cartofi wedges la cuptor (~200g)', categorie: 'pranz', calorii: 320, proteine: 5, carbohidrati: 50, grasimi: 11, gramajDefault: 200, icon: '🥔' },
  { id: 'nuggets-pui-6', nume: 'Nuggets de pui (6 buc ~120g)', categorie: 'pranz', calorii: 310, proteine: 16, carbohidrati: 18, grasimi: 19, gramajDefault: 120, icon: '🍗' },
  { id: 'mici-mustar', nume: 'Mici la grătar (1 buc ~50g)', categorie: 'pranz', calorii: 140, proteine: 8, carbohidrati: 1, grasimi: 11, gramajDefault: 50, icon: '🌭' },
  { id: 'mici-4-mustar-paine', nume: 'Mici (4 buc) cu muștar și pâine (~300g)', categorie: 'pranz', calorii: 680, proteine: 36, carbohidrati: 35, grasimi: 44, gramajDefault: 300, icon: '🌭' },
  { id: 'sarmale-porc-3', nume: 'Sarmale de porc în foi de varză (3 buc ~200g)', categorie: 'pranz', calorii: 380, proteine: 18, carbohidrati: 20, grasimi: 26, gramajDefault: 200, icon: '🥬' },
  { id: 'mamaliga-branza-smantana', nume: 'Mămăligă cu brânză și smântână (~300g)', categorie: 'pranz', calorii: 450, proteine: 16, carbohidrati: 45, grasimi: 23, gramajDefault: 300, icon: '🌽' },
  { id: 'ciorba-burta', nume: 'Ciorbă de burtă cu smântână (1 porție ~350g)', categorie: 'pranz', calorii: 380, proteine: 20, carbohidrati: 12, grasimi: 28, gramajDefault: 350, icon: '🍲' },
  { id: 'ciorba-radauteana', nume: 'Ciorbă Rădăuțeană cu pui (1 porție ~350g)', categorie: 'pranz', calorii: 340, proteine: 22, carbohidrati: 14, grasimi: 22, gramajDefault: 350, icon: '🍲' },
  { id: 'ciorba-vacuta', nume: 'Ciorbă de văcuță cu legume (~350g)', categorie: 'pranz', calorii: 220, proteine: 16, carbohidrati: 18, grasimi: 9, gramajDefault: 350, icon: '🍲' },
  { id: 'supa-pui-taitei', nume: 'Supă de pui cu tăiței (~300g)', categorie: 'pranz', calorii: 180, proteine: 14, carbohidrati: 18, grasimi: 5, gramajDefault: 300, icon: '🍲' },
  { id: 'ciorba-perisoare', nume: 'Ciorbă de perișoare (~350g)', categorie: 'pranz', calorii: 260, proteine: 15, carbohidrati: 16, grasimi: 14, gramajDefault: 350, icon: '🍲' },
  { id: 'piept-pui-grill', nume: 'Piept de pui la grătar (1 buc ~150g)', categorie: 'pranz', calorii: 245, proteine: 46, carbohidrati: 0, grasimi: 5, gramajDefault: 150, icon: '🍗' },
  { id: 'ceafa-porc-gratar', nume: 'Ceafă de porc la grătar (~150g)', categorie: 'pranz', calorii: 390, proteine: 32, carbohidrati: 0, grasimi: 29, gramajDefault: 150, icon: '🥩' },
  { id: 'snitel-pui', nume: 'Șnițel de pui pane (1 buc ~150g)', categorie: 'pranz', calorii: 360, proteine: 30, carbohidrati: 22, grasimi: 16, gramajDefault: 150, icon: '🍗' },
  { id: 'pulpa-pui-cuptor', nume: 'Pulpă de pui la cuptor (~180g)', categorie: 'pranz', calorii: 340, proteine: 36, carbohidrati: 1, grasimi: 21, gramajDefault: 180, icon: '🍗' },
  { id: 'orez-alb-garnitura', nume: 'Orez alb fiert / simplu (1 porție ~150g)', categorie: 'pranz', calorii: 195, proteine: 4, carbohidrati: 42, grasimi: 0.5, gramajDefault: 150, icon: '🍚' },
  { id: 'cartofi-fierti-piure', nume: 'Piure de cartofi cu unt și lapte (~200g)', categorie: 'pranz', calorii: 230, proteine: 4, carbohidrati: 36, grasimi: 8, gramajDefault: 200, icon: '🥔' },
  { id: 'paste-carbonara', nume: 'Paste Carbonara cu bacon și ou (~300g)', categorie: 'pranz', calorii: 620, proteine: 26, carbohidrati: 65, grasimi: 28, gramajDefault: 300, icon: '🍝' },
  { id: 'paste-bolognese', nume: 'Paste Bolognese cu carne tocată (~300g)', categorie: 'pranz', calorii: 540, proteine: 26, carbohidrati: 68, grasimi: 18, gramajDefault: 300, icon: '🍝' },
  { id: 'paste-quattro-formaggi', nume: 'Paste Quattro Formaggi (~300g)', categorie: 'pranz', calorii: 680, proteine: 24, carbohidrati: 62, grasimi: 36, gramajDefault: 300, icon: '🍝' },
  { id: 'salata-caesar-pui', nume: 'Salată Caesar cu piept de pui și crutoane (~250g)', categorie: 'pranz', calorii: 380, proteine: 26, carbohidrati: 18, grasimi: 22, gramajDefault: 250, icon: '🥗' },
  { id: 'gyros-pui-lipie', nume: 'Gyros grecesc de pui în lipie (~320g)', categorie: 'pranz', calorii: 580, proteine: 34, carbohidrati: 52, grasimi: 26, gramajDefault: 320, icon: '🥙' },
  { id: 'tacos-vita-2', nume: 'Tacos mezo-american cu vită (2 buc ~200g)', categorie: 'pranz', calorii: 420, proteine: 22, carbohidrati: 36, grasimi: 20, gramajDefault: 200, icon: '🌮' },
  { id: 'sushi-california-8', nume: 'Sushi California Rolls (8 role ~200g)', categorie: 'pranz', calorii: 340, proteine: 9, carbohidrati: 58, grasimi: 8, gramajDefault: 200, icon: '🍣' },

  // ==========================================
  // CINĂ (25+ preparate ușoare și proteice)
  // ==========================================
  { id: 'somon-gratar', nume: 'Somon la grătar cu lămâie (~150g)', categorie: 'cina', calorii: 310, proteine: 30, carbohidrati: 0, grasimi: 20, gramajDefault: 150, icon: '🐟' },
  { id: 'dorada-cuptor', nume: 'Doradă / Biban la cuptor (~200g)', categorie: 'cina', calorii: 260, proteine: 38, carbohidrati: 0, grasimi: 11, gramajDefault: 200, icon: '🐟' },
  { id: 'pastrav-gratar', nume: 'Păstrăv la grătar (~180g)', categorie: 'cina', calorii: 270, proteine: 34, carbohidrati: 0, grasimi: 14, gramajDefault: 180, icon: '🐟' },
  { id: 'tuna-salata-porumb', nume: 'Salată cu ton, porumb și măsline (~200g)', categorie: 'cina', calorii: 240, proteine: 24, carbohidrati: 12, grasimi: 10, gramajDefault: 200, icon: '🥗' },
  { id: 'salata-bulgareasca', nume: 'Salată bulgărească cu șuncă, ou și telemea (~300g)', categorie: 'cina', calorii: 320, proteine: 18, carbohidrati: 10, grasimi: 22, gramajDefault: 300, icon: '🥗' },
  { id: 'salata-greceasca', nume: 'Salată grecească cu feta și măsline (~250g)', categorie: 'cina', calorii: 290, proteine: 10, carbohidrati: 14, grasimi: 21, gramajDefault: 250, icon: '🥗' },
  { id: 'branza-cottage-perle', nume: 'Brânză cottage perle de brânză (~150g)', categorie: 'cina', calorii: 145, proteine: 16, carbohidrati: 5, grasimi: 6.5, gramajDefault: 150, icon: '🧀' },
  { id: 'branza-fagaras', nume: 'Brânză Făgăraș cu smântână (~150g)', categorie: 'cina', calorii: 210, proteine: 15, carbohidrati: 4, grasimi: 15, gramajDefault: 150, icon: '🧀' },
  { id: 'legume-cuptor-mix', nume: 'Mix de legume la cuptor (~200g)', categorie: 'cina', calorii: 140, proteine: 4, carbohidrati: 22, grasimi: 5, gramajDefault: 200, icon: '🥕' },
  { id: 'fasole-verde-usturoi', nume: 'Fasole verde sote cu usturoi (~200g)', categorie: 'cina', calorii: 110, proteine: 3, carbohidrati: 14, grasimi: 4, gramajDefault: 200, icon: '🫛' },
  { id: 'broccoli-fiert', nume: 'Broccoli la abur / sote cu unt (~150g)', categorie: 'cina', calorii: 80, proteine: 4, carbohidrati: 10, grasimi: 3, gramajDefault: 150, icon: '🥦' },
  { id: 'spanac-smantana', nume: 'Mâncare de spanac cu smântână și ou (~250g)', categorie: 'cina', calorii: 240, proteine: 12, carbohidrati: 14, grasimi: 16, gramajDefault: 250, icon: '🍃' },
  { id: 'guacamole-tortilla', nume: 'Guacamole cu chipsuri de tortilla (~150g)', categorie: 'cina', calorii: 320, proteine: 4, carbohidrati: 28, grasimi: 22, gramajDefault: 150, icon: '🥑' },
  { id: 'hummus-lipie', nume: 'Hummus libanez cu lipie caldă (~180g)', categorie: 'cina', calorii: 360, proteine: 12, carbohidrati: 42, grasimi: 16, gramajDefault: 180, icon: '🧆' },
  { id: 'muschi-vita-gratar', nume: 'Mușchi de vită la grătar (~150g)', categorie: 'cina', calorii: 310, proteine: 40, carbohidrati: 0, grasimi: 16, gramajDefault: 150, icon: '🥩' },
  { id: 'ficatei-pui', nume: 'Ficăței de pui trași la tigaie (~200g)', categorie: 'cina', calorii: 320, proteine: 34, carbohidrati: 4, grasimi: 18, gramajDefault: 200, icon: '🍖' },
  { id: 'chiftelute-cuptor', nume: 'Chifteluțe la cuptor (4 buc ~120g)', categorie: 'cina', calorii: 260, proteine: 18, carbohidrati: 10, grasimi: 16, gramajDefault: 120, icon: '🧆' },
  { id: 'ostropel-pui', nume: 'Ostropel de pui cu sos de roșii (~250g)', categorie: 'cina', calorii: 290, proteine: 28, carbohidrati: 12, grasimi: 14, gramajDefault: 250, icon: '🍲' },
  { id: 'zacusca-paine', nume: 'Zacuscă de vinete pe pâine (2 felii ~150g)', categorie: 'cina', calorii: 260, proteine: 4, carbohidrati: 32, grasimi: 13, gramajDefault: 150, icon: '🍆' },
  { id: 'salata-vinete', nume: 'Salată de vinete cu ceapă și pâine (~150g)', categorie: 'cina', calorii: 280, proteine: 3, carbohidrati: 24, grasimi: 19, gramajDefault: 150, icon: '🍆' },

  // ==========================================
  // GUSTĂRI & DESERTURI (25+ preparate)
  // ==========================================
  { id: 'mar', nume: 'Măr proaspăt (1 buc ~150g)', categorie: 'gustare', calorii: 78, proteine: 0.5, carbohidrati: 21, grasimi: 0.3, gramajDefault: 150, icon: '🍎' },
  { id: 'banana', nume: 'Banană (1 buc medie ~120g)', categorie: 'gustare', calorii: 105, proteine: 1.3, carbohidrati: 27, grasimi: 0.4, gramajDefault: 120, icon: '🍌' },
  { id: 'capsuni-castron', nume: 'Căpșuni proaspete (1 bol ~200g)', categorie: 'gustare', calorii: 64, proteine: 1.4, carbohidrati: 15, grasimi: 0.6, gramajDefault: 200, icon: '🍓' },
  { id: 'afine-castron', nume: 'Afine / Fructe de pădure (~150g)', categorie: 'gustare', calorii: 85, proteine: 1.1, carbohidrati: 21, grasimi: 0.5, gramajDefault: 150, icon: '🫐' },
  { id: 'struguri', nume: 'Struguri roșii/albi (~150g)', categorie: 'gustare', calorii: 104, proteine: 1, carbohidrati: 27, grasimi: 0.2, gramajDefault: 150, icon: '🍇' },
  { id: 'portocala', nume: 'Portocală (1 buc ~180g)', categorie: 'gustare', calorii: 86, proteine: 1.7, carbohidrati: 21, grasimi: 0.2, gramajDefault: 180, icon: '🍊' },
  { id: 'migdale-crud', nume: 'Migdale crude / prăjite (1 pumn ~30g)', categorie: 'gustare', calorii: 175, proteine: 6, carbohidrati: 6, grasimi: 15, gramajDefault: 30, icon: '🥜' },
  { id: 'nuci-romanesti', nume: 'Nuci românești / caju (1 pumn ~30g)', categorie: 'gustare', calorii: 195, proteine: 4.5, carbohidrati: 4, grasimi: 19, gramajDefault: 30, icon: '🥜' },
  { id: 'fistic-copt', nume: 'Fistic copt și sărat (~30g)', categorie: 'gustare', calorii: 160, proteine: 6, carbohidrati: 8, grasimi: 13, gramajDefault: 30, icon: '🥜' },
  { id: 'alune-padure', nume: 'Alune de pădure (~30g)', categorie: 'gustare', calorii: 185, proteine: 4, carbohidrati: 5, grasimi: 18, gramajDefault: 30, icon: '🥜' },
  { id: 'protein-bar', nume: 'Baton proteic (1 buc ~60g)', categorie: 'gustare', calorii: 210, proteine: 20, carbohidrati: 18, grasimi: 7, gramajDefault: 60, icon: '🍫' },
  { id: 'shake-proteic-whey', nume: 'Shake proteic Whey în apă/lapte (~300ml)', categorie: 'gustare', calorii: 160, proteine: 28, carbohidrati: 6, grasimi: 2.5, gramajDefault: 300, icon: '🥤' },
  { id: 'ciocolata-neagra', nume: 'Ciocolată neagră 70-80% (3 cuburi ~30g)', categorie: 'gustare', calorii: 170, proteine: 2.5, carbohidrati: 13, grasimi: 12, gramajDefault: 30, icon: '🍫' },
  { id: 'ciocolata-lapte', nume: 'Ciocolată cu lapte (4 cuburi ~40g)', categorie: 'gustare', calorii: 215, proteine: 3, carbohidrati: 23, grasimi: 12, gramajDefault: 40, icon: '🍫' },
  { id: 'papanasi-smantana', nume: 'Papanași cu smântână și dulceață (1 buc ~180g)', categorie: 'gustare', calorii: 450, proteine: 12, carbohidrati: 52, grasimi: 22, gramajDefault: 180, icon: '🍩' },
  { id: 'inghetata-cornet', nume: 'Înghețată la cornet / cupă (~100g)', categorie: 'gustare', calorii: 210, proteine: 3.5, carbohidrati: 26, grasimi: 10, gramajDefault: 100, icon: '🍦' },
  { id: 'tort-ciocolata', nume: 'Tort de ciocolată / Amandină (1 felie ~120g)', categorie: 'gustare', calorii: 420, proteine: 5, carbohidrati: 48, grasimi: 23, gramajDefault: 120, icon: '🍰' },
  { id: 'cheesecake', nume: 'Cheesecake cu fructe (1 felie ~130g)', categorie: 'gustare', calorii: 380, proteine: 7, carbohidrati: 36, grasimi: 23, gramajDefault: 130, icon: '🍰' },
  { id: 'placinta-mere', nume: 'Plăcintă de casă cu mere (~120g)', categorie: 'gustare', calorii: 280, proteine: 3, carbohidrati: 42, grasimi: 11, gramajDefault: 120, icon: '🥧' },
  { id: 'pufuleti-sare', nume: 'Pufuleți cu sare (1 pungă ~45g)', categorie: 'gustare', calorii: 210, proteine: 3, carbohidrati: 28, grasimi: 9, gramajDefault: 45, icon: '🍿' },
  { id: 'chipsuri-cartofi', nume: 'Chipsuri de cartofi Lays / Chio (~50g)', categorie: 'gustare', calorii: 265, proteine: 3, carbohidrati: 26, grasimi: 17, gramajDefault: 50, icon: '🥔' },
  { id: 'popcorn-sarat', nume: 'Popcorn sărat la microunde (~50g)', categorie: 'gustare', calorii: 240, proteine: 5, carbohidrati: 31, grasimi: 11, gramajDefault: 50, icon: '🍿' },

  // ==========================================
  // BĂUTURI (15+ preparate)
  // ==========================================
  { id: 'apa-plata', nume: 'Apă plată / minerală (~250ml)', categorie: 'bautura', calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, gramajDefault: 250, icon: '💧' },
  { id: 'cafea-neagra', nume: 'Cafea espresso / neagră (~150ml)', categorie: 'bautura', calorii: 2, proteine: 0.1, carbohidrati: 0, grasimi: 0, gramajDefault: 150, icon: '☕' },
  { id: 'cappuccino-lapte', nume: 'Cappuccino / Flat White cu lapte (~200ml)', categorie: 'bautura', calorii: 90, proteine: 5, carbohidrati: 9, grasimi: 4, gramajDefault: 200, icon: '☕' },
  { id: 'latte-machiatto', nume: 'Caffè Latte / Latte Macchiato (~250ml)', categorie: 'bautura', calorii: 140, proteine: 7, carbohidrati: 14, grasimi: 6, gramajDefault: 250, icon: '☕' },
  { id: 'ceai-verde-negru', nume: 'Ceai verde / negru / plante (~250ml)', categorie: 'bautura', calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, gramajDefault: 250, icon: '🍵' },
  { id: 'limonada-miere', nume: 'Limonadă proaspătă cu miere / mentă (~300ml)', categorie: 'bautura', calorii: 95, proteine: 0.3, carbohidrati: 24, grasimi: 0.1, gramajDefault: 300, icon: '🍋' },
  { id: 'suc-portocale-fresh', nume: 'Fresh de portocale stoarse (~250ml)', categorie: 'bautura', calorii: 110, proteine: 1.5, carbohidrati: 26, grasimi: 0.5, gramajDefault: 250, icon: '🧃' },
  { id: 'suc-mere-natural', nume: 'Suc de mere 100% natural (~250ml)', categorie: 'bautura', calorii: 115, proteine: 0.3, carbohidrati: 28, grasimi: 0.2, gramajDefault: 250, icon: '🧃' },
  { id: 'cola-pepsi-clasic', nume: 'Coca-Cola / Pepsi Clasic (1 doză ~330ml)', categorie: 'bautura', calorii: 140, proteine: 0, carbohidrati: 35, grasimi: 0, gramajDefault: 330, icon: '🥤' },
  { id: 'cola-zero-sugar', nume: 'Coca-Cola Zero / Pepsi Max (1 doză ~330ml)', categorie: 'bautura', calorii: 1, proteine: 0, carbohidrati: 0, grasimi: 0, gramajDefault: 330, icon: '🥤' },
  { id: 'bere-blonda', nume: 'Bere blondă (1 sticlă/doză ~500ml)', categorie: 'bautura', calorii: 215, proteine: 2.5, carbohidrati: 18, grasimi: 0, gramajDefault: 500, icon: '🍺' },
  { id: 'vin-rosu-sec', nume: 'Vin roșu sec / alb sec (1 pahar ~150ml)', categorie: 'bautura', calorii: 125, proteine: 0.2, carbohidrati: 3, grasimi: 0, gramajDefault: 150, icon: '🍷' },
  { id: 'cocktail-aperol', nume: 'Aperol Spritz / Cocktail (~200ml)', categorie: 'bautura', calorii: 160, proteine: 0, carbohidrati: 18, grasimi: 0, gramajDefault: 200, icon: '🍹' },
  { id: 'lapte-15', nume: 'Lapte de vacă 1.5% grăsime (~250ml)', categorie: 'bautura', calorii: 115, proteine: 8.5, carbohidrati: 12, grasimi: 3.7, gramajDefault: 250, icon: '🥛' },
  { id: 'lapte-migdale', nume: 'Lapte de migdale / ovăz (fără zahăr ~250ml)', categorie: 'bautura', calorii: 45, proteine: 1, carbohidrati: 2, grasimi: 3.5, gramajDefault: 250, icon: '🥛' },

  // ==========================================
  // EXTINDERE MASIVĂ - PREPARATE TRADIȚIONALE ROMÂNEȘTI & INTERNAȚIONALE (100+ preparate)
  // ==========================================
  // Mic Dejun & Panificație
  { id: 'corn-ciocolata', nume: 'Corn cu ciocolată / 7Days (1 buc ~80g)', categorie: 'mic-dejun', calorii: 360, proteine: 5, carbohidrati: 42, grasimi: 20, gramajDefault: 80, icon: '🥐' },
  { id: 'gogosa-pudrata', nume: 'Gogoașă simplă / pudrată (1 buc ~70g)', categorie: 'mic-dejun', calorii: 270, proteine: 4, carbohidrati: 34, grasimi: 13, gramajDefault: 70, icon: '🍩' },
  { id: 'sandwich-salam-cascaval', nume: 'Sandwich cu salam și cașcaval (~180g)', categorie: 'mic-dejun', calorii: 480, proteine: 18, carbohidrati: 40, grasimi: 28, gramajDefault: 180, icon: '🥪' },
  { id: 'branza-vaci-degresata', nume: 'Brânză proaspătă de vaci degresată (~150g)', categorie: 'mic-dejun', calorii: 135, proteine: 24, carbohidrati: 4, grasimi: 1.5, gramajDefault: 150, icon: '🧀' },
  { id: 'cascaval-pane', nume: 'Cașcaval pane la tigaie (1 buc ~120g)', categorie: 'pranz', calorii: 390, proteine: 18, carbohidrati: 15, grasimi: 29, gramajDefault: 120, icon: '🧀' },
  { id: 'zacusca-vinete', nume: 'Zacuscă de vinete de casă (2 linguri ~100g)', categorie: 'mic-dejun', calorii: 140, proteine: 2, carbohidrati: 12, grasimi: 10, gramajDefault: 100, icon: '🍆' },
  { id: 'fasole-batuta', nume: 'Fasole bătută cu ceapă călită (~150g)', categorie: 'mic-dejun', calorii: 260, proteine: 12, carbohidrati: 36, grasimi: 8, gramajDefault: 150, icon: '🧆' },
  { id: 'salata-de-vinete', nume: 'Salată de vinete cu ceapă și ulei (~150g)', categorie: 'mic-dejun', calorii: 180, proteine: 2, carbohidrati: 8, grasimi: 16, gramajDefault: 150, icon: '🍆' },
  { id: 'omleta-taraneasca', nume: 'Omletă țărănească cu cârnați și brânză (~200g)', categorie: 'mic-dejun', calorii: 420, proteine: 24, carbohidrati: 4, grasimi: 34, gramajDefault: 200, icon: '🍳' },
  { id: 'ou-ochi-moale', nume: 'Ou ochi prăjit în ulei (1 buc ~60g)', categorie: 'mic-dejun', calorii: 110, proteine: 6.5, carbohidrati: 0.5, grasimi: 9, gramajDefault: 60, icon: '🍳' },

  // Ciorbe, Supe & Felul 1
  { id: 'ciorba-de-fasole-afumatura', nume: 'Ciorbă de fasole cu afumătură (~350g)', categorie: 'pranz', calorii: 340, proteine: 18, carbohidrati: 32, grasimi: 16, gramajDefault: 350, icon: '🍲' },
  { id: 'ciorba-gulas-vita', nume: 'Gulaș unguresc de vită și cartofi (~350g)', categorie: 'pranz', calorii: 390, proteine: 24, carbohidrati: 28, grasimi: 20, gramajDefault: 350, icon: '🍲' },
  { id: 'supa-crema-rosii', nume: 'Supă cremă de roșii cu crutoane (~300g)', categorie: 'pranz', calorii: 210, proteine: 5, carbohidrati: 28, grasimi: 9, gramajDefault: 300, icon: '🍅' },
  { id: 'supa-crema-ciuperci', nume: 'Supă cremă de ciuperci (~300g)', categorie: 'pranz', calorii: 230, proteine: 6, carbohidrati: 20, grasimi: 14, gramajDefault: 300, icon: '🍄' },
  { id: 'ciorba-de-legume-post', nume: 'Ciorbă țărănească de legume (post ~350g)', categorie: 'pranz', calorii: 140, proteine: 4, carbohidrati: 24, grasimi: 3, gramajDefault: 350, icon: '🥕' },
  { id: 'ciorba-de-pui-a-la-grec', nume: 'Ciorbă de pui à la grec cu lămâie (~350g)', categorie: 'pranz', calorii: 310, proteine: 20, carbohidrati: 14, grasimi: 19, gramajDefault: 350, icon: '🍲' },
  { id: 'supa-crema-dovleac', nume: 'Supă cremă de dovleac și smântână (~300g)', categorie: 'pranz', calorii: 190, proteine: 4, carbohidrati: 26, grasimi: 8, gramajDefault: 300, icon: '🎃' },

  // Felul 2, Grătar & Mâncăruri Gătite
  { id: 'tochitura-moldoveneasca', nume: 'Tochitură moldovenească cu mămăligă (~350g)', categorie: 'pranz', calorii: 680, proteine: 42, carbohidrati: 35, grasimi: 42, gramajDefault: 350, icon: '🥩' },
  { id: 'ardei-umplut-porc', nume: 'Ardei umpluți cu carne și orez (2 buc ~300g)', categorie: 'pranz', calorii: 440, proteine: 22, carbohidrati: 34, grasimi: 24, gramajDefault: 300, icon: '🫑' },
  { id: 'varza-a-la-cluj', nume: 'Varză à la Cluj cu smântână (~300g)', categorie: 'pranz', calorii: 510, proteine: 26, carbohidrati: 22, grasimi: 36, gramajDefault: 300, icon: '🥬' },
  { id: 'muschi-vita-gratar-180g', nume: 'Mușchi de vită la grătar (~180g)', categorie: 'cina', calorii: 340, proteine: 46, carbohidrati: 0, grasimi: 16, gramajDefault: 180, icon: '🥩' },
  { id: 'costite-porc-bbq', nume: 'Coaste de porc BBQ la cuptor (~300g)', categorie: 'pranz', calorii: 780, proteine: 48, carbohidrati: 18, grasimi: 58, gramajDefault: 300, icon: '🍖' },
  { id: 'frigarui-pui-legume', nume: 'Frigărui de pui cu legume la grătar (~200g)', categorie: 'cina', calorii: 280, proteine: 36, carbohidrati: 8, grasimi: 11, gramajDefault: 200, icon: '🍢' },
  { id: 'snitel-porc', nume: 'Șnițel de porc pane (1 buc ~150g)', categorie: 'pranz', calorii: 420, proteine: 28, carbohidrati: 20, grasimi: 25, gramajDefault: 150, icon: '🥩' },
  { id: 'ostropel-pui-sos', nume: 'Ostropel de pui în sos de roșii (~250g)', categorie: 'pranz', calorii: 360, proteine: 32, carbohidrati: 14, grasimi: 19, gramajDefault: 250, icon: '🍗' },
  { id: 'peste-crap-prajit', nume: 'Crap prăjit cu mămăligă și mujdei (~250g)', categorie: 'cina', calorii: 480, proteine: 32, carbohidrati: 30, grasimi: 25, gramajDefault: 250, icon: '🐟' },
  { id: 'creveți-tigaie-usturoi', nume: 'Creveți trași la tigaie cu unt și usturoi (~150g)', categorie: 'cina', calorii: 240, proteine: 28, carbohidrati: 2, grasimi: 13, gramajDefault: 150, icon: '🍤' },
  { id: 'calamari-pane', nume: 'Inele de calamar pane (~150g)', categorie: 'cina', calorii: 310, proteine: 18, carbohidrati: 22, grasimi: 16, gramajDefault: 150, icon: '🦑' },

  // Garnituri & Salate diverse
  { id: 'cartofi-natur-patrunjel', nume: 'Cartofi natur fierți cu unt și pătrunjel (~200g)', categorie: 'pranz', calorii: 210, proteine: 4, carbohidrati: 38, grasimi: 5, gramajDefault: 200, icon: '🥔' },
  { id: 'legume-gratar', nume: 'Legume asortate la grătar (dovlecel, ardei ~200g)', categorie: 'cina', calorii: 110, proteine: 3, carbohidrati: 16, grasimi: 4, gramajDefault: 200, icon: '🍆' },
  { id: 'brocoli-sote', nume: 'Broccoli sote cu usturoi (~150g)', categorie: 'cina', calorii: 85, proteine: 4, carbohidrati: 8, grasimi: 4, gramajDefault: 150, icon: '🥦' },
  { id: 'fasole-verde-tigaie-150g', nume: 'Fasole verde trasă la tigaie (~150g)', categorie: 'cina', calorii: 95, proteine: 3, carbohidrati: 10, grasimi: 5, gramajDefault: 150, icon: '🫛' },
  { id: 'salata-varza-alba', nume: 'Salată de varză albă cu ulei și oțet (~150g)', categorie: 'pranz', calorii: 80, proteine: 1.5, carbohidrati: 8, grasimi: 5, gramajDefault: 150, icon: '🥗' },
  { id: 'salata-rosii-castraveti', nume: 'Salată de roșii și castraveți cu telemea (~200g)', categorie: 'cina', calorii: 150, proteine: 6, carbohidrati: 10, grasimi: 9, gramajDefault: 200, icon: '🍅' },
  { id: 'pilaf-orez-legume', nume: 'Pilaf de orez cu legume (~200g)', categorie: 'pranz', calorii: 240, proteine: 5, carbohidrati: 48, grasimi: 3, gramajDefault: 200, icon: '🍚' },
  { id: 'mamaliga-simpla', nume: 'Mămăligă caldă simplă (~200g)', categorie: 'pranz', calorii: 180, proteine: 4, carbohidrati: 38, grasimi: 1, gramajDefault: 200, icon: '🌽' },

  // Fast-Food, Pizza & Internațional
  { id: 'pizza-margherita-felie-italiana', nume: 'Pizza Margherita (1 felie ~120g)', categorie: 'pranz', calorii: 270, proteine: 11, carbohidrati: 32, grasimi: 11, gramajDefault: 120, icon: '🍕' },
  { id: 'pizza-diavola-felie-picanta', nume: 'Pizza Diavola / Salam picant (1 felie ~130g)', categorie: 'pranz', calorii: 340, proteine: 14, carbohidrati: 30, grasimi: 18, gramajDefault: 130, icon: '🍕' },
  { id: 'pizza-quattro-stagioni', nume: 'Pizza Quattro Stagioni (1 felie ~135g)', categorie: 'pranz', calorii: 330, proteine: 13, carbohidrati: 31, grasimi: 16, gramajDefault: 135, icon: '🍕' },
  { id: 'hot-dog-clasic', nume: 'Hot Dog cu muștar și ketchup (1 buc ~150g)', categorie: 'gustare', calorii: 340, proteine: 11, carbohidrati: 28, grasimi: 20, gramajDefault: 150, icon: '🌭' },
  { id: 'falafel-lipie-hummus', nume: 'Falafel în lipie cu hummus și salată (~300g)', categorie: 'pranz', calorii: 520, proteine: 18, carbohidrati: 64, grasimi: 22, gramajDefault: 300, icon: '🧆' },
  { id: 'hummus-ulei-masline', nume: 'Hummus de năut cu ulei de măsline (~100g)', categorie: 'gustare', calorii: 230, proteine: 7, carbohidrati: 16, grasimi: 15, gramajDefault: 100, icon: '🥣' },
  { id: 'burrito-pui-orez', nume: 'Burrito mexican cu pui, fasole și orez (~350g)', categorie: 'pranz', calorii: 640, proteine: 34, carbohidrati: 68, grasimi: 25, gramajDefault: 350, icon: '🌯' },
  { id: 'quesadilla-pui-branza', nume: 'Quesadilla cu pui și cheddar (1 porție ~250g)', categorie: 'cina', calorii: 540, proteine: 32, carbohidrati: 38, grasimi: 28, gramajDefault: 250, icon: '🌮' },
  { id: 'noodles-pui-legume', nume: 'Taitei chinezești Chow Mein cu pui (~300g)', categorie: 'pranz', calorii: 490, proteine: 24, carbohidrati: 62, grasimi: 16, gramajDefault: 300, icon: '🍜' },

  // Gustări, Fructe, Nuci & Dulciuri
  { id: 'mar-mediu', nume: 'Măr proaspăt (1 buc medie ~150g)', categorie: 'gustare', calorii: 80, proteine: 0.5, carbohidrati: 20, grasimi: 0.2, gramajDefault: 150, icon: '🍎' },
  { id: 'banana-medie', nume: 'Banană (1 buc medie ~120g)', categorie: 'gustare', calorii: 105, proteine: 1.3, carbohidrati: 27, grasimi: 0.3, gramajDefault: 120, icon: '🍌' },
  { id: 'portocala-medie', nume: 'Portocală proaspătă (1 buc ~150g)', categorie: 'gustare', calorii: 70, proteine: 1.4, carbohidrati: 17, grasimi: 0.2, gramajDefault: 150, icon: '🍊' },
  { id: 'struguri-albi', nume: 'Struguri albi/negri (~150g)', categorie: 'gustare', calorii: 105, proteine: 1, carbohidrati: 27, grasimi: 0.3, gramajDefault: 150, icon: '🍇' },
  { id: 'capsuni-proaspete', nume: 'Căpșuni proaspete (~150g)', categorie: 'gustare', calorii: 50, proteine: 1, carbohidrati: 11, grasimi: 0.4, gramajDefault: 150, icon: '🍓' },
  { id: 'pepene-rosu', nume: 'Pepene roșu (o felie ~300g)', categorie: 'gustare', calorii: 90, proteine: 1.8, carbohidrati: 22, grasimi: 0.4, gramajDefault: 300, icon: '🍉' },
  { id: 'nuci-romanesti-crude', nume: 'Nuci românești crude (1 pumn ~30g)', categorie: 'gustare', calorii: 195, proteine: 4.5, carbohidrati: 4, grasimi: 19, gramajDefault: 30, icon: '🌰' },
  { id: 'alune-padure-coapte', nume: 'Alune de pădure coapte (~30g)', categorie: 'gustare', calorii: 185, proteine: 4, carbohidrati: 5, grasimi: 18, gramajDefault: 30, icon: '🌰' },
  { id: 'caju-crud', nume: 'Caju crud / prăjit (~30g)', categorie: 'gustare', calorii: 165, proteine: 5, carbohidrati: 9, grasimi: 13, gramajDefault: 30, icon: '🥜' },
  { id: 'arahide-sarate', nume: 'Arahide sărate / prăjite (1 pumn ~40g)', categorie: 'gustare', calorii: 240, proteine: 10, carbohidrati: 6, grasimi: 20, gramajDefault: 40, icon: '🥜' },
  { id: 'seminte-floarea-soarelui', nume: 'Semințe de floarea-soarelui decojite (~30g)', categorie: 'gustare', calorii: 175, proteine: 6, carbohidrati: 6, grasimi: 15, gramajDefault: 30, icon: '🌻' },
  { id: 'cornulete-rahat', nume: 'Cornulețe de casă cu rahat / magiun (3 buc ~60g)', categorie: 'gustare', calorii: 280, proteine: 3, carbohidrati: 36, grasimi: 14, gramajDefault: 60, icon: '🥐' },
  { id: 'ecler-ciocolata', nume: 'Ecler cu cremă de vanilie și ciocolată (1 buc ~100g)', categorie: 'gustare', calorii: 310, proteine: 5, carbohidrati: 34, grasimi: 17, gramajDefault: 100, icon: '🍰' },
  { id: 'clatite-fineti-1buc', nume: 'Clătită cu Fineti / Nutella (1 buc ~80g)', categorie: 'gustare', calorii: 240, proteine: 4, carbohidrati: 28, grasimi: 12, gramajDefault: 80, icon: '🥞' },
  { id: 'clatite-gem-1buc', nume: 'Clătită cu gem / dulceață (1 buc ~80g)', categorie: 'gustare', calorii: 190, proteine: 3.5, carbohidrati: 36, grasimi: 3.5, gramajDefault: 80, icon: '🥞' },
  { id: 'biscuiti-digestivi', nume: 'Biscuiți digestivi / cereale (3 buc ~45g)', categorie: 'gustare', calorii: 210, proteine: 3.5, carbohidrati: 29, grasimi: 9, gramajDefault: 45, icon: '🍪' },
  { id: 'croissant-francez-unt', nume: 'Croissant francez cu unt (1 buc ~60g)', categorie: 'mic-dejun', calorii: 245, proteine: 5, carbohidrati: 26, grasimi: 14, gramajDefault: 60, icon: '🥐' },
  { id: 'kefir-sana', nume: 'Kefir / Sana / Lapte bătut (~250ml)', categorie: 'gustare', calorii: 140, proteine: 8, carbohidrati: 10, grasimi: 7.5, gramajDefault: 250, icon: '🥛' },

  // Băuturi suplimentare
  { id: 'frappe-vanilie', nume: 'Frappé cu înghețată și lapte (~300ml)', categorie: 'bautura', calorii: 220, proteine: 4, carbohidrati: 32, grasimi: 8, gramajDefault: 300, icon: '🧋' },
  { id: 'matcha-latte', nume: 'Matcha Latte cu lapte (~250ml)', categorie: 'bautura', calorii: 120, proteine: 6, carbohidrati: 12, grasimi: 5, gramajDefault: 250, icon: '🍵' },
  { id: 'energizant-doza', nume: 'Red Bull / Monster (1 doză ~250ml)', categorie: 'bautura', calorii: 115, proteine: 0, carbohidrati: 28, grasimi: 0, gramajDefault: 250, icon: '⚡' },
  { id: 'energizant-zero', nume: 'Energizant Zero Zahăr (1 doză ~250ml)', categorie: 'bautura', calorii: 3, proteine: 0, carbohidrati: 0, grasimi: 0, gramajDefault: 250, icon: '⚡' },
  { id: 'cidru-mere', nume: 'Cidru de mere (1 sticlă ~330ml)', categorie: 'bautura', calorii: 180, proteine: 0, carbohidrati: 24, grasimi: 0, gramajDefault: 330, icon: '🍏' },
];

export const categories = [
  { id: 'fructe', name: 'Fructe', icon: '🍎' },
  { id: 'mic-dejun', name: 'Mic Dejun', icon: '🌅' },
  { id: 'pranz', name: 'Prânz', icon: '☀️' },
  { id: 'cina', name: 'Cină', icon: '🌙' },
  { id: 'gustare', name: 'Gustări', icon: '🍿' },
  { id: 'bautura', name: 'Băuturi', icon: '🥤' },
];

