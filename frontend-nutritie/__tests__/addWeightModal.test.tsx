import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AddWeightModal } from '../components/AddWeightModal';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error' },
}));

describe('AddWeightModal missing current weight', () => {
  it('starts empty, does not imply 75 kg, and saves a valid user-entered value', async () => {
    const onSave = jest.fn();
    const screen = await render(
      <AddWeightModal visible onClose={jest.fn()} onSave={onSave} greutateCurenta={null} />,
    );

    expect(screen.getByTestId('weight-current-input').props.value).toBe('');
    expect(screen.queryByText(/75 kg/)).toBeNull();
    expect(screen.getByTestId('weight-adjust-minus-05').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('weight-current-input'), '70');
    await waitFor(() => expect(screen.getByTestId('weight-adjust-minus-05').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByTestId('weight-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(70));
  });

  it('keeps the existing 30–250 kg validation', async () => {
    const onSave = jest.fn();
    const screen = await render(
      <AddWeightModal visible onClose={jest.fn()} onSave={onSave} greutateCurenta={70} />,
    );
    await fireEvent.changeText(screen.getByTestId('weight-current-input'), '29');
    await fireEvent.press(screen.getByTestId('weight-save'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
