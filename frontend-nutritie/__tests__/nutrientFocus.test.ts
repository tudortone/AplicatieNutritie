/**
 * GetFlow — Nutrient Focus / Health-Aware Journal Tests
 * Testează calculatorul de nutrienți, manipularea datelor lipsă (MISSING ≠ ZERO),
 * ierarhizarea contributorilor, defalcarea pe mese, profilurile prestabilite,
 * stocarea preferințelor și garanțiile de siguranță non-medicală.
 */

import { Masa, AlimentDetaliat } from '../types';
import {
  NutrientId,
  NUTRIENT_DEFINITIONS,
  FOCUS_PRESETS,
  DEFAULT_NUTRIENT_FOCUS_PREFERENCES,
  calculateNutrientTotals,
  getTopContributors,
  getMealBreakdown,
  calculate7DayTrends,
  extractFoodNutrientValue,
  flattenFoods,
  getNutrientFocusPreferences,
  selectFocusPreset,
  toggleTrackedNutrient,
  setCustomNutrientTarget,
  setFoodPreferences,
  resetNutrientFocusToDefaults,
} from '../lib/nutrientFocus';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, val: string) => {
      store[key] = val;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
    __resetStore: () => {
      store = {};
    },
  };
});

describe('Nutrient Focus — Core Calculator & Data Rules', () => {
  beforeEach(() => {
    (AsyncStorage as any).__resetStore();
    jest.clearAllMocks();
  });

  describe('CRITICAL RULE: MISSING ≠ ZERO', () => {
    it('does NOT count missing micronutrient data as 0 for a food', () => {
      const foodWithoutSodium: AlimentDetaliat = {
        nume: 'Sandwich clasic',
        calorii: 350,
        proteine: 18,
        carbohidrati: 40,
        grasimi: 12,
        // sodiu lipsă complet
      };

      const extractedVal = extractFoodNutrientValue(foodWithoutSodium, 'sodium');
      expect(extractedVal).toBeUndefined();
      expect(extractedVal).not.toBe(0);
    });

    it('correctly marks daily totals as incomplete when some foods lack nutrient data', () => {
      const mese: Masa[] = [
        {
          id: 'm1',
          user_id: 'u1',
          nume: 'Mic dejun',
          calorii: 300,
          proteine: 15,
          carbohidrati: 30,
          grasimi: 10,
          created_at: '2026-09-30T08:00:00Z',
          tip_masa: 'mic_dejun',
          alimente: [
            {
              nume: 'Omletă cu brânză',
              calorii: 300,
              proteine: 15,
              carbohidrati: 5,
              grasimi: 20,
              micronutrienti: { sodiu: 450, grasimi_saturate: 8 },
            },
          ],
        },
        {
          id: 'm2',
          user_id: 'u1',
          nume: 'Prânz manual',
          calorii: 500,
          proteine: 30,
          carbohidrati: 60,
          grasimi: 15,
          created_at: '2026-09-30T13:00:00Z',
          tip_masa: 'pranz',
          alimente: [
            {
              nume: 'Mâncare gătită fără etichetă',
              calorii: 500,
              proteine: 30,
              carbohidrati: 60,
              grasimi: 15,
              // fără micronutrienti
            },
          ],
        },
      ];

      const results = calculateNutrientTotals(mese, ['sodium', 'saturated_fat', 'calories']);

      const sodiumResult = results.find((r) => r.nutrientId === 'sodium')!;
      expect(sodiumResult.total).toBe(450);
      expect(sodiumResult.status).toBe('incomplete');
      expect(sodiumResult.totalFoodsCount).toBe(2);
      expect(sodiumResult.availableFoodsCount).toBe(1);
      expect(sodiumResult.missingFoodsCount).toBe(1);

      const caloriesResult = results.find((r) => r.nutrientId === 'calories')!;
      expect(caloriesResult.total).toBe(800);
      expect(caloriesResult.status).toBe('complete');
      expect(caloriesResult.missingFoodsCount).toBe(0);
    });

    it('returns status "no_data" and total null when ALL logged foods lack data for a nutrient', () => {
      const mese: Masa[] = [
        {
          id: 'm1',
          user_id: 'u1',
          nume: 'Salată simplă',
          calorii: 150,
          proteine: 3,
          carbohidrati: 10,
          grasimi: 8,
          created_at: '2026-09-30T12:00:00Z',
          tip_masa: 'pranz',
          alimente: [
            {
              nume: 'Salată verde',
              calorii: 150,
              proteine: 3,
              carbohidrati: 10,
              grasimi: 8,
              // fără potasiu
            },
          ],
        },
      ];

      const results = calculateNutrientTotals(mese, ['potassium']);
      const potResult = results[0];

      expect(potResult.total).toBeNull();
      expect(potResult.status).toBe('no_data');
      expect(potResult.availableFoodsCount).toBe(0);
      expect(potResult.missingFoodsCount).toBe(1);
    });
  });

  describe('Contributor Ranking (Phase 7)', () => {
    it('ranks contributors in descending order with neutral classifications', () => {
      const mese: Masa[] = [
        {
          id: 'm1',
          user_id: 'u1',
          nume: 'Mese combinate',
          calorii: 1000,
          proteine: 50,
          carbohidrati: 120,
          grasimi: 30,
          created_at: '2026-09-30T12:00:00Z',
          alimente: [
            {
              nume: 'Orez basmati',
              calorii: 350,
              proteine: 7,
              carbohidrati: 75,
              grasimi: 1,
            },
            {
              nume: 'Banană mare',
              calorii: 110,
              proteine: 1,
              carbohidrati: 28,
              grasimi: 0.3,
            },
            {
              nume: 'Iaurt grecesc',
              calorii: 120,
              proteine: 15,
              carbohidrati: 6,
              grasimi: 4,
            },
          ],
        },
      ];

      const contributors = getTopContributors(mese, 'carbs');

      expect(contributors.length).toBe(3);
      expect(contributors[0].foodName).toBe('Orez basmati');
      expect(contributors[0].amount).toBe(75);
      expect(contributors[0].classification).toBe('higher');

      expect(contributors[1].foodName).toBe('Banană mare');
      expect(contributors[1].amount).toBe(28);

      expect(contributors[2].foodName).toBe('Iaurt grecesc');
      expect(contributors[2].amount).toBe(6);
      expect(contributors[2].classification).toBe('lower');

      // Verificăm că nu există limbaj alarmist de tip „bad” sau „forbidden”
      for (const c of contributors) {
        expect(['higher', 'moderate', 'lower']).toContain(c.classification);
      }
    });
  });

  describe('Per-Meal Breakdown (Phase 8)', () => {
    it('calculates totals per meal with accurate incomplete data flags', () => {
      const mese: Masa[] = [
        {
          id: 'm1',
          user_id: 'u1',
          nume: 'Mic dejun',
          calorii: 300,
          proteine: 20,
          carbohidrati: 35,
          grasimi: 10,
          tip_masa: 'mic_dejun',
          created_at: '2026-09-30T08:00:00Z',
          alimente: [
            {
              nume: 'Ovăz cu lapte',
              calorii: 300,
              proteine: 20,
              carbohidrati: 35,
              grasimi: 10,
            },
          ],
        },
        {
          id: 'm2',
          user_id: 'u1',
          nume: 'Prânz',
          calorii: 600,
          proteine: 40,
          carbohidrati: 65,
          grasimi: 20,
          tip_masa: 'pranz',
          created_at: '2026-09-30T13:00:00Z',
          alimente: [
            {
              nume: 'Paste integrale',
              calorii: 600,
              proteine: 40,
              carbohidrati: 65,
              grasimi: 20,
            },
          ],
        },
      ];

      const breakdown = getMealBreakdown(mese, 'carbs');

      const breakfast = breakdown.find((b) => b.mealType === 'mic_dejun')!;
      expect(breakfast.amount).toBe(35);
      expect(breakfast.hasIncompleteData).toBe(false);

      const lunch = breakdown.find((b) => b.mealType === 'pranz')!;
      expect(lunch.amount).toBe(65);
      expect(lunch.hasIncompleteData).toBe(false);

      const dinner = breakdown.find((b) => b.mealType === 'cina')!;
      expect(dinner.amount).toBeNull();
      expect(dinner.hasIncompleteData).toBe(false);
    });
  });

  describe('7-Day Trends Calculation (Phase 9)', () => {
    it('evaluates daily averages and days meeting target without clinical outcome claims', () => {
      const historyByDate: Record<string, Masa[]> = {
        '2026-09-24': [
          {
            id: '1', user_id: 'u1', nume: 'Zi 1', calorii: 2000, proteine: 90, carbohidrati: 200, grasimi: 60,
            created_at: '2026-09-24T12:00:00Z', fibre: 30,
          },
        ],
        '2026-09-25': [
          {
            id: '2', user_id: 'u1', nume: 'Zi 2', calorii: 2100, proteine: 85, carbohidrati: 220, grasimi: 65,
            created_at: '2026-09-25T12:00:00Z', fibre: 26,
          },
        ],
        '2026-09-26': [
          {
            id: '3', user_id: 'u1', nume: 'Zi 3', calorii: 1950, proteine: 95, carbohidrati: 190, grasimi: 55,
            created_at: '2026-09-26T12:00:00Z', fibre: 32,
          },
        ],
      };

      const trends = calculate7DayTrends(historyByDate, 'fiber', 28);

      expect(trends.daysEvaluated).toBe(3);
      expect(trends.daysWithData).toBe(3);
      expect(trends.averageAmount).toBe(29.3);
      expect(trends.daysMeetingTarget).toBe(2); // 30 >= 28 and 32 >= 28
      expect(trends.isLimit).toBe(false);
    });
  });

  describe('Preset Profiles & Preferences Storage (Phase 3 & 4)', () => {
    it('returns default preferences on fresh start', async () => {
      const prefs = await getNutrientFocusPreferences();
      expect(prefs.activePreset).toBe('general');
      expect(prefs.trackedNutrients).toEqual(['calories', 'protein', 'carbs', 'fat', 'fiber']);
    });

    it('switches to CARB_AWARENESS preset and updates tracked nutrients', async () => {
      const updated = await selectFocusPreset('carb_awareness');
      expect(updated.activePreset).toBe('carb_awareness');
      expect(updated.trackedNutrients).toEqual(FOCUS_PRESETS.carb_awareness.nutrients);
      expect(updated.trackedNutrients).toContain('carbs');
      expect(updated.trackedNutrients).toContain('fiber');
    });

    it('switches to HEART_HEALTH preset', async () => {
      const updated = await selectFocusPreset('heart_health');
      expect(updated.activePreset).toBe('heart_health');
      expect(updated.trackedNutrients).toContain('saturated_fat');
      expect(updated.trackedNutrients).toContain('sodium');
    });

    it('switches to LOW_SODIUM preset', async () => {
      const updated = await selectFocusPreset('low_sodium');
      expect(updated.activePreset).toBe('low_sodium');
      expect(updated.trackedNutrients).toEqual(['sodium']);
    });

    it('switches to HIGH_FIBER preset', async () => {
      const updated = await selectFocusPreset('high_fiber');
      expect(updated.activePreset).toBe('high_fiber');
      expect(updated.trackedNutrients).toEqual(['fiber']);
    });

    it('allows custom target configuration', async () => {
      const updated = await setCustomNutrientTarget('sodium', 1800);
      expect(updated.customTargets.sodium).toBe(1800);

      // Clearing custom target
      const cleared = await setCustomNutrientTarget('sodium', null);
      expect(cleared.customTargets.sodium).toBeUndefined();
    });

    it('toggles a nutrient and transitions to CUSTOM preset', async () => {
      await selectFocusPreset('general');
      const updated = await toggleTrackedNutrient('potassium');

      expect(updated.activePreset).toBe('custom');
      expect(updated.trackedNutrients).toContain('potassium');
    });

    it('prevents deselecting all nutrients (keeps minimum 1)', async () => {
      await selectFocusPreset('low_sodium'); // only 'sodium'
      const updated = await toggleTrackedNutrient('sodium', false);
      expect(updated.trackedNutrients.length).toBeGreaterThanOrEqual(1);
    });

    it('stores non-medical food preferences safely without health diagnoses', async () => {
      const updated = await setFoodPreferences(['vegetarian', 'mediterranean']);
      expect(updated.foodPreferences).toEqual(['vegetarian', 'mediterranean']);
    });

    it('resets preferences to default', async () => {
      await selectFocusPreset('heart_health');
      await setCustomNutrientTarget('sodium', 1500);

      const reset = await resetNutrientFocusToDefaults();
      expect(reset.activePreset).toBe('general');
      expect(reset.trackedNutrients).toEqual(DEFAULT_NUTRIENT_FOCUS_PREFERENCES.trackedNutrients);
      expect(reset.customTargets).toEqual({});
    });
  });

  describe('Medical Safety & Compliance Audits', () => {
    it('verifies all supported nutrients have definitions and valid units', () => {
      const allKeys: NutrientId[] = [
        'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugars',
        'added_sugars', 'saturated_fat', 'unsaturated_fat', 'sodium',
        'cholesterol', 'potassium',
      ];

      for (const k of allKeys) {
        const def = NUTRIENT_DEFINITIONS[k];
        expect(def).toBeDefined();
        expect(['kcal', 'g', 'mg']).toContain(def.unit);
        expect(typeof def.isLimit).toBe('boolean');
      }
    });

    it('verifies that no clinical diagnoses are saved in storage data structure', async () => {
      const prefs = await getNutrientFocusPreferences();
      const keys = Object.keys(prefs);
      expect(keys).not.toContain('disease');
      expect(keys).not.toContain('diagnosis');
      expect(keys).not.toContain('diabetes');
      expect(keys).not.toContain('hypertension');
    });
  });
});
