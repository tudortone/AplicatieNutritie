import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

let mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) delete mockStore[k];
    }),
  },
}));

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
let mockSearchId = 'plank';
jest.mock('expo-router', () => ({
  router: { back: mockRouterBack, push: mockRouterPush },
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
  useLocalSearchParams: () => ({ id: mockSearchId }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning' },
}));

jest.mock('expo-linear-gradient', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return {
    LinearGradient: ({ children, style }: any) => ReactMock.createElement(MockView, { style }, children),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '__esModule') return false;
      return (props: any) => ReactMock.createElement(MockView, { testID: `lucide-${String(name)}`, ...props });
    },
  });
});

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      surface: '#12161A',
      surfaceElevated: '#181D22',
      surfaceBg: '#12161A',
      cardBg: '#12161A',
      cardBorder: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.08)',
      textPrimary: '#F8FAFC',
      textSecondary: '#B8C1CC',
      textTertiary: '#8E98A4',
      accent: '#CCFF00',
      accentSecondary: '#A855F7',
      accentTertiary: '#38BDF8',
      textOnAccent: '#000000',
      danger: '#EF4444',
      warning: '#F59E0B',
      success: '#4ADE80',
      disabledText: '#64748B',
      disabledBg: '#1C2229',
    },
  }),
}));

const mockNotify = {
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.mock('../hooks/useNotify', () => ({ useNotify: () => mockNotify }));

jest.mock('../components/ui/KeyboardAwareScreen', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, style }: any) => ReactMock.createElement(MockView, { style }, children),
    useContentBottomPadding: () => 24,
  };
});

jest.mock('../components/SkeletonLoader', () => ({
  SkeletonLoader: () => null,
}));

jest.mock('../components/fitness/BodyMap', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return {
    BodyMap: ({ view, intensity }: any) =>
      ReactMock.createElement(MockView, {
        testID: `bodymap-${view}`,
        accessibilityLabel: JSON.stringify(intensity ?? {}),
      }),
  };
});

jest.mock('../components/ui/FlowIcon', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return {
    FlowIcon: ({ name }: { name: string }) => ReactMock.createElement(MockView, { testID: `flow-icon-${name}` }),
    resolveFlowIconName: () => 'Check',
  };
});

jest.mock('../components/ui/ConfirmSheet', () => ({
  ConfirmSheet: () => null,
}));

const mockRefreshExercises = jest.fn(async () => undefined);
const mockRefreshWorkouts = jest.fn(async () => undefined);
const mockAdaugaAntrenament = jest.fn(async (payload: any) => ({ id: 'w-new', ...payload }));
const mockStergeAntrenament = jest.fn(async () => true);

const SAMPLE_TIMED_WORKOUT = {
  id: 'workout-1',
  nume: 'Core Session',
  tip: 'abdomen',
  durata_min: 18,
  calorii_arse: 140,
  volum_total: 0,
  is_local: true,
  created_at: '2026-11-12T10:00:00.000Z',
  muscle_load: { abs: 120 },
  exercitii: [
    {
      exercitiuId: 'plank',
      nume: 'Planșă (Plank)',
      durataMin: 3,
      kcal: 25,
      seturi: [
        { serie: 1, repetari: 1, greutate: 0, time_seconds: 45, set_type: 'working' as const, completed: true },
      ],
    },
  ],
};

const mockFetchIstoric = jest.fn(async () => [SAMPLE_TIMED_WORKOUT]);
let mockAntrenamenteList: any[] = [SAMPLE_TIMED_WORKOUT];

jest.mock('../hooks/useExercitii', () => {
  const { EXERCITII_DB } = jest.requireActual('../constants/exercitii');
  return {
    useExercitii: () => ({
      exercitii: EXERCITII_DB,
      loading: false,
      refresh: mockRefreshExercises,
    }),
  };
});

jest.mock('../hooks/useAntrenamente', () => ({
  useAntrenamente: () => ({
    antrenamente: mockAntrenamenteList,
    loading: false,
    adaugaAntrenament: mockAdaugaAntrenament,
    fetchIstoric: mockFetchIstoric,
    stergeAntrenament: mockStergeAntrenament,
    refresh: mockRefreshWorkouts,
  }),
}));

import i18n, { changeLanguage } from '../i18n';
import AntrenamenteScreen from '../app/(tabs)/antrenamente';
import JurnalAntrenamenteScreen from '../app/jurnal-antrenamente';
import ProgresAntrenamenteScreen from '../app/progres-antrenamente';
import ExercitiuDetailScreen from '../app/exercitiu/[id]';
import DailyQuestsCard from '../components/gamification/DailyQuestsCard';
import { Holographic3DAnatomyBody } from '../components/fitness/Holographic3DAnatomyBody';
import { Stepper } from '../components/ui/Stepper';
import { CATEGORII, EXERCITII_DB } from '../constants/exercitii';
import { describeSet, getSetFields, summarizeSets, summaryLabel, validateLoggedSet } from '../lib/workoutSets';
import { cautaExercitii } from '../lib/exercitiu';
import { dayKey, evaluateQuests, pickDailyQuests } from '../lib/questsEngine';
import { computeWorkoutMetrics } from '../lib/fitnessEngine';

function wrap(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(async () => {
  await cleanup();
});

beforeEach(async () => {
  mockStore = {};
  mockNotify.success.mockClear();
  mockNotify.warning.mockClear();
  mockNotify.error.mockClear();
  mockAdaugaAntrenament.mockClear();
  mockRefreshExercises.mockClear();
  mockRefreshWorkouts.mockClear();
  mockFetchIstoric.mockClear();
  mockAntrenamenteList = [SAMPLE_TIMED_WORKOUT];
  await changeLanguage('en');
});

describe('Sport Subsystem i18n, Layout Clipping & Click-Path Regressions', () => {
  it('1. Domain helpers localize into EN, FR, DE, and RO cleanly at runtime', async () => {
    const plank = EXERCITII_DB.find((e) => e.id === 'plank')!;
    await changeLanguage('en');
    const enFields = getSetFields(plank);
    expect(enFields.modeLabel).not.toMatch(/Cronometru|Repetări/);
    expect(describeSet({ serie: 1, repetari: 1, greutate: 0, time_seconds: 45 }, enFields)).toBe('45s');
    expect(summaryLabel(summarizeSets([{ serie: 1, repetari: 1, greutate: 0, time_seconds: 65 }], enFields), enFields)).not.toMatch(/serii|rep/);
    expect(validateLoggedSet({ serie: 1, repetari: 0, greutate: 0 }, getSetFields(EXERCITII_DB[0]))).not.toMatch(/Completează/);

    const metricsEn = computeWorkoutMetrics([]);
    expect(metricsEn.rank.label).not.toBe('Începător');

    const questsEn = evaluateQuests(
      pickDailyQuests(dayKey(new Date('2026-11-13T10:00:00Z'))),
      { sets: 0, reps: 0, volumeKg: 0, minutes: 0, exercises: 0, muscles: 0 },
    );
    expect(questsEn.some((q) => /seturi|grupă|mușchi|exerciții|repetări/i.test(`${q.title} ${q.unit}`))).toBe(false);

    await changeLanguage('fr');
    expect(getSetFields(EXERCITII_DB[0]).modeLabel).not.toMatch(/Weight|Greutate/);
    const frResults = cautaExercitii({ query: 'developpe' });
    expect(frResults.length).toBeGreaterThan(0);

    await changeLanguage('de');
    expect(getSetFields(EXERCITII_DB[0]).modeLabel).not.toMatch(/Weight|Greutate/);
  });

  it('2. Every category in CATEGORII has exercises (no dead blank corp_intreg category)', () => {
    for (const cat of CATEGORII) {
      expect(EXERCITII_DB.some((e) => e.categorie === cat.id)).toBe(true);
    }
  });

  it('3. AntrenamenteScreen translates UI + catalog on EN/FR/DE switch and renders unclipped horizontal pills', async () => {
    await changeLanguage('en');
    const view = await render(wrap(<AntrenamenteScreen />));

    await waitFor(() => {
      expect(view.getByPlaceholderText(/Search/i)).toBeTruthy();
    });
    expect(view.queryByPlaceholderText('Caută exercițiu...')).toBeNull();
    expect(view.queryByText('Exerciții')).toBeNull();
    expect(view.queryByText('Salvează antrenamentul')).toBeNull();

    // Horizontal ScrollView + pill anti-clipping styles
    const horizontalScroller = view.getByTestId('sport-category-scroll');
    expect(horizontalScroller.props.horizontal).toBe(true);
    const hStyle = StyleSheet.flatten(horizontalScroller.props.style);
    expect(hStyle.flexGrow).toBe(0);
    expect(hStyle.flexShrink).toBe(0);

    const chestPill = view.getByText(i18n.t('sport.categories.piept'));
    const pillTextStyle = StyleSheet.flatten(chestPill.props.style);
    expect(pillTextStyle.lineHeight).toBeGreaterThanOrEqual(18);
    expect(pillTextStyle.includeFontPadding).toBe(false);
    expect(pillTextStyle.flexShrink).toBe(0);

    const pillButton = view.getByTestId('sport-category-piept');
    const pillButtonStyle = StyleSheet.flatten(pillButton.props.style);
    expect(pillButtonStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(pillButtonStyle.flexShrink).toBe(0);

    // Switch language dynamically to French while mounted
    await act(async () => {
      await changeLanguage('fr');
    });
    await waitFor(() => {
      expect(view.getByText(i18n.t('sport.categories.piept'))).toBeTruthy();
    });
  });

  it('4. Search normalizes diacritics, offers accessible clear button + empty state, and category switch cleans tracker/saves true tip', async () => {
    await changeLanguage('en');
    const view = await render(wrap(<AntrenamenteScreen />));

    const searchInput = await waitFor(() => view.getByPlaceholderText(/Search/i));
    await fireEvent.changeText(searchInput, 'tractiuni');
    await waitFor(() => {
      expect(view.queryByTestId('sport-empty-search')).toBeNull();
    });

    await fireEvent.changeText(searchInput, 'zzzz-missing-exercise');
    await waitFor(() => {
      expect(view.getByTestId('sport-empty-search')).toBeTruthy();
    });

    const clearBtn = view.getByTestId('sport-search-clear');
    const clearStyle = StyleSheet.flatten(clearBtn.props.style);
    expect(clearStyle.minWidth ?? clearStyle.width).toBeGreaterThanOrEqual(44);
    expect(clearStyle.minHeight ?? clearStyle.height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(clearBtn);
    await waitFor(() => {
      expect(view.queryByTestId('sport-empty-search')).toBeNull();
    });

    // Open an exercise in Back category, log a set, switch category to Chest, then save -> saved tip must stay 'spate'
    const backCat = i18n.t('sport.categories.spate');
    await fireEvent.press(view.getByText(backCat));
    const pullUpName = i18n.t('sport.exercises.tractiuni');
    await fireEvent.press(view.getByText(pullUpName));
    const warmupBtn = await waitFor(() => view.getByRole('switch'));
    await fireEvent.press(warmupBtn);
    expect(warmupBtn.props.accessibilityState.checked).toBe(true);

    await fireEvent.press(view.getByTestId('sport-add-set-btn'));

    // Switch to Chest -> previously expanded tracker & warmup should reset
    await fireEvent.press(view.getByText(i18n.t('sport.categories.piept')));
    expect(view.queryByTestId('sport-add-set-btn')).toBeNull();

    // Save workout -> payload tip must reflect the logged Back exercise ('spate'), not newly browsed 'piept'
    await fireEvent.press(view.getByTestId('sport-save-workout-btn'));
    await waitFor(() => {
      expect(mockAdaugaAntrenament).toHaveBeenCalledTimes(1);
    });
    expect(mockAdaugaAntrenament.mock.calls[0][0].tip).toBe('spate');
  });

  it('5. Stepper updates text immediately when +/- is pressed even while focused and persists on blur', async () => {
    const onDec = jest.fn();
    const onInc = jest.fn();
    const onTextChange = jest.fn();
    const colors = {
      textPrimary: '#fff',
      textSecondary: '#aaa',
      textTertiary: '#666',
      background: '#000',
      surface: '#111',
      surfaceElevated: '#222',
      cardBg: '#12161A',
      cardBorder: '#333',
      accent: '#cf0',
    };

    const view = await render(
      wrap(
        <Stepper
          label="Reps"
          value="10"
          onDec={() => {
            onDec();
            view.rerender(
              wrap(
                <Stepper
                  label="Reps"
                  value="11"
                  onDec={onDec}
                  onInc={onInc}
                  onTextChange={onTextChange}
                  colors={colors}
                />,
              ),
            );
          }}
          onInc={() => {
            onInc();
            view.rerender(
              wrap(
                <Stepper
                  label="Reps"
                  value="11"
                  onDec={onDec}
                  onInc={onInc}
                  onTextChange={onTextChange}
                  colors={colors}
                />,
              ),
            );
          }}
          onTextChange={onTextChange}
          colors={colors}
        />,
      ),
    );

    const input = view.getByDisplayValue('10');
    expect(input.props.accessibilityLabel).not.toContain('undefined');
    await fireEvent(input, 'focus');
    const buttons = view.getAllByRole('button');
    await fireEvent.press(buttons[1]);
    await fireEvent(input, 'blur');

    expect(onInc).toHaveBeenCalled();
    expect(onTextChange).not.toHaveBeenCalledWith('10');
    expect(input.props.value).toBe('11');
  });

  it('6. Secondary Sport screens (Journal, Progress, Quests, Anatomy, Detail) localize cleanly and format timed sets', async () => {
    await changeLanguage('en');

    const questsView = await render(
      wrap(
        <DailyQuestsCard
          snapshot={{ sets: 3, reps: 30, volumeKg: 900, minutes: 15, exercises: 2, muscles: 2 }}
        />,
      ),
    );
    await waitFor(() => expect(questsView.queryByText('Questuri zilnice')).toBeNull());
    expect(JSON.stringify(questsView.toJSON())).not.toMatch(/Questuri zilnice|Reset în|Serie:/);

    const journalView = await render(wrap(<JurnalAntrenamenteScreen />));
    await waitFor(() => {
      expect(journalView.queryByText('Jurnal Antrenamente')).toBeNull();
    });
    await fireEvent.press(journalView.getByText(/Core Session/));
    await waitFor(() => {
      expect(journalView.getAllByText(/45s/).length).toBeGreaterThan(0);
    });
    expect(journalView.queryByText(/1 rap/)).toBeNull();
    const deleteBtns = journalView.getAllByRole('button').filter((b) =>
      String(b.props.accessibilityLabel || '').toLowerCase().includes('delete') ||
      String(b.props.accessibilityLabel || '').toLowerCase().includes('șterge'),
    );
    expect(deleteBtns.length).toBeGreaterThan(0);
    const delStyle = StyleSheet.flatten(deleteBtns[0].props.style);
    expect(delStyle.minWidth ?? delStyle.width).toBeGreaterThanOrEqual(44);
    expect(delStyle.minHeight ?? delStyle.height).toBeGreaterThanOrEqual(44);

    const progressView = await render(wrap(<ProgresAntrenamenteScreen />));
    await waitFor(() => {
      expect(progressView.queryByText('Progres sport')).toBeNull();
    });
    await fireEvent.press(progressView.getByText('Core Session'));
    await waitFor(() => {
      expect(progressView.getAllByText(/45s/).length).toBeGreaterThan(0);
    });
    expect(progressView.queryByText(/1 rep × 0 kg/)).toBeNull();

    mockSearchId = 'plank';
    const detailView = await render(wrap(<ExercitiuDetailScreen />));
    expect(detailView.queryByText('LOG ANTRENAMENT')).toBeNull();
    expect(detailView.queryByText('CUM SE EXECUTĂ CORECT')).toBeNull();

    const anatomyView = await render(
      wrap(
        <Holographic3DAnatomyBody
          activeGroups={['Chest', 'Back']}
          intensityScore={75}
          accentColor="#CCFF00"
          secondaryColor="#38BDF8"
          cardBg="#12161A"
          textPrimary="#F8FAFC"
        />,
      ),
    );
    const frontIntensity = JSON.parse(anatomyView.getByTestId('bodymap-front').props.accessibilityLabel);
    expect(frontIntensity.chest).toBeGreaterThan(0);
    expect(frontIntensity.lats).toBeGreaterThan(0);
  });
});
