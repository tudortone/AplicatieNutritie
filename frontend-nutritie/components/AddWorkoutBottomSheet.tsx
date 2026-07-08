import React, { useState, useMemo, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Flame, Clock, Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotificationBanner } from '../context/NotificationBannerContext';
import { exercitiiPresets, ExercitiuPreset, calculeazaCaloriiArse } from '../constants/exercitii';
import { useAntrenamente } from '../hooks/useAntrenamente';

export interface AddWorkoutBottomSheetRef {
  open: () => void;
  close: () => void;
}

interface AddWorkoutBottomSheetProps {
  onSuccess?: () => void;
}

export const AddWorkoutBottomSheet = forwardRef<AddWorkoutBottomSheetRef, AddWorkoutBottomSheetProps>(
  ({ onSuccess }, ref) => {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { showBanner } = useNotificationBanner();
    const { adaugaAntrenament } = useAntrenamente();

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['70%', '88%'], []);

    const [selectedPreset, setSelectedPreset] = useState<ExercitiuPreset>(exercitiiPresets[0]);
    const [durataMin, setDurataMin] = useState('30');
    const [manualKcal, setManualKcal] = useState('');
    const [useManual, setUseManual] = useState(false);
    const [greutateUser, setGreutateUser] = useState(75);
    const [loading, setLoading] = useState(false);

    useImperativeHandle(ref, () => ({
      open: async () => {
        try {
          if (user?.user_metadata?.greutate) {
            setGreutateUser(Number(user.user_metadata.greutate));
          } else {
            const st = await AsyncStorage.getItem('greutate');
            if (st) setGreutateUser(Number(st));
          }
        } catch {}

        setSelectedPreset(exercitiiPresets[0]);
        setDurataMin('30');
        setManualKcal('');
        setUseManual(false);

        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
        bottomSheetRef.current?.expand();
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      []
    );

    const durNumber = parseInt(durataMin, 10) || 0;
    const estimatedKcal = useMemo(() => {
      if (useManual) return parseInt(manualKcal, 10) || 0;
      return calculeazaCaloriiArse(selectedPreset.met, greutateUser, durNumber);
    }, [useManual, manualKcal, selectedPreset.met, greutateUser, durNumber]);

    const handleSave = async () => {
      if (durNumber <= 0) {
        Alert.alert("Durată invalidă", "Introdu o durată în minute mai mare decât 0.");
        return;
      }
      if (estimatedKcal <= 0) {
        Alert.alert("Calorii invalide", "Numărul de calorii arse trebuie să fie mai mare decât 0.");
        return;
      }

      setLoading(true);
      try {
        await adaugaAntrenament({
          nume: selectedPreset.nume,
          tip: selectedPreset.tip,
          durata_min: durNumber,
          calorii_arse: estimatedKcal,
          met: selectedPreset.met,
        });

        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}

        showBanner({
          title: "Antrenament salvat!",
          message: `+${estimatedKcal} kcal adăugate la bugetul tău de azi.`,
          type: "success",
        });

        bottomSheetRef.current?.close();
        if (onSuccess) onSuccess();
      } catch (err: any) {
        Alert.alert("Eroare", "Nu am putut salva antrenamentul. Verifică dacă tabela 'antrenamente' există în Supabase.");
      } finally {
        setLoading(false);
      }
    };

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.cardBg, borderColor: colors.cardBorder, borderWidth: 1 }}
        handleIndicatorStyle={{ backgroundColor: colors.textTertiary }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={[styles.iconBox, { backgroundColor: colors.warning + '26' }]}>
                <Dumbbell size={22} color={colors.warning} />
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Înregistrează Antrenament
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bottomSheetRef.current?.close()}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]}
              accessibilityLabel="Închide panoul antrenament"
              accessibilityRole="button"
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Selectare exercițiu */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            ALEGE TIPUL DE EXERCIȚIU
          </Text>
          <View style={styles.chipsWrap}>
            {exercitiiPresets.map((preset) => {
              const active = selectedPreset.id === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => {
                    setSelectedPreset(preset);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: active ? colors.warning : colors.surfaceBg,
                      borderColor: active ? colors.warning : colors.cardBorder,
                    },
                  ]}
                  accessibilityLabel={`Selectează ${preset.nume}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipIcon}>{preset.icon}</Text>
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? '#000' : colors.textPrimary },
                    ]}
                  >
                    {preset.nume}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Durată (minute) */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>
            DURATĂ ANTRENAMENT (MINUTE)
          </Text>
          <View style={styles.inputRow}>
            <Clock size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <BottomSheetTextInput
              style={[
                styles.input,
                { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg },
              ]}
              keyboardType="numeric"
              value={durataMin}
              onChangeText={setDurataMin}
              placeholder="Ex: 30"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={styles.quickDurationRow}>
            {['15', '30', '45', '60', '90'].map((val) => (
              <TouchableOpacity
                key={val}
                onPress={() => {
                  setDurataMin(val);
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                }}
                style={[
                  styles.quickBtn,
                  {
                    backgroundColor: durataMin === val ? colors.warning + '26' : colors.surfaceBg,
                    borderColor: durataMin === val ? colors.warning : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: durataMin === val ? colors.warning : colors.textSecondary,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {val}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Preview sau introducedere manuală calorii */}
          <View style={[styles.previewCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Flame size={24} color={colors.warning} />
                <View>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Calorii arse estimate</Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: colors.warning }}>
                    +{estimatedKcal} kcal
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setUseManual(!useManual)}
                style={[
                  styles.switchManualBtn,
                  { borderColor: useManual ? colors.warning : colors.cardBorder },
                ]}
              >
                <Text style={{ fontSize: 12, color: useManual ? colors.warning : colors.textSecondary, fontWeight: '700' }}>
                  {useManual ? "Calcul automat" : "Introdu manual"}
                </Text>
              </TouchableOpacity>
            </View>

            {useManual && (
              <View style={{ marginTop: 12 }}>
                <BottomSheetTextInput
                  style={[
                    styles.input,
                    { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg },
                  ]}
                  keyboardType="numeric"
                  value={manualKcal}
                  onChangeText={setManualKcal}
                  placeholder="Introdu numărul exact de kcal arse"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            )}
          </View>

          {/* Buton Salvează */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            style={styles.saveWrap}
            accessibilityLabel="Salvează antrenamentul"
            accessibilityRole="button"
          >
            <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.saveBtn}>
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Check size={20} color="#000" strokeWidth={3} />
                  <Text style={styles.saveText}>Salvează Antrenamentul</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  chipIcon: { fontSize: 16 },
  chipText: { fontSize: 13, fontWeight: '700' },

  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 48, fontSize: 16, fontWeight: '700' },

  quickDurationRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  quickBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  previewCard: { padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 24 },
  switchManualBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },

  saveWrap: { borderRadius: 18, overflow: 'hidden' },
  saveBtn: { height: 54, justifyContent: 'center', alignItems: 'center' },
  saveText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
