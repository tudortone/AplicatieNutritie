import React from 'react';
import { act, render, within } from '@testing-library/react-native';

import {
  StreakBottomSheet,
  type StreakBottomSheetRef,
} from '../components/gamification/StreakBottomSheet';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#CCFF00',
      accentGradient: ['#CCFF00', '#7EA500'],
      background: '#07101F',
      cardBg: '#0D1930',
      cardBorder: '#17304B',
      overlayLight: '#10253A',
      overlayStrong: '#365068',
      surfaceBg: '#132239',
      textPrimary: '#FFFFFF',
      textSecondary: '#A7B0BE',
      textTertiary: '#758197',
    },
  }),
}));

jest.mock('../context/GamificareContext', () => ({
  useGamificareData: () => ({
    streak: 0,
    xpTotal: 0,
    nivel: 1,
    detaliiNivel: { titlu: 'Începător', procentNivel: 0 },
  }),
}));

jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

describe('StreakBottomSheet responsive interaction layout', () => {
  it('keeps the close action above the content and the vertical scroll free from the backdrop responder', async () => {
    const ref = React.createRef<StreakBottomSheetRef>();
    const view = await render(<StreakBottomSheet ref={ref} />);

    await act(async () => ref.current?.open());

    const backdrop = view.getByTestId('streak-sheet-backdrop');
    const sheet = view.getByTestId('streak-sheet');
    const header = view.getByTestId('streak-sheet-header');
    const scroll = view.getByTestId('streak-sheet-scroll');

    expect(backdrop.parent).toBe(sheet.parent);
    expect(within(header).getByTestId('streak-sheet-close')).toBeTruthy();
    expect(within(backdrop).queryByTestId('streak-sheet-scroll')).toBeNull();
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(scroll.props.style).toEqual(expect.objectContaining({ flex: 1 }));
  });
});
