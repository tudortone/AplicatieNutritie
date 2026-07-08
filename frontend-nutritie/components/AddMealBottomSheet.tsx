import React, { useCallback, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  ScrollView
} from 'react-native';
import BottomSheet, { 
  BottomSheetScrollView, 
  BottomSheetBackdrop, 
  BottomSheetTextInput 
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, X, Heart, Trash2, Scale } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from '../constants/config';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { useFavorite } from '../hooks/useFavorite';
import { Masa } from '../types';
import { foodPresets, categories, FoodPreset } from '../constants/foodPresets';

export interface AddMealBottomSheetRef {
  open: (masaToEdit?: Masa) => void;
  openWithItem: (item: {
    nume: string;
    calorii: number;
    proteine: number;
    carbohidrati: number;
    grasimi: number;
    gramajDefault?: number;
  }) => void;
  close: () => void;
}

interface AddMealBottomSheetProps {
  onSuccess?: () => void;
}

interface BaseNutrition {
  defaultGrame: number;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
}

export const AddMealBottomSheet = forwardRef<AddMealBottomSheetRef, AddMealBottomSheetProps>(
  ({ onSuccess }, ref) => {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { favorite, addFavorite, removeFavorite, isFavorite } = useFavorite();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const scrollViewRef = useRef<any>(null);
    const [gramajSectionY, setGramajSectionY] = useState<number>(0);
    const [highlightGramaj, setHighlightGramaj] = useState(false);

    const snapPoints = useMemo(() => ['75%', '90%'], []);

    const [editingMasaId, setEditingMasaId] = useState<string | null>(null);
    const [nume, setNume] = useState('');
    const [grame, setGrame] = useState('');
    const [calorii, setCalorii] = useState('');
    const [proteine, setProteine] = useState('');
    const [carbohidrati, setCarbohidrati] = useState('');
    const [grasimi, setGrasimi] = useState('');
    const [loading, setLoading] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiEstimating, setAiEstimating] = useState(false);
    const [baseNutrition, setBaseNutrition] = useState<BaseNutrition | null>(null);

    const filteredPresets = useMemo(() => {
      if (searchQuery.trim() === '' && !selectedCategory) {
        return [];
      }
      return foodPresets.filter(p => {
        if (searchQuery.trim() !== '') {
          return p.nume.toLowerCase().includes(searchQuery.trim().toLowerCase());
        }
        return p.categorie === selectedCategory;
      });
    }, [selectedCategory, searchQuery]);

    const scrollToGramajSection = useCallback(() => {
      setHighlightGramaj(true);
      setTimeout(() => setHighlightGramaj(false), 1600);
      if (scrollViewRef.current && gramajSectionY > 0) {
        scrollViewRef.current.scrollTo({
          y: Math.max(0, gramajSectionY - 20),
          animated: true,
        });
      }
    }, [gramajSectionY]);

    const handleGramajChange = useCallback((newGrameStr: string) => {
      setGrame(newGrameStr);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      const grNum = parseFloat(newGrameStr);
      if (baseNutrition && !isNaN(grNum) && grNum > 0) {
        const factor = grNum / baseNutrition.defaultGrame;
        setCalorii(String(Math.round(baseNutrition.calorii * factor)));
        setProteine(String(Math.round(baseNutrition.proteine * factor)));
        setCarbohidrati(String(Math.round(baseNutrition.carbohidrati * factor)));
        setGrasimi(String(Math.round(baseNutrition.grasimi * factor)));
      }
    }, [baseNutrition]);

    const applyPreset = useCallback((preset: FoodPreset) => {
      const defaultGr = preset.gramajDefault || 100;
      setNume(preset.nume);
      setGrame(String(defaultGr));
      setCalorii(String(preset.calorii));
      setProteine(String(preset.proteine));
      setCarbohidrati(String(preset.carbohidrati));
      setGrasimi(String(preset.grasimi));

      setBaseNutrition({
        defaultGrame: defaultGr,
        calorii: preset.calorii,
        proteine: preset.proteine,
        carbohidrati: preset.carbohidrati,
        grasimi: preset.grasimi,
      });

      try {
        Haptics.selectionAsync();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      scrollToGramajSection();
    }, [scrollToGramajSection]);

    const estimateWithAI = async (query: string) => {
      if (!query.trim()) return;
      setAiEstimating(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/estimeaza-mancare-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ text: query.trim() })
        });
        if (res.ok) {
          const data = await res.json();
          const defaultGr = data.gramajDefault || 100;
          const cal = data.calorii || 0;
          const p = data.proteine || 0;
          const cb = data.carbohidrati || 0;
          const gr = data.grasimi || 0;

          setNume(data.nume || query.trim());
          setGrame(String(defaultGr));
          setCalorii(String(cal));
          setProteine(String(p));
          setCarbohidrati(String(cb));
          setGrasimi(String(gr));

          setBaseNutrition({
            defaultGrame: defaultGr,
            calorii: cal,
            proteine: p,
            carbohidrati: cb,
            grasimi: gr,
          });

          try { 
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
          } catch {}
          scrollToGramajSection();
        } else {
          Alert.alert("Eroare AI", "Nu am putut estima valorile. Încearcă să le introduci manual.");
        }
      } catch {
        Alert.alert("Eroare conexiune", "Verifică conexiunea la internet.");
      } finally {
        setAiEstimating(false);
      }
    };

    useImperativeHandle(ref, () => ({
      open: (masaToEdit?: Masa) => {
        if (masaToEdit) {
          setEditingMasaId(masaToEdit.id);
          setNume(masaToEdit.nume || '');
          setCalorii(String(masaToEdit.calorii || 0));
          setProteine(String(masaToEdit.proteine || 0));
          setCarbohidrati(String(masaToEdit.carbohidrati || 0));
          setGrasimi(String(masaToEdit.grasimi || 0));
          setGrame('');
          setBaseNutrition(null);
        } else {
          setEditingMasaId(null);
          setNume('');
          setGrame('');
          setCalorii('');
          setProteine('');
          setCarbohidrati('');
          setGrasimi('');
          setBaseNutrition(null);
        }
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
        bottomSheetRef.current?.expand();
      },
      openWithItem: (item) => {
        const defaultGr = item.gramajDefault || 100;
        setEditingMasaId(null);
        setNume(item.nume);
        setGrame(String(defaultGr));
        setCalorii(String(item.calorii));
        setProteine(String(item.proteine));
        setCarbohidrati(String(item.carbohidrati));
        setGrasimi(String(item.grasimi));

        setBaseNutrition({
          defaultGrame: defaultGr,
          calorii: item.calorii,
          proteine: item.proteine,
          carbohidrati: item.carbohidrati,
          grasimi: item.grasimi,
        });

        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}

        bottomSheetRef.current?.expand();
        setTimeout(() => {
          scrollToGramajSection();
        }, 350);
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

    const isNumeValid = nume.trim().length >= 2;
    const calNumber = parseInt(calorii, 10);
    const isCaloriiValid = !isNaN(calNumber) && calNumber > 0;
    const isFormValid = isNumeValid && isCaloriiValid;

    const handleSave = async () => {
      if (!isFormValid) {
        Alert.alert("Formular invalid", "Verificați ca numele alimentului să aibă cel puțin 2 caractere și caloriile să fie un număr valid mai mare ca 0.");
        return;
      }

      if (!user) {
        Alert.alert("Eroare", "Trebuie să te autentifici pentru a înregistra mese.");
        return;
      }

      setLoading(true);
      try {
        const numeFinal = grame.trim() && !editingMasaId ? `${nume.trim()} (${grame.trim()}g)` : nume.trim();
        const payload = {
          user_id: user.id,
          nume: numeFinal,
          calorii: calNumber,
          proteine: parseInt(proteine, 10) || 0,
          carbohidrati: parseInt(carbohidrati, 10) || 0,
          grasimi: parseInt(grasimi, 10) || 0,
        };

        let err = null;
        if (editingMasaId) {
          const { error } = await supabase.from('mese').update(payload).eq('id', editingMasaId);
          err = error;
        } else {
          const { error } = await supabase.from('mese').insert(payload);
          err = error;
        }

        if (err) {
          Alert.alert("Eroare salvare", err.message);
        } else {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          bottomSheetRef.current?.close();
          onSuccess?.();
        }
      } catch {
        Alert.alert("Eroare", "A apărut o problemă neașteptată la salvare.");
      } finally {
        setLoading(false);
      }
    };

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: colors.background,
          borderColor: colors.cardBorder,
          borderWidth: 1,
        }}
        handleIndicatorStyle={{
          backgroundColor: colors.textTertiary,
          width: 50,
        }}
      >
        <BottomSheetScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {editingMasaId ? 'Editează Masa' : 'Adaugă Masă Nouă'}
            </Text>
            <TouchableOpacity onPress={() => bottomSheetRef.current?.close()} style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Favorite Foods Section */}
          {favorite.length > 0 && !editingMasaId && (
            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.favHeaderTitle, { color: colors.textSecondary }]}>❤️ ALIMENTE FAVORITE RAPIDE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                {favorite.map((fav) => (
                  <TouchableOpacity
                    key={fav.id}
                    style={[styles.favChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                    onPress={() => {
                      setNume(fav.nume);
                      setCalorii(String(fav.calorii));
                      setProteine(String(fav.proteine));
                      setCarbohidrati(String(fav.carbohidrati));
                      setGrasimi(String(fav.grasimi));
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.favChipTitle, { color: colors.textPrimary }]}>{fav.nume}</Text>
                      <TouchableOpacity onPress={() => removeFavorite(fav.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Trash2 size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.favChipSub, { color: colors.accent }]}>
                      {fav.calorii} kcal • {fav.proteine}g P
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Preset Foods Section */}
          {!editingMasaId && (
            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.favHeaderTitle, { color: colors.textSecondary }]}>
                🍽️ ALEGE DIN PRESETURI RAPIDE
              </Text>

              {/* Search */}
              <BottomSheetTextInput
                style={[styles.input, { marginBottom: 12, color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                placeholder="Caută aliment..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                selectionColor={colors.accent}
              />

              {/* Category buttons */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
                {categories.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        { 
                          backgroundColor: isSelected ? colors.accent : colors.surfaceBg,
                          borderColor: isSelected ? colors.accent : colors.cardBorder,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6
                        }
                      ]}
                      onPress={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
                      <Text style={[
                        styles.categoryText,
                        { color: isSelected ? '#000000' : colors.textPrimary, fontWeight: isSelected ? '800' : '600' }
                      ]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedCategory && !searchQuery && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                    Afișare opțiuni pentru {categories.find(c => c.id === selectedCategory)?.name} {categories.find(c => c.id === selectedCategory)?.icon}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>✕ Închide</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!selectedCategory && !searchQuery && (
                <View style={{ paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceBg, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 }}>
                    👆 Apasă pe o categorie de mai sus sau caută în bară pentru a explora cele peste 150 de alimente și preparate.
                  </Text>
                </View>
              )}

              {searchQuery.trim() !== '' && (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.accent,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    marginBottom: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row'
                  }}
                  onPress={() => estimateWithAI(searchQuery)}
                  disabled={aiEstimating}
                  activeOpacity={0.8}
                >
                  {aiEstimating ? (
                    <ActivityIndicator color="#000000" size="small" />
                  ) : (
                    <Text style={{ color: '#000000', fontWeight: 'bold', fontSize: 14 }}>
                      🤖 Calculează instant macros cu AI pentru „{searchQuery}”
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Presets grid */}
              <View style={styles.presetsGrid}>
                {filteredPresets.map((preset, index) => (
                  <TouchableOpacity
                    key={`${preset.id}-${index}`}
                    style={[styles.presetCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                    onPress={() => applyPreset(preset)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>{preset.icon}</Text>
                    <Text style={[styles.presetName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {preset.nume}
                    </Text>
                    <Text style={[styles.presetCalories, { color: colors.accent }]}>
                      {preset.calorii} kcal
                    </Text>
                    <Text style={[styles.presetMacros, { color: colors.textSecondary }]}>
                      P:{preset.proteine}g C:{preset.carbohidrati}g G:{preset.grasimi}g
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.formSection}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Nume aliment / preparat *</Text>
            <BottomSheetTextInput
              style={[
                styles.input, 
                { 
                  color: colors.textPrimary, 
                  borderColor: nume && !isNumeValid ? colors.danger : colors.cardBorder, 
                  backgroundColor: colors.surfaceBg 
                }
              ]}
              placeholder="Ex: Piept de pui la grătar cu orez"
              placeholderTextColor={colors.textTertiary}
              value={nume}
              onChangeText={setNume}
              selectionColor={colors.accent}
            />
            {nume.length > 0 && !isNumeValid && (
              <Text style={[styles.errorText, { color: colors.danger }]}>Numele trebuie să aibă cel puțin 2 caractere</Text>
            )}

            {!editingMasaId && nume.trim().length >= 2 && (
              <View style={{ marginTop: 8, marginBottom: 12, backgroundColor: colors.surfaceBg, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden', maxHeight: 220 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, textTransform: 'uppercase' }}>
                  💡 Sugestii automate găsite ({foodPresets.filter(p => p.nume.toLowerCase().includes(nume.trim().toLowerCase())).length}):
                </Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                  {foodPresets
                    .filter(p => p.nume.toLowerCase().includes(nume.trim().toLowerCase()))
                    .slice(0, 10)
                    .map((preset, index) => (
                      <TouchableOpacity
                        key={`${preset.id}-sug-${index}`}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 }}
                        onPress={() => applyPreset(preset)}
                      >
                        <Text style={{ fontSize: 20 }}>{preset.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{preset.nume}</Text>
                          <Text style={{ color: colors.accent, fontSize: 12, marginTop: 2 }}>{preset.calorii} kcal • {preset.proteine}g P • {preset.carbohidrati}g C • {preset.grasimi}g G</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  {foodPresets.filter(p => p.nume.toLowerCase().includes(nume.trim().toLowerCase())).length === 0 && (
                    <View style={{ padding: 14, alignItems: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                        Nu am găsit „{nume}” în lista de bază. Calculează valorile cu AI:
                      </Text>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        onPress={() => estimateWithAI(nume)}
                        disabled={aiEstimating}
                      >
                        {aiEstimating ? <ActivityIndicator color="#000" size="small" /> : <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>⚡ Calculează Valori Cu NutriAI</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Secțiunea de Gramaj (P0.2) */}
            <View
              onLayout={(e) => {
                const { y } = e.nativeEvent.layout;
                setGramajSectionY(y);
              }}
              style={[
                styles.gramajSectionContainer,
                highlightGramaj && {
                  borderColor: colors.accent,
                  backgroundColor: colors.accent + '1A',
                },
              ]}
            >
              <View style={styles.gramajHeaderRow}>
                <Scale size={16} color={colors.accent} />
                <Text style={[styles.label, { color: colors.textSecondary, flex: 1, marginBottom: 0 }]}>
                  Gramaj / Cantitate porție (grame)
                </Text>
                {baseNutrition && (
                  <Text style={[styles.liveSyncBadge, { color: colors.accent }]}>
                    ⚡ Calcul live
                  </Text>
                )}
              </View>

              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: colors.textPrimary,
                    borderColor: highlightGramaj ? colors.accent : colors.cardBorder,
                    backgroundColor: colors.surfaceBg,
                  },
                ]}
                placeholder="Ex: 150 (g)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                value={grame}
                onChangeText={handleGramajChange}
                selectionColor={colors.accent}
              />

              {/* Butoane rapide gramaj (P0.2) */}
              <View style={styles.gramChipsRow}>
                {['50', '100', '150', '200', '250'].map((val) => {
                  const isActive = grame === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.gramChip,
                        {
                          backgroundColor: isActive ? colors.accent : colors.surfaceBg,
                          borderColor: isActive ? colors.accent : colors.cardBorder,
                        },
                      ]}
                      onPress={() => handleGramajChange(val)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.gramChipText,
                          {
                            color: isActive ? '#000000' : colors.textPrimary,
                            fontWeight: isActive ? '800' : '600',
                          },
                        ]}
                      >
                        {val}g
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {baseNutrition && (
                  <TouchableOpacity
                    style={[
                      styles.gramChip,
                      {
                        backgroundColor: grame === String(baseNutrition.defaultGrame) ? colors.accentSecondary : colors.surfaceBg,
                        borderColor: grame === String(baseNutrition.defaultGrame) ? colors.accentSecondary : colors.cardBorder,
                      },
                    ]}
                    onPress={() => handleGramajChange(String(baseNutrition.defaultGrame))}
                  >
                    <Text
                      style={[
                        styles.gramChipText,
                        {
                          color: grame === String(baseNutrition.defaultGrame) ? '#FFFFFF' : colors.accentSecondary,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      Porție ({baseNutrition.defaultGrame}g)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Calorii (kcal) *</Text>
                <BottomSheetTextInput
                  style={[
                    styles.input, 
                    { 
                      color: colors.textPrimary, 
                      borderColor: calorii && !isCaloriiValid ? colors.danger : colors.cardBorder, 
                      backgroundColor: colors.surfaceBg 
                    }
                  ]}
                  placeholder="Ex: 450"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={calorii}
                  onChangeText={setCalorii}
                  selectionColor={colors.accent}
                />
                {calorii.length > 0 && !isCaloriiValid && (
                  <Text style={[styles.errorText, { color: colors.danger }]}>Calorii nevalide</Text>
                )}
              </View>

              <View style={styles.halfWidth}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Proteine (g)</Text>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                  placeholder="Ex: 35"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={proteine}
                  onChangeText={setProteine}
                  selectionColor={colors.accent}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Carbohidrați (g)</Text>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                  placeholder="Ex: 40"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={carbohidrati}
                  onChangeText={setCarbohidrati}
                  selectionColor={colors.accent}
                />
              </View>

              <View style={styles.halfWidth}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Grăsimi (g)</Text>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                  placeholder="Ex: 12"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={grasimi}
                  onChangeText={setGrasimi}
                  selectionColor={colors.accent}
                />
              </View>
            </View>

            {/* Quick Favorites CTA */}
            {isFormValid && (
              <TouchableOpacity
                style={[
                  styles.favToggleBtn, 
                  { 
                    backgroundColor: isFavorite(nume) ? colors.danger + '20' : colors.surfaceBg,
                    borderColor: isFavorite(nume) ? colors.danger : colors.cardBorder
                  }
                ]}
                onPress={() => {
                  if (isFavorite(nume)) {
                    const favItem = favorite.find(f => f.nume.toLowerCase() === nume.toLowerCase());
                    if (favItem) removeFavorite(favItem.id);
                  } else {
                    addFavorite({
                      nume: nume.trim(),
                      calorii: calNumber,
                      proteine: parseInt(proteine, 10) || 0,
                      carbohidrati: parseInt(carbohidrati, 10) || 0,
                      grasimi: parseInt(grasimi, 10) || 0,
                    });
                  }
                }}
              >
                <Heart
                  size={18}
                  color={isFavorite(nume) ? colors.danger : colors.textSecondary}
                  fill={isFavorite(nume) ? colors.danger : 'transparent'}
                />
                <Text style={[styles.favToggleText, { color: isFavorite(nume) ? colors.danger : colors.textPrimary }]}>
                  {isFavorite(nume) ? 'Salvat la Favorite' : 'Salvează la Favorite'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                !isFormValid && styles.saveBtnDisabled
              ]}
              disabled={loading || !isFormValid}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isFormValid ? colors.accentGradient : ['#2A323D', '#1A2129']}
                style={styles.gradientBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <Check color={isFormValid ? '#000000' : '#64748B'} size={20} />
                    <Text style={[
                      styles.saveBtnText,
                      { color: isFormValid ? '#000000' : '#64748B' }
                    ]}>
                      {editingMasaId ? 'Salvează Modificările' : 'Adaugă Masă'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
  },
  favHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  favChip: {
    flexDirection: 'column',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 130,
  },
  favChipTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  favChipSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryChip: {
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  presetCard: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  presetName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  presetCalories: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  presetMacros: {
    fontSize: 11,
  },
  formSection: {
    gap: 16,
  },
  gramajSectionContainer: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gramajHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  liveSyncBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  gramChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  gramChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  gramChipText: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  favToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  favToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  gradientBtn: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

AddMealBottomSheet.displayName = 'AddMealBottomSheet';
