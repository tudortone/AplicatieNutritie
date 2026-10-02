import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { WaterIntakeCard } from '../components/home/WaterIntakeCard';

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
  });

  afterEach(async () => {
    await cleanup();
  });

  it('shows the target and progress when a real target is available', async () => {
    const callbacks = actions();
    const screen = await render(
      <WaterIntakeCard consumedMl={750} targetMl={2450} loading={false} {...callbacks} />,
    );

    expect(screen.getByTestId('water-consumed-ml').props.accessibilityLabel).toContain('750');
    expect(screen.getByTestId('water-target-ml').props.children).toContain('2450');
    expect(screen.getByTestId('water-progress')).toBeTruthy();
    expect(screen.queryByTestId('water-add-weight')).toBeNull();
  });

  it('keeps water logging available and prompts for weight without a target', async () => {
    const callbacks = actions();
    const screen = await render(
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
});
