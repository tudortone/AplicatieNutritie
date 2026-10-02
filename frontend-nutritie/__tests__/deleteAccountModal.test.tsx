import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DeleteAccountModal } from '../components/ui/DeleteAccountModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'profile.deleteAccountModalTitle': 'Confirmare Ștergere Cont',
        'profile.deleteAccountModalSubtitle': 'Această acțiune este ireversibilă.',
        'profile.deleteAccountSubscriptionsNotice': 'Anulează abonamentele din Google Play.',
        'profile.deleteAccountPrompt': 'Scrie STERGE:',
        'profile.deleteAccountInputPlaceholder': 'Scrie STERGE',
        'profile.deleteAccountCancel': 'Anulează',
        'profile.deleteAccountConfirmBtn': 'Șterge definitiv contul',
        'profile.deleteAccountFinalConfirmTitle': 'Ultima Confirmare',
        'profile.deleteAccountFinalConfirmMessage': 'Ești 100% sigur?',
        'profile.deleteAccountFinalConfirmBtn': 'Da, șterge definitiv',
        'profile.deleteAccountFinalCancelBtn': 'Păstrează contul',
      };
      return translations[key] || key;
    },
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      cardBorder: 'rgba(255,255,255,0.1)',
      danger: '#EF4444',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      textTertiary: '#6B7280',
      inputBg: '#161C24',
      inputBorder: '#374151',
    },
  }),
}));

describe('DeleteAccountModal — Protectie împotriva ștergerii accidentale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  afterEach(async () => {
    await cleanup();
  });

  it('butonul este dezactivat pana la introducerea textului de confirmare', async () => {
    const onConfirmDelete = jest.fn();
    const onClose = jest.fn();

    const screen = await render(
      <DeleteAccountModal
        visible={true}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    // Initial apasare pe buton dezactivat
    await fireEvent.press(screen.getByTestId('delete-account-confirm-button'));
    expect(Alert.alert).not.toHaveBeenCalled();

    // Introducere text gresit
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-input'), 'GRESIT');
    await fireEvent.press(screen.getByTestId('delete-account-confirm-button'));
    expect(Alert.alert).not.toHaveBeenCalled();

    // Introducere text corect STERGE
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-input'), 'STERGE');
    await waitFor(() => {
      expect(screen.getByTestId('delete-account-confirm-button').props.accessibilityState?.disabled).not.toBe(true);
    });

    await fireEvent.press(screen.getByTestId('delete-account-confirm-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Ultima Confirmare',
      'Ești 100% sigur?',
      expect.any(Array)
    );
  });

  it('permite si cuvantul international DELETE', async () => {
    const onConfirmDelete = jest.fn();
    const onClose = jest.fn();

    const screen = await render(
      <DeleteAccountModal
        visible={true}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-input'), 'DELETE');
    await waitFor(() => {
      expect(screen.getByTestId('delete-account-confirm-button').props.accessibilityState?.disabled).not.toBe(true);
    });

    await fireEvent.press(screen.getByTestId('delete-account-confirm-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Ultima Confirmare',
      'Ești 100% sigur?',
      expect.any(Array)
    );
  });
});
