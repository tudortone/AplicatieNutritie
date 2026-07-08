import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Scale, X, Check, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

interface AddWeightModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (greutate: number) => void;
  greutateCurenta: number;
  greutateTinta?: number;
  onSaveTinta?: (tinta: number) => void;
  initialTab?: 'curenta' | 'tinta';
}

export const AddWeightModal: React.FC<AddWeightModalProps> = ({
  visible,
  onClose,
  onSave,
  greutateCurenta,
  greutateTinta = 70,
  onSaveTinta,
  initialTab = 'curenta',
}) => {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<'curenta' | 'tinta'>(initialTab);
  const [inputVal, setInputVal] = useState(greutateCurenta.toString());

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setInputVal(initialTab === 'curenta' ? greutateCurenta.toString() : greutateTinta.toString());
    }
  }, [visible, initialTab, greutateCurenta, greutateTinta]);

  const handleTabSwitch = (tab: 'curenta' | 'tinta') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    setInputVal(tab === 'curenta' ? greutateCurenta.toString() : greutateTinta.toString());
  };

  const handleSave = () => {
    const val = parseFloat(inputVal.replace(',', '.'));
    if (isNaN(val) || val < 30 || val > 250) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeTab === 'curenta') {
      onSave(val);
    } else if (onSaveTinta) {
      onSaveTinta(val);
    } else {
      onSave(val);
    }
  };

  const adaugaRaport = (diff: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const baza = activeTab === 'curenta' ? greutateCurenta : greutateTinta;
    const curent = parseFloat(inputVal.replace(',', '.')) || baza;
    const nou = Math.round((curent + diff) * 10) / 10;
    setInputVal(nou.toString());
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View entering={FadeInUp.duration(350).springify()} exiting={FadeOutDown.duration(250)} style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          <View style={[styles.glowTop, { backgroundColor: activeTab === 'curenta' ? colors.accentSecondary : colors.accent }]} />

          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={[styles.iconRing, { backgroundColor: (activeTab === 'curenta' ? colors.accentSecondary : colors.accent) + '25' }]}>
                {activeTab === 'curenta' ? (
                  <Scale size={22} color={colors.accentSecondary} />
                ) : (
                  <Target size={22} color={colors.accent} />
                )}
              </View>
              <View>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {activeTab === 'curenta' ? 'Greutate Curentă' : 'Greutate Țintă'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {activeTab === 'curenta' ? 'Monitorizează-ți progresul pe cântar azi' : 'Setați noul obiectiv de greutate dorită'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]} onPress={onClose}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tab Switcher */}
          {onSaveTinta && (
            <View style={[styles.tabContainer, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'curenta' && { backgroundColor: colors.accentSecondary }]}
                onPress={() => handleTabSwitch('curenta')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'curenta' ? colors.background : colors.textSecondary }]}>
                  ⚖️ Curentă ({greutateCurenta} kg)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'tinta' && { backgroundColor: colors.accent }]}
                onPress={() => handleTabSwitch('tinta')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'tinta' ? '#000000' : colors.textSecondary }]}>
                  🎯 Țintă ({greutateTinta} kg)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Big Input Box */}
          <View style={styles.inputContainer}>
            <View style={[styles.inputBox, { borderColor: (activeTab === 'curenta' ? colors.accentSecondary : colors.accent) + '50', backgroundColor: colors.surfaceBg }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={inputVal}
                onChangeText={setInputVal}
                keyboardType="decimal-pad"
                maxLength={5}
                selectTextOnFocus
                autoFocus
              />
              <Text style={[styles.unit, { color: activeTab === 'curenta' ? colors.accentSecondary : colors.accent }]}>kg</Text>
            </View>

            {/* Quick +/- adjustment buttons */}
            <View style={styles.quickButtons}>
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => adaugaRaport(-0.5)}>
                <Text style={[styles.quickBtnText, { color: colors.textSecondary }]}>−0.5</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => adaugaRaport(-0.1)}>
                <Text style={[styles.quickBtnText, { color: colors.textSecondary }]}>−0.1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => adaugaRaport(0.1)}>
                <Text style={[styles.quickBtnText, { color: colors.textSecondary }]}>+0.1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]} onPress={() => adaugaRaport(0.5)}>
                <Text style={[styles.quickBtnText, { color: colors.textSecondary }]}>+0.5</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={[styles.saveBtn, { shadowColor: activeTab === 'curenta' ? colors.accentSecondary : colors.accent }]} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={activeTab === 'curenta' ? colors.accentSecondaryGradient : colors.accentGradient} style={styles.saveGrad}>
              <Check size={20} color={activeTab === 'curenta' ? colors.background : '#000000'} strokeWidth={3} />
              <Text style={[styles.saveText, { color: activeTab === 'curenta' ? colors.background : '#000000' }]}>
                {activeTab === 'curenta' ? 'Salvează Istoric Cântărire' : 'Salvează Noua Țintă'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: { width: width - 40, borderRadius: 28, borderWidth: 1, overflow: 'hidden', padding: 24 },
  glowTop: { position: 'absolute', top: -80, alignSelf: 'center', width: 250, height: 250, borderRadius: 125, opacity: 0.12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconRing: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  
  inputContainer: { alignItems: 'center', marginBottom: 24 },
  inputBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12, width: '70%', marginBottom: 16 },
  input: { fontSize: 48, fontWeight: '900', textAlign: 'center', minWidth: 100 },
  unit: { fontSize: 24, fontWeight: '800', marginLeft: 8, alignSelf: 'flex-end', marginBottom: 8 },
  
  quickButtons: { flexDirection: 'row', gap: 10 },
  quickBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  quickBtnText: { fontSize: 14, fontWeight: '800' },
  
  tabContainer: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },

  saveBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  saveGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  saveText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
});
