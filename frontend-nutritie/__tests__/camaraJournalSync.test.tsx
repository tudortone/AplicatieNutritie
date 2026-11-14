import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockCamaraInsert = jest.fn(async () => ({ error: null }));
const mockMeseInsert = jest.fn((_p: unknown) => ({
  select: async () => ({ data: [{ id: 'masa-saved-1' }], error: null }),
}));
let mockMeseInsertShouldFail = false;

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'produse_camara') {
        return {
          insert: mockCamaraInsert,
        };
      }
      return {
        insert: (p: unknown) => ({
          select: async () =>
            mockMeseInsertShouldFail
              ? { data: null, error: { message: 'Network request failed' } }
              : mockMeseInsert(p).select(),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    }),
  },
}));

const mockPushOffline = jest.fn(async (_payload: unknown) => ({
  persistat: true,
  lungime: 1,
  duplicat: false,
}));

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMealVerificat: (payload: unknown) => mockPushOffline(payload),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-pantry-1' },
    session: { user: { id: 'user-pantry-1' } },
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_t, prop) => (prop === 'accentGradient' ? ['#CCFF00', '#A3E635'] : '#FFFFFF') }),
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 's', Error: 'e' },
  ImpactFeedbackStyle: { Light: 'l' },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../components/food/ProductSearch', () => ({ ProductSearch: () => null }));

jest.mock('../components/ui/MealSaveSuccessModal', () => ({
  MealSaveSuccessModal: () => null,
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const { View, TextInput } = require('react-native');
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
    BottomSheetScrollView: R.forwardRef((props: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ scrollTo: jest.fn() }));
      return R.createElement(View, props, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: TextInput,
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { AddMealBottomSheet, type AddMealBottomSheetRef } from '../components/AddMealBottomSheet';
import { ManualProductForm } from '../components/food/ManualProductForm';

describe('Cămară ↔ Jurnal Sync & Duplicate Guard', () => {
  beforeEach(() => {
    mockMeseInsertShouldFail = false;
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('AddMealBottomSheet pasează gramajul + id la onPantryUsed (online și offline) și resetează ref-ul pe open()', async () => {
    const onPantryUsed = jest.fn();
    const ref = React.createRef<AddMealBottomSheetRef>();
    const screen = await render(<AddMealBottomSheet ref={ref} onPantryUsed={onPantryUsed} />);

    // 1. Masă din cămară (150g din Piept de pui cu id p-1) — salvare online
    await act(async () => {
      ref.current?.openWithItem({
        nume: 'Piept de pui',
        calorii: 165,
        proteine: 31,
        carbohidrati: 0,
        grasimi: 3.6,
        gramajDefault: 150,
        pantryProductName: 'Piept de pui',
        pantryProductId: 'p-1',
      });
    });

    await fireEvent.press(screen.getByLabelText('jurnal.addMeal'));

    expect(onPantryUsed).toHaveBeenCalledTimes(1);
    expect(onPantryUsed).toHaveBeenCalledWith('Piept de pui', 150, 'p-1');

    // 2. Redeschidere cu open() simplu + masă non-cămară => NU deduce din cămară
    onPantryUsed.mockClear();
    await act(async () => {
      ref.current?.openWithItem({
        nume: 'Stale item',
        calorii: 100,
        proteine: 10,
        carbohidrati: 10,
        grasimi: 2,
        pantryProductName: 'Stale item',
        pantryProductId: 'stale-id',
      });
      ref.current?.open(null, 'pranz');
    });

    // Completăm minim nume + calorii pentru salvare validă
    await fireEvent.changeText(screen.getByPlaceholderText('jurnal.mealNamePlaceholder'), 'Omletă simplă');
    await fireEvent.changeText(screen.getByPlaceholderText('jurnal.caloriesPlaceholder'), '320');

    await fireEvent.press(screen.getByLabelText('jurnal.addMeal'));

    expect(onPantryUsed).not.toHaveBeenCalled();

    // 3. Masă din cămară salvată offline => apelează onPantryUsed după persistarea în coadă
    mockMeseInsertShouldFail = true;
    await act(async () => {
      ref.current?.openWithItem({
        nume: 'Brânză de vaci',
        calorii: 98,
        proteine: 18,
        carbohidrati: 3.5,
        grasimi: 1.2,
        gramajDefault: 200,
        pantryProductName: 'Brânză de vaci',
        pantryProductId: 'p-2',
      });
    });

    await fireEvent.press(screen.getByLabelText('jurnal.addMeal'));

    expect(mockPushOffline).toHaveBeenCalledTimes(1);
    expect(onPantryUsed).toHaveBeenCalledWith('Brânză de vaci', 200, 'p-2');
  });

  test('ManualProductForm cu skipRemoteCatalogInsert nu inserează rând duplicat în produse_camara', async () => {
    const onSave = jest.fn();
    const screen = await render(
      <ManualProductForm initialName="Iaurt grecesc 2%" skipRemoteCatalogInsert onSave={onSave} />
    );

    const saveBtn = screen.getByText('manualProduct.addToMeal');
    await fireEvent.press(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(mockCamaraInsert).not.toHaveBeenCalled();
  });
});
