import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Sparkles, X, Plus, Check, Clock, Utensils, Refrigerator } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { useCamara } from '../hooks/useCamara';
// REMED-002: traducerile modalei trec prin i18n (chei chat.recipeGen.*).
import { useTranslation } from 'react-i18next';

const { height } = Dimensions.get('window');

const INGREDIENTE_PREDEFINITE = [
  'Pui', 'Ouă', 'Spanac', 'Orez', 'Roșii',
  'Brânză / Telemea', 'Avocado', 'Ovăz', 'Ton',
  'Cartofi', 'Dovlecel', 'Iaurt grecesc', 'Paste',
  'Șuncă / Bacon', 'Ciuperci', 'Ceapă & Usturoi'
];

// REMED-002: `value` (RO) rămâne pentru prompt-ul AI; eticheta afișată trece
// prin i18n. Numele ingredientelor rămân RO (sunt input funcțional pentru AI).
const TIPURI_MASA: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'Orice', labelKey: 'chat.recipeGen.tipMasa.any' },
  { value: 'Micul dejun', labelKey: 'chat.recipeGen.tipMasa.breakfast' },
  { value: 'Prânz', labelKey: 'chat.recipeGen.tipMasa.lunch' },
  { value: 'Cină', labelKey: 'chat.recipeGen.tipMasa.dinner' },
  { value: 'Gustare', labelKey: 'chat.recipeGen.tipMasa.snack' },
];

const TIMP_PREPARARE: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'Rapid (< 15 min)', labelKey: 'chat.recipeGen.timp.rapid' },
  { value: 'Mediu (< 30 min)', labelKey: 'chat.recipeGen.timp.mediu' },
  { value: 'Fără limită', labelKey: 'chat.recipeGen.timp.nolimit' },
];

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
  const { produse } = useCamara();
  // REMED-002: traduceri OPȚIONALE pe ecranul de generare — prompt-ul trimis
  // modelului rămâne RO, doar etichetele UI se schimbă cu limba.
  const { t } = useTranslation();
  const [ingredienteSelectate, setIngredienteSelectate] = useState<string[]>(['Ouă', 'Roșii', 'Brânză / Telemea']);
  const [inputCustom, setInputCustom] = useState('');
  const [tipMasa, setTipMasa] = useState('Orice');
  const [timp, setTimp] = useState('Rapid (< 15 min)');

  const ingredienteCamara = React.useMemo(() => {
    return Array.from(new Set((produse || []).map(p => p.nume).filter(Boolean)));
  }, [produse]);

  useEffect(() => {
    if (visible && ingredienteCamara.length > 0) {
      setIngredienteSelectate(prev => Array.from(new Set([...prev, ...ingredienteCamara.slice(0, 5)])));
    }
  }, [visible, ingredienteCamara]);

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

    const prompt = `Am în casă următoarele ingrediente disponibile în cămară: ${ingredienteSelectate.join(', ')}. Te rog să îmi generezi o rețetă delicioasă și sănătoasă potrivită pentru ${tipMasa === 'Orice' ? 'orice masă a zilei' : tipMasa.toLowerCase()}, cu timp de preparare ${timp.toLowerCase()}. Țintele mele nutriționale rămase pentru astăzi sunt de aproximativ ${Math.max(caloriiRamase, 300)} kcal și ${Math.max(proteineRamase, 15)}g proteine. Include: 1) Numele rețetei, 2) Ingredientele exacte și cantități, 3) Modul de preparare pas cu pas pe scurt, 4) Valorile nutriționale estimate (Calorii, Proteine, Carbohidrați, Grăsimi).`;

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
                <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.textPrimary }]}>{t('chat.recipeGen.title')}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.textSecondary }]}>{t('chat.recipeGen.subtitle')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]}
              onPress={onClose}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.recipeGen.closeA11y')}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            
            {/* Input ingredient custom */}
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('chat.recipeGen.addIngredientsTitle')}</Text>
            <View style={[styles.inputRow, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder={t('chat.recipeGen.placeholder')}
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
            {ingredienteCamara.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.accent, marginBottom: 8 }]}>
                  {t('chat.recipeGen.pantryTitle', { count: ingredienteCamara.length })}
                </Text>
                <View style={styles.tagsGrid}>
                  {ingredienteCamara.map((ing) => {
                    const bifeat = ingredienteSelectate.includes(ing);
                    return (
                      <TouchableOpacity
                        key={`camara-${ing}`}
                        style={[styles.tag, bifeat ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                        onPress={() => toggleIngredient(ing)}
                      >
                        {bifeat ? <Check size={14} color={colors.background} strokeWidth={3} /> : <Plus size={14} color={colors.textSecondary} />}
                        <Text maxFontSizeMultiplier={1.3} style={[styles.tagText, bifeat ? { color: colors.background, fontWeight: '800' } : { color: colors.textSecondary }]}>{ing}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 8 }]}>{t('chat.recipeGen.otherIngredientsTitle')}</Text>
            <View style={styles.tagsGrid}>
              {ingredienteSelectate.filter(i => !ingredienteCamara.includes(i)).map((ing) => (
                <TouchableOpacity
                  key={ing}
                  style={[styles.tag, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => toggleIngredient(ing)}
                >
                  <Check size={14} color={colors.background} strokeWidth={3} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.tagText, { color: colors.background, fontWeight: '800' }]}>{ing}</Text>
                </TouchableOpacity>
              ))}
              {INGREDIENTE_PREDEFINITE.filter(i => !ingredienteSelectate.includes(i) && !ingredienteCamara.includes(i)).map((ing) => (
                <TouchableOpacity
                  key={ing}
                  style={[styles.tag, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => toggleIngredient(ing)}
                >
                  <Plus size={14} color={colors.textSecondary} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.tagText, { color: colors.textSecondary }]}>{ing}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selector Tip Masă */}
            <View style={styles.sectionHeaderRow}>
              <Utensils size={15} color={colors.accentSecondary} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]}>{t('chat.recipeGen.mealType')}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
              {TIPURI_MASA.map((opt) => {
                const isSel = tipMasa === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, { backgroundColor: isSel ? colors.accentSecondary : colors.surfaceBg, borderColor: isSel ? colors.accentSecondary : colors.cardBorder }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTipMasa(opt.value); }}
                  >
                    {/* REMED-013: text negru pe accentSecondary (contrast >= 4.5:1). */}
                    <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: isSel ? colors.textOnAccentSecondary : colors.textPrimary, fontWeight: isSel ? '800' : '600' }]}>{t(opt.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Selector Timp Preparare */}
            <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
              <Clock size={15} color={colors.warning} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]}>{t('chat.recipeGen.prepTime')}</Text>
            </View>
            <View style={styles.timeGrid}>
              {TIMP_PREPARARE.map((opt) => {
                const isSel = timp === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.timeCard, { backgroundColor: isSel ? colors.warning + '25' : colors.surfaceBg, borderColor: isSel ? colors.warning : colors.cardBorder }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTimp(opt.value); }}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[styles.timeText, { color: isSel ? colors.warning : colors.textSecondary, fontWeight: isSel ? '800' : '600' }]}>{t(opt.labelKey)}</Text>
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
                <Text maxFontSizeMultiplier={1.3} style={[styles.generateText, { color: colors.background }]}>
                  {t('chat.recipeGen.generate', { count: ingredienteSelectate.length })}
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
