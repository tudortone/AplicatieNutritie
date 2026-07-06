import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInUp, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Scan, ArrowRight, Mail, Lock } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

export default function AuthScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [parola, setParola] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const submit = async () => {
    if (!email || !parola) { 
      Alert.alert("Completează câmpurile", "Email și parolă sunt obligatorii."); 
      return; 
    }
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password: parola });
      if (error) Alert.alert("Eroare", error.message);
      else Alert.alert("Cont creat!", "Verifică-ți emailul pentru confirmare.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: parola });
      if (error) Alert.alert("Eroare", error.message);
    }
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background glows */}
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <View style={styles.content}>

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
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={colors.accent}
                  />
                </View>

                {/* Password */}
                <View style={styles.inputWrap}>
                  <View style={styles.inputIconWrap}>
                    <Lock size={18} color={colors.textSecondary} />
                  </View>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="Parolă"
                    placeholderTextColor={colors.textSecondary}
                    value={parola}
                    onChangeText={setParola}
                    secureTextEntry
                    selectionColor={colors.accent}
                  />
                </View>

                {/* Submit */}
                <TouchableOpacity style={[styles.submitBtn, { shadowColor: colors.accent }]} onPress={submit} disabled={loading}>
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
                <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsSignUp(!isSignUp)}>
                  <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                    {isSignUp ? 'Ai deja un cont? ' : 'Nu ai cont? '}
                    <Text style={[styles.toggleAccent, { color: colors.accent }]}>{isSignUp ? 'Conectează-te' : 'Înregistrează-te'}</Text>
                  </Text>
                </TouchableOpacity>

              </LinearGradient>
            </BlurView>
          </Animated.View>

        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 350, height: 350, borderRadius: 175, opacity: 0.07 },

  kav: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

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
});
