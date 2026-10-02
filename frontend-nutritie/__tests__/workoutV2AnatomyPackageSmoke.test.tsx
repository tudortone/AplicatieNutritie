import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AnatomyV2Map } from '../components/workout-v2/AnatomyV2Map';

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

describe('Workout V2 published anatomy package integration', () => {
  it('renders audited human front and back path data in the isolated V2 component', async () => {
    const view = await render(<AnatomyV2Map mode={{ mode: 'strength', scores: { chest: 84, lats: 55 } }} />);

    expect(view.getByTestId('anatomy-v2-source-front-chest-male-front-1')).toBeTruthy();
    expect(view.getByTestId('anatomy-v2-source-front-abs-male-front-1')).toBeTruthy();

    await fireEvent.press(view.getByTestId('anatomy-v2-back'));
    await waitFor(() => {
      expect(view.getByTestId('anatomy-v2-source-back-upper-back-male-back-1')).toBeTruthy();
      expect(view.getByTestId('anatomy-v2-source-back-hamstring-male-back-1')).toBeTruthy();
    });
  });
});
