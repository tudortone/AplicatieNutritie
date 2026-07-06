import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { API_URL } from '@/constants/config';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { Sparkles, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

interface SelectionRowProps {
  label: string;
  options: string[];
  current: string;
  onChange: (val: string) => void;
}

const SelectionRow = ({ label, options, current, onChange }: SelectionRowProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((opt: string) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.optionBtn,
              current === opt && { backgroundColor: colors.accent + '26', borderColor: colors.accent }
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optionText, { color: current === opt ? colors.accent : colors.textTertiary, fontWeight: current === opt ? '800' : '600' }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default function CalculatorAI() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    varsta: '',
    greutate: '',
    inaltime: '',
    sex: 'Masculin',
    activitate: 'Sedentar',
    obiectiv: 'Slăbire'
  });

  const updateForm = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const calculeaza = async () => {
    if (!form.varsta || !form.greutate || !form.inaltime) {
      Alert.alert("Eroare", "Te rog să introduci vârsta, greutatea și înălțimea.");
      return;
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        Alert.alert("Eroare", `Eroare sesiune: ${sessionError.message}`);
        return;
      }
      if (!session) {
        Alert.alert("Eroare", "Trebuie să fii autentificat.");
        return;
      }

      const raspuns = await fetch(`${API_URL}/api/calculeaza-profil`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(form)
      });
      const date = await raspuns.json();

      if (date.eroare) {
        Alert.alert("Eroare AI", date.eroare);
      } else {
        await AsyncStorage.setItem('caloriiTinta', String(date.caloriiTinta));
        await AsyncStorage.setItem('proteineTinta', String(date.proteineTinta));
        await AsyncStorage.setItem('greutate', form.greutate);
        
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            caloriiTinta: date.caloriiTinta,
            proteineTinta: date.proteineTinta,
            greutate: parseInt(form.greutate)
          }
        });

        if (updateError) {
          console.error("Eroare sincronizare metadata Supabase:", updateError.message);
        }
        
        Alert.alert(
          "✅ Profil Generat", 
          `Țintele tale au fost setate la:\n\n🔥 Calorii: ${date.caloriiTinta} kcal\n🥩 Proteine: ${date.proteineTinta}g`,
          [{ text: "Super!", onPress: () => router.back() }]
        );
      }
    } catch {
      Alert.alert("Eroare", "Nu am putut contacta serverul. Verifică conexiunea.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <Animated.View entering={FadeInUp.duration(500)} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BlurView intensity={20} tint="dark" style={styles.backBtnBlur}>
            <ArrowLeft color="#fff" size={24} />
          </BlurView>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Asistent Profil</Text>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={ZoomIn.duration(600).delay(100)} style={[styles.aiBadge, { borderColor: colors.accent + '33' }]}>
          <LinearGradient colors={[colors.accent + '26', 'rgba(0,0,0,0)']} style={styles.aiBadgeGrad}>
            <Sparkles size={24} color={colors.accent} />
            <Text style={styles.aiBadgeText}>Algoritm medical cu inteligență artificială. Introdu datele tale corecte pentru ținte precise de nutriție.</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(200)} style={[styles.formContainer, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={20} tint="dark" style={styles.formBlur}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textTertiary }]}> Vârstă</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Ex: 25"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={form.varsta}
                onChangeText={(t) => updateForm('varsta', t)}
              />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textTertiary }]}> Greutate (kg)</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Ex: 75"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={form.greutate}
                  onChangeText={(t) => updateForm('greutate', t)}
                />
              </View>
              <View style={{ width: 16 }} />
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textTertiary }]}> Înălțime (cm)</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Ex: 180"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={form.inaltime}
                  onChangeText={(t) => updateForm('inaltime', t)}
                />
              </View>
            </View>

            <SelectionRow 
              label="Sex biologic"
              options={['Masculin', 'Feminin']}
              current={form.sex}
              onChange={(val: string) => updateForm('sex', val)}
            />

            <SelectionRow 
              label="Nivel Activitate Fizică"
              options={['Sedentar', 'Moderat', 'Foarte Activ']}
              current={form.activitate}
              onChange={(val: string) => updateForm('activitate', val)}
            />

            <SelectionRow 
              label="Obiectiv"
              options={['Slăbire', 'Menținere', 'Masă Musculară']}
              current={form.obiectiv}
              onChange={(val: string) => updateForm('obiectiv', val)}
            />
          </BlurView>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(400)}>
          <TouchableOpacity 
            style={[styles.submitBtn, { shadowColor: colors.accent }]} 
            onPress={calculeaza}
            disabled={loading}
          >
            <LinearGradient 
              colors={loading ? ['#333', '#222'] : colors.accentGradient} 
              style={styles.submitGrad}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={[styles.submitText, { color: colors.background }]}>Calculează cu AI</Text>
                  <Sparkles size={18} color={colors.background} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.05 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.05 },

  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { borderRadius: 16, overflow: 'hidden', marginRight: 16 },
  backBtnBlur: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },

  scroll: { paddingHorizontal: 20, paddingBottom: 60 },

  aiBadge: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  aiBadgeGrad: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  aiBadgeText: { color: '#D1D5DB', fontSize: 13, flex: 1, lineHeight: 20 },

  formContainer: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 32 },
  formBlur: { padding: 24 },

  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowInputs: { flexDirection: 'row' },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 14 },

  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  optionText: { fontSize: 14 },

  submitBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  submitGrad: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
});
