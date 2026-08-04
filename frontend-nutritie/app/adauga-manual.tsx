
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Platform, 
  KeyboardAvoidingView 
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { localDayKey } from '../lib/dateUtils';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Check, Heart, Trash2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { useFavorite } from '../hooks/useFavorite';
import { TipMasa, AlimentDetaliat } from '../types';
import { getTipMasaDupaOra, MEAL_CATEGORIES } from '../lib/mealUtils';
import { GramInput } from '../components/ui/GramInput';
import * as Haptics from 'expo-haptics';

export default function AdaugaManualScreen() {
  const insets = useSafeAreaInsets();
  // FIX: parseInt trunchia zecimalele (12.5 g proteine se salvau ca 12) si nu avea radix.
  // Acceptam si virgula ca separator zecimal (tastatura romaneasca).
  const numar = (v: string) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
  };

  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { favorite, addFavorite, removeFavorite, isFavorite } = useFavorite();

  const [tipMasa, setTipMasa] = useState<TipMasa>(() => getTipMasaDupaOra());
  const [nume, setNume] = useState('');
  const [grame, setGrame] = useState(0);
  const [calorii, setCalorii] = useState('');
  const [proteine, setProteine] = useState('');
  const [carbohidrati, setCarbohidrati] = useState('');
  const [grasimi, setGrasimi] = useState('');
  const [fibre, setFibre] = useState('');
  const [alimenteList, setAlimenteList] = useState<AlimentDetaliat[]>([]);
  
  const [loading, setLoading] = useState(false);
  const params = useLocalSearchParams();

  useEffect(() => {
    if (params?.alimente && typeof params.alimente === 'string') {
      try {
        const parsed = JSON.parse(params.alimente);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          const numeCompus = parsed.map((a: any) => a.nume).join(', ');
          const totalCal = parsed.reduce((s: number, a: any) => s + Math.round((a.calorii_per_100g * a.estimare_grame) / 100), 0);
          const totalProt = parsed.reduce((s: number, a: any) => s + Math.round((a.proteine_per_100g * a.estimare_grame) / 100 * 10) / 10, 0);
          const totalCarbs = parsed.reduce((s: number, a: any) => s + Math.round((a.carbohidrati_per_100g * a.estimare_grame) / 100 * 10) / 10, 0);
          const totalGras = parsed.reduce((s: number, a: any) => s + Math.round((a.grasimi_per_100g * a.estimare_grame) / 100 * 10) / 10, 0);
          const totalGrame = parsed.reduce((s: number, a: any) => s + (Number(a.estimare_grame) || 0), 0);

          setNume(numeCompus);
          setGrame(totalGrame > 0 ? Math.round(totalGrame) : 0);
          setCalorii(totalCal > 0 ? String(totalCal) : '');
          setProteine(totalProt > 0 ? String(totalProt) : '');
          setCarbohidrati(totalCarbs > 0 ? String(totalCarbs) : '');
          setGrasimi(totalGras > 0 ? String(totalGras) : '');

          const detailedItems: AlimentDetaliat[] = parsed.map((a: any, idx: number) => ({
            id: String(idx + 1),
            nume: a.nume || 'Aliment',
            grame: Number(a.estimare_grame) || 100,
            calorii: Math.round((a.calorii_per_100g * a.estimare_grame) / 100) || 0,
            proteine: Math.round((a.proteine_per_100g * a.estimare_grame) / 100 * 10) / 10 || 0,
            carbohidrati: Math.round((a.carbohidrati_per_100g * a.estimare_grame) / 100 * 10) / 10 || 0,
            grasimi: Math.round((a.grasimi_per_100g * a.estimare_grame) / 100 * 10) / 10 || 0,
            fibre: Number(a.fibre) || 0
          }));
          setAlimenteList(detailedItems);
        }
      } catch (e) {
        console.warn('Eroare parsare alimente param:', e);
      }
    }
    if (params?.tip_masa && typeof params.tip_masa === 'string') {
      if (['mic_dejun', 'pranz', 'cina', 'gustare'].includes(params.tip_masa)) {
        setTipMasa(params.tip_masa as TipMasa);
      }
    }
  }, [params?.alimente, params?.tip_masa]);

  const handleSave = async () => {
    if (!nume.trim()) {
      Alert.alert("Date incomplete", "Vă rugăm să introduceți numele alimentului sau al mesei.");
      return;
    }

    const cal = Math.round(numar(calorii));
    if (cal === 0 && !calorii) {
      Alert.alert("Calorii lipsă", "Introduceți numărul estimat de calorii pentru această masă.");
      return;
    }

    setLoading(true);
    try {
      if (!user) {
        Alert.alert("Eroare", "Trebuie să te autentifici pentru a adăuga mese.");
        return;
      }

      const numeFinal = grame > 0 ? `${nume.trim()} (${grame}g)` : nume.trim();

      const now = new Date();
      const todayStr = localDayKey(now);
      const oraStr = now.toTimeString().split(' ')[0].substring(0, 5);

      const alimentePayload: AlimentDetaliat[] = alimenteList.length > 0 ? alimenteList : [
        {
          nume: nume.trim(),
          grame: grame || 0,
          calorii: cal,
          proteine: numar(proteine),
          carbohidrati: numar(carbohidrati),
          grasimi: numar(grasimi),
          fibre: numar(fibre),
        }
      ];

      const { error: insertError } = await supabase
        .from('mese')
        .insert({
          user_id: user.id,
          nume: numeFinal,
          calorii: cal,
          proteine: numar(proteine),
          carbohidrati: numar(carbohidrati),
          grasimi: numar(grasimi),
          fibre: numar(fibre),
          // FIX: todayStr / oraStr erau calculate mai sus dar nu erau folosite niciodata.
          data: todayStr,
          ora: oraStr,
          tip_masa: tipMasa,
          alimente: alimentePayload,
        });

      if (insertError) {
        Alert.alert("Eroare salvare", insertError.message);
      } else {
        Alert.alert(
          "✅ Masă adăugată!", 
          `"${numeFinal}" a fost înregistrată cu succes în jurnalul tău.`,
          [{ text: "Super", onPress: () => router.back() }]
        );
      }
    } catch {
      Alert.alert("Eroare", "A apărut o problemă neașteptată la salvare.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surfaceBg }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Adaugă Masă Manual</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          // FIX UI: fara asta, primul tap pe "Salveaza" doar inchidea tastatura.
          keyboardShouldPersistTaps="handled"
        >
          
          {/* Favorite Foods Section */}
          {favorite.length > 0 && (
            <Animated.View entering={FadeInDown.duration(500)} style={{ marginBottom: 20 }}>
              <Text style={[styles.favHeaderTitle, { color: colors.textSecondary }]}>❤️ ALIMENTE FRECVENTE / FAVORITE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                {favorite.map((fav) => (
                  <View
                    key={fav.id}
                    style={[styles.favChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setNume(fav.nume);
                        setCalorii(String(fav.calorii));
                        setProteine(String(fav.proteine));
                        setCarbohidrati(String(fav.carbohidrati));
                        setGrasimi(String(fav.grasimi));
                      }}
                      activeOpacity={0.8}
                      style={{ flex: 1 }}
                    >
                      <Text style={[styles.favChipTitle, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{fav.nume}</Text>
                      <Text style={[styles.favChipSub, { color: colors.accent }]}>
                        {fav.calorii} kcal • {fav.proteine}g P
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeFavorite(fav.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.favChipDelete}
                    >
                      <Trash2 size={13} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Meal Category Selector Section */}
          <Animated.View entering={FadeInDown.duration(450)} style={{ marginBottom: 20 }}>
            <Text style={[styles.favHeaderTitle, { color: colors.textSecondary }]}>🍽️ SELECTEAZĂ CATEGORIA MESEI *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {MEAL_CATEGORIES.map((cat) => {
                const isSelected = tipMasa === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: isSelected ? colors.accent + '25' : colors.surfaceBg,
                        borderColor: isSelected ? colors.accent : colors.cardBorder,
                      }
                    ]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setTipMasa(cat.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
                    <Text style={[styles.catChipText, { color: isSelected ? colors.accent : colors.textPrimary, fontWeight: isSelected ? '800' : '600' }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500)} style={[styles.card, { borderColor: colors.cardBorder }]}>
            <BlurView intensity={20} tint="dark" style={styles.cardBlur}>
              <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>1. Despre ce aliment este vorba?</Text>
                
                <Text style={[styles.label, { color: colors.textSecondary }]}>Nume aliment / preparat *</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                  placeholder="Ex: Porție orez cu pui, măr, shake proteic..."
                  placeholderTextColor={colors.textTertiary}
                  value={nume}
                  onChangeText={setNume}
                  selectionColor={colors.accent}
                />

                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Gramaj estimat (opțional)</Text>
                <GramInput
                  value={grame}
                  onChange={setGrame}
                  borderColor={colors.cardBorder}
                  color={colors.textPrimary}
                />
              </LinearGradient>
            </BlurView>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={[styles.card, { borderColor: colors.cardBorder, marginTop: 20 }]}>
            <BlurView intensity={20} tint="dark" style={styles.cardBlur}>
              <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>2. Valori Nutriționale</Text>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>🔥 Calorii (kcal) *</Text>
                    <TextInput
                      style={[styles.input, { color: colors.accent, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={calorii}
                      onChangeText={setCalorii}
                      keyboardType="decimal-pad"
                      maxLength={5}
                      returnKeyType="done"
                      selectionColor={colors.accent}
                    />
                  </View>

                  <View style={styles.col}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>🥩 Proteine (g)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.accentSecondary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={proteine}
                      onChangeText={setProteine}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      returnKeyType="done"
                      selectionColor={colors.accent}
                    />
                  </View>
                </View>

                <View style={[styles.row, { marginTop: 16 }]}>
                  <View style={styles.col}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>🌾 Carbohidrați (g)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.accentTertiary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={carbohidrati}
                      onChangeText={setCarbohidrati}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      returnKeyType="done"
                      selectionColor={colors.accent}
                    />
                  </View>

                  <View style={styles.col}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>🥑 Grăsimi (g)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.warning, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={grasimi}
                      onChangeText={setGrasimi}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      returnKeyType="done"
                      selectionColor={colors.accent}
                    />
                  </View>
                </View>

                <View style={[styles.row, { marginTop: 16 }]}>
                  <View style={styles.col}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>🌿 Fibre (g) (opțional)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={fibre}
                      onChangeText={setFibre}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      returnKeyType="done"
                      selectionColor={colors.accent}
                    />
                  </View>
                  <View style={styles.col} />
                </View>
              </LinearGradient>
            </BlurView>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={{ marginTop: 28 }}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Check size={22} color="#000" strokeWidth={3} />
                    <Text style={styles.saveBtnText}>Salvează în Jurnal</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Save to Favorites Button */}
          <Animated.View entering={FadeInUp.duration(600).delay(250)} style={{ marginTop: 12 }}>
            <TouchableOpacity 
              style={[styles.favSaveBtn, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
              onPress={() => {
                if (!nume.trim()) {
                  Alert.alert("Eroare", "Introduceți numele alimentului înainte de a-l salva ca favorit.");
                  return;
                }
                addFavorite({
                  nume: nume.trim(),
                  calorii: Math.round(numar(calorii)),
                  proteine: numar(proteine),
                  carbohidrati: numar(carbohidrati),
                  grasimi: numar(grasimi),
                });
              }}
              activeOpacity={0.8}
            >
              <Heart size={18} color="#f43f5e" fill={isFavorite(nume) ? "#f43f5e" : "transparent"} />
              <Text style={[styles.favSaveBtnText, { color: colors.textPrimary }]}>
                {isFavorite(nume) ? "Deja salvat la Favorite" : "Salvează în lista de Favorite ❤️"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.05 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.05 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { fontSize: 20, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingBottom: 80, paddingTop: 12 },

  card: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  cardBlur: { overflow: 'hidden' },
  cardGrad: { padding: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },

  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontWeight: '600' },

  row: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },

  saveBtn: { borderRadius: 20, overflow: 'hidden', shadowColor: '#00e5ff', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  saveBtnGrad: { height: 58, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  saveBtnText: { color: '#000', fontSize: 18, fontWeight: '900' },
  favHeaderTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  favChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, minWidth: 120 },
  favChipDelete: { position: 'absolute', top: 4, right: 4, padding: 6, borderRadius: 8 },
  favChipTitle: { fontSize: 14, fontWeight: '700' },
  favChipSub: { fontSize: 11, fontWeight: '800', marginTop: 3 },
  favSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 18, borderWidth: 1, gap: 8 },
  favSaveBtnText: { fontSize: 14, fontWeight: '700' },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, gap: 8 },
  catChipText: { fontSize: 14 },
});
