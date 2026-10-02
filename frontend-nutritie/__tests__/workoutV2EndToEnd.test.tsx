import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { WorkoutV2Experience } from '../components/workout-v2/WorkoutV2Experience';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#090c0e', surfaceBg: '#181d22', border: '#333', textPrimary: '#fff',
    textSecondary: '#999', textTertiary: '#777', accent: '#ccff00', accentTertiary: '#00f0ff',
    textOnAccent: '#000', danger: '#f55', success: '#0f0', disabledText: '#555', disabledBg: '#333',
    inputBg: '#111', inputBorder: '#444', warning: '#f90', muscleBase: '#222',
  } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number }) => values?.count === undefined ? key : `${key}:${values.count}` }),
}));

describe('Workout V2 isolated end-to-end preview', () => {
  it('drives preset → edit/save → active sets → verified summary without external persistence', async () => {
    const view = await render(<WorkoutV2Experience />);
    await fireEvent.press(view.getByTestId('workout-v2-preset-push'));
    await waitFor(() => expect(view.getByTestId('workout-v2-template-name')).toBeTruthy());
    await fireEvent.changeText(view.getByTestId('workout-v2-template-name'), 'Push Preview');
    await fireEvent.press(view.getByLabelText('workoutV2.builder.save'));
    await fireEvent.press(view.getByTestId('workout-v2-start'));
    await waitFor(() => expect(view.getAllByRole('checkbox').length).toBeGreaterThan(0));
    const setIds = view.getAllByRole('checkbox').map((control) => control.props.testID as string);
    expect(setIds.length).toBeGreaterThan(0);
    for (const setId of setIds) {
      await fireEvent.press(view.getByTestId(setId));
      await waitFor(() => expect(view.getByTestId(setId).props.accessibilityState.checked).toBe(true));
    }
    await fireEvent.press(view.getByLabelText('workoutV2.active.finish'));
    await waitFor(() => expect(view.getByTestId('workout-v2-strength-summary')).toBeTruthy());
    expect(view.getByText('workoutV2.strength.currentStrength')).toBeTruthy();
  });
});
