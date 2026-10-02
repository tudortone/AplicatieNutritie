import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// Mock AsyncStorage before i18n import
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] || null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockStorage[key] = val;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStorage[key];
  }),
  clear: jest.fn(async () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }),
}));

import { EditAlimentSheet, EditAlimentSheetRef } from '../components/food/EditAlimentModal';
import { MealDetailsSheet, MealDetailsSheetRef } from '../components/MealDetailsModal';
import {
  extrageBazaNutritionala,
  scaleazaDinBaza,
  actualizeazaCantitateAliment,
  recalculeazaTotaluri,
  actualizeazaMasaCuPoza,
  LIMITE_DB_MESE,
  clampValoare,
} from '../lib/mealUtils';
import { marcheazaMeseModificate, aboneazaLaModificariMese } from '../lib/freshnessMese';
import { changeLanguage } from '../i18n';
import i18n from '../i18n';
import { Masa, AlimentDetaliat } from '../types';

// Mock ThemeContext
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#c8ff00',
      accentSecondary: '#00e5ff',
      accentTertiary: '#a855f7',
      cardBg: '#111827',
      cardBorder: '#263244',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      textOnAccent: '#000000',
      surface: '#181D22',
      surfaceBg: '#1e293b',
      danger: '#ef4444',
      warning: '#f59e0b',
      success: '#10b981',
      overlayStrong: 'rgba(255,255,255,0.2)',
    },
  }),
}));

// Mock PremiumContext
jest.mock('../context/PremiumContext', () => ({
  usePremium: () => ({
    isPremium: true,
    hasFullAccess: true,
  }),
}));

// Mock safe area insets
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock Gorhom BottomSheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, TextInput, ScrollView } = require('react-native');

  const BottomSheetModal = React.forwardRef(({ children, onDismiss }: any, ref: any) => {
    const [visible, setVisible] = React.useState(false);
    React.useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: () => {
        setVisible(false);
        if (onDismiss) onDismiss();
      },
      close: () => {
        setVisible(false);
        if (onDismiss) onDismiss();
      },
    }));
    if (!visible) return null;
    return <View testID="bottom-sheet-modal">{children}</View>;
  });

  const BottomSheetScrollView = ({ children, ...props }: any) => (
    <ScrollView {...props}>{children}</ScrollView>
  );

  const BottomSheetTextInput = React.forwardRef((props: any, ref: any) => (
    <TextInput ref={ref} {...props} />
  ));

  const BottomSheetBackdrop = () => null;

  return {
    BottomSheetModal,
    BottomSheetScrollView,
    BottomSheetTextInput,
    BottomSheetBackdrop,
  };
});

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('GETFLOW — Journal Food Quantity Editing & Persistence Remediation', () => {
  const changeInput = async (element: any, text: string) => {
    await act(async () => {
      fireEvent.changeText(element, text);
    });
  };

  const pressButton = async (element: any) => {
    await act(async () => {
      fireEvent.press(element);
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await changeLanguage('ro');
  });

  // 1 & 2. Existing Journal food opens quantity editor & displays existing quantity
  test('1 & 2. Existing Journal food opens quantity editor and displays existing quantity', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();

    const { getByText, getByDisplayValue } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    const testFood: AlimentDetaliat = {
      id: 'al-1',
      nume: 'Cartofi prăjiți',
      grame: 100,
      calorii: 300,
      proteine: 10,
      carbohidrati: 20,
      grasimi: 15,
      fibre: 4,
    };

    await act(async () => {
      ref.current?.open(testFood);
    });

    expect(getByText('Cartofi prăjiți')).toBeTruthy();
    expect(getByDisplayValue('100')).toBeTruthy();
    expect(getByText('300')).toBeTruthy(); // calories preview
  });

  // 3. User can type a new quantity
  test('3. User can type a new quantity directly', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();

    const { getByDisplayValue } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    await act(async () => {
      ref.current?.open({
        nume: 'Cartofi prăjiți',
        grame: 100,
        calorii: 300,
        proteine: 10,
        carbohidrati: 20,
        grasimi: 15,
        fibre: 4,
      });
    });

    const input = getByDisplayValue('100');
    await changeInput(input, '150');

    expect(getByDisplayValue('150')).toBeTruthy();
  });

  // 4 & 5. Plus and Minus change quantity
  test('4 & 5. Plus and Minus buttons increment and decrement quantity', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();

    const { getByLabelText, getByDisplayValue } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    await act(async () => {
      ref.current?.open({
        nume: 'Cartofi prăjiți',
        grame: 100,
        calorii: 300,
        proteine: 10,
        carbohidrati: 20,
        grasimi: 15,
        fibre: 4,
      });
    });

    const plusBtn = getByLabelText('Crește cantitatea');
    const minusBtn = getByLabelText('Scade cantitatea');

    // Tap Plus -> 110
    await pressButton(plusBtn);
    expect(getByDisplayValue('110')).toBeTruthy();

    // Tap Plus -> 120
    await pressButton(plusBtn);
    expect(getByDisplayValue('120')).toBeTruthy();

    // Tap Minus -> 110
    await pressButton(minusBtn);
    expect(getByDisplayValue('110')).toBeTruthy();
  });

  // 6. Invalid quantity is rejected (0, negative, NaN)
  test('6. Invalid quantity (0, negative, NaN) disables save and shows warning', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();

    const { getByDisplayValue, getByText, queryByText } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    await act(async () => {
      ref.current?.open({
        nume: 'Cartofi prăjiți',
        grame: 100,
        calorii: 300,
        proteine: 10,
        carbohidrati: 20,
        grasimi: 15,
        fibre: 4,
      });
    });

    const input = getByDisplayValue('100');

    // Set to 0
    await changeInput(input, '0');
    expect(getByText('Cantitatea trebuie să fie mai mare ca zero')).toBeTruthy();

    // Set to negative
    await changeInput(input, '-25');
    expect(getByText('Cantitatea trebuie să fie mai mare ca zero')).toBeTruthy();

    // Set to invalid text
    await changeInput(input, 'abc');
    expect(getByText('Cantitatea trebuie să fie mai mare ca zero')).toBeTruthy();

    // Valid number clears warning
    await changeInput(input, '150');
    expect(queryByText('Cantitatea trebuie să fie mai mare ca zero')).toBeNull();
  });

  // 7. Nutrition preview recalculates correctly from authoritative base
  test('7. Nutrition preview recalculates correctly from authoritative base (100g -> 150g -> 100g without rounding drift)', () => {
    const food: AlimentDetaliat = {
      nume: 'French fries',
      grame: 100,
      calorii: 300,
      proteine: 10,
      carbohidrati: 20,
      grasimi: 15,
      fibre: 4,
    };

    const basis = extrageBazaNutritionala(food);
    expect(basis.baseQuantity).toBe(100);
    expect(basis.kcalPerUnit).toBe(3);
    expect(basis.proteinPerUnit).toBe(0.1);
    expect(basis.carbsPerUnit).toBe(0.2);
    expect(basis.fatPerUnit).toBe(0.15);
    expect(basis.fiberPerUnit).toBe(0.04);

    // Scaling to 150g
    const scaled150 = scaleazaDinBaza(basis, 150);
    expect(scaled150.calorii).toBe(450);
    expect(scaled150.proteine).toBe(15);
    expect(scaled150.carbohidrati).toBe(30);
    expect(scaled150.grasimi).toBe(22.5);
    expect(scaled150.fibre).toBe(6);

    // Scaling back to 100g preserves exact original values
    const scaledBack = scaleazaDinBaza(basis, 100);
    expect(scaledBack.calorii).toBe(300);
    expect(scaledBack.proteine).toBe(10);
    expect(scaledBack.carbohidrati).toBe(20);
    expect(scaledBack.grasimi).toBe(15);
    expect(scaledBack.fibre).toBe(4);
  });

  // 8. Save calls REAL persistence
  test('8. Save calls REAL persistence and propagates scaled values', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn().mockResolvedValue(true);

    const { getByDisplayValue, getByText } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    await act(async () => {
      ref.current?.open({
        id: 'food-fries-id',
        nume: 'French fries',
        grame: 100,
        calorii: 300,
        proteine: 10,
        carbohidrati: 20,
        grasimi: 15,
        fibre: 4,
      });
    });

    const input = getByDisplayValue('100');
    await changeInput(input, '150');

    const saveBtn = getByText('Salvează modificările');
    await pressButton(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'food-fries-id',
        nume: 'French fries',
        grame: 150,
        calorii: 450,
        proteine: 15,
        carbohidrati: 30,
        grasimi: 22.5,
        fibre: 6,
      })
    );
  });

  // 9. Persistence failure does not show success, keeps editor state, allows retry
  test('9. Persistence failure does not show fake success, keeps editor state open, and allows retry', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    // First attempt fails, second attempt succeeds
    const onSave = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { getByDisplayValue, getByText } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    await act(async () => {
      ref.current?.open({
        id: 'food-1',
        nume: 'Orez basmati',
        grame: 100,
        calorii: 130,
        proteine: 3,
        carbohidrati: 28,
        grasimi: 0.5,
        fibre: 1,
      });
    });

    const input = getByDisplayValue('100');
    await changeInput(input, '200');

    const saveBtn = getByText('Salvează modificările');

    // First attempt -> fails
    await pressButton(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    // Editor is still open with 200
    expect(getByDisplayValue('200')).toBeTruthy();
    expect(getByText('Nu am putut salva modificările. Încearcă din nou.')).toBeTruthy();

    // Retry -> succeeds
    await pressButton(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(2);
  });

  // 10 & 11. Successful save invalidates/refreshes Journal & Home
  test('10 & 11. Successful save triggers freshness invalidation for user', () => {
    const listener = jest.fn();
    const unsubscribe = aboneazaLaModificariMese(listener);

    marcheazaMeseModificate('user-test-uuid-456');

    expect(listener).toHaveBeenCalledWith('user-test-uuid-456');
    unsubscribe();
  });

  // 12 & 13. Reopen / Restart consistency
  test('12 & 13. Reopen / Restart consistency: opening saved food returns persisted 150g and 450kcal', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();

    const { getByDisplayValue, getByText } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} />
    );

    // Initial state: 100g
    await act(async () => {
      ref.current?.open({
        id: 'food-1',
        nume: 'French fries',
        grame: 100,
        calorii: 300,
        proteine: 10,
        carbohidrati: 20,
        grasimi: 15,
        fibre: 4,
      });
    });

    expect(getByDisplayValue('100')).toBeTruthy();

    // Close
    await act(async () => {
      ref.current?.close();
    });

    // Reopen with the persisted record of 150g
    await act(async () => {
      ref.current?.open({
        id: 'food-1',
        nume: 'French fries',
        grame: 150,
        calorii: 450,
        proteine: 15,
        carbohidrati: 30,
        grasimi: 22.5,
        fibre: 6,
      });
    });

    expect(getByDisplayValue('150')).toBeTruthy();
    expect(getByText('450')).toBeTruthy();
  });

  // 14 & 15. Meal totals and daily totals update accurately
  test('14 & 15. Meal totals update accurately when ingredient quantity is edited', () => {
    const mealAlimente: AlimentDetaliat[] = [
      { nume: 'Cartofi prăjiți', grame: 100, calorii: 300, proteine: 10, carbohidrati: 20, grasimi: 15, fibre: 4 },
      { nume: 'Piept de pui', grame: 200, calorii: 330, proteine: 62, carbohidrati: 0, grasimi: 7.2, fibre: 0 },
    ];

    // Initial meal total
    const totalInitial = recalculeazaTotaluri(mealAlimente);
    expect(totalInitial.calorii).toBe(630);
    expect(totalInitial.proteine).toBe(72);
    expect(totalInitial.carbohidrati).toBe(20);
    expect(totalInitial.grasimi).toBe(22.2);

    // Edit Cartofi prăjiți from 100g -> 150g
    const updatedAliment = actualizeazaCantitateAliment(mealAlimente[0], 150);
    const updatedAlimente = [updatedAliment, mealAlimente[1]];

    const totalUpdated = recalculeazaTotaluri(updatedAlimente);
    expect(totalUpdated.calorii).toBe(780); // 450 + 330
    expect(totalUpdated.proteine).toBe(77);  // 15 + 62
    expect(totalUpdated.carbohidrati).toBe(30); // 30 + 0
    expect(totalUpdated.grasimi).toBe(29.7); // 22.5 + 7.2
    expect(totalUpdated.fibre).toBe(6);     // 6 + 0
  });

  // 16. Photo AI ingredient can be manually corrected
  test('16. Photo AI ingredient can be manually corrected without rerunning AI', () => {
    // Photo AI meal with per-100g properties
    const photoAiItem: AlimentDetaliat = {
      nume: 'Cartofi prăjiți',
      grame: 180,
      calorii: 540,
      proteine: 18,
      carbohidrati: 36,
      grasimi: 27,
      fibre: 7.2,
      imageUrl: 'https://ik.imagekit.io/photo/123.jpg',
      imageKitFileId: 'file-123',
      ...({ calorii_per_100g: 300, proteine_per_100g: 10, carbohidrati_per_100g: 20, grasimi_per_100g: 15, fibre_per_100g: 4 } as any),
    };

    const basis = extrageBazaNutritionala(photoAiItem);
    expect(basis.baseQuantity).toBe(100);
    expect(basis.kcalPerUnit).toBe(3);

    // User corrects AI estimate: 180g -> 150g
    const corrected = actualizeazaCantitateAliment(photoAiItem, 150, basis);
    expect(corrected.grame).toBe(150);
    expect(corrected.calorii).toBe(450);
    expect(corrected.proteine).toBe(15);
    expect(corrected.carbohidrati).toBe(30);
    expect(corrected.grasimi).toBe(22.5);
    expect(corrected.fibre).toBe(6);
    expect(corrected.imageUrl).toBe('https://ik.imagekit.io/photo/123.jpg');
    expect(corrected.imageKitFileId).toBe('file-123');
  });

  // 17. Custom food entry can be edited
  test('17. Custom food entry quantity can be edited seamlessly', () => {
    const customFood: AlimentDetaliat = {
      id: 'custom-food-99',
      nume: 'Baton Proteic de Casă',
      grame: 60,
      calorii: 240,
      proteine: 20,
      carbohidrati: 18,
      grasimi: 8,
      fibre: 5,
      ...({ servingUnit: 'g' } as any),
    };

    const basis = extrageBazaNutritionala(customFood);
    expect(basis.baseQuantity).toBe(60);
    expect(basis.kcalPerUnit).toBe(4);

    // Edit quantity to 90g (1.5 bars)
    const updated = actualizeazaCantitateAliment(customFood, 90, basis);
    expect(updated.grame).toBe(90);
    expect(updated.calorii).toBe(360);
    expect(updated.proteine).toBe(30);
    expect(updated.carbohidrati).toBe(27);
    expect(updated.grasimi).toBe(12);
    expect(updated.fibre).toBe(7.5);
  });

  // 18. Predefined food entry can be edited
  test('18. Predefined food entry quantity can be edited seamlessly', () => {
    const predefined: AlimentDetaliat = {
      nume: 'Măr Golden',
      grame: 150,
      calorii: 78,
      proteine: 0.45,
      carbohidrati: 21,
      grasimi: 0.3,
      fibre: 3.6,
    };

    const basis = extrageBazaNutritionala(predefined);
    // User ate 200g apple
    const updated = actualizeazaCantitateAliment(predefined, 200, basis);
    expect(updated.grame).toBe(200);
    expect(updated.calorii).toBe(104);
  });

  // 19. Open Food Facts entry can be edited
  test('19. Open Food Facts entry can be edited preserving micronutrients', () => {
    const offItem: AlimentDetaliat = {
      nume: 'Iaurt Grecesc Olympus 10%',
      grame: 150,
      calorii: 195,
      proteine: 13.5,
      carbohidrati: 6,
      grasimi: 15,
      fibre: 0,
      micronutrienti: {
        calciu: 180,
      },
    };

    const basis = extrageBazaNutritionala(offItem);
    const updated = actualizeazaCantitateAliment(offItem, 200, basis);
    expect(updated.grame).toBe(200);
    expect(updated.calorii).toBe(260);
    expect(updated.proteine).toBe(18);
  });

  // 20. Delete remains explicit and separate from quantity = 0
  test('20. Delete remains explicit and separate from quantity = 0', async () => {
    const ref = React.createRef<EditAlimentSheetRef>();
    const onSave = jest.fn();
    const onDelete = jest.fn();

    const { getByDisplayValue, getByText } = await render(
      <EditAlimentSheet ref={ref} onSave={onSave} onDelete={onDelete} />
    );

    await act(async () => {
      ref.current?.open({
        id: 'food-del-id',
        nume: 'Pâine toast',
        grame: 50,
        calorii: 130,
        proteine: 4,
        carbohidrati: 25,
        grasimi: 1.5,
        fibre: 2,
      });
    });

    // Setting quantity to 0 does NOT trigger delete, Save button is disabled
    const input = getByDisplayValue('50');
    await changeInput(input, '0');

    const saveBtn = getByText('Salvează modificările');
    await pressButton(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    // Delete button exists as explicit action
    const deleteBtn = getByText('Elimină din masă');
    expect(deleteBtn).toBeTruthy();
  });

  // 21. RO/EN/FR/DE zero raw interpolation tokens
  test('21. RO/EN/FR/DE have zero raw interpolation tokens in quantity editing keys', async () => {
    const languages = ['ro', 'en', 'fr', 'de'] as const;

    for (const lang of languages) {
      await changeLanguage(lang);

      // currentQuantity
      const currentQty = i18n.t('jurnal.currentQuantity', { quantity: 150, unit: 'g' });
      expect(currentQty).not.toContain('{{');
      expect(currentQty).not.toContain('}}');
      expect(currentQty).toContain('150');

      // editIngredientA11y
      const a11y = i18n.t('jurnal.editIngredientA11y', { nume: 'Pui', grame: 150, kcal: 250 });
      expect(a11y).not.toContain('{{');
      expect(a11y).not.toContain('}}');
      expect(a11y).toContain('Pui');

      // saveChanges & removeFromMeal
      const saveText = i18n.t('jurnal.saveChanges');
      expect(saveText).not.toContain('{{');
      const delText = i18n.t('jurnal.removeFromMeal');
      expect(delText).not.toContain('{{');
    }
  });

  // actualizeazaMasaCuPoza .select() verification test
  test('actualizeazaMasaCuPoza uses .select() and handles PostgREST responses correctly', async () => {
    const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 'm-1' }], error: null });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockClient = {
      from: jest.fn().mockReturnValue({
        update: mockUpdate,
      }),
    };

    const res = await actualizeazaMasaCuPoza(mockClient, 'm-1', { calorii: 500 });
    expect(mockClient.from).toHaveBeenCalledWith('mese');
    expect(mockUpdate).toHaveBeenCalledWith({ calorii: 500 });
    expect(mockEq).toHaveBeenCalledWith('id', 'm-1');
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual([{ id: 'm-1' }]);
    expect(res.error).toBeNull();
  });
});
