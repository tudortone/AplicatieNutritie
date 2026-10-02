import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Holographic3DAnatomyBody } from '../components/fitness/Holographic3DAnatomyBody';

jest.mock('../components/fitness/BodyMap', () => {
  const ReactNative = jest.requireActual('react-native');
  return {
    BodyMap: ({ view, width }: { view: string; width: number }) => (
      <ReactNative.View testID="anatomy-map" accessibilityLabel={`${view}:${width}`} />
    ),
  };
});
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: { danger: '#f00', textOnAccent: '#000' } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const props = {
  activeGroups: ['Chest'],
  intensityScore: 80,
  accentColor: '#0ff',
  secondaryColor: '#0f0',
  cardBg: '#111',
  textPrimary: '#fff',
};

describe('P1-08 anatomy component accessibility and localization', () => {
  it('uses localized labels and exposes selected front/back controls', async () => {
    const view = await render(<Holographic3DAnatomyBody {...props} />);

    expect(view.getByText('anatomy.scanLabel')).toBeTruthy();
    expect(view.getByText('anatomy.detailTitle')).toBeTruthy();
    expect(view.getByText('anatomy.legendTitle')).toBeTruthy();
    expect(view.getByLabelText('anatomy.showFrontA11y').props.accessibilityState.selected).toBe(true);

    fireEvent.press(view.getByLabelText('anatomy.showBackA11y'));

    await waitFor(() => {
      expect(view.getByLabelText('anatomy.showBackA11y').props.accessibilityState.selected).toBe(true);
      expect(view.getByTestId('anatomy-map').props.accessibilityLabel).toMatch(/^back:/);
    });
  });
});
