import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native';
import { supabase } from '../../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Save, LogOut, Target, Scale, Zap, Sparkles, ChevronRight, Palette } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { themes, themeDisplayNames, ThemeName } from '../../constants/theme';
import type { Session } from '@supabase/supabase-js';

export default function ProfilScreen() {
  const router = useRouter();
  const { colors, themeName, setTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [greutate, setGreutate] = useState('75');
  const [caloriiTinta, setCaloriiTinta] = useState('2000');
  const [proteineTinta, setProteineTinta] = useState('150');
  
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const initProfile = async () => {
      setCheckingSession(true);
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Eroare sesiune Supabase:", error.message);
        }
        
        if (currentSession) {
          setSession(currentSession);
          
          const { data: { user } } = await supabase.auth.getUser();
          const metadata = user?.user_metadata || currentSession.user.user_metadata || {};
          let g = metadata.greutate;
          let c = metadata.caloriiTinta;
          let p = metadata.proteineTinta;

          if (!g) g = await AsyncStorage.getItem('greutate');
          if (!c) c = await AsyncStorage.getItem('caloriiTinta');
          if (!p) p = await AsyncStorage.getItem('proteineTinta');

          setGreutate(g ? String(g) : '75');
          setCaloriiTinta(c ? String(c) : '2000');
          setProteineTinta(p ? String(p) : '150');

          if (g) await AsyncStorage.setItem('greutate', String(g));
          if (c) await AsyncStorage.setItem('caloriiTinta', String(c));
          if (p) await AsyncStorage.setItem('proteineTinta', String(p));
        }
      } catch (e) {
        console.error("Eroare la inițializarea profilului:", e);
      } finally {
        setCheckingSession(false);
      }
    };

    initProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const salveaza = async () => {
    if (!greutate || !caloriiTinta || !proteineTinta) {
      Alert.alert("Eroare", "Te rog să completezi toate obiectivele.");
      return;
    }
    
    setLoading(true);
    try {
      await AsyncStorage.setItem('greutate', greutate);
      await AsyncStorage.setItem('caloriiTinta', caloriiTinta);
      await AsyncStorage.setItem('proteineTinta', proteineTinta);

      const { error } = await supabase.auth.updateUser({
        data: {
          greutate: parseInt(greutate) || 75,
          caloriiTinta: parseInt(caloriiTinta) || 2000,
          proteineTinta: parseInt(proteineTinta) || 150
        }
      });

      if (error) {
        Alert.alert("Eroare salvare", `Eroare salvare în Cloud: ${error.message}`);
      } else {
        Alert.alert("✅ Salvat", "Profilul tău a fost actualizat în siguranță.");
      }
    } catch {
      Alert.alert("Eroare", "A apărut o problemă la conexiune. Datele au fost salvate doar local.");
    } finally {
      setLoading(false);
    }
  };

  const deconectare = async () => {
    Alert.alert("Deconectare", "Ești sigur că vrei să te deconectezi?", [
      { text: "Anulează", style: "cancel" },
      { text: "Deconectează", style: "destructive", onPress: () => supabase.auth.signOut() }
    ]);
  };

  if (checkingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Se încarcă profilul...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Nu ești autentificat.</Text>
      </View>
    );
  }

  const initials = session.user.email?.slice(0, 2).toUpperCase() || 'NU';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Avatar header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.avatarSection}>
          <LinearGradient colors={colors.accentGradient} style={[styles.avatarRing, { shadowColor: colors.accent }]}>
            <View style={[styles.avatarInner, { backgroundColor: '#0F1318' }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
            </View>
          </LinearGradient>
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{session.user.email?.split('@')[0]}</Text>
          <Text style={[styles.emailText, { color: colors.textSecondary }]}>{session.user.email}</Text>

          <View style={[styles.planBadge, { borderColor: colors.accent + '33' }]}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.planBadgeGrad}>
              <Zap size={14} color={colors.accent} />
              <Text style={[styles.planBadgeText, { color: colors.accent }]}>AI Premium Plan</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Visual Theme Section */}
        <Animated.View entering={FadeInDown.duration(600).delay(50)}>
          <View style={styles.sectionHeaderRow}>
            <Palette size={16} color={colors.accent} />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TEMĂ VIZUALĂ</Text>
          </View>
          <View style={styles.themeGrid}>
            {(['midnight', 'ocean', 'sunset'] as ThemeName[]).map((tName) => {
              const tColors = themes[tName];
              const isSelected = themeName === tName;
              return (
                <TouchableOpacity
                  key={tName}
                  style={[
                    styles.themeCard,
                    { backgroundColor: tColors.surfaceBg, borderColor: isSelected ? tColors.accent : 'rgba(255,255,255,0.08)' },
                    isSelected && { borderWidth: 2 }
                  ]}
                  onPress={() => setTheme(tName)}
                  activeOpacity={0.8}
                >
                  <View style={styles.themeSwatchRow}>
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.background }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accent }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accentSecondary }]} />
                  </View>
                  <Text style={[styles.themeNameText, { color: isSelected ? tColors.accent : colors.textPrimary }]}>
                    {themeDisplayNames[tName]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Targets section */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>OBIECTIVELE TALE</Text>

          <TouchableOpacity style={[styles.aiSetupBtn, { borderColor: colors.accent + '33' }]} onPress={() => router.push('/calculator-ai')}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.aiSetupGrad}>
              <Sparkles size={22} color={colors.accent} />
              <View style={styles.aiSetupTextWrap}>
                <Text style={[styles.aiSetupTitle, { color: colors.textPrimary }]}>Asistent Configurare Profil</Text>
                <Text style={[styles.aiSetupSub, { color: colors.textTertiary }]}>Calculează țintele automat cu AI</Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </LinearGradient>
          </TouchableOpacity>

          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Scale size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Greutate (kg)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={greutate}
                    onChangeText={setGreutate}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Target size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Calorii (kcal/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={caloriiTinta}
                    onChangeText={setCaloriiTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accentSecondary + '1F' }]}>
                  <Zap size={18} color={colors.accentSecondary} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Proteine (g/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={proteineTinta}
                    onChangeText={setProteineTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Save button */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <TouchableOpacity style={[styles.saveBtn, { shadowColor: colors.accent }]} onPress={salveaza} disabled={loading}>
            <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Save size={20} color={colors.background} strokeWidth={2.5} />
                  <Text style={[styles.saveBtnText, { color: colors.background }]}>Salvează Modificările</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} style={styles.infoCard}>
          <BlurView intensity={15} tint="dark" style={styles.infoCardBlur}>
            <LinearGradient colors={['rgba(255,255,255,0.03)', 'rgba(0,0,0,0)']} style={styles.infoCardGrad}>
              <Text style={styles.infoCardTitle}>💡 Cum funcționează</Text>
              <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
                Obiectivele pe care le setezi sunt folosite de asistentul AI pentru a-ți oferi recomandări personalizate și a-ți urmări progresul zilnic.
              </Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={FadeInUp.duration(600).delay(400)}>
          <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger + '33', backgroundColor: colors.danger + '0A' }]} onPress={deconectare}>
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>Deconectare</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: 50, right: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.05 },

  scroll: { paddingTop: Platform.OS === 'ios' ? 48 : 28, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 160 : 50 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // Avatar section
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarRing: { width: 96, height: 96, borderRadius: 32, padding: 3, marginBottom: 16, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 15 },
  avatarInner: { flex: 1, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  displayName: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  emailText: { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  planBadge: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  planBadgeGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  planBadgeText: { fontSize: 13, fontWeight: '700', marginLeft: 4 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginLeft: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14, marginLeft: 4 },

  themeGrid: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  themeCard: { flex: 1, padding: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  themeSwatchRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  themeSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  themeNameText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  aiSetupBtn: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  aiSetupGrad: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  aiSetupTextWrap: { flex: 1 },
  aiSetupTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  aiSetupSub: { fontSize: 13, fontWeight: '500' },

  card: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  cardGrad: { paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  inputIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  inputContent: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  inputField: { fontSize: 22, fontWeight: '800', padding: 0 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 20 },

  // Save button
  saveBtn: { borderRadius: 20, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  saveBtnText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  // Info card
  infoCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 24 },
  infoCardBlur: { overflow: 'hidden' },
  infoCardGrad: { padding: 20 },
  infoCardTitle: { fontSize: 15, fontWeight: '800', color: '#E5E7EB', marginBottom: 8 },
  infoCardText: { fontSize: 14, lineHeight: 22 },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, borderRadius: 20, borderWidth: 1 },
  logoutText: { fontSize: 16, fontWeight: '700' },
});
