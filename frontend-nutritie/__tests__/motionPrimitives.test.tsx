import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

import { MotionCardEnter, MotionScreenEnter, MotionMacroBar, MotionSkeleton } from '../components/ui/MotionPrimitives';
import { AppThemeProvider } from '../context/ThemeContext';

describe('Phase E: Motion System Primitives', () => {
  it('renders MotionCardEnter with children', async () => {
    const view = await render(
      <AppThemeProvider>
        <MotionCardEnter>
          <Text>Card Content</Text>
        </MotionCardEnter>
      </AppThemeProvider>
    );
    expect(view.getByText('Card Content')).toBeTruthy();
  });

  it('renders MotionScreenEnter with children', async () => {
    const view = await render(
      <AppThemeProvider>
        <MotionScreenEnter>
          <Text>Screen Content</Text>
        </MotionScreenEnter>
      </AppThemeProvider>
    );
    expect(view.getByText('Screen Content')).toBeTruthy();
  });

  it('renders MotionMacroBar with accessibility progressbar role', async () => {
    const view = await render(
      <AppThemeProvider>
        <MotionMacroBar progress={0.65} />
      </AppThemeProvider>
    );
    const bar = view.getByTestId('macro-progress-bar');
    expect(bar).toBeTruthy();
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 65 });
  });

  it('renders MotionSkeleton with dimensions', async () => {
    const view = await render(
      <AppThemeProvider>
        <MotionSkeleton width={120} height={20} />
      </AppThemeProvider>
    );
    expect(view.toJSON()).toBeTruthy();
  });
});
