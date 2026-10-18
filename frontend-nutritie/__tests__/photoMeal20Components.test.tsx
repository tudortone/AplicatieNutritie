import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react-native';
import { MacroDistributionBar } from '../components/food/MacroDistributionBar';
import { StepperQuantityControl } from '../components/ui/StepperQuantityControl';
import { ChangeIngredientSheet } from '../components/food/ChangeIngredientSheet';
import { IngredientCardRow } from '../components/food/IngredientCardRow';
import { PhotoMealErrorView } from '../components/food/PhotoMealErrorView';
import { PhotoMealResultView } from '../components/food/PhotoMealResultView';
import type { AlimentScanat } from '../components/food/FoodScanSuccessModal';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Mock expo-blur
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: ({ children, style, testID }: any) => (
      <View testID={testID} style={style}>{children}</View>
    ),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/FlowCreditsContext', () => ({
  useFlowCredits: () => ({
    balance: { total: 3, dailyRemaining: 3, rewarded: 0, purchased: 0, rewardedGrantsRemaining: 5, serverDay: null },
    loading: false,
    unlimited: false,
    visible: false,
    rewardState: 'idle',
    creditProducts: [],
    open: jest.fn(),
    close: jest.fn(),
    refresh: jest.fn().mockResolvedValue(null),
    consumeOptimisticCredit: jest.fn(),
    watchRewarded: jest.fn().mockResolvedValue('unavailable'),
    purchase: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

describe('Photo AI 2.0: Component Suite & User Experience Contracts', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  describe('MacroDistributionBar', () => {
    it('renders proportional distribution bar with non-zero values', async () => {
      const view = await render(
        <MacroDistributionBar
          protein={30}
          carbs={40}
          fat={15}
          fiber={5}
        />
      );

      expect(view.getByTestId('macro-distribution-bar')).toBeTruthy();
      expect(view.getByTestId('macro-bar-protein')).toBeTruthy();
      expect(view.getByTestId('macro-bar-carbs')).toBeTruthy();
      expect(view.getByTestId('macro-bar-fat')).toBeTruthy();
      expect(view.getByTestId('macro-bar-fiber')).toBeTruthy();

      expect(view.getByText('30g')).toBeTruthy();
      expect(view.getByText('40g')).toBeTruthy();
      expect(view.getByText('15g')).toBeTruthy();
      expect(view.getByText('5g')).toBeTruthy();
    });

    it('handles zero macro state with neutral empty bar', async () => {
      const view = await render(
        <MacroDistributionBar
          protein={0}
          carbs={0}
          fat={0}
          fiber={0}
        />
      );

      expect(view.getByTestId('macro-distribution-bar')).toBeTruthy();
      expect(view.getByTestId('macro-bar-empty')).toBeTruthy();
      expect(view.getAllByText('0g')).toHaveLength(4);
    });
  });

  describe('StepperQuantityControl', () => {
    it('renders initial grams with minus and plus buttons', async () => {
      const onChange = jest.fn();
      const view = await render(
        <StepperQuantityControl
          grams={150}
          onChangeGrams={onChange}
        />
      );

      expect(view.getByTestId('stepper-quantity-control')).toBeTruthy();
      expect(view.getByText('150')).toBeTruthy();
      expect(view.getByText('g')).toBeTruthy();

      const plusBtn = view.getByTestId('stepper-plus-btn');
      await act(async () => {
        fireEvent.press(plusBtn);
      });
      expect(onChange).toHaveBeenCalledWith(175);

      const minusBtn = view.getByTestId('stepper-minus-btn');
      await act(async () => {
        fireEvent.press(minusBtn);
      });
      expect(onChange).toHaveBeenCalledWith(125);
    });

    it('clamps decrement at min grams (5g)', async () => {
      const onChange = jest.fn();
      const view = await render(
        <StepperQuantityControl
          grams={10}
          min={5}
          step={25}
          onChangeGrams={onChange}
        />
      );

      const minusBtn = view.getByTestId('stepper-minus-btn');
      await act(async () => {
        fireEvent.press(minusBtn);
      });
      expect(onChange).toHaveBeenCalledWith(5);
    });

    it('allows tap-to-type inline numeric editing', async () => {
      const onChange = jest.fn();
      const view = await render(
        <StepperQuantityControl
          grams={150}
          onChangeGrams={onChange}
        />
      );

      const chip = view.getByTestId('stepper-gram-chip');
      await act(async () => {
        fireEvent.press(chip);
      });

      const input = view.getByTestId('stepper-gram-input');
      expect(input).toBeTruthy();

      await act(async () => {
        fireEvent.changeText(input, '220');
      });
      await act(async () => {
        fireEvent(input, 'blur');
      });
      expect(onChange).toHaveBeenCalledWith(220);
    });

    it('disables controls when disabled prop is true', async () => {
      const onChange = jest.fn();
      const view = await render(
        <StepperQuantityControl
          grams={150}
          disabled={true}
          onChangeGrams={onChange}
        />
      );

      const minusBtn = view.getByTestId('stepper-minus-btn');
      const plusBtn = view.getByTestId('stepper-plus-btn');
      expect(minusBtn.props.accessibilityState.disabled).toBe(true);
      expect(plusBtn.props.accessibilityState.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(plusBtn);
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('ChangeIngredientSheet', () => {
    it('renders candidate suggestions and filters by search query', async () => {
      const onSelect = jest.fn();
      const onClose = jest.fn();
      const view = await render(
        <ChangeIngredientSheet
          visible={true}
          currentIngredientName="Pui"
          onSelectCandidate={onSelect}
          onClose={onClose}
        />
      );

      expect(view.getByTestId('change-ingredient-sheet')).toBeTruthy();
      expect(view.getByPlaceholderText('Caută aliment sau ingredient...')).toBeTruthy();

      const searchInput = view.getByTestId('change-ingredient-search-input');
      await act(async () => {
        fireEvent.changeText(searchInput, 'orez');
      });

      expect(view.getByText('Orez alb fiert')).toBeTruthy();
      const candidateBtn = view.getByTestId('candidate-Orez alb fiert');
      await act(async () => {
        fireEvent.press(candidateBtn);
      });

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          nume: 'Orez alb fiert',
          calorii_per_100g: 130,
        })
      );
    });

    it('calls onClose when close button is pressed', async () => {
      const onClose = jest.fn();
      const view = await render(
        <ChangeIngredientSheet
          visible={true}
          currentIngredientName="Măr"
          onSelectCandidate={jest.fn()}
          onClose={onClose}
        />
      );

      const closeBtn = view.getByTestId('change-ingredient-close-btn');
      await act(async () => {
        fireEvent.press(closeBtn);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('IngredientCardRow', () => {
    const mockIngredient: AlimentScanat = {
      nume: 'Piept de pui',
      estimare_grame: 150,
      calorii_per_100g: 165,
      proteine_per_100g: 31,
      carbohidrati_per_100g: 0,
      grasimi_per_100g: 3.6,
      fibre_per_100g: 0,
    };

    it('renders ingredient name, macros, and actions', async () => {
      const onChangeGrams = jest.fn();
      const onOpenChange = jest.fn();
      const onDelete = jest.fn();

      const view = await render(
        <IngredientCardRow
          ingredient={mockIngredient}
          index={0}
          onChangeGrams={onChangeGrams}
          onOpenChangeSheet={onOpenChange}
          onDelete={onDelete}
        />
      );

      expect(view.getByTestId('ingredient-card-0')).toBeTruthy();
      expect(view.getByText('Piept de pui')).toBeTruthy();
      // 150g of 165 kcal/100g = 248 kcal
      expect(view.getByText(/248 kcal/)).toBeTruthy();

      const changeBtn = view.getByTestId('ingredient-change-btn-0');
      await act(async () => {
        fireEvent.press(changeBtn);
      });
      expect(onOpenChange).toHaveBeenCalledWith(0);

      const deleteBtn = view.getByTestId('ingredient-delete-btn-0');
      await act(async () => {
        fireEvent.press(deleteBtn);
      });
      expect(onDelete).toHaveBeenCalledWith(0);
    });

    it('renders locked grams and hides actions when pendingPhotoSaveLocked', async () => {
      const view = await render(
        <IngredientCardRow
          ingredient={mockIngredient}
          index={0}
          pendingPhotoSaveLocked={true}
          onChangeGrams={jest.fn()}
          onOpenChangeSheet={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      expect(view.getByTestId('camera-locked-ingredient-grams').props.children).toEqual([150, ' g']);
      expect(view.queryByTestId('ingredient-change-btn-0')).toBeNull();
      expect(view.queryByTestId('ingredient-delete-btn-0')).toBeNull();
    });
  });

  describe('PhotoMealErrorView', () => {
    it('renders not_food error with retake, gallery, and home actions', async () => {
      const onRetake = jest.fn();
      const onGallery = jest.fn();
      const onHome = jest.fn();

      const view = await render(
        <PhotoMealErrorView
          errorType="not_food"
          onRetake={onRetake}
          onGallery={onGallery}
          onHome={onHome}
        />
      );

      expect(view.getByTestId('camera-not-food-card')).toBeTruthy();
      expect(view.getByText(/Nu am identificat alimente/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByTestId('not-food-retake-btn'));
      });
      expect(onRetake).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.press(view.getByTestId('not-food-gallery-btn'));
      });
      expect(onGallery).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.press(view.getByTestId('not-food-home-btn'));
      });
      expect(onHome).toHaveBeenCalledTimes(1);
    });

    it('renders network error with retry and home actions', async () => {
      const onRetry = jest.fn();
      const onHome = jest.fn();

      const view = await render(
        <PhotoMealErrorView
          errorType="network_error"
          onRetry={onRetry}
          onHome={onHome}
          onRetake={jest.fn()}
          onGallery={jest.fn()}
        />
      );

      expect(view.getByTestId('photo-meal-error-view')).toBeTruthy();
      expect(view.getByText(/Conexiunea a fost întreruptă/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByTestId('error-primary-btn'));
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('PhotoMealResultView (Full Option A Athletic Pro HUD)', () => {
    const mockItems: AlimentScanat[] = [
      {
        nume: 'Piept de pui',
        estimare_grame: 200,
        calorii_per_100g: 165,
        proteine_per_100g: 31,
        carbohidrati_per_100g: 0,
        grasimi_per_100g: 3.6,
        fibre_per_100g: 0,
      },
      {
        nume: 'Orez fiert',
        estimare_grame: 150,
        calorii_per_100g: 130,
        proteine_per_100g: 2.7,
        carbohidrati_per_100g: 28,
        grasimi_per_100g: 0.3,
        fibre_per_100g: 0.4,
      },
    ];

    it('renders HUD with correct calculated totals (525 kcal)', async () => {
      const onSave = jest.fn();
      const view = await render(
        <PhotoMealResultView
          rezultat={mockItems}
          tipMasa="pranz"
          onChangeTipMasa={jest.fn()}
          onUpdateRezultat={jest.fn()}
          onSaveToJournal={onSave}
          onCancelAndRescan={jest.fn()}
          isSaving={false}
        />
      );

      expect(view.getByTestId('camera-result-scroll')).toBeTruthy();
      expect(view.getByTestId('camera-macro-summary')).toBeTruthy();
      // 200g * 1.65 = 330 kcal + 150g * 1.30 = 195 kcal = 525 kcal
      expect(view.getByText('525')).toBeTruthy();

      const saveBtn = view.getByTestId('camera-add-journal-btn');
      await act(async () => {
        fireEvent.press(saveBtn);
      });
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('renders save failure banner and retry save CTA when saveFailureMessage is present', async () => {
      const onRetrySave = jest.fn();
      const onSaveOffline = jest.fn();

      const view = await render(
        <PhotoMealResultView
          rezultat={mockItems}
          tipMasa="pranz"
          saveFailureMessage="Eroare de conexiune la salvare"
          onRetrySave={onRetrySave}
          onSaveOffline={onSaveOffline}
          onChangeTipMasa={jest.fn()}
          onUpdateRezultat={jest.fn()}
          onSaveToJournal={jest.fn()}
          onCancelAndRescan={jest.fn()}
          isSaving={false}
        />
      );

      expect(view.getByTestId('save-failure-banner')).toBeTruthy();
      expect(view.getByText(/Eroare de conexiune la salvare/)).toBeTruthy();

      const retryBtn = view.getByTestId('camera-retry-save-btn');
      expect(retryBtn).toBeTruthy();
      await act(async () => {
        fireEvent.press(retryBtn);
      });
      expect(onRetrySave).toHaveBeenCalledTimes(1);

      const offlineBtn = view.getByTestId('save-offline-direct-btn');
      expect(offlineBtn).toBeTruthy();
      await act(async () => {
        fireEvent.press(offlineBtn);
      });
      expect(onSaveOffline).toHaveBeenCalledTimes(1);
    });
  });
});
