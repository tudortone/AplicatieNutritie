import React from 'react';
import { render, act } from '@testing-library/react-native';

import { CategorieDetailSheet, type CategorieDetailSheetRef } from '../components/jurnal/CategorieDetailSheet';
import { PLAFON_MACRO, PLAFON_CALORII } from '../lib/nutritionTotals';
import type { CategorieMasaGrupata } from '../hooks/useMeseAzi';

/**
 * P1-03 (remediere) — CategorieDetailSheet trebuie să facă el însuși conversia
 * de PREZENTARE.
 *
 * Contractul stabilit la P1-03: totalurile pe categorie rămân valori CANONICE
 * BRUTE în starea aplicației (doar așa „suma categoriilor == totalul zilei" se
 * poate garanta), iar rotunjirea se aplică o singură dată, la afișare.
 *
 * `istoric.tsx` respectă asta la randarea antetelor de categorie, dar pasează
 * aceleași obiecte BRUTE mai departe prin `categoriiLive`. Sheet-ul le afișa
 * direct, deci utilizatorul vedea `245.66666666666666` în loc de `246`.
 */

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#CCFF00',
      accentSecondary: '#FF6B6B',
      accentTertiary: '#00F0FF',
      warning: '#FFB020',
      success: '#2ECC71',
      danger: '#FF4D4D',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      textTertiary: '#5A6270',
      cardBorder: '#232A31',
      surfaceBg: '#11161A',
      surfaceElevated: '#181D22',
      background: '#090C0E',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cheie: string, optiuni?: Record<string, unknown>) => (optiuni?.label ? `${cheie}:${optiuni.label}` : cheie) }),
}));

// Bottom sheet: randăm conținutul direct, ca să putem inspecta textul afișat.
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const React2 = require('react');
  return {
    BottomSheetModal: React2.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      React2.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React2.createElement(View, null, children);
    }),
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) => React2.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

jest.mock('../components/MasaCard', () => ({
  MasaCard: () => null,
}));

jest.mock('lucide-react-native', () => ({
  X: () => null,
  PlusCircle: () => null,
}));

const categorieBruta = (totaluri: Partial<CategorieMasaGrupata>): CategorieMasaGrupata => ({
  id: 'pranz',
  label: 'Prânz',
  icon: '🍲',
  mese: [],
  totalCalorii: 0,
  totalProteine: 0,
  totalCarbohidrati: 0,
  totalGrasimi: 0,
  totalFibre: 0,
  ...totaluri,
});

async function randeaza(categorie: CategorieMasaGrupata) {
  const ref = React.createRef<CategorieDetailSheetRef>();
  const utilitare = await render(
    <CategorieDetailSheet
      ref={ref}
      afisarePoze={false}
      onPressMasa={jest.fn()}
      onEditMasa={jest.fn()}
      onDeleteMasa={jest.fn()}
      onAddMasa={jest.fn()}
      categoriiLive={[categorie]}
    />,
  );
  return { ref, ...utilitare };
}

describe('P1-03 — CategorieDetailSheet aplică rotunjirea de prezentare', () => {
  test('1. valorile canonice fracționare se afișează rotunjite, nu brute', async () => {
    const categorie = categorieBruta({
      totalCalorii: 245.6666666,
      totalProteine: 12.3456789,
      totalCarbohidrati: 34.56789,
      totalGrasimi: 7.89123,
      totalFibre: 4.45678,
    });

    const { ref, getByText, queryByText } = await randeaza(categorie);
    await act(async () => { ref.current?.open(categorie); });

    // Calorii → întreg; macro → o zecimală (politica unică din nutritionTotals).
    // Fiecare macro are o zecimală semnificativă, deci rotunjirea chiar se vede
    // pe toate cele patru — nu doar pe proteine.
    expect(getByText('246')).toBeTruthy();
    expect(getByText('12.3g')).toBeTruthy();
    expect(getByText('34.6g')).toBeTruthy();
    expect(getByText('7.9g')).toBeTruthy();
    expect(getByText('4.5g')).toBeTruthy();

    // Niciuna dintre valorile BRUTE nu ajunge pe ecran.
    expect(queryByText('245.6666666')).toBeNull();
    expect(queryByText('12.3456789g')).toBeNull();
    expect(queryByText('34.56789g')).toBeNull();
    expect(queryByText('7.89123g')).toBeNull();
    expect(queryByText('4.45678g')).toBeNull();
  });

  test('2. valorile deja întregi rămân neschimbate', async () => {
    const categorie = categorieBruta({
      totalCalorii: 500,
      totalProteine: 40,
      totalCarbohidrati: 60,
      totalGrasimi: 20,
      totalFibre: 5,
    });

    const { ref, getByText } = await randeaza(categorie);
    await act(async () => { ref.current?.open(categorie); });

    expect(getByText('500')).toBeTruthy();
    expect(getByText('40g')).toBeTruthy();
  });

  test('3. plafonul canonic de macro se aplică la afișare', async () => {
    const categorie = categorieBruta({
      totalCalorii: 120,
      totalProteine: PLAFON_MACRO + 2500,
      totalCarbohidrati: 10,
      totalGrasimi: 10,
      totalFibre: 1,
    });

    const { ref, getByText, queryByText } = await randeaza(categorie);
    await act(async () => { ref.current?.open(categorie); });

    expect(getByText(`${PLAFON_MACRO}g`)).toBeTruthy();
    expect(queryByText(`${PLAFON_MACRO + 2500}g`)).toBeNull();
  });

  test('4. plafonul canonic de calorii se aplică la afișare', async () => {
    const categorie = categorieBruta({ totalCalorii: PLAFON_CALORII + 1 });

    const { ref, getByText } = await randeaza(categorie);
    await act(async () => { ref.current?.open(categorie); });

    expect(getByText(String(PLAFON_CALORII))).toBeTruthy();
  });

  test('5. valorile invalide nu ajung vizibile ca NaN/Infinity', async () => {
    const categorie = categorieBruta({
      totalCalorii: Number.POSITIVE_INFINITY,
      totalProteine: Number.NaN,
      totalCarbohidrati: -5,
      totalGrasimi: 3.14159,
      totalFibre: 0,
    });

    const { ref, getByText, queryByText } = await randeaza(categorie);
    await act(async () => { ref.current?.open(categorie); });

    expect(queryByText('NaN')).toBeNull();
    expect(queryByText('NaNg')).toBeNull();
    expect(queryByText('Infinity')).toBeNull();
    expect(getByText('3.1g')).toBeTruthy();
  });

  test('6. calea de rezervă (fără categoriiLive) primește aceeași prezentare', async () => {
    // Apelanții care nu pasează `categoriiLive` folosesc instantaneul din `open()`.
    // Și acele valori sunt canonice brute, deci trebuie convertite la fel.
    const categorie = categorieBruta({ totalCalorii: 245.6666666, totalProteine: 12.3456789 });
    const ref = React.createRef<CategorieDetailSheetRef>();
    const { getByText, queryByText } = await render(
      <CategorieDetailSheet
        ref={ref}
        afisarePoze={false}
        onPressMasa={jest.fn()}
        onEditMasa={jest.fn()}
        onDeleteMasa={jest.fn()}
        onAddMasa={jest.fn()}
      />,
    );
    await act(async () => { ref.current?.open(categorie); });

    expect(getByText('246')).toBeTruthy();
    expect(getByText('12.3g')).toBeTruthy();
    expect(queryByText('245.6666666')).toBeNull();
  });
});
