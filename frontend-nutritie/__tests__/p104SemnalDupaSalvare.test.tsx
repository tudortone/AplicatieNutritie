import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { AddMealBottomSheet } from '../components/AddMealBottomSheet';
import { aboneazaLaModificariMese } from '../lib/freshnessMese';

/**
 * P1-04 — semnalul de prospețime se emite DOAR după persistare dovedită.
 *
 * Testul montează componenta REALĂ de salvare manuală (cea mai folosită cale) și
 * verifică, prin abonarea la canalul real de invalidare, cine îl declanșează:
 *
 *   succes server / reluare confirmată P1-01  → semnal (datele canonice s-au schimbat)
 *   conflict P1-01 / verificare eșuată        → FĂRĂ semnal
 *   doar pus în coada offline                 → FĂRĂ semnal (nu e dată canonică)
 *
 * Fără această distincție, Home ar reîncărca (sau, mai rău, ar părea proaspăt)
 * pentru salvări care nu există pe server.
 */

const UTILIZATOR = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

let mockRandPersistat: Record<string, unknown> | null = null;
let mockEcouInsert = false;
let mockEroareInsert: unknown = null;
const mockCoada: unknown[] = [];
const mockInserturi: unknown[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      insert: (p: unknown) => ({
        select: async () => { mockInserturi.push(p); return { data: mockEroareInsert ? null : [{ id: 'nou', ...(p as object) }], error: mockEroareInsert }; },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mockEcouInsert ? ((mockInserturi[0] as Record<string, unknown>) ?? null) : mockRandPersistat,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMealVerificat: jest.fn(async (payload: unknown) => {
    mockCoada.push(payload);
    return { persistat: true, lungime: mockCoada.length, duplicat: false };
  }),
}));

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: UTILIZATOR }) }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: (_t, p) => (p === 'accentGradient' ? ['#1', '#2'] : '#fff') }) }),
}));
jest.mock('../context/GamificareContext', () => ({ useGamificareActions: () => ({ adaugaProgres: jest.fn() }) }));
jest.mock('../hooks/useFavorite', () => ({
  useFavorite: () => ({ favorite: [], addFavorite: jest.fn(), removeFavorite: jest.fn(), isFavorite: () => false }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(), impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 's', Error: 'e' }, ImpactFeedbackStyle: { Light: 'l' },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('./../components/food/ProductSearch', () => ({ ProductSearch: () => null }));
jest.mock('./../components/ui/MealSaveSuccessModal', () => {
  const { Text } = require('react-native');
  const R = require('react');
  return {
    MealSaveSuccessModal: ({ visible }: { visible?: boolean }) =>
      (visible ? R.createElement(Text, null, 'MODAL') : null),
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const R = require('react');
  const Sheet = R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn(), close: jest.fn(), expand: jest.fn() }));
    return R.createElement(View, null, props.children);
  });
  return {
    __esModule: true, default: Sheet,
    BottomSheetView: ({ children }: any) => R.createElement(View, null, children),
    BottomSheetScrollView: ({ children }: any) => R.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: require('react-native').TextInput,
  };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const NUTRITIE = { calorii: 500, proteine: 40, carbohidrati: 30, grasimi: 20 };
let semnale: string[] = [];
let dezabonare: (() => void) | null = null;

async function salveaza() {
  const ref = React.createRef<never>();
  const utile = await render(<AddMealBottomSheet ref={ref} />);
  await act(async () => {
    (ref.current as unknown as { openWithItem: (i: unknown) => void })
      .openWithItem({ nume: 'Pui cu orez', ...NUTRITIE, gramajDefault: 100 });
  });
  await act(async () => { fireEvent.press(utile.getByLabelText('jurnal.addMeal')); });
  return utile;
}

beforeEach(() => {
  mockCoada.length = 0; mockInserturi.length = 0;
  mockRandPersistat = null; mockEcouInsert = false; mockEroareInsert = null;
  semnale = [];
  dezabonare = aboneazaLaModificariMese((u) => semnale.push(u));
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { dezabonare?.(); jest.restoreAllMocks(); });

describe('P1-04 — cine are voie să invalideze datele canonice', () => {
  test('1. salvare online reușită → exact UN semnal, pentru utilizatorul corect', async () => {
    await salveaza();

    expect(mockInserturi.length).toBeGreaterThan(0);
    expect(semnale).toEqual([UTILIZATOR.id]);
  });

  test('2. reluare confirmată P1-01 (23505 verificat) → semnal permis', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key' };
    mockEcouInsert = true; // rândul persistat este exact această masă

    await salveaza();

    expect(semnale).toEqual([UTILIZATOR.id]);
  });

  test('3. CONFLICT P1-01 → NICIUN semnal (nu s-a persistat masa noastră)', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key' };
    mockRandPersistat = {
      id: 'x', nume: 'Altceva', tip_masa: 'mic_dejun',
      calorii: 500, proteine: 40, grasimi: 20, carbohidrati: 30, fibre: 0,
    };

    await salveaza();

    expect(mockInserturi.length).toBeGreaterThan(0);
    expect(semnale).toHaveLength(0);
  });

  test('4. verificare eșuată P1-01 → NICIUN semnal', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key' };
    mockRandPersistat = null; // rândul nu poate fi citit

    await salveaza();

    expect(semnale).toHaveLength(0);
  });

  test('5. doar pus în coada offline → NICIUN semnal (nu este dată canonică)', async () => {
    mockEroareInsert = new Error('Network request failed');

    await salveaza();

    // Masa e în coadă, deci utilizatorul primește confirmarea offline (P1-02)…
    expect(mockCoada).toHaveLength(1);
    // …dar Home NU trebuie să reîncarce ca și cum ar exista un rând pe server.
    expect(semnale).toHaveLength(0);
  });

  test('6. o singură salvare logică produce o singură invalidare', async () => {
    await salveaza();
    expect(semnale).toHaveLength(1);
  });
});
