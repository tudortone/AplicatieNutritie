import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

import {
  getCompanionStage,
  getDaysUntilNextEvolution,
  getEvolutionProgressPercent,
  getLimitBeaconStatus,
  COMPANION_STAGES,
} from '../lib/flowCompanion';
import { FlowCompanionPill } from '../components/home/FlowCompanionPill';
import { FlowCompanionModal } from '../components/home/FlowCompanionModal';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      cardBg: '#14181A',
      cardBorder: '#262D30',
      accent: '#C5F467',
      accentGradient: ['#C5F467', '#A8EE44'],
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      textTertiary: '#5C6470',
      textOnAccent: '#000000',
      overlayStrong: 'rgba(0,0,0,0.6)',
      danger: '#EF4444',
      warning: '#F59E0B',
    },
  }),
}));

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: any) => {
      if (typeof def === 'string') return def;
      if (typeof def === 'object' && def !== null) {
        if ('days' in def) return `Mai ai ${def.days} zile!`;
        if ('stage' in def) return `Etapa ${def.stage} din 5`;
        if ('consumed' in def && 'target' in def) return `${def.consumed} din ${def.target} kcal`;
      }
      return key;
    },
  }),
}));

describe('Flow Companion & Nutritional Limit Beacon Suite', () => {
  describe('1. Mathematical & Progression Logic (lib/flowCompanion.ts)', () => {
    it('maps streak to correct Pokemon-style companion stages', () => {
      // Stage 1: Egg (0 - 2 days)
      expect(getCompanionStage(0).id).toBe('egg');
      expect(getCompanionStage(1).id).toBe('egg');
      expect(getCompanionStage(2).id).toBe('egg');

      // Stage 2: Fox (3 - 6 days)
      expect(getCompanionStage(3).id).toBe('fox');
      expect(getCompanionStage(6).id).toBe('fox');

      // Stage 3: Lynx (7 - 13 days)
      expect(getCompanionStage(7).id).toBe('lynx');
      expect(getCompanionStage(13).id).toBe('lynx');

      // Stage 4: Wolf (14 - 29 days)
      expect(getCompanionStage(14).id).toBe('wolf');
      expect(getCompanionStage(29).id).toBe('wolf');

      // Stage 5: Titan (30+ days)
      expect(getCompanionStage(30).id).toBe('titan');
      expect(getCompanionStage(100).id).toBe('titan');
    });

    it('calculates days until next evolution correctly', () => {
      expect(getDaysUntilNextEvolution(0)).toBe(3); // 3 - 0
      expect(getDaysUntilNextEvolution(1)).toBe(2); // 3 - 1
      expect(getDaysUntilNextEvolution(3)).toBe(4); // 7 - 3
      expect(getDaysUntilNextEvolution(7)).toBe(7); // 14 - 7
      expect(getDaysUntilNextEvolution(14)).toBe(16); // 30 - 14
      expect(getDaysUntilNextEvolution(30)).toBeNull(); // Max level reached
    });

    it('calculates evolution progress percent accurately', () => {
      expect(getEvolutionProgressPercent(0)).toBe(0);
      expect(getEvolutionProgressPercent(3)).toBe(0); // start of stage 2 (3..7)
      expect(getEvolutionProgressPercent(5)).toBe(50); // halfway between 3 and 7: (5-3)/(7-3) = 2/4 = 50%
      expect(getEvolutionProgressPercent(35)).toBe(100); // maxed
    });

    it('derives limit beacon states: optimal, near_limit, and exceeded', () => {
      // 1200 / 2000 = 60% -> optimal
      const optimal = getLimitBeaconStatus(1200, 2000);
      expect(optimal.status).toBe('optimal');
      expect(optimal.color).toBe('#C5F467');
      expect(optimal.percent).toBe(60);

      // 1800 / 2000 = 90% -> near_limit (>= 85%)
      const near = getLimitBeaconStatus(1800, 2000);
      expect(near.status).toBe('near_limit');
      expect(near.color).toBe('#F59E0B');
      expect(near.percent).toBe(90);

      // 2150 / 2000 = 108% -> exceeded (> 100%)
      const exceeded = getLimitBeaconStatus(2150, 2000);
      expect(exceeded.status).toBe('exceeded');
      expect(exceeded.color).toBe('#EF4444');
      expect(exceeded.percent).toBe(108);
      expect(exceeded.differenceKcal).toBe(150);
    });
  });

  describe('2. FlowCompanionPill Component', () => {
    it('renders mascot name and beacon label in standard view', async () => {
      const mockPress = jest.fn();
      const view = await render(
        <FlowCompanionPill
          streak={5}
          caloriiConsumate={1200}
          caloriiTinta={2000}
          onPress={mockPress}
        />
      );

      expect(view.getByTestId('home-flow-companion-pill')).toBeTruthy();
      expect(view.getByText('Pui de Foc')).toBeTruthy();
      expect(view.getByText('În grafic')).toBeTruthy();

      await act(async () => {
        await fireEvent.press(view.getByTestId('home-flow-companion-pill'));
      });
      expect(mockPress).toHaveBeenCalledTimes(1);
    });

    it('renders compact mode with lightbulb beacon on small displays', async () => {
      const mockPress = jest.fn();
      const view = await render(
        <FlowCompanionPill
          streak={10}
          caloriiConsumate={1900}
          caloriiTinta={2000}
          isCompact={true}
          onPress={mockPress}
        />
      );

      expect(view.getByTestId('home-flow-companion-pill')).toBeTruthy();
      // Text is omitted in compact mode to guarantee 0 overflow
      expect(view.queryByText('Râs Electric')).toBeNull();
    });
  });

  describe('3. FlowCompanionModal Component', () => {
    it('renders details, evolution bar, limit beacon explanation and closes on action', async () => {
      const mockClose = jest.fn();
      const view = await render(
        <FlowCompanionModal
          visible={true}
          onClose={mockClose}
          streak={7}
          caloriiConsumate={1500}
          caloriiTinta={2000}
        />
      );

      expect(view.getByTestId('flow-companion-modal-sheet')).toBeTruthy();
      expect(view.getByText('Râs Electric')).toBeTruthy();
      expect(view.getByText('Etapa 3 din 5')).toBeTruthy();
      expect(view.getByText('Becul de Limită Nutrițională')).toBeTruthy();
      expect(view.getByText('75%')).toBeTruthy();

      // Close through backdrop
      await act(async () => {
        await fireEvent.press(view.getByTestId('flow-companion-backdrop'));
      });
      expect(mockClose).toHaveBeenCalledTimes(1);

      // Close through button
      await act(async () => {
        await fireEvent.press(view.getByTestId('flow-companion-modal-action'));
      });
      expect(mockClose).toHaveBeenCalledTimes(2);
    });
  });
});
