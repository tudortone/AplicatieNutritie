import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Sparkles, X, Plus, Check, Clock, Utensils, Refrigerator } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

const { height } = Dimensions.get('window');

const INGREDIENTE_PREDEFINITE = [
  'Pui', 'Ouă', 'Spanac', 'Orez', 'Roșii', 
  'Brânză / Telemea', 'Avocado', 'Ovăz', 'Ton', 
  'Cartofi', 'Dovlecel', 'Iaurt grecesc', 'Paste', 
  'Șuncă / Bacon', 'Ciuperci', 'Ceapă & Usturoi'
];

const TIPURI_MASA = ['Orice', 'Micul dejun', 'Prânz', 'Cină', 'Gustare'];
const TIMP_PREPARARE = ['Rapid (< 15 min)', 'Mediu (< 30 min)', 'Fără limită'];

interface RecipeGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
  caloriiRamase: number;
  proteineRamase: number;
}

export const RecipeGeneratorModal: React.FC<RecipeGeneratorModalProps> = ({
  visible,
  onClose,
  onGenerate,
  caloriiRamase,
  proteineRamase,
}) => {
  const { colors } = useTheme();
  const [ingredienteSelectate, setIngredienteSelectate] = useState<string[]>(['Ouă', 'Roșii', 'Brânză / Telemea']);
  const [inputCustom, setInputCustom] = useState('');
  const [tipMasa, setTipMasa] = useState('Orice');
  const [timp, setTimp] = useState('Rapid (< 15 min)');

  const toggleIngredient = (ing: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredienteSelectate((prev) =>
      prev.includes(ing) ? prev.filter((item) => item !== ing) : [...prev, ing]
    );
  };

  const adaugaCustom = () => {
    if (!inputCustom.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nou = inputCustom.trim();
    if (!ingredienteSelectate.includes(nou)) {
      setIngredienteSelectate((prev) => [nou, ...prev]);
    }
    setInputCustom('');
  };

  const handleGenerate = () => {
    if (ingredienteSelectate.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const prompt = `Am în casă următoarele ingrediente: ${ingredienteSelectate.join(', ')}. Te rog să îmi generezi o rețetă delicioasă și sănătoasă potrivită pentru ${tipMasa === 'Orice' ? 'orice masă a zilei' : tipMasa.toLowerCase()}, cu timp de preparare ${timp.toLowerCase()}. Țintele mele nutriționale rămase pentru astăzi sunt de aproximativ ${Math.max(caloriiRamase, 300)} kcal și ${Math.max(proteineRamase, 15)}g proteine. Include: 1) Numele rețetei, 2) Ingredientele exacte și cantități, 3) Modul de preparare pas cu pas pe scurt, 4) Valorile nutriționale estimate (Calorii, Proteine, Carbohidrați, Grăsimi).`;

    onGenerate(prompt);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View entering={FadeInUp.duration(400).springify()} exiting={FadeOutDown.duration(300)} style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
          
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={[styles.iconRing, { backgroundColor: colors.accent + '25' }]}>
                <Refrigerator size={22} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Generator Rețete AI</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Gătește inteligent din ce ai în frigider</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]} onPress={onClose}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            
            {/* Input ingredient custom */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ADAUTĂ SAU SELECTEAZĂ INGREDIENTE</Text>
            <View style={[styles.inputRow, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Ex: ciuperci, avocado, somon..."
                placeholderTextColor={colors.textTertiary}
                value={inputCustom}
                onChangeText={setInputCustom}
                onSubmitEditing={adaugaCustom}
              />
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.accent }]} onPress={adaugaCustom}>
                <Plus size={18} color={colors.background} strokeWidth={3} />
              </TouchableOpacity>
            </View>

            {/* Tag-uri ingrediente */}
            <View style={styles.tagsGrid}>
              {ingredienteSelectate.map((ing) => (
                <TouchableOpacity
                  key={ing}
                  style={[styles.tag, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => toggleIngredient(ing)}
                >
                  <Check size={14} color={colors.background} strokeWidth={3} />
                  <Text style={[styles.tagText, { color: colors.background, fontWeight: '800' }]}>{ing}</Text>
                </TouchableOpacity>
              ))}
              {INGREDIENTE_PREDEFINITE.filter(i => !ingredienteSelectate.includes(i)).map((ing) => (
                <TouchableOpacity
                  key={ing}
                  style={[styles.tag, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => toggleIngredient(ing)}
                >
                  <Plus size={14} color={colors.textSecondary} />
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{ing}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selector Tip Masă */}
            <View style={styles.sectionHeaderRow}>
              <Utensils size={15} color={colors.accentSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]}>TIPUL MESEI</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
              {TIPURI_MASA.map((t) => {
                const isSel = tipMasa === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, { backgroundColor: isSel ? colors.accentSecondary : colors.surfaceBg, borderColor: isSel ? colors.accentSecondary : colors.cardBorder }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTipMasa(t); }}
                  >
                    <Text style={[styles.chipText, { color: isSel ? colors.background : colors.textPrimary, fontWeight: isSel ? '800' : '600' }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Selector Timp Preparare */}
            <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
              <Clock size={15} color={colors.warning} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]}>TIMP DE PREPARARE</Text>
            </View>
            <View style={styles.timeGrid}>
              {TIMP_PREPARARE.map((tm) => {
                const isSel = timp === tm;
                return (
                  <TouchableOpacity
                    key={tm}
                    style={[styles.timeCard, { backgroundColor: isSel ? colors.warning + '25' : colors.surfaceBg, borderColor: isSel ? colors.warning : colors.cardBorder }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTimp(tm); }}
                  >
                    <Text style={[styles.timeText, { color: isSel ? colors.warning : colors.textSecondary, fontWeight: isSel ? '800' : '600' }]}>{tm}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </ScrollView>

          {/* Generate CTA Button */}
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.generateBtn, { shadowColor: colors.accent }]} onPress={handleGenerate} activeOpacity={0.85}>
              <LinearGradient colors={colors.accentGradient} style={styles.generateGrad}>
                <Sparkles size={20} color={colors.background} strokeWidth={2.5} />
                <Text style={[styles.generateText, { color: colors.background }]}>
                  Generează Rețetă ({ingredienteSelectate.length} ingrediente)
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: { maxHeight: height * 0.85, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 24 },
  glowTop: { position: 'absolute', top: -100, alignSelf: 'center', width: 300, height: 300, borderRadius: 150, opacity: 0.1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconRing: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  
  scroll: { maxHeight: height * 0.55 },
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6 },
  
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  input: { flex: 1, height: 40, fontSize: 15, fontWeight: '600' },
  addBtn: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  tagText: { fontSize: 13, fontWeight: '600' },
  
  horizontalChips: { gap: 8, paddingBottom: 6 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13 },
  
  timeGrid: { flexDirection: 'row', gap: 8 },
  timeCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  timeText: { fontSize: 12, textAlign: 'center' },
  
  footer: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  generateBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  generateGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  generateText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
});
