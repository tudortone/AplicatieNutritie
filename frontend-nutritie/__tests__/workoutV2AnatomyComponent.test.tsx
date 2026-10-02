import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import {
  resolveAnatomyV2State,
  strengthLevelForScore,
} from '../lib/workout-v2/anatomyState';
import { AnatomyV2Map } from '../components/workout-v2/AnatomyV2Map';

jest.mock('react-native-body-parts-anatomy', () => {
  const actual = jest.requireActual('react-native-body-parts-anatomy');
  const ReactForMock = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  return {
    ...actual,
    BodySilhouette: ({ testID, view, onFragmentPress }: {
      testID: string;
      view: 'front' | 'back';
      onFragmentPress?: (slug: string) => void;
    }) => ReactForMock.createElement(Pressable, {
      testID,
      onPress: () => onFragmentPress?.(view === 'front' ? 'chest' : 'upper-back'),
    }),
  };
});

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#ccff00', accentTertiary: '#00f0ff', warning: '#ff9900',
      muscleBase: '#2a323d', textPrimary: '#ffffff', textSecondary: '#999999',
      surfaceBg: '#181d22', border: '#333333', background: '#090c0e',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Workout V2 anatomy display states', () => {
  it('keeps exercise roles separate from strength levels', () => {
    expect(resolveAnatomyV2State({
      mode: 'exercise', primary: ['chest'], secondary: ['triceps'], stabilizers: ['abs'],
    }, 'chest')).toBe('PRIMARY');
    expect(resolveAnatomyV2State({
      mode: 'strength', scores: { chest: 81 },
    }, 'chest')).toBe('LEVEL_5');
    expect(strengthLevelForScore(undefined)).toBe('NO_DATA');
  });

  it('supports front/back state and muscle selection', async () => {
    const onSelectMuscle = jest.fn();
    const view = await render(
      <AnatomyV2Map
        mode={{ mode: 'exercise', primary: ['chest'], secondary: [], stabilizers: [] }}
        onSelectMuscle={onSelectMuscle}
      />,
    );

    expect(view.getByLabelText('workoutV2.anatomy.showFront').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(view.getByTestId('anatomy-v2-source-front'));
    expect(onSelectMuscle).toHaveBeenCalledWith('chest');
    await fireEvent.press(view.getByLabelText('workoutV2.anatomy.showBack'));
    await waitFor(() => {
      expect(view.getByLabelText('workoutV2.anatomy.showBack').props.accessibilityState.selected).toBe(true);
    });
    await fireEvent.press(view.getByTestId('anatomy-v2-source-back'));
    expect(onSelectMuscle).toHaveBeenLastCalledWith('lats');
  });

  it('uses GetFlow-owned package-data hit targets for muscle selection on Web', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const onSelectMuscle = jest.fn();

    try {
      const view = await render(
        <AnatomyV2Map
          mode={{ mode: 'exercise', primary: ['chest'], secondary: [], stabilizers: [] }}
          onSelectMuscle={onSelectMuscle}
        />,
      );

      expect(view.queryByTestId('anatomy-v2-source-front')).toBeNull();
      await fireEvent.press(view.getByTestId('anatomy-v2-web-chest-male-front-1'));
      expect(onSelectMuscle).toHaveBeenCalledWith('chest');
    } finally {
      if (originalDescriptor) Object.defineProperty(Platform, 'OS', originalDescriptor);
    }
  });
});
