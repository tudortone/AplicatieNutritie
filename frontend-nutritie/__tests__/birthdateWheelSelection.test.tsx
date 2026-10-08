import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../components/onboarding/EcranPas', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../context/OnboardingContext', () => ({
  useOnboarding: () => ({ date: { dataNasterii: null }, actualizeaza: jest.fn() }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A1',
    },
  }),
}));

import { Coloana } from '../app/onboarding/data-nasterii';

describe('DOB wheel continuous center-row selection', () => {
  test('highlights the row currently centered during native scrolling without committing early', async () => {
    const onChange = jest.fn();
    const view = await render(
      <Coloana
        valori={[2004, 2003, 2002, 2001, 2000]}
        selectat={2004}
        laSchimbare={onChange}
        latime={120}
        etichetaAccesibila="Year"
      />,
    );

    const wheel = view.getByLabelText('Year');
    await fireEvent.scroll(wheel, { nativeEvent: { contentOffset: { y: 4 * 46 } } });

    expect(StyleSheet.flatten(view.getByText('2000').props.style)).toEqual(
      expect.objectContaining({ color: '#FFFFFF', opacity: 1, fontWeight: '800' }),
    );
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent(wheel, 'momentumScrollEnd', { nativeEvent: { contentOffset: { y: 4 * 46 } } });
    expect(onChange).toHaveBeenCalledWith(2000);
  });
});
