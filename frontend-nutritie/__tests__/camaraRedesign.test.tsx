import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import {
  computeExpiryMeta,
  isLowStockItem,
  matchesPantryFilter,
  matchesPantryQuery,
  normalizePantryText,
  sortPantryItems,
} from '../components/camara/pantryUtils';
import type { ProdusCamara } from '../hooks/useCamara';

const mockStorage = new Map<string, string>();
let mockAuthUser: { id: string } | null = null;
const mockSupabaseUpdate = jest.fn(() => ({
  eq: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
}));
const mockSupabaseDelete = jest.fn(() => ({
  eq: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
}));
const mockSupabaseInsert = jest.fn(() => ({
  select: jest.fn(() => ({
    single: jest.fn(async () => ({ data: { id: 'db-cam-1' }, error: null })),
  })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockStorage.delete(k);
  }),
}));

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: mockAuthUser }, error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(async () => ({ data: [], error: null })),
        })),
      })),
      insert: mockSupabaseInsert,
      update: mockSupabaseUpdate,
      delete: mockSupabaseDelete,
    })),
  },
}));

jest.mock('../lib/pantryNotifications', () => ({
  checkAndSchedulePantryExpiryNotification: jest.fn(async () => undefined),
}));

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      const serialized = Object.entries(params)
        .filter(([k]) => k !== 'defaultValue')
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      return serialized ? `${key}:${serialized}` : key;
    },
    i18n: { language: 'ro' },
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      surface: '#11161A',
      surfaceElevated: '#181D22',
      surfaceBg: '#181D22',
      accent: '#CCFF00',
      accentSecondary: '#00E5FF',
      accentTertiary: '#38BDF8',
      gold: '#F59E0B',
      textOnAccent: '#090C0E',
      textOnAccentSecondary: '#090C0E',
      textOnDanger: '#FFFFFF',
      textPrimary: '#FFFFFF',
      textSecondary: '#94A3B8',
      textTertiary: '#64748B',
      danger: '#EF4444',
      warning: '#F59E0B',
      success: '#10B981',
      border: '#242A32',
      accentGradient: ['#CCFF00', '#A3E635'],
      accentSecondaryGradient: ['#00E5FF', '#38BDF8'],
      cardBorder: '#242A32',
      cardBg: '#12161B',
      muscleBase: '#1E293B',
      muscleOutline: '#334155',
      inputBg: '#14191F',
      inputBorder: '#2A313C',
      disabledBg: '#1E242B',
      disabledText: '#64748B',
      dangerBg: 'rgba(239,68,68,0.14)',
      dangerBorder: 'rgba(239,68,68,0.4)',
      shadow: '#000000',
      overlayLight: 'rgba(0,0,0,0.4)',
      overlayStrong: 'rgba(0,0,0,0.75)',
    },
  }),
}));

jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => ({ showBanner: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()],
}));

jest.mock('expo-blur', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return {
    BlurView: ({ children }: { children: React.ReactNode }) => ReactMock.createElement(MockView, null, children),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('../components/AddMealBottomSheet', () => ({
  AddMealBottomSheet: require('react').forwardRef(() => null),
}));

jest.mock('../components/food/ManualProductForm', () => ({
  ManualProductForm: () => null,
}));

import { useCamara } from '../hooks/useCamara';
import { PantryView } from '../components/camara/PantryView';
import ScannerBarcodeScreen from '../app/scanner-barcode';

function makeIsoOffset(daysOffset: number): string {
  return new Date(Date.now() + daysOffset * 86_400_000).toISOString().split('T')[0];
}

function makeItem(overrides: Partial<ProdusCamara> = {}): ProdusCamara {
  return {
    id: 'item-1',
    user_id: 'u1',
    barcode: '5941234567890',
    nume: 'Piept de pui',
    brand: 'Agricola',
    calorii_100g: 165,
    proteine_100g: 31,
    grasimi_100g: 3.6,
    carbohidrati_100g: 0,
    created_at: new Date().toISOString(),
    cantitate: 1,
    cantitate_g: 500,
    data_expirare: makeIsoOffset(2),
    zile_valabilitate: 2,
    is_congelat: false,
    ...overrides,
  };
}

describe('Cămară Redesign — pantryUtils', () => {
  test('normalizează diacriticele și potrivește nume, brand și cod de bare', () => {
    const branza = makeItem({
      nume: 'Brânză de vaci slabă',
      brand: 'Lactate Țara Mea',
      barcode: '5940001112223',
    });
    expect(normalizePantryText('Brânză Șuncă')).toBe('branza sunca');
    expect(matchesPantryQuery(branza, 'branza')).toBe(true);
    expect(matchesPantryQuery(branza, 'tara mea')).toBe(true);
    expect(matchesPantryQuery(branza, '5940001')).toBe(true);
    expect(matchesPantryQuery(branza, 'somon')).toBe(false);
  });

  test('clasifică corect urgența expirării și stocul mic', () => {
    const expired = makeItem({ data_expirare: makeIsoOffset(-1), zile_valabilitate: -1 });
    const tomorrow = makeItem({ data_expirare: makeIsoOffset(1), zile_valabilitate: 1 });
    const soon = makeItem({ data_expirare: makeIsoOffset(3), zile_valabilitate: 3 });
    const fresh = makeItem({ data_expirare: makeIsoOffset(12), zile_valabilitate: 12, cantitate_g: 600 });
    const frozen = makeItem({ is_congelat: true, data_expirare: makeIsoOffset(90), cantitate_g: 500 });
    const lowGram = makeItem({ cantitate_g: 120, cantitate: 1 });

    expect(computeExpiryMeta(expired).status).toBe('expired');
    expect(computeExpiryMeta(tomorrow).status).toBe('danger');
    expect(computeExpiryMeta(soon).status).toBe('warning');
    expect(computeExpiryMeta(fresh).status).toBe('fresh');
    expect(computeExpiryMeta(frozen).status).toBe('frozen');

    expect(isLowStockItem(lowGram)).toBe(true);
    expect(isLowStockItem(fresh)).toBe(false);
    expect(matchesPantryFilter(soon, 'expiring')).toBe(true);
    expect(matchesPantryFilter(frozen, 'expiring')).toBe(false);
    expect(matchesPantryFilter(frozen, 'frozen')).toBe(true);
    expect(matchesPantryFilter(fresh, 'ambient')).toBe(true);
  });

  test('sortarea după urgență pune produsele proaspete aproape de expirare înaintea congelatorului', () => {
    const frozen = makeItem({ id: 'frozen', nume: 'Zmeură', is_congelat: true, data_expirare: makeIsoOffset(90) });
    const freshLong = makeItem({ id: 'long', nume: 'Ovăz', is_congelat: false, data_expirare: makeIsoOffset(20) });
    const urgent = makeItem({ id: 'urgent', nume: 'Iaurt grecesc', is_congelat: false, data_expirare: makeIsoOffset(1) });

    const sorted = sortPantryItems([frozen, freshLong, urgent], 'urgency');
    expect(sorted.map((i) => i.id)).toEqual(['urgent', 'long', 'frozen']);

    const alpha = sortPantryItems([frozen, freshLong, urgent], 'alpha');
    expect(alpha.map((i) => i.id)).toEqual(['urgent', 'long', 'frozen']);
  });
});

describe('Cămară Redesign — useCamara hook', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockAuthUser = null;
    jest.clearAllMocks();
  });

  function Harness({ onReady }: { onReady: (api: ReturnType<typeof useCamara>) => void }) {
    const api = useCamara();
    React.useEffect(() => {
      onReady(api);
    });
    return null;
  }

  test('stachează cantitate_g, actualizează, caută cu diacritice și deduce gramele consumate', async () => {
    let latestApi!: ReturnType<typeof useCamara>;
    await render(<Harness onReady={(api) => { latestApi = api; }} />);

    await waitFor(() => expect(latestApi.loading).toBe(false));

    await act(async () => {
      await latestApi.adaugaProdus(
        {
          barcode: '12345678',
          nume: 'Brânză de vaci',
          calorii_100g: 98,
          proteine_100g: 18,
          carbohidrati_100g: 3.5,
          grasimi_100g: 1.2,
          cantitate_g: 300,
        },
        { cantitate: 1, cantitate_g: 300, zileValabilitate: 10 }
      );
    });

    expect(latestApi.produse).toHaveLength(1);
    expect(latestApi.produse[0].cantitate_g).toBe(300);

    // Stack același produs încă 300g => total 600g, 2x
    await act(async () => {
      await latestApi.adaugaProdus(
        {
          barcode: '12345678',
          nume: 'Brânză de vaci',
          calorii_100g: 98,
          proteine_100g: 18,
          carbohidrati_100g: 3.5,
          grasimi_100g: 1.2,
          cantitate_g: 300,
        },
        { cantitate: 1, cantitate_g: 300 }
      );
    });

    expect(latestApi.produse).toHaveLength(1);
    expect(latestApi.produse[0].cantitate).toBe(2);
    expect(latestApi.produse[0].cantitate_g).toBe(600);

    // Căutare fără diacritice
    expect(latestApi.cautaLocal('branza')).toHaveLength(1);

    // Consum 150g din Jurnal => rămân 450g (produsul nu este șters!)
    const id = latestApi.produse[0].id;
    let consumeRes: any;
    await act(async () => {
      consumeRes = await latestApi.consumaDinCamara({
        id,
        name: 'Brânză de vaci',
        usedGrams: 150,
      });
    });

    expect(consumeRes).toMatchObject({ status: 'updated_grams', remainingGrams: 450 });
    expect(latestApi.produse).toHaveLength(1);
    expect(latestApi.produse[0].cantitate_g).toBe(450);

    // Actualizare explicită din sheet
    await act(async () => {
      await latestApi.actualizeazaProdus(id, { cantitate_g: 100, is_congelat: true });
    });
    expect(latestApi.produse[0].cantitate_g).toBe(100);
    expect(latestApi.produse[0].is_congelat).toBe(true);

    // Consum peste stocul rămas => consumat complet și șters
    await act(async () => {
      await latestApi.actualizeazaProdus(id, { cantitate: 1 });
      consumeRes = await latestApi.consumaDinCamara({
        id,
        name: 'Brânză de vaci',
        usedGrams: 120,
      });
    });
    expect(consumeRes.status).toBe('consumed');
    expect(latestApi.produse).toHaveLength(0);
  });
});

describe('Cămară Redesign — PantryView & ScannerBarcodeScreen', () => {
  test('căutarea cu diacritice, filtrele și ConfirmSheet împiedică ștergerea accidentală la decrementare minimă', async () => {
    const items = [
      makeItem({ id: 'p1', nume: 'Ouă de țară', cantitate: 1, cantitate_g: undefined, data_expirare: makeIsoOffset(1), zile_valabilitate: 1 }),
      makeItem({ id: 'p2', nume: 'Piept de pui', cantitate: 1, cantitate_g: 500, is_congelat: true, data_expirare: makeIsoOffset(90) }),
    ];
    const onDeleteItem = jest.fn(async () => undefined);
    const onStepUnit = jest.fn();

    const screen = await render(
      <PantryView
        produse={items}
        selectedIds={[]}
        onToggleSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onQuickAdd={jest.fn()}
        onScanFirst={jest.fn()}
        onAddMeal={jest.fn()}
        onStepUnit={onStepUnit}
        onStepGrams={jest.fn()}
        onSaveEdit={jest.fn()}
        onDeleteItem={onDeleteItem}
        onGenerateRecipes={jest.fn()}
      />
    );

    expect(screen.getByText('Ouă de țară')).toBeTruthy();
    expect(screen.getByText('Piept de pui')).toBeTruthy();
    expect(screen.getByText('scannerBarcode.askRecipes')).toBeTruthy();
    expect(screen.queryByText(/\{\{count\}\}/)).toBeNull();

    // Căutare fără diacritice
    await fireEvent.changeText(screen.getByTestId('pantry-search-input'), 'oua');
    await waitFor(() => {
      expect(screen.getByText('Ouă de țară')).toBeTruthy();
      expect(screen.queryByText('Piept de pui')).toBeNull();
    });

    await fireEvent.changeText(screen.getByTestId('pantry-search-input'), '');
    await waitFor(() => expect(screen.getByText('Piept de pui')).toBeTruthy());

    // Filtru congelator
    await fireEvent.press(screen.getByText('scannerBarcode.filterFrozen:count=1'));
    await waitFor(() => {
      expect(screen.getByText('Piept de pui')).toBeTruthy();
      expect(screen.queryByText('Ouă de țară')).toBeNull();
    });

    // Reset la Toate și apăsare minus pe itemul cu cantitate 1 => cere confirmare, nu șterge silențios
    await fireEvent.press(screen.getByText('scannerBarcode.filterAll:count=2'));
    await fireEvent.press(screen.getByLabelText('scannerBarcode.decreaseQuantityA11y:name=Ouă de țară'));

    expect(onDeleteItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('scannerBarcode.deleteConfirmTitle')).toBeTruthy());

    await fireEvent.press(screen.getByText('scannerBarcode.deleteConfirmAction'));
    await waitFor(() => expect(onDeleteItem).toHaveBeenCalledWith('p1'));
  });

  test('tabul Cămară rămâne accesibil chiar și când permisiunea de cameră este refuzată', async () => {
    const screen = await render(<ScannerBarcodeScreen />);

    // Pe tabul default Scan vedem cererea de permisiune + tab bar-ul vizibil sus
    expect(screen.getByText('scannerBarcode.permissionTitle')).toBeTruthy();
    const pantryTab = screen.getByLabelText('scannerBarcode.inventoryTabA11y:count=0');

    await fireEvent.press(pantryTab);

    await waitFor(() => {
      expect(screen.getByTestId('pantry-view')).toBeTruthy();
      expect(screen.queryByText('scannerBarcode.permissionTitle')).toBeNull();
    });
  });
});
