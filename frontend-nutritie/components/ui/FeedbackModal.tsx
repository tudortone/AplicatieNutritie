import React, { useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Send, MessageSquare, CheckCircle2, AlertCircle, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { submitFeedback } from '../../lib/feedback';
import { buildSupportMailto, SUPPORT_EMAIL } from '../../constants/support';

// The production RPC migration and endpoint have not passed the live release gate.
// Keep submissions disabled until that dependency is deployed and verified.
const FEEDBACK_SUBMISSION_ENABLED = false;

export interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { session } = useAuth();
  const [mesaj, setMesaj] = useState('');
  const [seIncarca, setSeIncarca] = useState(false);
  const [salvat, setSalvat] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const submissionInFlight = useRef(false);

  const inchide = () => {
    if (seIncarca) return;
    setMesaj('');
    setSalvat(false);
    setEroare(null);
    onClose();
  };

  const deschideEmailSuport = async () => {
    try {
      await Linking.openURL(buildSupportMailto());
    } catch {
      Alert.alert(t('profile.supportEmailLabel'), t('profile.supportEmailOpenFailed'));
    }
  };

  const trimiteFeedback = async () => {
    if (submissionInFlight.current || seIncarca) return;
    if (!mesaj.trim()) {
      setEroare(t('profile.feedbackValidation'));
      return;
    }
    submissionInFlight.current = true;
    setEroare(null);
    setSeIncarca(true);

    try {
      await submitFeedback(mesaj, session?.access_token);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setSalvat(true);
    } catch (error) {
      setEroare(error instanceof Error && error.message === 'FEEDBACK_INVALID'
        ? t('profile.feedbackValidation')
        : t('profile.feedbackSubmitFailed'));
    } finally {
      submissionInFlight.current = false;
      setSeIncarca(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={inchide}
      animationType="fade"
      transparent
    >
      <Pressable style={styles.backdrop} onPress={inchide}>
        <Pressable style={[styles.card, { backgroundColor: colors.background, borderColor: colors.cardBorder }]} onPress={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.iconBg, { backgroundColor: colors.accent + '20' }]}>
              <MessageSquare size={20} color={colors.accent} />
            </View>
          <Text style={[styles.titlu, { color: colors.textPrimary }]}>{t('profile.feedbackTitle')}</Text>
          </View>

          <TouchableOpacity onPress={inchide} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {!FEEDBACK_SUBMISSION_ENABLED ? (
          <View style={styles.unavailableBox}>
            <Text accessibilityRole="alert" style={[styles.subtitlu, { color: colors.textSecondary }]}>
              {t('profile.feedbackTemporarilyUnavailable')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('profile.feedbackContactSupport')}
              onPress={() => { void deschideEmailSuport(); }}
              style={[styles.supportButton, { borderColor: colors.cardBorder }]}
              testID="feedback-contact-support"
            >
              <Mail size={17} color={colors.accent} />
              <Text style={[styles.btnText, { color: colors.accent }]}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
          </View>
        ) : salvat ? (
          <View style={styles.succesBox}>
            <CheckCircle2 size={48} color={colors.success} />
            <Text style={[styles.succesTitlu, { color: colors.textPrimary }]}>{t('profile.feedbackSavedTitle')}</Text>
            <Text style={[styles.succesSub, { color: colors.textSecondary }]}>
              {t('profile.feedbackSavedMessage')}
            </Text>
            <TouchableOpacity onPress={inchide} accessibilityRole="button" style={styles.dismissButton}>
              <Text style={[styles.btnText, { color: colors.accent }]}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.subtitlu, { color: colors.textSecondary }]}>
              {t('profile.feedbackDescription')}
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                }
              ]}
              placeholder="Descrie părerea sau problema ta aici..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              value={mesaj}
              onChangeText={setMesaj}
              maxLength={2000}
              accessibilityLabel={t('profile.feedbackInputA11y')}
              accessibilityHint={t('profile.feedbackInputHint')}
              testID="feedback-message-input"
            />

            <Text style={[styles.notaSansibilitate, { color: colors.textSecondary }]}>
              {t('profile.feedbackPrivacyNote')}
            </Text>

            {eroare ? (
              <View style={[styles.errorBox, { backgroundColor: colors.danger + '18', borderColor: colors.danger + '40' }]}>
                <AlertCircle size={16} color={colors.danger} />
                <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{eroare}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, (!mesaj.trim() || seIncarca) && { opacity: 0.5 }]}
              onPress={trimiteFeedback}
              disabled={!mesaj.trim() || seIncarca}
              testID="feedback-submit"
            >
              <LinearGradient colors={colors.accentGradient} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {seIncarca ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <>
                    <Text style={[styles.btnText, { color: colors.background }]}>{t('profile.feedbackSubmit')}</Text>
                    <Send size={18} color={colors.background} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 28, borderWidth: 1, padding: 24, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBg: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  titlu: { fontSize: 17, fontWeight: '800' },
  closeBtn: { padding: 4 },
  subtitlu: { fontSize: 13, lineHeight: 18 },
  unavailableBox: { gap: 12 },
  supportButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  input: { borderRadius: 16, borderWidth: 1, padding: 14, minHeight: 110, fontSize: 14 },
  notaSansibilitate: { fontSize: 11, fontStyle: 'italic', marginTop: 6, marginBottom: 4 },
  btn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  btnText: { fontSize: 16, fontWeight: '900' },
  succesBox: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  succesTitlu: { fontSize: 20, fontWeight: '900' },
  succesSub: { fontSize: 13, textAlign: 'center' },
  dismissButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
