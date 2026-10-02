import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ManualProductForm, LOCAL_CUSTOM_FOODS_STORAGE_KEY } from '../components/food/ManualProductForm';
import { ProductSearch } from '../components/food/ProductSearch';
import { FoodProductDetailModal } from '../components/food/FoodProductDetailModal';
import { changeLanguage } from '../i18n';
import i18n from '../i18n';
import { foodPresets } from '../constants/foodPresets';
import { FoodProduct } from '../components/food/types';
import { LIMITE_DB_MESE, clampValoare, totaluriPentruPersistare, recalculeazaTotaluri } from '../lib/mealUtils';

// Mock AsyncStorage
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

// Mock AuthContext
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: {
      access_token: 'valid-test-token',
      user: { id: 'test-user-uuid-123' },
    },
    user: { id: 'test-user-uuid-123' },
  }),
}));

// Mock ThemeContext
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#00e5ff',
      accentSecondary: '#0088ff',
      accentTertiary: '#a855f7',
      cardBg: '#111827',
      cardBorder: '#263244',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      textOnAccent: '#000000',
      surface: '#181D22',
      surfaceBg: '#1e293b',
      danger: '#ef4444',
      warning: '#f59e0b',
      success: '#10b981',
      disabledText: '#64748b',
    },
  }),
}));

jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBanner: () => ({
    showBanner: jest.fn(),
  }),
}));

// Mock Supabase with full query chaining and .select()
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../supabase', () => {
  return {
    supabase: {
      from: jest.fn((table: string) => {
        const query: any = {};
        query.select = jest.fn(() => query);
        query.eq = jest.fn(() => query);
        query.limit = jest.fn(() => query);
        query.ilike = jest.fn(() => query);
        query.order = jest.fn(() => query);
        query.insert = jest.fn((payload: any) => {
          mockInsert(table, payload);
          const row = Array.isArray(payload) ? payload[0] : { id: payload.id || 'gen-meal-id', ...payload };
          return {
            select: async () => ({
              data: [row],
              error: null,
            }),
            then: (resolve: any) => Promise.resolve({
              data: [row],
              error: null,
            }).then(resolve),
          };
        });
        query.update = jest.fn((data: any) => ({
          eq: () => Promise.resolve({ data: [data], error: null }),
        }));
        query.delete = jest.fn(() => ({
          eq: () => ({
            eq: () => {
              mockDelete(table);
              return Promise.resolve({ data: [], error: null });
            },
          }),
        }));
        query.then = (resolve: any) => {
          if (table === 'produse_camara') {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          return Promise.resolve({ data: [{ id: 'mock-meal-id' }], error: null }).then(resolve);
        };
        return query;
      }),
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'test-user-uuid-123' } }, error: null })),
        getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok' } }, error: null })),
      },
    },
  };
});

// Mock Haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Mock freshnessMese
const mockMarcheazaMeseModificate = jest.fn();
jest.mock('../lib/freshnessMese', () => ({
  marcheazaMeseModificate: (userId: string) => mockMarcheazaMeseModificate(userId),
  aboneazaLaModificariMese: jest.fn(() => () => {}),
}));

// Mock offlineQueue
const mockPushOfflineMealVerificat = jest.fn(async (_p?: any) => true);
jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMealVerificat: (p: any) => mockPushOfflineMealVerificat(p),
}));

describe('Custom Food Creation + Journal Save Remediation', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    await changeLanguage('ro');
  });

  describe('Goal 1: Custom Food Form - Field Requirements and Numeric Validation', () => {
    test('renders all 8 required nutrition fields: Name, Serving Quantity, Serving Unit, Calories, Protein, Carbs, Fats, Fiber', async () => {
      const onSave = jest.fn();
      const ecran = await render(<ManualProductForm onSave={onSave} />);

      expect(ecran.getByPlaceholderText(i18n.t('manualProduct.productNamePlaceholder'))).toBeTruthy(); // Name
      expect(ecran.getByPlaceholderText(i18n.t('manualProduct.servingQuantityPlaceholder'))).toBeTruthy(); // Serving quantity
      expect(ecran.getByPlaceholderText(i18n.t('manualProduct.servingUnitPlaceholder'))).toBeTruthy(); // Serving unit
      expect(ecran.getByPlaceholderText('ex: 125')).toBeTruthy(); // Calories
      // Protein, Carbs, Fat, Fiber section labels exist
      expect(ecran.getByText(i18n.t('manualProduct.proteinPer100g'))).toBeTruthy();
      expect(ecran.getByText(i18n.t('manualProduct.carbsPer100g'))).toBeTruthy();
      expect(ecran.getByText(i18n.t('manualProduct.fatPer100g'))).toBeTruthy();
      expect(ecran.getByText(i18n.t('manualProduct.fiberPer100g'))).toBeTruthy();
    });

    test('validates and rejects empty name', async () => {
      const onSave = jest.fn();
      const ecran = await render(<ManualProductForm onSave={onSave} />);
      const saveBtn = ecran.getByText(i18n.t('manualProduct.addToMeal'));

      await fireEvent.press(saveBtn);
      await waitFor(() => {
        expect(ecran.getByText(i18n.t('manualProduct.errNameRequired'))).toBeTruthy();
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    test('validates and rejects impossible calories (>1000 kcal/100g)', async () => {
      const onSave = jest.fn();
      const ecran = await render(<ManualProductForm onSave={onSave} />);
      const saveBtn = ecran.getByText(i18n.t('manualProduct.addToMeal'));

      await fireEvent.changeText(ecran.getByPlaceholderText(i18n.t('manualProduct.productNamePlaceholder')), 'Aliment Test');
      await fireEvent.changeText(ecran.getByPlaceholderText('ex: 125'), '1500'); // > 1000
      await fireEvent.press(saveBtn);

      await waitFor(() => {
        expect(ecran.getByText(i18n.t('manualProduct.errKcalRange'))).toBeTruthy();
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    test('validates and rejects impossible macronutrients (>100g)', async () => {
      const onSave = jest.fn();
      const ecran = await render(<ManualProductForm onSave={onSave} />);
      const saveBtn = ecran.getByText(i18n.t('manualProduct.addToMeal'));

      await fireEvent.changeText(ecran.getByPlaceholderText(i18n.t('manualProduct.productNamePlaceholder')), 'Aliment Test');
      await fireEvent.changeText(ecran.getByPlaceholderText('ex: 125'), '250');

      const inputs = ecran.getAllByPlaceholderText('0');
      // Setting invalid protein > 100g
      await fireEvent.changeText(inputs[0], '150');
      await fireEvent.press(saveBtn);

      await waitFor(() => {
        expect(ecran.getByText(i18n.t('manualProduct.errProtRange'))).toBeTruthy();
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    test('valid custom food is saved with all required fields to local storage & Supabase', async () => {
      const onSave = jest.fn();
      const ecran = await render(<ManualProductForm onSave={onSave} />);

      // Fill Name
      await fireEvent.changeText(ecran.getByPlaceholderText(i18n.t('manualProduct.productNamePlaceholder')), 'Shake Proteic de Ciocolată');
      // Fill Serving Quantity
      await fireEvent.changeText(ecran.getByPlaceholderText(i18n.t('manualProduct.servingQuantityPlaceholder')), '250');
      // Fill Serving Unit
      await fireEvent.changeText(ecran.getByPlaceholderText(i18n.t('manualProduct.servingUnitPlaceholder')), 'porție 250ml');
      // Fill Calories
      await fireEvent.changeText(ecran.getByPlaceholderText('ex: 125'), '85');

      // Fill Macros: Protein, Carbs, Fat, Fiber
      const zeroInputs = ecran.getAllByPlaceholderText('0');
      await fireEvent.changeText(zeroInputs[0], '10.5'); // Protein
      await fireEvent.changeText(zeroInputs[1], '6.2');  // Carbs
      await fireEvent.changeText(zeroInputs[2], '2.1');  // Fat
      await fireEvent.changeText(zeroInputs[3], '1.8');  // Fiber

      // Press Save
      await fireEvent.press(ecran.getByText(i18n.t('manualProduct.addToMeal')));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const [savedProduct] = onSave.mock.calls[0];
      expect(savedProduct.name).toBe('Shake Proteic de Ciocolată');
      expect(savedProduct.servingGrams).toBe(250);
      expect(savedProduct.servingLabel).toBe('porție 250ml');
      expect(savedProduct.kcalPer100g).toBe(85);
      expect(savedProduct.proteinPer100g).toBe(10.5);
      expect(savedProduct.carbsPer100g).toBe(6.2);
      expect(savedProduct.fatPer100g).toBe(2.1);
      expect(savedProduct.fiberPer100g).toBe(1.8);
      expect(savedProduct.source).toBe('user_saved');

      // Verify persistence to AsyncStorage
      const stored = mockStorage[LOCAL_CUSTOM_FOODS_STORAGE_KEY];
      expect(stored).toBeDefined();
      const parsedStored = JSON.parse(stored);
      expect(parsedStored[0].name).toBe('Shake Proteic de Ciocolată');

      // Verify persistence to Supabase produse_camara
      expect(mockInsert).toHaveBeenCalledWith(
        'produse_camara',
        expect.objectContaining({
          nume: 'Shake Proteic de Ciocolată',
          calorii_100g: 85,
          proteine_100g: 10.5,
          carbohidrati_100g: 6.2,
          grasimi_100g: 2.1,
          fibre_100g: 1.8,
          portie_grame: 250,
          portie_label: 'porție 250ml',
          source: 'manual',
        })
      );
    });
  });

  describe('Goal 2, 3, 4: Custom Food Reuse & Search Integration', () => {
    test('existing predefined presets remain available in search', async () => {
      const ecran = await render(<ProductSearch onSelectProductWithGrams={jest.fn()} />);

      // Predefined preset from foodPresets.ts should be in search results after searchCombined runs
      const firstPreset = foodPresets[0];
      await waitFor(() => {
        expect(ecran.getByText(firstPreset.nume)).toBeTruthy();
      }, { timeout: 3000 });
    });

    test('custom food saved in local AsyncStorage is available and reusable in ProductSearch', async () => {
      // Pre-save custom food in storage
      const customFood: FoodProduct = {
        id: 'custom_test_1',
        source: 'user_saved',
        name: 'Clătite cu ovăz și banană',
        kcalPer100g: 165,
        proteinPer100g: 8.5,
        carbsPer100g: 24,
        fatPer100g: 3.5,
        fiberPer100g: 3.2,
        servingGrams: 150,
        servingLabel: 'porție',
      };
      mockStorage[LOCAL_CUSTOM_FOODS_STORAGE_KEY] = JSON.stringify([customFood]);

      const ecran = await render(<ProductSearch onSelectProductWithGrams={jest.fn()} />);

      // Search for custom food
      await fireEvent.changeText(
        ecran.getByPlaceholderText(i18n.t('productSearch.inputPlaceholder')),
        'clatite'
      );

      await waitFor(() => {
        expect(ecran.getByText('Clătite cu ovăz și banană')).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Goal 5: Adding Food to Journal — Verified Success & Invalidation', () => {
    test('saves food to journal, triggers marcheazaMeseModificate, and verified success callback', async () => {
      const onAddSuccess = jest.fn();
      const product: FoodProduct = {
        id: 'prod_1',
        source: 'user_saved',
        name: 'Omletă cu brânză',
        kcalPer100g: 190,
        proteinPer100g: 14,
        carbsPer100g: 2,
        fatPer100g: 14,
        fiberPer100g: 0.5,
        servingGrams: 150,
      };

      const ecran = await render(
        <FoodProductDetailModal
          visible={true}
          product={product}
          initialGrams={150}
          onClose={jest.fn()}
          onAddSuccess={onAddSuccess}
        />
      );

      // Verify nutrition display (150g = 1.5 * 190 = 285 kcal)
      await waitFor(() => {
        expect(ecran.getByText('285')).toBeTruthy();
      });

      // Press Add to Journal button
      const addBtn = ecran.getByText(/Adaugă în Jurnal/i);
      await fireEvent.press(addBtn);

      await waitFor(() => {
        expect(mockInsert).toHaveBeenCalledWith(
          'mese',
          expect.objectContaining({
            user_id: 'test-user-uuid-123',
            nume: 'Omletă cu brânză',
            calorii: 285,
            proteine: 21,
            carbohidrati: 3,
            grasimi: 21,
            fibre: 0.8,
          })
        );
      });

      // Verify freshness invalidation was called with user ID
      expect(mockMarcheazaMeseModificate).toHaveBeenCalledWith('test-user-uuid-123');

      // Verify success callback was invoked
      expect(onAddSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('i18n Raw Placeholder Zero-Leak Verification: RO, EN, FR, DE', () => {
    const languages = ['ro', 'en', 'fr', 'de'] as const;

    languages.forEach((lang) => {
      test(`guarantees NO raw {{categorie}} or {{label}} reaches UI in ${lang.toUpperCase()}`, async () => {
        await changeLanguage(lang);

        const testCategoryName = 'Prânz';

        // 1. addCategory
        const translatedAddCat = i18n.t('jurnal.addCategory', {
          categorie: testCategoryName,
          label: testCategoryName,
        });
        expect(translatedAddCat).not.toContain('{{');
        expect(translatedAddCat).not.toContain('}}');
        expect(translatedAddCat).not.toContain('categorie');

        // 2. addAnotherTo
        const translatedAddAnother = i18n.t('jurnal.addAnotherTo', {
          categorie: testCategoryName,
          label: testCategoryName,
        });
        expect(translatedAddAnother).not.toContain('{{');
        expect(translatedAddAnother).not.toContain('}}');
        expect(translatedAddAnother).not.toContain('categorie');

        // 3. showOptionsFor
        const translatedShowOptions = i18n.t('jurnal.showOptionsFor', {
          categorie: testCategoryName,
          label: testCategoryName,
        });
        expect(translatedShowOptions).not.toContain('{{');
        expect(translatedShowOptions).not.toContain('}}');
        expect(translatedShowOptions).not.toContain('categorie');

        // 4. viewCategoryDetails
        const translatedViewDetails = i18n.t('jurnal.viewCategoryDetails', {
          categorie: testCategoryName,
          label: testCategoryName,
        });
        expect(translatedViewDetails).not.toContain('{{');
        expect(translatedViewDetails).not.toContain('}}');
      });
    });
  });

  describe('Realistic Quantities and Totals Preservation on Edit/Delete', () => {
    test('clampValoare prevents unrealistic food quantities', () => {
      // Negative clamp
      expect(clampValoare(-50, LIMITE_DB_MESE.gramaj, 1)).toBe(1);
      expect(clampValoare(0, LIMITE_DB_MESE.gramaj, 1)).toBe(1);
      // Realistic normal
      expect(clampValoare(250, LIMITE_DB_MESE.gramaj, 1)).toBe(250);
      // Upper bound clamp
      expect(clampValoare(999999, LIMITE_DB_MESE.gramaj, 1)).toBe(5000);
      // Calories clamp
      expect(clampValoare(150000, LIMITE_DB_MESE.calorii, 0)).toBe(10000);
      // NaN or Infinity
      expect(clampValoare(NaN, LIMITE_DB_MESE.gramaj, 1)).toBe(1);
      expect(clampValoare(Infinity, LIMITE_DB_MESE.gramaj, 1)).toBe(1);
    });

    test('recalculeazaTotaluri and totaluriPentruPersistare preserve exact mathematical totals on ingredient edit/delete', () => {
      const alimente = [
        { nume: 'Piept de pui', grame: 200, calorii: 330, proteine: 62, carbohidrati: 0, grasimi: 7.2, fibre: 0 },
        { nume: 'Orez basmati', grame: 150, calorii: 195, proteine: 4.5, carbohidrati: 42, grasimi: 0.6, fibre: 1.5 },
        { nume: 'Salată verde', grame: 100, calorii: 20, proteine: 1.5, carbohidrati: 3, grasimi: 0.2, fibre: 2.1 },
      ];

      const totals = recalculeazaTotaluri(alimente);
      expect(totals.calorii).toBe(545);
      expect(totals.proteine).toBe(68);
      expect(totals.carbohidrati).toBe(45);
      expect(totals.grasimi).toBe(8);
      expect(totals.fibre).toBe(3.6);

      // Deleting second ingredient preserves exact updated totals
      const alimenteDupaStergere = alimente.filter((_, i) => i !== 1);
      const totalsDupaStergere = recalculeazaTotaluri(alimenteDupaStergere);
      expect(totalsDupaStergere.calorii).toBe(350);
      expect(totalsDupaStergere.proteine).toBe(63.5);
      expect(totalsDupaStergere.carbohidrati).toBe(3);
      expect(totalsDupaStergere.grasimi).toBe(7.4);
      expect(totalsDupaStergere.fibre).toBe(2.1);

      // totaluriPentruPersistare uses the decomposed ingredient totals
      const persistate = totaluriPentruPersistare(alimenteDupaStergere, {
        calorii: 999, // Stale form value
        proteine: 0,
        carbohidrati: 0,
        grasimi: 0,
        fibre: 0,
      });
      expect(persistate.calorii).toBe(350);
      expect(persistate.proteine).toBe(63.5);
    });
  });
});
