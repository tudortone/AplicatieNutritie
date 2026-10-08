import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { WaterIntakeCard } from '../components/home/WaterIntakeCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApa } from '../hooks/useApa';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children?: React.ReactNode }) => children }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children?: React.ReactNode }) => children }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { ml?: number }) => options?.ml ? `${key} ${options.ml}` : key,
  }),
}));

describe('WaterIntakeCard', () => {
  const actions = () => ({
    onAddGlass: jest.fn(),
    onRemoveGlass: jest.fn(),
    onAddWeight: jest.fn(),
    onSetConsumedMl: jest.fn(async () => undefined),
  });

  it('accepts an exact consumed water amount from the numeric keyboard', async () => {
    const callbacks = actions();
    const screen = await render(
      <WaterIntakeCard consumedMl={500} targetMl={2450} loading={false} {...callbacks} />,
    );

    const input = screen.getByTestId('water-consumed-input');
    expect(input.props.keyboardType).toBe('number-pad');
    fireEvent.changeText(input, '925');
    fireEvent(input, 'submitEditing');
    expect(callbacks.onSetConsumedMl).toHaveBeenCalledWith(925);
    expect(screen.getByTestId('water-consumed-ml').props.accessibilityLabel).toContain('500');
    expect(screen.getByTestId('water-target-ml').props.children).toContain('2450');
    expect(screen.getByTestId('water-progress')).toBeTruthy();
    expect(screen.queryByTestId('water-add-weight')).toBeNull();

    await screen.rerender(
      <WaterIntakeCard consumedMl={500} targetMl={null} loading={false} {...callbacks} />,
    );
    expect(screen.getByTestId('water-consumed-ml').props.accessibilityLabel).toContain('500');
    expect(screen.queryByTestId('water-target-ml')).toBeNull();
    expect(screen.queryByTestId('water-progress')).toBeNull();
    fireEvent.press(screen.getByTestId('water-add-glass'));
    fireEvent.press(screen.getByTestId('water-remove-glass'));
    fireEvent.press(screen.getByTestId('water-add-weight'));
    expect(callbacks.onAddGlass).toHaveBeenCalledTimes(1);
    expect(callbacks.onRemoveGlass).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddWeight).toHaveBeenCalledTimes(1);
  });

  afterEach(() => cleanup());

  it('migrates legacy glasses and persists exact millilitres for today', async () => {
    await AsyncStorage.clear();
    const day = new Date();
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    await AsyncStorage.setItem(`apa_${key}`, '3');

    const hook = await renderHook(() => useApa());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.consumedMl).toBe(750);

    await act(async () => { await hook.result.current.setConsumedMl(925); });
    expect(await AsyncStorage.getItem(`apa_ml_${key}`)).toBe('925');
    hook.unmount();
  });
});
