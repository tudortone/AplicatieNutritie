import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { AddMealBottomSheet } from '../components/AddMealBottomSheet';
import { localDayKey } from '../lib/dateUtils';
import { aboneazaLaModificariMese } from '../lib/freshnessMese';
import type { Masa } from '../types';

/**
 * P1-16 — Regression Test for Manual Add Food to Journal.
 *
 * Must prove the complete production path:
 * select food → choose meal category → save → canonical meal persisted → journal receives/displays row.
 *
 * Also proves:
 * - double tap → only one logical save
 * - P1-01 conflict → no false success
 * - offline durable queue → truthful offline state
 */

const TEST_USER = { id: 'usr-p116-test-1234-5678' };

let mockInsertedPayloads: Record<string, unknown>[] = [];
let mockInsertError: unknown = null;
let mockExistingRowInDb: Record<string, unknown> | null = null;
const mockOfflineQueue: unknown[] = [];
let mockLanguage = 'en';
let mockWindow = { width: 390, height: 844, scale: 1, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: any) => ({
        select: async () => {
          mockInsertedPayloads.push(payload);
          if (mockInsertError) {
            return { data: null, error: mockInsertError };
          }
          const createdRow = {
            id: payload.id || 'gen-uuid-1',
            ...payload,
            created_at: payload.created_at || new Date().toISOString(),
          };
          return { data: [createdRow], error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mockExistingRowInDb,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMealVerificat: jest.fn(async (payload: unknown) => {
    mockOfflineQueue.push(payload);
    return { persistat: true, lungime: mockOfflineQueue.length, duplicat: false };
  }),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: TEST_USER, session: { access_token: 'fake-token' } }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_t, p) => (p === 'accentGradient' ? ['#000', '#fff'] : '#111') }),
  }),
}));

jest.mock('../context/GamificareContext', () => ({
  useGamificareActions: () => ({ adaugaProgres: jest.fn() }),
}));

jest.mock('../hooks/useFavorite', () => ({
  useFavorite: () => ({
    favorite: [],
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    isFavorite: () => false,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: any) => {
      if (k === 'chat.mealCategory.pranz') return 'Lunch';
      if (k === 'chat.mealCategory.mic_dejun') return 'Breakfast';
      if (k === 'chat.mealCategory.cina') return 'Dinner';
      if (k === 'chat.mealCategory.gustare') return 'Snacks';
      if (k === 'jurnal.category') return 'Category';
      if (opts?.defaultValue) return opts.defaultValue;
      return k;
    },
    i18n: { language: mockLanguage, isInitialized: true },
  }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: 's', Error: 'e', Warning: 'w' },
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm' },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('./../components/food/ProductSearch', () => ({
  ProductSearch: () => null,
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const R = require('react');
  const Sheet = R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({
      snapToIndex: jest.fn(),
      close: jest.fn(),
      expand: jest.fn(),
    }));
    return R.createElement(View, null, typeof props.children === 'function' ? props.children() : props.children);
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

describe('P1-16 — Manual Add Food to Journal Regression Tests', () => {
  let freshnessSignals: string[] = [];
  let unsubscribeFreshness: (() => void) | null = null;

  beforeEach(() => {
    mockInsertedPayloads = [];
    mockInsertError = null;
    mockExistingRowInDb = null;
    mockOfflineQueue.length = 0;
    mockLanguage = 'en';
    mockWindow = { width: 390, height: 844, scale: 1, fontScale: 1 };
    freshnessSignals = [];
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    unsubscribeFreshness = aboneazaLaModificariMese((userId) => {
      freshnessSignals.push(userId);
    });
  });

  afterEach(() => {
    unsubscribeFreshness?.();
    jest.restoreAllMocks();
  });

  test('RED/GREEN: Select food → category → save → canonical meal persisted with date & displays in journal', async () => {
    const journalMeals: Masa[] = [];
    const onMasaCreata = jest.fn((masa: Masa) => {
      journalMeals.push(masa);
    });
    const onSuccess = jest.fn();

    const ref = React.createRef<any>();
    const utils = await render(
      <AddMealBottomSheet
        ref={ref}
        onMasaCreata={onMasaCreata}
        onSuccess={onSuccess}
      />
    );

    // 1. Open manual sheet with food item
    await act(async () => {
      ref.current.openWithItem({
        nume: 'Piept de pui la grătar',
        calorii: 165,
        proteine: 31,
        carbohidrati: 0,
        grasimi: 3.6,
        gramajDefault: 100,
      });
    });

    // 2. Select category: Prânz / Lunch
    const lunchChip = utils.getByLabelText(/jurnal\.mealCategory.*Lunch|Lunch/i);
    await act(async () => {
      fireEvent.press(lunchChip);
    });

    // 3. Tap Save Button
    const saveBtn = utils.getByLabelText('jurnal.addMeal');
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    // 4. Persistence assertions
    expect(mockInsertedPayloads.length).toBe(1);
    const persisted = mockInsertedPayloads[0];
    expect(persisted.nume).toBe('Piept de pui la grătar');
    expect(persisted.tip_masa).toBe('pranz');
    expect(persisted.user_id).toBe(TEST_USER.id);
    expect(persisted.calorii).toBe(165);
    expect(persisted.proteine).toBe(31);

    // Canonical date & time must be present on persisted record
    expect(persisted.data).toBe(localDayKey());
    expect(typeof persisted.ora).toBe('string');
    expect(persisted.ora).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    // 5. Journal integration: onMasaCreata must be called with the persisted row
    expect(onMasaCreata).toHaveBeenCalledTimes(1);
    expect(journalMeals.length).toBe(1);
    expect(journalMeals[0].nume).toBe('Piept de pui la grătar');
    expect(journalMeals[0].tip_masa).toBe('pranz');

    // 6. Freshness signal for Home totals
    expect(freshnessSignals).toContain(TEST_USER.id);
    expect(onSuccess).toHaveBeenCalled();
  });

  test.each([
    ['ro', 360, 640, 1, ['1/2 măr', '1 măr mic', '1 măr mediu', '1 măr mare']],
    ['en', 360, 800, 1.15, ['1/2 apple', '1 small apple', '1 medium apple', '1 large apple']],
    ['fr', 390, 844, 1.3, ['1/2 pomme', '1 petite pomme', '1 pomme moyenne', '1 grosse pomme']],
    ['de', 412, 915, 1.4, ['1/2 Apfel', '1 kleiner Apfel', '1 mittlerer Apfel', '1 großer Apfel']],
  ])('V7: actual preset quick portions are localized in %s at %ix%i / fontScale %s', async (language, width, height, fontScale, labels) => {
    mockLanguage = language;
    mockWindow = { width, height, scale: 1, fontScale };
    const ref = React.createRef<any>();
    const utils = await render(<AddMealBottomSheet ref={ref} />);

    await act(async () => {
      ref.current.open();
    });
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Category: Fructe'));
    });
    await act(async () => {
      fireEvent.press(utils.getByText(language === 'ro' ? 'Măr proaspăt' : 'Fresh Apple'));
    });

    for (const label of labels) {
      expect(utils.getByText(label)).toBeTruthy();
    }

    const container = utils.getByTestId('quick-portions-container');
    const flattened = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style.filter(Boolean))
      : container.props.style;
    expect(flattened).toEqual(expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap' }));
  });

  test('V7: selecting a real preset portion saves once into the canonical Journal contract', async () => {
    const journalMeals: Masa[] = [];
    const onMasaCreata = jest.fn((masa: Masa) => journalMeals.push(masa));
    const ref = React.createRef<any>();
    const utils = await render(<AddMealBottomSheet ref={ref} onMasaCreata={onMasaCreata} />);

    await act(async () => {
      ref.current.open();
    });
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Category: Fructe'));
    });
    await act(async () => {
      fireEvent.press(utils.getByText('Fresh Apple'));
    });
    await act(async () => {
      fireEvent.press(utils.getByText('1 large apple'));
      fireEvent.press(utils.getByLabelText(/jurnal\.mealCategory.*Lunch|Lunch/i));
    });

    await act(async () => {
      fireEvent.press(utils.getByLabelText('jurnal.addMeal'));
    });

    expect(mockInsertedPayloads).toHaveLength(1);
    expect((mockInsertedPayloads[0].alimente as Array<{ grame: number }>)[0].grame).toBe(200);
    expect(mockInsertedPayloads[0].calorii).toBe(104);
    expect(onMasaCreata).toHaveBeenCalledTimes(1);
    expect(journalMeals).toHaveLength(1);
    expect(freshnessSignals).toEqual([TEST_USER.id]);
  });

  test('Double-tap protection: only one logical save executes', async () => {
    const onMasaCreata = jest.fn();
    const ref = React.createRef<any>();
    const utils = await render(<AddMealBottomSheet ref={ref} onMasaCreata={onMasaCreata} />);

    await act(async () => {
      ref.current.openWithItem({
        nume: 'Orez fiert',
        calorii: 130,
        proteine: 2.7,
        carbohidrati: 28,
        grasimi: 0.3,
        gramajDefault: 100,
      });
    });

    const saveBtn = utils.getByLabelText('jurnal.addMeal');
    // Rapid double-tap
    await act(async () => {
      fireEvent.press(saveBtn);
      fireEvent.press(saveBtn);
    });

    expect(mockInsertedPayloads.length).toBe(1);
  });

  test('P1-01 Conflict (23505 with different content) does not report false success', async () => {
    mockInsertError = { code: '23505', message: 'duplicate key' };
    mockExistingRowInDb = {
      id: 'existing-id',
      nume: 'Complet alt aliment',
      tip_masa: 'mic_dejun',
      calorii: 999,
      proteine: 80,
      carbohidrati: 50,
      grasimi: 40,
    };

    const onMasaCreata = jest.fn();
    const onSuccess = jest.fn();
    const ref = React.createRef<any>();
    const utils = await render(<AddMealBottomSheet ref={ref} onMasaCreata={onMasaCreata} onSuccess={onSuccess} />);

    await act(async () => {
      ref.current.openWithItem({
        nume: 'Salata verde',
        calorii: 20,
        proteine: 1,
        carbohidrati: 3,
        grasimi: 0,
        gramajDefault: 100,
      });
    });

    const saveBtn = utils.getByLabelText('jurnal.addMeal');
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    // Must NOT call onMasaCreata or onSuccess
    expect(onMasaCreata).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(freshnessSignals.length).toBe(0);
  });

  test('Offline fallback enters durable queue with truthful offline state without false canonical freshness', async () => {
    mockInsertError = new Error('Network request failed');

    const onMasaCreata = jest.fn();
    const onSuccess = jest.fn();
    const ref = React.createRef<any>();
    const utils = await render(<AddMealBottomSheet ref={ref} onMasaCreata={onMasaCreata} onSuccess={onSuccess} />);

    await act(async () => {
      ref.current.openWithItem({
        nume: 'Măr roșu',
        calorii: 52,
        proteine: 0.3,
        carbohidrati: 14,
        grasimi: 0.2,
        gramajDefault: 100,
      });
    });

    const saveBtn = utils.getByLabelText('jurnal.addMeal');
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(mockOfflineQueue.length).toBe(1);
    expect((mockOfflineQueue[0] as Record<string, unknown>).ora).toEqual(expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/));
    expect((mockOfflineQueue[0] as Record<string, unknown>).created_at).toEqual(expect.any(String));
    expect(freshnessSignals.length).toBe(0); // offline meal is not canonical yet
  });
});
