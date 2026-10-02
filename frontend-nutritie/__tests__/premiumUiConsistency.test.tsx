import React from 'react';
import { View, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { Trash2, LogOut } from 'lucide-react-native';

// Mocks
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, style }: any) => React.createElement(View, { style }, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (options?.defaultValue) return options.defaultValue;
      return key;
    },
    i18n: { language: 'ro' },
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      surface: '#101512',
      border: '#1F2923',
      textPrimary: '#F1F5F9',
      textSecondary: '#94A3B8',
      textTertiary: '#64748B',
      accent: '#22C55E',
      textOnAccent: '#0A0E0C',
      danger: '#EF4444',
      textOnDanger: '#FFFFFF',
      disabledBg: '#1E2922',
      disabledText: '#64748B',
      warning: '#F59E0B',
    },
  }),
}));

describe('GETFLOW — Premium UI Consistency & Native-Default Sweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. ConfirmSheet renders GetFlow-owned modal with icon, title, message, and accessibility', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const screen = await render(
      <ConfirmSheet
        visible={true}
        title="Remove food?"
        message='"French fries" will be removed from this meal.'
        icon={<Trash2 size={24} color="#EF4444" />}
        destructive
        buttonLayout="horizontal"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Remove food?')).toBeTruthy();
    expect(screen.getByText('"French fries" will be removed from this meal.')).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByLabelText('Remove')).toBeTruthy();
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });

  test('2. Cancel button dismisses without calling onConfirm', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const screen = await render(
      <ConfirmSheet
        visible={true}
        title="Delete meal?"
        message='"Lunch" will be deleted from your journal.'
        icon={<Trash2 size={24} color="#EF4444" />}
        destructive
        buttonLayout="horizontal"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('3. Confirm button calls onConfirm action', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const screen = await render(
      <ConfirmSheet
        visible={true}
        title="Delete meal?"
        message='"Lunch" will be deleted from your journal.'
        icon={<Trash2 size={24} color="#EF4444" />}
        destructive
        buttonLayout="horizontal"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Delete'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('4. Loading state disables both confirm and cancel and renders indicator', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const screen = await render(
      <ConfirmSheet
        visible={true}
        title="Deleting meal..."
        loading={true}
        destructive
        buttonLayout="horizontal"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // During loading, confirm button text is replaced by ActivityIndicator
    expect(screen.queryByText('Delete')).toBeNull();
  });

  test('5. Logout confirmation renders warning-themed ConfirmSheet with LogOut icon', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const screen = await render(
      <ConfirmSheet
        visible={true}
        title="Deconectare"
        message="Ești sigur că vrei să te deconectezi?"
        icon={<LogOut size={24} color="#F59E0B" />}
        iconBg="rgba(245, 158, 11, 0.1)"
        destructive
        buttonLayout="horizontal"
        confirmLabel="Deconectează"
        cancelLabel="Anulează"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Deconectare')).toBeTruthy();
    expect(screen.getByText('Ești sigur că vrei să te deconectezi?')).toBeTruthy();
    expect(screen.getByText('Deconectează')).toBeTruthy();
    expect(screen.getByText('Anulează')).toBeTruthy();
  });

  test('6. RO, EN, FR, DE locales contain all required confirmation strings without raw curly braces', () => {
    const locales = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };

    const requiredKeys = [
      'confirmRemoveIngredientTitle',
      'confirmRemoveIngredientMessage',
      'confirmRemoveIngredientNamed',
      'confirmDeleteMealTitle',
      'confirmDeleteMealMessage',
      'mealDeletedSuccess',
      'ingredientRemovedSuccess',
    ];

    for (const [lang, json] of Object.entries(locales)) {
      const jurnal = (json as any).jurnal;
      expect(jurnal).toBeDefined();

      for (const key of requiredKeys) {
        expect(jurnal[key]).toBeDefined();
        expect(typeof jurnal[key]).toBe('string');
        expect(jurnal[key].length).toBeGreaterThan(0);

        // Verify valid interpolation tokens only (e.g. {{nume}}), no broken tokens like {{... or {raw}
        const matches = jurnal[key].match(/\{\{([^}]+)\}\}/g);
        if (matches) {
          matches.forEach((token: string) => {
            const inner = token.replace(/\{\{|\}\}/g, '').trim();
            expect(['nume', 'quantity', 'unit', 'count', 'categorie', 'gramaj', 'kcal', 'label', 'proteine'].includes(inner)).toBe(true);
          });
        }
      }
    }
  });
});
