import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Platform, Alert, ActivityIndicator
} from 'react-native';
import KeyboardAwareScreen from '../components/ui/KeyboardAwareScreen';
import { supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInUp, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Scan, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

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
  const [email, setEmail] = useState('');
  const [parola, setParola] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isMinLength = parola.length >= 8;
  const hasUpperCase = /[A-Z]/.test(parola);
  const hasNumber = /[0-9]/.test(parola);
  const isPasswordValid = isMinLength && hasUpperCase && hasNumber;

  const isValidEmail = (str: string) => /\S+@\S+\.\S+/.test(str.trim());

  const submit = async () => {
    setAuthError(null);
    if (!email || !parola) { 
      setAuthError("Email și parolă sunt obligatorii.");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return; 
    }
    if (!isValidEmail(email)) {
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
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: parola });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message);
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          Alert.alert("Cont creat!", "Verifică-ți emailul pentru confirmare.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: parola });
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
      Alert.alert("Email necesar", "Introduceți adresa de email pentru a vă reseta parola.");
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert("Email invalid", "Te rugăm să introduci o adresă de email validă.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'nutriai://auth/callback',
      });
      if (error) {
        Alert.alert("Eroare", error.message);
      } else {
        Alert.alert("Email trimis", "Verificați căsuța de email pentru instrucțiunile de resetare a parolei.");
      }
    } catch (e: any) {
      console.error("Reset password error:", e);
      Alert.alert("Eroare neașteptată", e?.message || "Nu s-a putut realiza conexiunea la server.");
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'nutriai://auth/callback',
        },
      });
      if (error) Alert.alert("Eroare OAuth", error.message);
    } catch (e: any) {
      console.error("OAuth error:", e);
      Alert.alert("Eroare OAuth", e?.message || "A apărut o problemă de conexiune.");
    } finally {
      setLoading(false);
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

        <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>NutriAI</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Nutriție inteligentă, personalizată pentru tine.</Text>
        </Animated.View>

        {/* Form card */}
        <Animated.View entering={FadeInDown.duration(700).delay(400).springify()} style={[styles.formCard, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={25} tint="dark" style={styles.formBlur}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.formGrad}>

              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{isSignUp ? 'Creare cont nou' : 'Bun venit înapoi'}</Text>

              {/* Email */}
              <View style={styles.inputWrap}>
                <View style={styles.inputIconWrap}>
                  <Mail size={18} color={colors.textSecondary} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Adresă de email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (authError) setAuthError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  selectionColor={colors.accent}
                />
              </View>

              {/* Password */}
              <View style={[styles.inputWrap, authError ? { borderColor: '#FF4D4D' } : {}]}>
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
                  selectionColor={colors.accent}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ padding: 10, marginRight: 6 }}
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
                <Animated.View entering={FadeInDown.duration(350)} style={styles.passwordRulesBox}>
                  <Text style={[styles.passwordRulesHeader, { color: colors.textSecondary }]}>
                    Cerințe parolă:
                  </Text>
                  <View style={styles.ruleRow}>
                    {isMinLength ? (
                      <CheckCircle2 size={16} color="#4ADE80" />
                    ) : (
                      <Circle size={16} color="#FF4D4D" />
                    )}
                    <Text style={[styles.ruleText, { color: isMinLength ? '#4ADE80' : '#FF4D4D' }]}>
                      Minim 8 caractere
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasUpperCase ? (
                      <CheckCircle2 size={16} color="#4ADE80" />
                    ) : (
                      <Circle size={16} color="#FF4D4D" />
                    )}
                    <Text style={[styles.ruleText, { color: hasUpperCase ? '#4ADE80' : '#FF4D4D' }]}>
                      O literă mare (A-Z)
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasNumber ? (
                      <CheckCircle2 size={16} color="#4ADE80" />
                    ) : (
                      <Circle size={16} color="#FF4D4D" />
                    )}
                    <Text style={[styles.ruleText, { color: hasNumber ? '#4ADE80' : '#FF4D4D' }]}>
                      O cifră (0-9)
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Error Banner */}
              {authError && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.errorBanner}>
                  <AlertCircle size={18} color="#FF4D4D" style={{ marginRight: 8 }} />
                  <Text style={styles.errorText}>{authError}</Text>
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
                <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>sau</Text>
                <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
              </View>

              <View style={styles.oauthWrap}>
                <TouchableOpacity style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => signInWithOAuth('google')}>
                  <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]}>🟢 Google</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => signInWithOAuth('apple')}>
                  <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]}>🍎 Apple</Text>
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

  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 14, paddingHorizontal: 16 },
  inputIconWrap: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, fontWeight: '500' },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  submitText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  toggleBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  toggleText: { fontSize: 15, fontWeight: '500' },
  toggleAccent: { fontWeight: '700' },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 14, paddingVertical: 4 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  oauthWrap: { flexDirection: 'row', gap: 12 },
  oauthBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  oauthBtnText: { fontSize: 15, fontWeight: '700' },
  passwordRulesBox: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', gap: 8 },
  passwordRulesHeader: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 13, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 77, 77, 0.12)', borderWidth: 1, borderColor: 'rgba(255, 77, 77, 0.3)', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, color: '#FF4D4D', fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
