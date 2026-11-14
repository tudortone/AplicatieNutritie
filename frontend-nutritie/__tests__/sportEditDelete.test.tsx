jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';

import enLocale from '../i18n/locales/en.json';

let mockUseRealHook = false;
let mockAuthUser: { id: string; user_metadata?: Record<string, unknown> } | null = {
  id: 'user-uuid-1234',
  user_metadata: { greutate: 75 },
};
let mockCloudRows: any[] = [];
let mockUpdateError: any = null;
let mockDeleteError: any = null;
const mockUpdatePayloads: any[] = [];
const mockUpdateEqs: [string, unknown][] = [];
const mockDeleteEqs: [string, unknown][] = [];

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
const mockRefreshWorkouts = jest.fn(async () => undefined);
const mockAdaugaAntrenament = jest.fn(async (payload: any) => ({ id: 'w-new', ...payload }));
const mockActualizeazaAntrenament = jest.fn();
const mockStergeAntrenament = jest.fn(async (_id: string): Promise<void> => undefined);
const mockFetchIstoric = jest.fn(async () => mockAntrenamenteList);
let mockAntrenamenteList: any[] = [];

const resolveEnTranslation = (key: string, opts?: Record<string, unknown>): string => {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), enLocale);
  const template = typeof value === 'string'
    ? value
    : typeof opts?.defaultValue === 'string'
      ? opts.defaultValue
      : key;
  if (!opts) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, param) =>
    opts[param] !== undefined ? String(opts[param]) : `{{${param}}}`,
  );
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => resolveEnTranslation(key, opts),
    i18n: { language: 'en' },
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  }),
  useFocusEffect: (cb: () => void) => {
    const ReactRef = require('react');
    ReactRef.useEffect(() => cb(), []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning' },
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-body-parts-anatomy', () => ({
  BodySilhouette: () => null,
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: new Proxy(
      {},
      {
        get: (_, prop) => (prop === 'accentGradient' ? ['#a3e635', '#22d3ee'] : '#111111'),
      },
    ),
  }),
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    session: mockAuthUser ? { user: mockAuthUser } : null,
    loadingAuth: false,
  }),
}));
jest.mock('../hooks/useNotify', () => ({
  useNotify: () => mockNotify,
}));
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    scrollPaddingTop: 0,
    scrollPaddingBottom: 0,
    isSmallScreen: false,
    width: 390,
  }),
}));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
  useContentBottomPadding: () => 0,
}));
jest.mock('../components/workout-v2/WorkoutV2Experience', () => ({
  WorkoutV2Experience: () => null,
}));

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: mockAuthUser } })),
    },
    from: jest.fn(() => {
      const builder: any = {
        select: jest.fn(() => builder),
        insert: jest.fn(() => builder),
        update: jest.fn((payload: any) => {
          mockUpdatePayloads.push(payload);
          return {
            eq: jest.fn((col1: string, val1: unknown) => {
              mockUpdateEqs.push([col1, val1]);
              return {
                eq: jest.fn((col2: string, val2: unknown) => {
                  mockUpdateEqs.push([col2, val2]);
                  return Promise.resolve({ error: mockUpdateError });
                }),
              };
            }),
          };
        }),
        delete: jest.fn(() => ({
          eq: jest.fn((col1: string, val1: unknown) => {
            mockDeleteEqs.push([col1, val1]);
            return {
              eq: jest.fn((col2: string, val2: unknown) => {
                mockDeleteEqs.push([col2, val2]);
                return Promise.resolve({ error: mockDeleteError });
              }),
            };
          }),
        })),
        eq: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        single: jest.fn(async () => ({ data: null, error: null })),
        then: (resolve: any, reject: any) =>
          Promise.resolve({ data: mockCloudRows, error: null }).then(resolve, reject),
      };
      return builder;
    }),
  },
}));

const actualAntrenamente = jest.requireActual<typeof import('../hooks/useAntrenamente')>('../hooks/useAntrenamente');

jest.mock('../hooks/useAntrenamente', () => {
  const actual = jest.requireActual('../hooks/useAntrenamente');
  return {
    ...actual,
    useAntrenamente: () =>
      mockUseRealHook
        ? actual.useAntrenamente()
        : {
            user: mockAuthUser,
            antrenamente: mockAntrenamenteList,
            totalCaloriiArse: 0,
            numarAntrenamente: mockAntrenamenteList.length,
            loading: false,
            adaugaAntrenament: mockAdaugaAntrenament,
            actualizeazaAntrenament: mockActualizeazaAntrenament,
            stergeAntrenament: mockStergeAntrenament,
            fetchIstoric: mockFetchIstoric,
            refresh: mockRefreshWorkouts,
          },
  };
});

import AntrenamenteScreen from '../app/(tabs)/antrenamente';
import JurnalAntrenamenteScreen from '../app/jurnal-antrenamente';
import ProgresAntrenamenteScreen from '../app/progres-antrenamente';
import type { Antrenament } from '../hooks/useAntrenamente';

const {
  useAntrenamente: realUseAntrenamente,
  replaceSetInWorkout,
  removeSetFromWorkout,
  removeExerciseFromWorkout,
  recalculateEditedWorkout,
} = actualAntrenamente;

const LOCAL_STORAGE_KEY = 'nutriai_antrenamente_local_v2';
const CLOUD_WORKOUT_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_WORKOUT_ID = '22222222-2222-4222-8222-222222222222';

const buildSampleWorkout = (overrides: Partial<Antrenament> = {}): Antrenament => ({
  id: CLOUD_WORKOUT_ID,
  user_id: 'user-uuid-1234',
  nume: 'Upper Body Push',
  tip: 'forta',
  durata_min: 30,
  calorii_arse: 210,
  volum_total: 1000,
  exercitii: [
    {
      exercitiuId: 'impins-piept-haltera',
      nume: 'Bench Press',
      seturi: [
        { serie: 1, repetari: 10, greutate: 60, set_type: 'working' },
        { serie: 2, repetari: 8, greutate: 50, set_type: 'working' },
      ],
      durataMin: 15,
      kcal: 120,
    },
    {
      exercitiuId: 'fluturari-gantere',
      nume: 'Dumbbell Flyes',
      seturi: [
        { serie: 1, repetari: 12, greutate: 10, set_type: 'working' },
      ],
      durataMin: 10,
      kcal: 90,
    },
  ],
  created_at: new Date().toISOString(),
  is_local: false,
  ...overrides,
});

describe('Sport edit & delete — persistence, pure helpers, and UI flows', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockUseRealHook = false;
    mockAuthUser = { id: 'user-uuid-1234', user_metadata: { greutate: 75 } };
    mockCloudRows = [];
    mockUpdateError = null;
    mockDeleteError = null;
    mockUpdatePayloads.length = 0;
    mockUpdateEqs.length = 0;
    mockDeleteEqs.length = 0;
    mockAntrenamenteList = [];
    mockActualizeazaAntrenament.mockImplementation(async (workout: Antrenament | string, nextExercitii: any[]) => {
      const target = typeof workout === 'string'
        ? mockAntrenamenteList.find((w) => w.id === workout) ?? buildSampleWorkout({ id: workout })
        : workout;
      const valid = (nextExercitii ?? []).filter((ex) => Array.isArray(ex.seturi) && ex.seturi.length > 0);
      if (valid.length === 0) {
        mockAntrenamenteList = mockAntrenamenteList.filter((w) => w.id !== target.id);
        return null;
      }
      const next = recalculateEditedWorkout(target, valid);
      mockAntrenamenteList = mockAntrenamenteList.map((w) => (w.id === next.id ? next : w));
      return next;
    });
    mockStergeAntrenament.mockImplementation(async (id: string) => {
      mockAntrenamenteList = mockAntrenamenteList.filter((w) => w.id !== id);
    });
  });

  describe('Pure helpers & real useAntrenamente().actualizeazaAntrenament', () => {
    it('replaces, removes sets/exercises, and recalculates workout metrics without mutating source', () => {
      const source = buildSampleWorkout();
      const replaced = replaceSetInWorkout(source, 0, 1, {
        serie: 2,
        repetari: 10,
        greutate: 70,
        set_type: 'warmup',
      });
      expect(source.exercitii?.[0].seturi[1].greutate).toBe(50);
      expect(replaced[0].seturi[1].greutate).toBe(70);
      expect(replaced[0].seturi[1].set_type).toBe('warmup');

      const removedSecondExSet = removeSetFromWorkout(source, 1, 0);
      expect(removedSecondExSet).toHaveLength(1);

      const removedFirstEx = removeExerciseFromWorkout(source, 0);
      expect(removedFirstEx).toHaveLength(1);
      expect(removedFirstEx[0].exercitiuId).toBe('fluturari-gantere');

      const recalculatedWarmup = recalculateEditedWorkout(source, replaced);
      // Warmup sets are excluded from working external volume
      expect(recalculatedWarmup.volum_total).toBe(10 * 60 + 12 * 10);
      expect(recalculatedWarmup.external_volume_kg).toBe(recalculatedWarmup.volum_total);

      const replacedWorking = replaceSetInWorkout(source, 0, 1, {
        serie: 2,
        repetari: 10,
        greutate: 70,
        set_type: 'working',
      });
      const recalculated = recalculateEditedWorkout(source, replacedWorking);
      expect(recalculated.volum_total).toBe(10 * 60 + 10 * 70 + 12 * 10);
      expect(recalculated.external_volume_kg).toBe(recalculated.volum_total);
      expect(recalculated.calorii_arse).toBeGreaterThan(0);
      expect(recalculated.durata_min).toBeGreaterThan(0);
      expect(recalculated.muscle_load).toBeDefined();
    });

    it('updates synced cloud UUID row via supabase .update().eq(id).eq(user_id) and syncs local cache', async () => {
      mockUseRealHook = true;
      const synced = buildSampleWorkout({ id: CLOUD_WORKOUT_ID, is_local: false });
      mockCloudRows = [synced];
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([synced]));

      const { result } = await renderHook(() => realUseAntrenamente());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const nextExercitii = replaceSetInWorkout(synced, 0, 0, {
        serie: 1,
        repetari: 12,
        greutate: 80,
        set_type: 'working',
      });

      let updated: Antrenament | null = null;
      await act(async () => {
        updated = await result.current.actualizeazaAntrenament(synced, nextExercitii);
      });

      expect(updated).not.toBeNull();
      expect(mockUpdatePayloads).toHaveLength(1);
      expect(mockUpdatePayloads[0].volum_total).toBe(12 * 80 + 8 * 50 + 12 * 10);
      expect(mockUpdateEqs).toEqual([
        ['id', CLOUD_WORKOUT_ID],
        ['user_id', 'user-uuid-1234'],
      ]);

      const stored = JSON.parse((await AsyncStorage.getItem(LOCAL_STORAGE_KEY)) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].volum_total).toBe(12 * 80 + 8 * 50 + 12 * 10);
      expect(stored[0].is_local).toBe(false);
    });

    it('throws before modifying local storage if cloud supabase update fails', async () => {
      mockUseRealHook = true;
      const synced = buildSampleWorkout({ id: CLOUD_WORKOUT_ID, is_local: false });
      mockCloudRows = [synced];
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([synced]));
      mockUpdateError = new Error('Supabase update failed');

      const { result } = await renderHook(() => realUseAntrenamente());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const nextExercitii = replaceSetInWorkout(synced, 0, 0, {
        serie: 1,
        repetari: 15,
        greutate: 90,
        set_type: 'working',
      });

      await act(async () => {
        await expect(result.current.actualizeazaAntrenament(synced, nextExercitii)).rejects.toThrow(
          'Supabase update failed',
        );
      });

      const stored = JSON.parse((await AsyncStorage.getItem(LOCAL_STORAGE_KEY)) || '[]');
      expect(stored[0].volum_total).toBe(1000);
      expect(stored[0].exercitii[0].seturi[0].greutate).toBe(60);
    });

    it('auto-deletes the workout when zero valid exercises/sets remain', async () => {
      mockUseRealHook = true;
      const singleSetWorkout = buildSampleWorkout({
        id: CLOUD_WORKOUT_ID,
        is_local: false,
        exercitii: [
          {
            exercitiuId: 'impins-piept-haltera',
            nume: 'Bench Press',
            seturi: [{ serie: 1, repetari: 10, greutate: 60, set_type: 'working' }],
            durataMin: 5,
            kcal: 30,
          },
        ],
      });
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([singleSetWorkout]));

      const { result } = await renderHook(() => realUseAntrenamente());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const emptyAfterDelete = removeSetFromWorkout(singleSetWorkout, 0, 0);
      expect(emptyAfterDelete).toEqual([]);

      let res: Antrenament | null = singleSetWorkout;
      await act(async () => {
        res = await result.current.actualizeazaAntrenament(singleSetWorkout, emptyAfterDelete);
      });

      expect(res).toBeNull();
      expect(mockDeleteEqs).toEqual([
        ['id', CLOUD_WORKOUT_ID],
        ['user_id', 'user-uuid-1234'],
      ]);
      const stored = JSON.parse((await AsyncStorage.getItem(LOCAL_STORAGE_KEY)) || '[]');
      expect(stored).toEqual([]);
    });

    it('updates local-only row in AsyncStorage without issuing a Supabase update call', async () => {
      mockUseRealHook = true;
      const localOnly = buildSampleWorkout({ id: LOCAL_WORKOUT_ID, is_local: true });
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([localOnly]));

      const { result } = await renderHook(() => realUseAntrenamente());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const nextExercitii = replaceSetInWorkout(localOnly, 0, 0, {
        serie: 1,
        repetari: 20,
        greutate: 75,
        set_type: 'working',
      });

      await act(async () => {
        await result.current.actualizeazaAntrenament(localOnly, nextExercitii);
      });

      expect(mockUpdatePayloads).toHaveLength(0);
      const stored = JSON.parse((await AsyncStorage.getItem(LOCAL_STORAGE_KEY)) || '[]');
      expect(stored[0].exercitii[0].seturi[0].greutate).toBe(75);
      expect(stored[0].is_local).toBe(true);
    });
  });

  describe('AntrenamenteScreen active session edit & delete', () => {
    it('supports inline set edit, cancel without duplication, worked chips, per-exercise delete, and saved-today journal link', async () => {
      mockAntrenamenteList = [buildSampleWorkout({ created_at: new Date().toISOString() })];

      const view = await render(<AntrenamenteScreen />);

      // Saved today banner navigates to journal
      const savedLink = view.getByTestId('sport-saved-today-link');
      await fireEvent.press(savedLink);
      expect(mockPush).toHaveBeenCalledWith('/jurnal-antrenamente');

      // Expand first exercise card
      const openPrefix = enLocale.sport.screen.openExerciseA11y.split('{{')[0];
      const exerciseButtons = view
        .getAllByRole('button')
        .filter((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(openPrefix));
      expect(exerciseButtons.length).toBeGreaterThan(0);
      await fireEvent.press(exerciseButtons[0]);

      // Log 2 sets using the CTA button
      const pressLogSet = async () => {
        const btns = view.getAllByRole('button', { name: /^(add|log|save)\s+(a\s+)?set$/i });
        await fireEvent.press(btns[btns.length - 1]);
      };
      await pressLogSet();
      await pressLogSet();

      // Find the logged set edit button for set 0
      const editButtons = view.getAllByTestId(/^sport-edit-set-.+-0$/);
      expect(editButtons.length).toBe(1);
      const editSet0Id = editButtons[0].props.testID as string;
      const exId = editSet0Id.replace(/^sport-edit-set-/, '').replace(/-0$/, '');

      // Tap edit on set #1, modify reps, then cancel — must preserve original count (2) and values
      await fireEvent.press(view.getByTestId(editSet0Id));
      expect(view.getByTestId('sport-save-set-btn')).toBeTruthy();
      expect(view.getByTestId('sport-cancel-edit-set-btn')).toBeTruthy();

      const originalRepsInput = view.getAllByDisplayValue('12')[0];
      await fireEvent.changeText(originalRepsInput, '18');
      await fireEvent.press(view.getByTestId('sport-cancel-edit-set-btn'));

      expect(view.queryByTestId('sport-save-set-btn')).toBeNull();
      expect(view.getByTestId(`sport-edit-set-${exId}-1`)).toBeTruthy();
      expect(view.queryByText(/18 reps/)).toBeNull();

      // Re-edit set via "Ce ai lucrat" chip for set #2 and save updated reps — must not add a 3rd set
      await fireEvent.press(view.getByTestId(`sport-worked-chip-${exId}-1`));
      expect(view.getByTestId('sport-save-set-btn')).toBeTruthy();
      const editInput = view.getAllByDisplayValue('12')[0];
      await fireEvent.changeText(editInput, '15');
      await fireEvent.press(view.getByTestId('sport-save-set-btn'));

      expect(view.queryByTestId('sport-save-set-btn')).toBeNull();
      expect(view.queryByTestId(`sport-edit-set-${exId}-2`)).toBeNull();
      expect(view.getAllByText(/15 reps/).length).toBeGreaterThanOrEqual(2);

      // Delete multi-set exercise via "Ce ai lucrat" trash button -> opens ConfirmSheet
      await fireEvent.press(view.getByTestId(`sport-worked-delete-${exId}`));
      expect(view.getByText(enLocale.sport.screen.deleteExerciseConfirmTitle)).toBeTruthy();
      await fireEvent.press(view.getByText(enLocale.sport.journal.deleteConfirmBtn));

      await waitFor(() => {
        expect(view.queryByTestId(`sport-worked-delete-${exId}`)).toBeNull();
      });

      // Log 1 single set and delete directly without ConfirmSheet
      await pressLogSet();
      await fireEvent.press(view.getByTestId(`sport-worked-delete-${exId}`));
      expect(view.queryByText(enLocale.sport.screen.deleteExerciseConfirmTitle)).toBeNull();
      expect(view.queryByTestId(`sport-worked-delete-${exId}`)).toBeNull();
    });
  });

  describe('JurnalAntrenamenteScreen post-save edit & delete', () => {
    it('edits set values with validation, toggles warmup, deletes set, and deletes exercise via ConfirmSheet', async () => {
      const workout = buildSampleWorkout();
      mockAntrenamenteList = [workout];

      const view = await render(<JurnalAntrenamenteScreen />);
      await waitFor(() => expect(view.getByText(new RegExp(workout.nume))).toBeTruthy());

      if (!view.queryByTestId(`journal-edit-set-${workout.id}-0-0`)) {
        await fireEvent.press(view.getByText(new RegExp(workout.nume)));
      }

      // Open set edit sheet for first set (10 reps, 60 kg)
      await fireEvent.press(view.getByTestId(`journal-edit-set-${workout.id}-0-0`));
      expect(view.getByTestId('workout-set-edit-save')).toBeTruthy();

      // Invalid 0 reps blocks save and shows validation error
      await fireEvent.changeText(view.getByDisplayValue('10'), '0');
      await fireEvent.press(view.getByTestId('workout-set-edit-save'));
      expect(mockActualizeazaAntrenament).not.toHaveBeenCalled();

      // Enter valid reps=14, weight=70, toggle warmup, save
      await fireEvent.changeText(view.getByDisplayValue('0'), '14');
      await fireEvent.changeText(view.getByDisplayValue('60'), '70');
      await fireEvent.press(view.getByRole('switch'));
      await fireEvent.press(view.getByTestId('workout-set-edit-save'));

      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(1));
      const savedExercitii = mockActualizeazaAntrenament.mock.calls[0][1];
      expect(savedExercitii[0].seturi[0]).toEqual(
        expect.objectContaining({ repetari: 14, greutate: 70, set_type: 'warmup' }),
      );

      // Delete second set of first exercise via sheet delete button
      await fireEvent.press(view.getByTestId(`journal-edit-set-${workout.id}-0-1`));
      await fireEvent.press(view.getByTestId('workout-set-edit-delete'));

      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(2));
      expect(mockActualizeazaAntrenament.mock.calls[1][1][0].seturi).toHaveLength(1);

      // Delete entire remaining exercise via ConfirmSheet
      await fireEvent.press(view.getByTestId(`journal-delete-ex-${workout.id}-0`));
      expect(view.getByText(enLocale.sport.edit.deleteExerciseConfirmTitle)).toBeTruthy();
      await fireEvent.press(view.getByText(enLocale.sport.journal.deleteConfirmBtn));

      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(3));
      expect(mockActualizeazaAntrenament.mock.calls[2][1]).toHaveLength(1);
      expect(mockActualizeazaAntrenament.mock.calls[2][1][0].exercitiuId).toBe('fluturari-gantere');
    });
  });

  describe('ProgresAntrenamenteScreen post-save edit & delete', () => {
    it('edits a set, deletes last set removing workout, deletes an exercise, and deletes a whole workout', async () => {
      const multiWorkout = buildSampleWorkout({ id: CLOUD_WORKOUT_ID, nume: 'Push Progress' });
      const singleSetWorkout = buildSampleWorkout({
        id: LOCAL_WORKOUT_ID,
        nume: 'Solo Finish',
        exercitii: [
          {
            exercitiuId: 'impins-piept-haltera',
            nume: 'Bench Press',
            seturi: [{ serie: 1, repetari: 8, greutate: 40, set_type: 'working' }],
            durataMin: 5,
            kcal: 30,
          },
        ],
      });
      mockAntrenamenteList = [multiWorkout, singleSetWorkout];

      const view = await render(<ProgresAntrenamenteScreen />);
      await waitFor(() => expect(view.getByText('Push Progress')).toBeTruthy());

      if (!view.queryByTestId(`progress-edit-set-${CLOUD_WORKOUT_ID}-0-0`)) {
        await fireEvent.press(view.getByText('Push Progress'));
      }

      // Edit set in Progress
      await fireEvent.press(view.getByTestId(`progress-edit-set-${CLOUD_WORKOUT_ID}-0-0`));
      await fireEvent.changeText(view.getByDisplayValue('60'), '65');
      await fireEvent.press(view.getByTestId('workout-set-edit-save'));

      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(1));
      expect(mockActualizeazaAntrenament.mock.calls[0][1][0].seturi[0].greutate).toBe(65);

      // Delete exercise in Progress via ConfirmSheet
      await fireEvent.press(view.getByTestId(`progress-delete-ex-${CLOUD_WORKOUT_ID}-0`));
      await fireEvent.press(view.getByText(enLocale.sport.journal.deleteConfirmBtn));
      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(2));

      // Delete whole workout via ConfirmSheet
      await fireEvent.press(view.getByTestId(`progress-delete-workout-${CLOUD_WORKOUT_ID}`));
      await fireEvent.press(view.getByText(enLocale.sport.journal.deleteConfirmBtn));
      await waitFor(() => expect(mockStergeAntrenament).toHaveBeenCalledWith(CLOUD_WORKOUT_ID));

      // Delete last remaining set of singleSetWorkout removes the whole workout
      if (!view.queryByTestId(`progress-edit-set-${LOCAL_WORKOUT_ID}-0-0`)) {
        await fireEvent.press(view.getByText('Solo Finish'));
      }
      await fireEvent.press(view.getByTestId(`progress-edit-set-${LOCAL_WORKOUT_ID}-0-0`));
      expect(view.getByText(enLocale.sport.edit.lastSetRemovesWorkoutHint)).toBeTruthy();
      await fireEvent.press(view.getByTestId('workout-set-edit-delete'));

      await waitFor(() => expect(mockActualizeazaAntrenament).toHaveBeenCalledTimes(3));
      expect(mockActualizeazaAntrenament.mock.calls[2][1]).toEqual([]);
      expect(mockNotify.info).toHaveBeenCalledWith(
        enLocale.sport.edit.setDeletedTitle,
        enLocale.sport.edit.workoutDeletedMsg,
      );
    });
  });
});
