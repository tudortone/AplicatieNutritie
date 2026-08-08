
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import KeyboardAwareScreen from '../components/ui/KeyboardAwareScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeInUp, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Scan, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, Circle, Eye, EyeOff, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppStore } from '../hooks/useAppStore';
import { incarcaDateOnboarding, calculeazaPlan, type PlanNutritional } from '../lib/onboarding';
import { extrageCodDinUrl } from '../lib/oauth';

// Contul de admin se logheaza cu username-ul „admin" (nu email). Supabase cere
// email la autentificare, deci identificatorul se mapeaza intern la adresa contului.
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@nutriai.app';

const getFriendlyErrorMessage = (rawMsg: string): string => {
  const m = rawMsg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Email sau parolă incorectă. Verifică datele introduse.';
  }
  if (m.includes('email not confirmed')) {
    return 'Adresa de email nu a fost confirmată încă. Verifică inbox-ul.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return 'Există deja un cont înregistrat cu această adresă de email.';
  }
  if (m.includes('password should be at least')) {
    return 'Parola trebuie să aibă minimum 8 caractere.';
  }
  if (m.includes('rate limit')) {
    return 'Prea multe încercări. Te rugăm să aștepți câteva minute.';
  }
  return rawMsg || 'A apărut o problemă la autentificare.';
};

export default function AuthScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { contentMaxWidth } = useResponsiveLayout();
  const router = useRouter();
  const { setOnboardingDone } = useAppStore();
  const [planCalculat, setPlanCalculat] = useState<PlanNutritional | null>(null);
  const [email, setEmail] = useState('');
  const [parola, setParola] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState<'google' | 'apple' | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    incarcaDateOnboarding().then((d) => {
      if (d) {
        const p = calculeazaPlan(d);
        if (p) setPlanCalculat(p);
      }
    });
  }, []);

  const isMinLength = parola.length >= 8;
  const hasUpperCase = /[A-Z]/.test(parola);
  const hasNumber = /[0-9]/.test(parola);
  const isPasswordValid = isMinLength && hasUpperCase && hasNumber;

  const isValidEmail = (str: string) => /\S+@\S+\.\S+/.test(str.trim());

  const submit = async () => {
    setAuthError(null);
    const identificator = email.trim();
    const esteAdminLogin = !isSignUp && identificator.toLowerCase() === ADMIN_USERNAME;
    if (!identificator || !parola) {
      setAuthError("Email și parolă sunt obligatorii.");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (!isValidEmail(identificator) && !esteAdminLogin) {
      setAuthError("Te rugăm să introduci o adresă de email validă.");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (isSignUp && !isPasswordValid) {
      setAuthError("Parola nu îndeplinește toate cerințele de securitate.");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Datele din setup-ul de dinainte de cont (onboarding) ajung în metadata contului,
        // ca profilul să fie deja completat la prima autentificare.
        const setupKeys = ['greutate', 'caloriiTinta', 'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv'];
        const setupRaw = await AsyncStorage.multiGet(setupKeys);
        const setupData: Record<string, unknown> = {};
        for (const [key, value] of setupRaw) {
          if (!value) continue;
          if (key === 'greutate') setupData[key] = parseFloat(value) || undefined;
          else if (key === 'caloriiTinta' || key === 'varsta' || key === 'inaltime') setupData[key] = parseInt(value, 10) || undefined;
          else setupData[key] = value;
          if (setupData[key] === undefined) delete setupData[key];
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: parola,
          options: { data: setupData },
        });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message);
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          Alert.alert(t('alerts.titluri.contCreat'), t('alerts.mesaje.verificaEmailConfirmare'));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: esteAdminLogin ? ADMIN_EMAIL : identificator, password: parola });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message);
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        }
      }
    } catch (e: any) {
      console.error("Auth submit error:", e);
      const msg = getFriendlyErrorMessage(e?.message || "Nu s-a putut realiza conexiunea la server.");
      setAuthError(msg);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const resetParola = async () => {
    if (!email) {
      Alert.alert(t('alerts.titluri.emailNecesar'), t('alerts.mesaje.emailNecesarResetare'));
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert(t('alerts.titluri.emailInvalid'), t('alerts.mesaje.emailInvalidDetalii'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'nutriai://auth/callback',
      });
      if (error) {
        Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.eroareDinamica', { eroare: error.message }));
      } else {
        Alert.alert(t('alerts.titluri.emailTrimis'), t('alerts.mesaje.emailTrimisResetare'));
      }
    } catch (e: any) {
      console.error("Reset password error:", e);
      Alert.alert(t('alerts.titluri.eroareNeasteptata'), e?.message || t('alerts.mesaje.conexiuneServerEsueaza'));
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (loadingOAuth) return;
    setAuthError(null);
    setLoadingOAuth(provider);
    try {
      // Pe React Native SDK-ul Supabase NU navigheaza singur: returneaza URL-ul
      // in `data.url`, pe care trebuie sa-l deschidem noi (expo-web-browser).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'nutriai://auth/callback',
        },
      });
      if (error) {
        Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.eroareDinamica', { eroare: error.message }));
        return;
      }
      if (!data.url) {
        Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
        return;
      }
      const rezultat = await WebBrowser.openAuthSessionAsync(data.url, 'nutriai://auth/callback');
      if (rezultat.type === 'success' && rezultat.url) {
        const cod = extrageCodDinUrl(rezultat.url);
        if (!cod) {
          Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
          return;
        }
        const { error: eroareSchimb } = await supabase.auth.exchangeCodeForSession(cod);
        if (eroareSchimb) {
          Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.eroareDinamica', { eroare: eroareSchimb.message }));
        }
      }
      // rezultat.type 'cancel'/'dismiss' → utilizatorul a renuntat; fara eroare.
    } catch (e: any) {
      console.error("OAuth error:", e);
      Alert.alert(t('alerts.titluri.eroareOAuth'), e?.message || t('alerts.mesaje.problemaConexiuneOAuth'));
    } finally {
      setLoadingOAuth(null);
    }
  };

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background glows */}
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Animated.View entering={ZoomIn.duration(700).springify()} style={[styles.logoWrap, { shadowColor: colors.accent }]}>
          <LinearGradient colors={colors.accentGradient} style={styles.logoGrad}>
            <Scan size={42} color={colors.background} strokeWidth={2.5} />
          </LinearGradient>
        </Animated.View>

        {/* Calculated Plan Banner */}
        {planCalculat ? (
          <Animated.View entering={FadeInUp.duration(600).delay(280)} style={[styles.planCard, { maxWidth: contentMaxWidth }]}>
            <LinearGradient colors={colors.accentGradient} style={styles.planGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.planHeaderRow}>
                <Sparkles size={20} color={colors.background} />
                <Text style={[styles.planBadgeText, { color: colors.background }]}>Planul tău zilnic calculat AI</Text>
              </View>
              <Text style={[styles.planKcalText, { color: colors.background }]}>{planCalculat.calorii} kcal/zi</Text>
              <View style={styles.planMacroRow}>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]}>{planCalculat.proteineG}g Proteine</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]}>{planCalculat.carbohidratiG}g Carbi</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]}>{planCalculat.grasimiG}g Grăsimi</Text>
                </View>
              </View>
              <Text style={[styles.planSubtext, { color: colors.background }]}>
                Creează-ți contul sau conectează-te pentru a-ți activa planul în aplicație.
              </Text>
            </LinearGradient>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.duration(600).delay(280)} style={{ width: '100%', maxWidth: contentMaxWidth, marginBottom: 20 }}>
            <TouchableOpacity
              style={[styles.noPlanCard, { borderColor: colors.accent + '44', backgroundColor: colors.cardBg }]}
              onPress={() => {
                setOnboardingDone(false);
                router.replace('/onboarding');
              }}
              activeOpacity={0.8}
            >
              <Sparkles size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noPlanTitle, { color: colors.textPrimary }]}>Vrei să-ți calculezi planul mai întâi?</Text>
                <Text style={[styles.noPlanSub, { color: colors.accent }]}>Parcurge chestionarul NutriAI ➔</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Form card */}
        <Animated.View entering={FadeInDown.duration(700).delay(400).springify()} style={[styles.formCard, { borderColor: colors.cardBorder, maxWidth: contentMaxWidth }]}>
          <BlurView intensity={25} tint="dark" style={styles.formBlur}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.formGrad}>

              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{isSignUp ? 'Creare cont nou' : 'Bun venit înapoi'}</Text>

              {/* Email */}
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <View style={styles.inputIconWrap}>
                  <Mail size={18} color={colors.textSecondary} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Email sau utilizator"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (authError) setAuthError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  // FIX UI: autocorectul transforma adresele de email, iar autofill-ul nu functiona.
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  selectionColor={colors.accent}
                />
              </View>

              {/* Password */}
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: authError ? colors.danger : colors.inputBorder }]}>
                <View style={styles.inputIconWrap}>
                  <Lock size={18} color={colors.textSecondary} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Parolă"
                  placeholderTextColor={colors.textSecondary}
                  value={parola}
                  onChangeText={(t) => {
                    setParola(t);
                    if (authError) setAuthError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  selectionColor={colors.accent}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ padding: 14, marginRight: 2 }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Password Requirements (doar la înregistrare) */}
              {isSignUp && (
                <Animated.View entering={FadeInDown.duration(350)} style={[styles.passwordRulesBox, { backgroundColor: colors.overlayLight, borderColor: colors.overlayStrong }]}>
                  <Text style={[styles.passwordRulesHeader, { color: colors.textSecondary }]}>
                    Cerințe parolă:
                  </Text>
                  <View style={styles.ruleRow}>
                    {isMinLength ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: isMinLength ? colors.success : colors.danger }]}>
                      Minim 8 caractere
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasUpperCase ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: hasUpperCase ? colors.success : colors.danger }]}>
                      O literă mare (A-Z)
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasNumber ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: hasNumber ? colors.success : colors.danger }]}>
                      O cifră (0-9)
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Error Banner */}
              {authError && (
                <Animated.View entering={FadeInDown.duration(300)} style={[styles.errorBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                  <AlertCircle size={18} color={colors.danger} style={{ marginRight: 8 }} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>{authError}</Text>
                </Animated.View>
              )}

              {!isSignUp && (
                <TouchableOpacity style={styles.forgotBtn} onPress={resetParola}>
                  <Text style={[styles.forgotText, { color: colors.accent }]}>Ai uitat parola?</Text>
                </TouchableOpacity>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { shadowColor: colors.accent },
                  (isSignUp && !isPasswordValid) ? { opacity: 0.6 } : {}
                ]}
                onPress={submit}
                disabled={loading}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Text style={[styles.submitText, { color: colors.background }]}>{isSignUp ? 'Creează cont' : 'Conectare'}</Text>
                      <ArrowRight size={20} color={colors.background} strokeWidth={2.5} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Toggle */}
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => {
                  setAuthError(null);
                  setIsSignUp(!isSignUp);
                }}
              >
                <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                  {isSignUp ? 'Ai deja un cont? ' : 'Nu ai cont? '}
                  <Text style={[styles.toggleAccent, { color: colors.accent }]}>{isSignUp ? 'Conectează-te' : 'Înregistrează-te'}</Text>
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerWrap}>
                <View style={[styles.dividerLine, { backgroundColor: colors.overlayStrong }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>sau</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.overlayStrong }]} />
              </View>

              <View style={styles.oauthWrap}>
                <TouchableOpacity
                  style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => signInWithOAuth('google')}
                  disabled={loadingOAuth !== null}
                >
                  {loadingOAuth === 'google' ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]}>🟢 Google</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => signInWithOAuth('apple')}
                  disabled={loadingOAuth !== null}
                >
                  {loadingOAuth === 'apple' ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]}>🍎 Apple</Text>
                  )}
                </TouchableOpacity>
              </View>

            </LinearGradient>
          </BlurView>
        </Animated.View>

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

  titleWrap: { alignItems: 'center', marginBottom: 44 },
  title: { fontSize: 48, fontWeight: '900', letterSpacing: -2, marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', fontWeight: '400', maxWidth: '80%', lineHeight: 24 },

  formCard: { width: '100%', borderRadius: 32, overflow: 'hidden', borderWidth: 1 },
  formBlur: { overflow: 'hidden' },
  formGrad: { padding: 28 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 24, letterSpacing: -0.3 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, marginBottom: 14, paddingHorizontal: 16 },
  inputIconWrap: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, fontWeight: '500' },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  submitText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  toggleBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  toggleText: { fontSize: 15, fontWeight: '500' },
  toggleAccent: { fontWeight: '700' },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 14, paddingVertical: 8 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  oauthWrap: { flexDirection: 'row', gap: 12 },
  oauthBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  oauthBtnText: { fontSize: 15, fontWeight: '700' },
  passwordRulesBox: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, gap: 8 },
  passwordRulesHeader: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 13, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  planCard: { width: '100%', borderRadius: 24, overflow: 'hidden', marginBottom: 20 },
  planGrad: { padding: 20, alignItems: 'center' },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  planBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  planKcalText: { fontSize: 36, fontWeight: '900', letterSpacing: -1, marginVertical: 2 },
  planMacroRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  planMacroPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  planMacroText: { fontSize: 12, fontWeight: '800' },
  planSubtext: { fontSize: 12, textAlign: 'center', opacity: 0.9, marginTop: 4 },

  noPlanCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: 16, gap: 14 },
  noPlanTitle: { fontSize: 14, fontWeight: '700' },
  noPlanSub: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});
