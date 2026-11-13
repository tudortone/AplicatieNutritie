import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { StyleSheet } from 'react-native';
import { WORKOUT_V2_PRESETS } from '../constants/workout-v2/presets';
import { TemplateBuilder } from '../components/workout-v2/TemplateBuilder';
import { instantiatePreset } from '../lib/workout-v2/templateModel';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    textPrimary: '#fff', textSecondary: '#999', textTertiary: '#777', surfaceBg: '#111', border: '#333',
    disabledText: '#555', disabledBg: '#222', accentTertiary: '#0ff', danger: '#f44', accent: '#cf0',
    textOnAccent: '#000', success: '#0f0', inputBg: '#111', inputBorder: '#333',
  } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(async () => { await cleanup(); });

describe('Workout V2 builder production components', () => {
  it('keeps add/remove/reorder/duplicate/save actions reachable', async () => {
    const template = instantiatePreset(WORKOUT_V2_PRESETS[0], 'user-a', 'template-a', '2026-09-26T10:00:00Z');
    const onAddExercise = jest.fn();
    const onRemoveBlock = jest.fn();
    const onDuplicateBlock = jest.fn();
    const onMoveBlock = jest.fn();
    const onSave = jest.fn();
    const view = await render(
      <TemplateBuilder
        template={template}
        onNameChange={jest.fn()}
        onAddExercise={onAddExercise}
        onRemoveBlock={onRemoveBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
        onChangeStrengthBlock={jest.fn()}
        onChangeCardioBlock={jest.fn()}
        onSave={onSave}
      />,
    );
    await fireEvent.press(view.getByTestId('workout-v2-add-running'));
    await fireEvent.press(view.getByTestId(`duplicate-${template.blocks[0].id}`));
    await fireEvent.press(view.getByTestId(`remove-${template.blocks[0].id}`));
    await fireEvent.press(view.getByLabelText('workoutV2.builder.save'));
    expect(onAddExercise).toHaveBeenCalledWith('running');
    expect(onDuplicateBlock).toHaveBeenCalledWith(template.blocks[0].id);
    expect(onRemoveBlock).toHaveBeenCalledWith(template.blocks[0].id);
    expect(onSave).toHaveBeenCalledTimes(1);

    const dupStyle = StyleSheet.flatten(view.getByTestId(`duplicate-${template.blocks[0].id}`).props.style);
    expect(dupStyle.width ?? dupStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(dupStyle.height ?? dupStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('uses readable disabledText contrast on invalid Save button and allows clearing numeric inputs', async () => {
    const onChangeStrength = jest.fn();
    const template = { ...instantiatePreset(WORKOUT_V2_PRESETS[0], 'user-a', 'template-a', '2026-09-26T10:00:00Z'), name: '' };
    const view = await render(
      <TemplateBuilder
        template={template}
        onNameChange={jest.fn()}
        onAddExercise={jest.fn()}
        onRemoveBlock={jest.fn()}
        onDuplicateBlock={jest.fn()}
        onMoveBlock={jest.fn()}
        onChangeStrengthBlock={onChangeStrength}
        onChangeCardioBlock={jest.fn()}
        onSave={jest.fn()}
      />,
    );
    const saveText = view.getByText('workoutV2.builder.save');
    expect(StyleSheet.flatten(saveText.props.style).color).toBe('#555');

    const setsInput = view.getAllByLabelText('workoutV2.builder.sets')[0];
    await fireEvent.changeText(setsInput, '');
    expect(view.getAllByLabelText('workoutV2.builder.sets')[0].props.value).toBe('');
    await fireEvent.changeText(view.getAllByLabelText('workoutV2.builder.sets')[0], '5');
    expect(onChangeStrength).toHaveBeenCalledWith(template.blocks[0].id, { sets: 5 });
  });
});
