import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { AddMealBottomSheet } from '../components/AddMealBottomSheet';

/**
 * P1-01 (remediere finală, Blocant B) — salvarea manuală, la nivel de COMPONENTĂ.
 *
 * ==========================================================================
 * DEFECTUL
 * ==========================================================================
 * ORICE eroare de insert — inclusiv `23505` — cădea în ramura generică offline
 * și afișa „Salvat offline", fără să verifice dacă rândul deja persistat sub
 * aceeași identitate este chiar masa curentă. Sub o identitate refolosită, asta
 * confirma utilizatorului o salvare care nu s-a întâmplat.
 *
 * Testele montează componenta REALĂ și verifică ce se întâmplă efectiv:
 * ce ajunge în coada offline și ce i se spune utilizatorului.
 */

const UTILIZATOR = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

let mockRandPersistat: Record<string, unknown> | null = null;
// Când e activ, rândul „persistat" este EXACT payload-ul trimis de componentă —
// singurul mod de a exercita cu adevărat ramura `reluare_confirmata`.
let mockEcouInsert = false;
let mockEroareInsert: unknown = null;
const mockCoada: unknown[] = [];
const mockInserturi: unknown[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      insert: (p: unknown) => ({
        select: async () => { mockInserturi.push(p); return { data: null, error: mockEroareInsert }; },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mockEcouInsert
              ? ((mockInserturi[0] as Record<string, unknown>) ?? null)
              : mockRandPersistat,
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
  useTheme: () => ({
    colors: new Proxy({}, { get: (_t, prop) => (prop === 'accentGradient' ? ['#1', '#2'] : '#fff') }),
  }),
}));
jest.mock('../context/GamificareContext', () => ({
  useGamificareActions: () => ({ adaugaProgres: jest.fn() }),
}));
jest.mock('../hooks/useFavorite', () => ({
  useFavorite: () => ({
    favorite: [], addFavorite: jest.fn(), removeFavorite: jest.fn(), isFavorite: () => false,
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cheie: string) => cheie }),
}));
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
    MealSaveSuccessModal: ({ visible, data }: { visible?: boolean; data?: { isOffline?: boolean } }) =>
      (visible ? R.createElement(Text, null, data?.isOffline ? 'MODAL_OFFLINE' : 'MODAL_SUCCES') : null),
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const R = require('react');
  const Sheet = R.forwardRef((props: any, ref: any) => {
    const children = props.children;
    R.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn(), close: jest.fn(), expand: jest.fn() }));
    return R.createElement(View, null, typeof children === 'function' ? children() : children);
  });
  return {
    __esModule: true,
    default: Sheet,
    BottomSheetView: ({ children }: any) => R.createElement(View, null, children),
    BottomSheetScrollView: ({ children }: any) => R.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: require('react-native').TextInput,
  };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const NUTRITIE = { calorii: 500, proteine: 40, carbohidrati: 30, grasimi: 20 };

async function monteazaSiSalveaza() {
  const ref = React.createRef<never>();
  const utile = await render(<AddMealBottomSheet ref={ref} />);
  await act(async () => {
    (ref.current as unknown as { openWithItem: (i: unknown) => void })
      .openWithItem({ nume: 'Pui cu orez', ...NUTRITIE, gramajDefault: 100 });
  });
  const buton = utile.getByLabelText('jurnal.addMeal');
  await act(async () => { fireEvent.press(buton); });
  return utile;
}

beforeEach(() => {
  mockCoada.length = 0;
  mockInserturi.length = 0;
  mockRandPersistat = null;
  mockEcouInsert = false;
  mockEroareInsert = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('P1-01 — AddMealBottomSheet: 23505 nu mai cade în ramura offline', () => {
  test('1. CONFLICT: rândul persistat are alt conținut → fără „Salvat offline", fără coadă', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key value violates unique constraint' };
    // Rândul din bază este ALTĂ masă decât cea trimisă acum.
    mockRandPersistat = {
      id: 'x', nume: 'Mic dejun vechi', tip_masa: 'mic_dejun',
      calorii: 500, proteine: 40, grasimi: 20, carbohidrati: 30, fibre: 0,
    };

    const { queryByText } = await monteazaSiSalveaza();

    // Salvarea chiar a rulat (altfel testul ar trece vacuu).
    expect(mockInserturi.length).toBeGreaterThan(0);
    // Nimic nu a fost pus în coadă ca salvare reușită.
    expect(mockCoada).toHaveLength(0);
    // Niciun modal de succes ȘI niciun „Salvat offline".
    expect(queryByText('MODAL_SUCCES')).toBeNull();
    expect(queryByText('MODAL_OFFLINE')).toBeNull();
    // Conflictul este raportat explicit.
    expect(Alert.alert).toHaveBeenCalled();
  });

  test('2. RELUARE CONFIRMATĂ: rândul persistat corespunde → succes, fără intrare în coadă', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key value violates unique constraint' };
    // Rândul deja persistat ESTE exact această masă (reluare autentică).
    mockEcouInsert = true;

    const { queryByText } = await monteazaSiSalveaza();

    expect(mockInserturi.length).toBeGreaterThan(0);
    // Esențial: o reluare confirmată NU adaugă un duplicat în coadă…
    expect(mockCoada).toHaveLength(0);
    // …și NU raportează conflict sau eroare — este o reluare validă.
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(queryByText('MODAL_SUCCES')).not.toBeNull();
  });

  test('3. VERIFICARE EȘUATĂ: rândul nu poate fi citit → nu se pretinde salvare', async () => {
    mockEroareInsert = { code: '23505', message: 'duplicate key' };
    mockRandPersistat = null; // rândul lipsește → stare necunoscută

    const { queryByText } = await monteazaSiSalveaza();

    expect(mockInserturi.length).toBeGreaterThan(0);
    expect(mockCoada).toHaveLength(0);
    expect(queryByText('MODAL_SUCCES')).toBeNull();
    expect(queryByText('MODAL_OFFLINE')).toBeNull();
    expect(Alert.alert).toHaveBeenCalled();
  });

  test('4. eroare de TRANSPORT (non-23505) urmează ramura generică offline, ca înainte', async () => {
    mockEroareInsert = new Error('Network request failed');

    await monteazaSiSalveaza();

    // Comportamentul existent nu a fost schimbat pentru erorile de rețea.
    expect(mockCoada).toHaveLength(1);
  });
});
