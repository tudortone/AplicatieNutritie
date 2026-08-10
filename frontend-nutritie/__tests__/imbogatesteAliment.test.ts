import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlimentDetaliat } from '../types';
import { normalizeazaNumeAliment } from '../lib/normalizareAliment';
import {
  cautaInTabel,
  escaladeazaPer100g,
  combinaProfil,
  esteDejaImbogatit,
  imbogatesteAliment,
} from '../lib/imbogatesteAliment';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } },
}));

const per100gPieptPui: AlimentDetaliat = {
  nume: 'Piept de pui',
  grame: 100,
  calorii: 165,
  proteine: 31,
  carbohidrati: 0,
  grasimi: 3.6,
  fibre: 0,
  aminoacizi: { leucina: 2340, izoleucina: 1490, valina: 1610, lizina: 2740, triptofan: 370 },
  micronutrienti: { vitamina_b3: 12.6, potasiu: 256, fier: 1.0 },
};

const tabelTest: Record<string, AlimentDetaliat> = {
  [normalizeazaNumeAliment('piept de pui')]: per100gPieptPui,
  [normalizeazaNumeAliment('ou fiert')]: {
    nume: 'Ou fiert',
    grame: 100,
    calorii: 155,
    proteine: 12.6,
    carbohidrati: 1.1,
    grasimi: 10.6,
    fibre: 0,
  },
};

describe('cautaInTabel', () => {
  it('găsește după nume normalizat (diacritice tolerate)', () => {
    const rez = cautaInTabel('Piept de pui', tabelTest);
    expect(rez).toBe(per100gPieptPui);
  });

  it('găsește ignorând parantezele/modul de gătire', () => {
    const rez = cautaInTabel('Piept de pui (fiert)', tabelTest);
    expect(rez).toBe(per100gPieptPui);
  });

  it('nu găsește nume necunoscut', () => {
    expect(cautaInTabel('Ratatouille de legume', tabelTest)).toBeNull();
  });

  it('nu găsește input gol', () => {
    expect(cautaInTabel('', tabelTest)).toBeNull();
    expect(cautaInTabel('   ', tabelTest)).toBeNull();
  });
});

describe('cautaInTabel — tabelul real (lib/nutritieTabel)', () => {
  it('rezolvă nume canonice cu macro-uri', () => {
    const rez = cautaInTabel('Piept de pui');
    expect(rez).not.toBeNull();
    expect(rez?.calorii).toBeGreaterThan(0);
    expect(rez?.proteine).toBeGreaterThan(0);
  });

  it('rezolvă diacritice românești pe cheia generată', () => {
    expect(cautaInTabel('Brânză de vaci')).not.toBeNull();
    expect(cautaInTabel('Linte fiartă')).not.toBeNull();
    expect(cautaInTabel('Pâine integrală')).not.toBeNull();
  });
});

describe('escaladeazaPer100g', () => {
  it('scalează caloriile și macro-urile liniar pentru porția dată', () => {
    const la150g = escaladeazaPer100g(per100gPieptPui, 150);
    expect(la150g.calorii).toBe(247.5);
    expect(la150g.proteine).toBe(46.5);
    expect(la150g.grasimi).toBe(5.4);
  });

  it('hardcodează micro/amino fără scale (date per-100g greu de validat)', () => {
    const la150g = escaladeazaPer100g(per100gPieptPui, 150);
    expect(la150g.aminoacizi?.leucina).toBe(2340);
    expect(la150g.micronutrienti?.potasiu).toBe(256);
  });

  it('fără gramaj tratează profilul ca deja la nivel de porție', () => {
    const rez = escaladeazaPer100g(per100gPieptPui, undefined);
    expect(rez.calorii).toBe(165);
  });

  it('gramaj zero/negativ nu creează factor chimereic', () => {
    expect(escaladeazaPer100g(per100gPieptPui, 0).calorii).toBe(165);
    expect(escaladeazaPer100g(per100gPieptPui, -10).calorii).toBe(165);
  });
});

describe('combinaProfil', () => {
  it('păstrează macro-urile alimentului autoritare și adaugă doar ce lipsește', () => {
    const aliment: AlimentDetaliat = {
      nume: 'Piept la grătar',
      grame: 150,
      calorii: 300,
      proteine: 50,
      carbohidrati: 2,
      grasimi: 8,
    };
    const rez = combinaProfil(aliment, per100gPieptPui);
    expect(rez.calorii).toBe(300); // macro autoritar, NESCHIMBAT
    expect(rez.proteine).toBe(50);
    expect(rez.fibre).toBe(0);
    expect(rez.aminoacizi?.leucina).toBe(2340);
    expect(rez.micronutrienti?.potasiu).toBe(256);
    expect(rez.nume).toBe('Piept la grătar');
  });

  it('nu suprascrie fibrele existente cu cele din profil', () => {
    const aliment: AlimentDetaliat = {
      nume: 'Piept de pui',
      grame: 150,
      calorii: 300,
      proteine: 50,
      carbohidrati: 2,
      grasimi: 8,
      fibre: 7,
    };
    const rez = combinaProfil(aliment, per100gPieptPui);
    expect(rez.fibre).toBe(7);
  });

  it('păstrează aminoacizii/micronutrienții existenți ai alimentului', () => {
    const aliment: AlimentDetaliat = {
      nume: 'Piept de pui',
      grame: 100,
      calorii: 300,
      proteine: 50,
      carbohidrati: 2,
      grasimi: 8,
      aminoacizi: { leucina: 999 },
    };
    const rez = combinaProfil(aliment, per100gPieptPui);
    expect(rez.aminoacizi?.leucina).toBe(999);
    expect(rez.micronutrienti?.potasiu).toBe(256);
  });
});

describe('esteDejaImbogatit', () => {
  it('consideră îmbogățit un aliment cu aminoacizi sau micronutrienți', () => {
    expect(esteDejaImbogatit(per100gPieptPui)).toBe(true);
    expect(esteDejaImbogatit({ nume: 'a', calorii: 1, proteine: 1, carbohidrati: 1, grasimi: 1 })).toBe(false);
  });
});

describe('imbogatesteAliment', () => {
  it('returnează nemodificat un aliment deja îmbogățit (fără reach la cache/AI)', async () => {
    const rez = await imbogatesteAliment(per100gPieptPui, { online: false });
    expect(rez).toBe(per100gPieptPui);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('îmbogățește din tabelul static fără rețea', async () => {
    const aliment: AlimentDetaliat = {
      nume: 'Piept de pui',
      grame: 150,
      calorii: 260,
      proteine: 45,
      carbohidrati: 0,
      grasimi: 5,
    };
    const rez = await imbogatesteAliment(aliment, { online: false });
    expect(rez.calorii).toBe(260); // macro autoritar
    expect(rez.aminoacizi?.leucina).toBe(2340);
    expect(rez.fibre).toBe(0);
  });

  it('pe tabel/gol + offline cert returnează alimentul nemodificat', async () => {
    const aliment: AlimentDetaliat = {
      nume: 'Plăcintă cu brânză',
      grame: 200,
      calorii: 500,
      proteine: 10,
      carbohidrati: 60,
      grasimi: 20,
    };
    const rez = await imbogatesteAliment(aliment, { online: false });
    expect(rez).toBe(aliment);
  });

  it('nume gol nu întoarce erreura', async () => {
    const aliment: AlimentDetaliat = {
      nume: '',
      calorii: 0,
      proteine: 0,
      carbohidrati: 0,
      grasimi: 0,
    };
    const rez = await imbogatesteAliment(aliment, { online: false });
    expect(rez).toBe(aliment);
  });
});