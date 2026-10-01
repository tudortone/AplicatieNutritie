import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Haptics from 'expo-haptics';
import { X, Send, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../context/ThemeContext';

export interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const { colors } = useTheme();
  const [mesaj, setMesaj] = useState('');
  const [seIncarca, setSeIncarca] = useState(false);
  const [trimis, setTrimis] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);

  // Sanitize feedback-ul ÎNAINTE de trimitere: eliminăm textul brut sensibil
  // (JWT, email, telefon) și limităm lungimea — NU trimitem niciodată date raw.
  const sanitizeFeedback = (value: string): string =>
    value
      .trim()
      .slice(0, 2000)
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE_REDACTED]');

  const trimiteFeedback = async () => {
    setEroare(null);
    setSeIncarca(true);

    try {
      const sanitized = sanitizeFeedback(mesaj);
      if (!sanitized) {
        setSeIncarca(false);
        return;
      }

      // Trimitem doar mesajul sanitizat prin API-ul Sentry (nu text raw).
      Sentry.captureFeedback({ message: sanitized });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setTrimis(true);
      setTimeout(() => {
        setTrimis(false);
        setMesaj('');
        setSeIncarca(false);
        setEroare(null);
        onClose();
      }, 1500);
    } catch {
      setSeIncarca(false);
      setEroare('Nu s-a putut trimite feedback-ul. Te rugăm să încerci din nou.');
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      transparent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.background, borderColor: colors.cardBorder }]} onPress={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.iconBg, { backgroundColor: colors.accent + '20' }]}>
              <MessageSquare size={20} color={colors.accent} />
            </View>
            <Text style={[styles.titlu, { color: colors.textPrimary }]}>Feedback & Raportare Erori</Text>
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {trimis ? (
          <View style={styles.succesBox}>
            <CheckCircle2 size={48} color={colors.success} />
            <Text style={[styles.succesTitlu, { color: colors.textPrimary }]}>Îți mulțumim!</Text>
            <Text style={[styles.succesSub, { color: colors.textSecondary }]}>
              Mesajul tău a fost trimis către echipa GetFlow.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.subtitlu, { color: colors.textSecondary }]}>
              Spune-ne cum putem îmbunătăți aplicația sau raportează o problemă întâmpinată.
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
            />

            <Text style={[styles.notaSansibilitate, { color: colors.textSecondary }]}>
              Nu include parole, date medicale, informații de plată sau tokenuri.
            </Text>

            {eroare ? (
              <View style={[styles.errorBox, { backgroundColor: colors.danger + '18', borderColor: colors.danger + '40' }]}>
                <AlertCircle size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{eroare}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, (!mesaj.trim() || seIncarca) && { opacity: 0.5 }]}
              onPress={trimiteFeedback}
              disabled={!mesaj.trim() || seIncarca}
            >
              <LinearGradient colors={colors.accentGradient} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {seIncarca ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <>
                    <Text style={[styles.btnText, { color: colors.background }]}>Trimite Feedback</Text>
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
});
