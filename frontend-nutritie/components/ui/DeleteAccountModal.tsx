import React, { useContext, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AlertTriangle, X, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const FALLBACK_INSETS_CONTEXT = React.createContext<{ bottom?: number } | null>(null);

export interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmDelete: () => Promise<void> | void;
  loading?: boolean;
}

export function DeleteAccountModal({
  visible,
  onClose,
  onConfirmDelete,
  loading = false,
}: DeleteAccountModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useContext(SafeAreaInsetsContext ?? FALLBACK_INSETS_CONTEXT);
  const bottomInset = insets?.bottom ?? 0;
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const isBusy = loading || submitting;

  // Acceptă fie cuvântul localizat, fie standardele internaționale 'STERGE' / 'DELETE'
  const isConfirmed = (() => {
    const cleaned = confirmText.trim().toUpperCase();
    const localizedPrompt = (t('profile.deleteAccountInputPlaceholder') || '').trim().toUpperCase();
    return (
      cleaned === 'STERGE' ||
      cleaned === 'ȘTERGE' ||
      cleaned === 'DELETE' ||
      cleaned === 'SUPPRIMER' ||
      cleaned === 'LOESCHEN' ||
      cleaned === 'LÖSCHEN' ||
      (localizedPrompt && cleaned.includes(localizedPrompt.replace(/^(SCRIE|TYPE|ÉCRIVEZ|GIB)\s*/i, '')))
    );
  })();

  const handleClose = (force = false) => {
    if (isBusy && !force) return;
    setConfirmText('');
    onClose();
  };

  const handlePressDelete = () => {
    if (!isConfirmed || isBusy || submittingRef.current) return;

    // Avertisment final suplimentar (Double Confirmation) înainte de execuția definitivă
    Alert.alert(
      t('profile.deleteAccountFinalConfirmTitle'),
      t('profile.deleteAccountFinalConfirmMessage'),
      [
        {
          text: t('profile.deleteAccountFinalCancelBtn'),
          style: 'cancel',
        },
        {
          text: t('profile.deleteAccountFinalConfirmBtn'),
          style: 'destructive',
          onPress: async () => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            setSubmitting(true);
            try {
              await onConfirmDelete();
              handleClose(true);
            } finally {
              submittingRef.current = false;
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={() => handleClose()}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={[styles.backdrop, { paddingBottom: Math.max(bottomInset, 20) }]} onPress={() => handleClose()}>
          <Pressable
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal={true}
            aria-modal={true}
          >
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={[styles.iconBg, { backgroundColor: colors.danger + '20' }]}>
                  <AlertTriangle size={22} color={colors.danger} />
                </View>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {t('profile.deleteAccountModalTitle')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleClose()}
                disabled={isBusy}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close', 'Închide')}
                accessibilityState={{ disabled: isBusy }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('profile.deleteAccountModalSubtitle')}
              </Text>

              <View style={[styles.warningBox, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '0D' }]}>
                <Text style={[styles.warningText, { color: colors.danger }]}>
                  {t('profile.deleteAccountSubscriptionsNotice')}
                </Text>
              </View>

              <Text style={[styles.promptLabel, { color: colors.textPrimary }]}>
                {t('profile.deleteAccountPrompt')}
              </Text>

              <TextInput
                testID="delete-account-confirm-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: isConfirmed ? colors.danger : colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder={t('profile.deleteAccountInputPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
              />

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancelBtn, { borderColor: colors.cardBorder }]}
                  onPress={() => handleClose()}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isBusy }}
                >
                  <Text
                    style={[styles.cancelBtnText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {t('profile.deleteAccountCancel')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="delete-account-confirm-button"
                  style={[
                    styles.btn,
                    styles.deleteBtn,
                    {
                      backgroundColor: isConfirmed ? colors.danger : colors.danger + '40',
                      opacity: isConfirmed ? 1 : 0.6,
                    },
                  ]}
                  onPress={handlePressDelete}
                  disabled={!isConfirmed || isBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isConfirmed || isBusy }}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={colors.textOnDanger} />
                  ) : (
                    <>
                      <Trash2 size={16} color={colors.textOnDanger} style={{ marginRight: 6 }} />
                      <Text
                        style={[styles.deleteBtnText, { color: colors.textOnDanger }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        {t('profile.deleteAccountConfirmBtn')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  iconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  body: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  warningBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  cancelBtn: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {
    elevation: 2,
    paddingHorizontal: 10,
  },
  deleteBtnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
});
