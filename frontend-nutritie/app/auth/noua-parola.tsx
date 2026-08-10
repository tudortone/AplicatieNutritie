import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import KeyboardAwareScreen from '../../components/ui/KeyboardAwareScreen';
import { supabase } from '../../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Eye, EyeOff, CheckCircle2, Circle, KeyRound, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

// H1: ecranul de finalizare a resetării parolei. Supabase redirecționează din
// emailul de resetare în `app/auth/callback.tsx` cu `type=recovery`; după ce
// sesiunea e stabilită acolo, ajungem aici ca utilizatorul să-și seteze parola
// nouă (updateUser). Fără acest pas, resetarea era un dead-end: utilizatorul
// rămânea blocat cu parola veche, fiind aruncat direct în (tabs).
export default function NouaParolaScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { contentMaxWidth } = useResponsiveLayout();
  const router = useRouter();
  const [parola, setParola] = useState('');
  const [confirmare, setConfirmare] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmare, setShowConfirmare] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verificat = useRef(false);

  const isMinLength = parola.length >= 8;
  const hasUpperCase = /[A-Z]/.test(parola);
  const hasNumber = /[0-9]/.test(parola);
  const isPasswordValid = isMinLength && hasUpperCase && hasNumber;
  const confirmOk = parola.length > 0 && parola === confirmare;
  const poateTrimite = isPasswordValid && confirmOk;

  // Fără sesiune (link expirat / deschis direct) → înapoi la login.
  useEffect(() => {
    if (verificat.current) return;
    verificat.current = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        Alert.alert(t('alerts.titluri.eroareAutentificare'), t('alerts.mesaje.sesiuneExpirata'));
        router.replace('/auth');
      }
    })();
  }, [router, t]);

  const submit = async () => {
    setError(null);
    if (!isPasswordValid) {
      setError('Parola nu îndeplinește toate cerințele de securitate.');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (!confirmOk) {
      setError('Parolele nu coincid.');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    setLoading(true);
    try {
      const { error: eroare } = await supabase.auth.updateUser({ password: parola });
      if (eroare) {
        setError(eroare.message);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return;
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert(
        t('alerts.titluri.succes'),
        'Parola a fost schimbată cu succes. Te rugăm să te conectezi cu parola nouă.',
        [{ text: t('alerts.butoane.super'), onPress: () => router.replace('/(tabs)') }],
      );
    } catch (e: any) {
      console.error("Update password error:", e);
      setError(e?.message || t('alerts.mesaje.conexiuneServerEsueaza'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logoWrap, { shadowColor: colors.accent }]}>
          <LinearGradient colors={colors.accentGradient} style={styles.logoGrad}>
            <KeyRound size={42} color={colors.background} strokeWidth={2.5} />
          </LinearGradient>
        </View>

        <View style={[styles.formCard, { borderColor: colors.cardBorder, maxWidth: contentMaxWidth }]}>
          <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.formGrad}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Setare parolă nouă</Text>
            <Text style={[styles.formSubtitle, { color: colors.textSecondary }]}>
              Alege o parolă nouă pentru contul tău. Cerințele sunt aceleași ca la înregistrare.
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <View style={styles.inputIconWrap}>
                <Lock size={18} color={colors.textSecondary} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                accessibilityLabel="Parolă nouă"
                placeholder="Parolă nouă"
                placeholderTextColor={colors.textSecondary}
                value={parola}
                onChangeText={(text) => {
                  setParola(text);
                  if (error) setError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                selectionColor={colors.accent}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{ padding: 14, marginRight: 2 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ascunde parola' : 'Arată parola'}
              >
                {showPassword ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
              </TouchableOpacity>
            </View>

            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: error && !confirmOk ? colors.danger : colors.inputBorder }]}>
              <View style={styles.inputIconWrap}>
                <Lock size={18} color={colors.textSecondary} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                accessibilityLabel="Confirmă parola"
                placeholder="Confirmă parola"
                placeholderTextColor={colors.textSecondary}
                value={confirmare}
                onChangeText={(text) => {
                  setConfirmare(text);
                  if (error) setError(null);
                }}
                secureTextEntry={!showConfirmare}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                selectionColor={colors.accent}
                onSubmitEditing={submit}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmare(!showConfirmare)}
                style={{ padding: 14, marginRight: 2 }}
                accessibilityRole="button"
                accessibilityLabel={showConfirmare ? 'Ascunde parola' : 'Arată parola'}
              >
                {showConfirmare ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
              </TouchableOpacity>
            </View>

            <View style={[styles.passwordRulesBox, { backgroundColor: colors.overlayLight, borderColor: colors.overlayStrong }]}>
              <Text style={[styles.passwordRulesHeader, { color: colors.textSecondary }]}>Cerințe parolă:</Text>
              <View style={styles.ruleRow}>
                {isMinLength ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={colors.danger} />}
                <Text style={[styles.ruleText, { color: isMinLength ? colors.success : colors.danger }]}>Minim 8 caractere</Text>
              </View>
              <View style={styles.ruleRow}>
                {hasUpperCase ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={colors.danger} />}
                <Text style={[styles.ruleText, { color: hasUpperCase ? colors.success : colors.danger }]}>O literă mare (A-Z)</Text>
              </View>
              <View style={styles.ruleRow}>
                {hasNumber ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={colors.danger} />}
                <Text style={[styles.ruleText, { color: hasNumber ? colors.success : colors.danger }]}>O cifră (0-9)</Text>
              </View>
              <View style={styles.ruleRow}>
                {confirmOk ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={confirmare.length > 0 ? colors.danger : colors.danger} />}
                <Text style={[styles.ruleText, { color: confirmOk ? colors.success : colors.danger }]}>Parolele coincid</Text>
              </View>
            </View>

            {error && (
              <View style={[styles.errorBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, { shadowColor: colors.accent }, !poateTrimite ? { opacity: 0.6 } : {}]}
              onPress={submit}
              disabled={loading}
            >
              <LinearGradient colors={colors.accentGradient} style={styles.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <>
                    <Text style={[styles.submitText, { color: colors.background }]}>Salvează parola nouă</Text>
                    <ArrowRight size={20} color={colors.background} strokeWidth={2.5} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.replace('/auth')}
              accessibilityRole="button"
              accessibilityLabel="Înapoi la autentificare"
            >
              <Text style={[styles.backText, { color: colors.textSecondary }]}>Înapoi la autentificare</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 350, height: 350, borderRadius: 175, opacity: 0.07 },

  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingBottom: 48 },

  logoWrap: { marginBottom: 28, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.5, shadowRadius: 32, elevation: 20 },
  logoGrad: { width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },

  formCard: { width: '100%', borderRadius: 32, overflow: 'hidden', borderWidth: 1 },
  formGrad: { padding: 28 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  formSubtitle: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 24 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, marginBottom: 14, paddingHorizontal: 16 },
  inputIconWrap: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, fontWeight: '500' },

  passwordRulesBox: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, gap: 8 },
  passwordRulesHeader: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 13, fontWeight: '600' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  submitText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  backBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  backText: { fontSize: 15, fontWeight: '600' },
});
