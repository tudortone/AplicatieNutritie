import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { WORKOUT_V2_PRESETS } from '../constants/workout-v2/presets';
import { ActiveWorkout } from '../components/workout-v2/ActiveWorkout';
import { startWorkoutFromTemplate } from '../lib/workout-v2/sessionModel';
import { instantiatePreset } from '../lib/workout-v2/templateModel';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    textPrimary: '#fff', textSecondary: '#999', textTertiary: '#777', surfaceBg: '#111', border: '#333',
    accentTertiary: '#0ff', accent: '#cf0', textOnAccent: '#000', success: '#0f0', inputBg: '#111', inputBorder: '#333',
  } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(async () => { await cleanup(); });

it('supports inline active set completion and adding a set', async () => {
  const template = instantiatePreset(WORKOUT_V2_PRESETS[6], 'user-a', 'template-a', '2026-09-26T10:00:00Z');
  const session = startWorkoutFromTemplate(template, 'session-a', '2026-09-26T10:01:00Z');
  const strength = session.blocks.find((block) => block.kind === 'strength');
  if (!strength || strength.kind !== 'strength') throw new Error('missing strength block');
  const onCompleteSet = jest.fn();
  const onAddSet = jest.fn();
  const view = await render(<ActiveWorkout session={session} onCompleteSet={onCompleteSet} onAddSet={onAddSet} onCompleteCardio={jest.fn()} onFinish={jest.fn()} />);
  await fireEvent.press(view.getAllByLabelText('workoutV2.active.completeSet')[0]);
  await fireEvent.press(view.getAllByLabelText('workoutV2.active.addSet')[0]);
  expect(onCompleteSet).toHaveBeenCalledWith(strength.id, strength.sets[0].id, expect.objectContaining({ reps: strength.sets[0].plannedReps }));
  expect(onAddSet).toHaveBeenCalledWith(strength.id);
});
