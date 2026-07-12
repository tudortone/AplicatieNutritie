import React, { useState, useMemo, useRef, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList
} from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Plus, Trash2, Search, Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { EXERCITII, CATEGORII, Exercitiu, calculeazaCaloriiArse } from '../constants/exercitii';
import { useAntrenamente, SetExercitiu } from '../hooks/useAntrenamente';
import { useGamificare } from '../hooks/useGamificare';
import { useNotify } from '../hooks/useNotify';
import { Holographic3DAnatomyBody } from '../app/exercitiu/[id]';

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
    const notify = useNotify();
    const { adaugaProgres } = useGamificare();
    const { adaugaAntrenament, adaugaExercitiu } = useAntrenamente();

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['75%', '92%'], []);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [categorieSelectata, setCategorieSelectata] = useState<string | null>(null);
    const [exercitiiRecenteIds, setExercitiiRecenteIds] = useState<string[]>([]);
    const [greutateUser, setGreutateUser] = useState(75);
    const [loading, setLoading] = useState(false);

    // Editor state
    const [exercitiuEditor, setExercitiuEditor] = useState<Exercitiu | null>(null);
    const [seturi, setSeturi] = useState<SetExercitiu[]>([]);
    const [durataMin, setDurataMin] = useState(20);

    // Debounce search ~250ms
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedQuery(searchQuery);
      }, 250);
      return () => clearTimeout(handler);
    }, [searchQuery]);

    useImperativeHandle(ref, () => ({
      open: async () => {
        try {
          if (user?.user_metadata?.greutate) {
            setGreutateUser(Number(user.user_metadata.greutate));
          } else {
            const st = await AsyncStorage.getItem('greutate');
            if (st) setGreutateUser(Number(st));
          }
          const rec = await AsyncStorage.getItem('exercitii_recente');
          if (rec) setExercitiiRecenteIds(JSON.parse(rec));
        } catch {}

        setSearchQuery('');
        setDebouncedQuery('');
        setCategorieSelectata(null);
        setExercitiuEditor(null);

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

    const salveazaRecente = async (exId: string) => {
      try {
        const up = [exId, ...exercitiiRecenteIds.filter(i => i !== exId)].slice(0, 10);
        setExercitiiRecenteIds(up);
        await AsyncStorage.setItem('exercitii_recente', JSON.stringify(up));
      } catch {}
    };

    // Filter exercises
    const filteredExercises = useMemo(() => {
      return EXERCITII.filter(e => {
        const matchesCat = !categorieSelectata || e.categorie === categorieSelectata;
        const q = debouncedQuery.trim().toLowerCase();
        const matchesSearch = !q || e.nume.toLowerCase().includes(q) || e.grupe.some(g => g.toLowerCase().includes(q));
        return matchesCat && matchesSearch;
      });
    }, [debouncedQuery, categorieSelectata]);

    const recenteExercises = useMemo(() => {
      if (debouncedQuery || categorieSelectata) return [];
      return exercitiiRecenteIds
        .map(id => EXERCITII.find(e => e.id === id))
        .filter((e): e is Exercitiu => !!e);
    }, [exercitiiRecenteIds, debouncedQuery, categorieSelectata]);

    // Quick add 1-tap
    const handleQuickAdd = async (ex: Exercitiu) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLoading(true);

        const isCardio = ex.categorie === 'cardio';
        const dur = isCardio ? 20 : ex.seriiDefault * 3;
        const kcal = calculeazaCaloriiArse(ex.met, greutateUser, dur);
        const seturiDefault: SetExercitiu[] = Array.from({ length: ex.seriiDefault }, (_, i) => ({
          serie: i + 1,
          repetari: ex.repetariDefault,
          greutate: 0
        }));

        await adaugaExercitiu({
          exercitiuId: ex.id,
          nume: ex.nume,
          calorii: kcal,
          durataMin: dur,
          seturi: seturiDefault,
          tip: ex.categorie
        });

        await salveazaRecente(ex.id);

        try {
          await adaugaProgres('antrenamente', 1);
          await adaugaProgres('minute_miscare', dur);
          await adaugaProgres('calorii_arse', kcal);
        } catch {}

        notify.reward('Exercițiu salvat rapid!', `+50 XP • ${kcal} kcal arse`);
        onSuccess?.();
        bottomSheetRef.current?.close();
      } catch {
        notify.error('Eroare', 'Nu s-a putut salva antrenamentul.');
      } finally {
        setLoading(false);
      }
    };

    // Open sets editor
    const deschideEditor = (ex: Exercitiu) => {
      Haptics.selectionAsync();
      setExercitiuEditor(ex);
      setDurataMin(ex.categorie === 'cardio' ? 25 : ex.seriiDefault * 3);

      const sDef: SetExercitiu[] = Array.from({ length: ex.seriiDefault }, (_, i) => ({
        serie: i + 1,
        repetari: ex.repetariDefault,
        greutate: 0
      }));
      setSeturi(sDef);
    };

    const adaugaSerie = () => {
      Haptics.selectionAsync();
      const ultima = seturi[seturi.length - 1] || { serie: 1, repetari: 10, greutate: 0 };
      setSeturi([
        ...seturi,
        {
          serie: seturi.length + 1,
          repetari: ultima.repetari,
          greutate: ultima.greutate
        }
      ]);
    };

    const stergeSerie = (idx: number) => {
      Haptics.selectionAsync();
      const updated = seturi.filter((_, i) => i !== idx).map((s, i) => ({ ...s, serie: i + 1 }));
      setSeturi(updated);
    };

    const actualizeazaSerie = (idx: number, camp: 'repetari' | 'greutate', delta: number) => {
      Haptics.selectionAsync();
      setSeturi(prev => prev.map((item, i) => {
        if (i !== idx) return item;
        const val = Math.max(0, (item[camp] || 0) + delta);
        const rounded = camp === 'greutate' ? Math.round(val * 10) / 10 : Math.round(val);
        return {
          ...item,
          [camp]: rounded,
          [`${camp}Str`]: String(rounded),
        };
      }));
    };

    const setSerieValoareDirect = (idx: number, camp: 'repetari' | 'greutate', valStr: string) => {
      const cleanStr = valStr.replace(/[^0-9.]/g, '');
      const num = camp === 'greutate' ? parseFloat(cleanStr) : parseInt(cleanStr, 10);
      setSeturi(prev => prev.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          [camp]: isNaN(num) ? 0 : num,
          [`${camp}Str`]: valStr,
        };
      }));
    };

    const kcalLive = useMemo(() => {
      if (!exercitiuEditor) return 0;
      return calculeazaCaloriiArse(exercitiuEditor.met, greutateUser, durataMin);
    }, [exercitiuEditor, greutateUser, durataMin]);

    const volumTotalCalc = useMemo(() => {
      return seturi.reduce((s, x) => s + x.repetari * (x.greutate || 0), 0);
    }, [seturi]);

    const scorIntensitateEditor = useMemo(() => {
      if (!exercitiuEditor) return 20;
      const avgKg = seturi.reduce((s, x) => s + (x.greutate || 0), 0) / (seturi.length || 1);
      const avgRep = seturi.reduce((s, x) => s + x.repetari, 0) / (seturi.length || 1);
      return Math.min(100, Math.max(15, Math.round(
        (avgKg * 0.95) + (avgRep * 2.3) + (seturi.length * 6.5) + (exercitiuEditor.dificultate === 'greu' ? 18 : exercitiuEditor.dificultate === 'mediu' ? 10 : 0)
      )));
    }, [exercitiuEditor, seturi]);

    const rankInfoEditor = useMemo(() => {
      const scor = scorIntensitateEditor;
      if (scor >= 85) return { rank: 'RANK S+ • ELITE PRO 👑⚡', badgeColor: '#FACC15', stele: '⭐⭐⭐⭐⭐' };
      if (scor >= 65) return { rank: 'RANK A • ADVANCED HYPERTROPHY 🔥', badgeColor: '#00F0FF', stele: '⭐⭐⭐⭐' };
      if (scor >= 45) return { rank: 'RANK B • INTERMEDIATE STRENGTH 💪', badgeColor: '#4ADE80', stele: '⭐⭐⭐' };
      return { rank: 'RANK C • FOUNDATION & FORM 🌊', badgeColor: '#38BDF8', stele: '⭐⭐' };
    }, [scorIntensitateEditor]);

    const salveazaDinEditor = async () => {
      if (!exercitiuEditor) return;
      try {
        setLoading(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        await adaugaAntrenament({
          nume: exercitiuEditor.nume,
          tip: exercitiuEditor.categorie,
          durata_min: durataMin,
          calorii_arse: kcalLive,
          exercitii: [{
            exercitiuId: exercitiuEditor.id,
            nume: exercitiuEditor.nume,
            seturi,
            durataMin,
            kcal: kcalLive
          }],
          volum_total: volumTotalCalc
        });

        await salveazaRecente(exercitiuEditor.id);

        try {
          await adaugaProgres('antrenamente', 1);
          await adaugaProgres('minute_miscare', durataMin);
          await adaugaProgres('calorii_arse', kcalLive);
        } catch {}

        notify.reward('Antrenament salvat!', `+100 XP • ${kcalLive} kcal`);
        onSuccess?.();
        setExercitiuEditor(null);
        bottomSheetRef.current?.close();
      } catch {
        notify.error('Eroare', 'Nu s-a putut salva antrenamentul.');
      } finally {
        setLoading(false);
      }
    };

    const renderCard = ({ item }: { item: Exercitiu }) => (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
        onPress={() => deschideEditor(item)}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconBox, { backgroundColor: colors.accent + '15' }]}>
            <Dumbbell size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.exTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.nume}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.categorie.toUpperCase()}</Text>
              <Text style={[styles.metaDot, { color: colors.textSecondary }]}>•</Text>
              <Text style={[styles.metaText, { color: colors.accent }]}>~{calculeazaCaloriiArse(item.met, greutateUser, item.seriiDefault * 3)} kcal</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.quickAddBtn, { backgroundColor: colors.accent }]}
          onPress={(e) => {
            e.stopPropagation();
            handleQuickAdd(item);
          }}
          accessibilityLabel="Adaugă rapid exercițiul"
        >
          <Plus size={18} color={colors.background} strokeWidth={3} />
        </TouchableOpacity>
      </TouchableOpacity>
    );

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.background, borderRadius: 28 }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary + '40', width: 44 }}
      >
        {exercitiuEditor ? (
          // EDITOR SETURI
          <BottomSheetScrollView contentContainerStyle={styles.editorWrap}>
            <View style={styles.editorHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.editorTitle, { color: colors.textPrimary }]}>{exercitiuEditor.nume}</Text>
                <Text style={[styles.editorSub, { color: colors.accent }]}>{kcalLive} kcal • {volumTotalCalc} kg volum total</Text>
              </View>
              <TouchableOpacity onPress={() => setExercitiuEditor(null)} style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]}>
                <X size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* 3D Holographic Anatomy Body & Dynamic Mastery Rank */}
            <View style={{ marginBottom: 14 }}>
              <Holographic3DAnatomyBody
                activeGroups={exercitiuEditor.grupe || ['Corp complet']}
                intensityScore={scorIntensitateEditor}
                accentColor={colors.accent}
                secondaryColor={colors.accentSecondary}
                cardBg={colors.cardBg}
                textPrimary={colors.textPrimary}
                rankBadgeColor={rankInfoEditor.badgeColor}
                volumTotalKg={volumTotalCalc}
              />

              <View style={[styles.editorRankBox, { backgroundColor: colors.surfaceBg, borderColor: rankInfoEditor.badgeColor }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: rankInfoEditor.badgeColor }}>
                    {rankInfoEditor.rank}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>{rankInfoEditor.stele}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 8 }}>
                  <View style={{ height: '100%', width: `${scorIntensitateEditor}%`, backgroundColor: rankInfoEditor.badgeColor }} />
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  Efort: <Text style={{ fontWeight: '800', color: rankInfoEditor.badgeColor }}>{scorIntensitateEditor}/100 PTS</Text> • Volum total: <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{volumTotalCalc} kg</Text>
                </Text>
              </View>
            </View>

            {exercitiuEditor.categorie === 'cardio' ? (
              <View style={[styles.cardioBox, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                <Text style={[styles.cardioLabel, { color: colors.textSecondary }]}>Durată (minute):</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={[styles.counterBtn, { backgroundColor: colors.cardBorder }]}
                    onPress={() => setDurataMin(Math.max(5, durataMin - 5))}
                  >
                    <Text style={[styles.counterText, { color: colors.textPrimary }]}>-</Text>
                  </TouchableOpacity>
                  <BottomSheetTextInput
                    style={[styles.durataInputText, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                    value={String(durataMin)}
                    onChangeText={(txt) => {
                      const num = parseInt(txt.replace(/[^0-9]/g, ''), 10);
                      setDurataMin(isNaN(num) ? 0 : num);
                    }}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={[styles.counterBtn, { backgroundColor: colors.cardBorder }]}
                    onPress={() => setDurataMin(durataMin + 5)}
                  >
                    <Text style={[styles.counterText, { color: colors.textPrimary }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.seturiHeader}>
                  <Text style={[styles.colLabel, { width: 60, color: colors.textSecondary }]}>SERIA</Text>
                  <Text style={[styles.colLabel, { flex: 1, textAlign: 'center', color: colors.textSecondary }]}>REPETĂRI</Text>
                  <Text style={[styles.colLabel, { flex: 1, textAlign: 'center', color: colors.textSecondary }]}>GREUTATE (KG)</Text>
                  <View style={{ width: 32 }} />
                </View>

                {seturi.map((item, idx) => (
                  <View key={idx} style={[styles.serieRow, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.serieNr, { color: colors.accent }]}>#{item.serie}</Text>

                    <View style={styles.counterGroup}>
                      <TouchableOpacity onPress={() => actualizeazaSerie(idx, 'repetari', -1)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: colors.textPrimary }]}>-</Text>
                      </TouchableOpacity>
                      <BottomSheetTextInput
                        style={[styles.serieInputText, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                        value={(item as any).repetariStr !== undefined ? (item as any).repetariStr : String(item.repetari || '')}
                        onChangeText={(txt) => setSerieValoareDirect(idx, 'repetari', txt)}
                        keyboardType="numeric"
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <TouchableOpacity onPress={() => actualizeazaSerie(idx, 'repetari', 1)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: colors.textPrimary }]}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.counterGroup}>
                      <TouchableOpacity onPress={() => actualizeazaSerie(idx, 'greutate', -2.5)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: colors.textPrimary }]}>-</Text>
                      </TouchableOpacity>
                      <BottomSheetTextInput
                        style={[styles.serieInputText, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                        value={(item as any).greutateStr !== undefined ? (item as any).greutateStr : String(item.greutate || '')}
                        onChangeText={(txt) => setSerieValoareDirect(idx, 'greutate', txt)}
                        keyboardType="numeric"
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <TouchableOpacity onPress={() => actualizeazaSerie(idx, 'greutate', 2.5)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: colors.textPrimary }]}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={() => stergeSerie(idx)} style={styles.delBtn}>
                      <Trash2 size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addSerieBtn, { borderColor: colors.accent }]}
                  onPress={adaugaSerie}
                >
                  <Plus size={16} color={colors.accent} />
                  <Text style={[styles.addSerieText, { color: colors.accent }]}>+ Adaugă serie</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.saveMainBtn}
              onPress={salveazaDinEditor}
              disabled={loading}
            >
              <LinearGradient colors={colors.accentGradient} style={styles.saveGrad}>
                {loading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <>
                    <Check size={20} color={colors.background} strokeWidth={3} />
                    <Text style={[styles.saveMainText, { color: colors.background }]}>SALVEAZĂ ANTRENAMENTUL</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </BottomSheetScrollView>
        ) : (
          // CATALOG & FILTRE
          <View style={styles.catalogWrap}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Adaugă Exercițiu</Text>
              <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>Caută, filtrează sau folosește adăugare rapidă</Text>
            </View>

            {/* Căutare */}
            <View style={[styles.searchWrap, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              <Search size={18} color={colors.textSecondary} />
              <BottomSheetTextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Caută exercițiu (ex: Arnold, Biceps)..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Chips Categorie */}
            <View style={styles.chipsRow}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ id: null, nume: 'Toate' }, ...CATEGORII]}
                keyExtractor={(item) => String(item.id || 'all')}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
                renderItem={({ item }) => {
                  const active = categorieSelectata === item.id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.catChip,
                        active
                          ? { backgroundColor: colors.accent, borderColor: colors.accent }
                          : { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setCategorieSelectata(item.id as string | null);
                      }}
                    >
                      <Text style={[styles.catChipText, { color: active ? colors.background : colors.textPrimary }]}>
                        {item.nume}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
              {recenteExercises.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>EXERCIȚII RECENTE</Text>
                  {recenteExercises.map((item) => (
                    <View key={item.id}>{renderCard({ item })}</View>
                  ))}
                  <Text style={[styles.sectionHeading, { color: colors.textSecondary, marginTop: 12 }]}>TOATE EXERCIȚIILE</Text>
                </View>
              )}

              {filteredExercises.map((item) => (
                <View key={item.id}>{renderCard({ item })}</View>
              ))}
            </BottomSheetScrollView>
          </View>
        )}
      </BottomSheet>
    );
  }
);

AddWorkoutBottomSheet.displayName = 'AddWorkoutBottomSheet';

const styles = StyleSheet.create({
  catalogWrap: { flex: 1 },
  sheetHeader: { paddingHorizontal: 20, marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '800' },
  sheetSub: { fontSize: 13, marginTop: 2 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 15 },

  chipsRow: { marginBottom: 14 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  catChipText: { fontSize: 13, fontWeight: '700' },

  sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  exTitle: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontSize: 12, fontWeight: '600' },
  metaDot: { fontSize: 10 },

  quickAddBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Editor
  editorWrap: { paddingHorizontal: 20, paddingBottom: 40 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  editorTitle: { fontSize: 20, fontWeight: '800' },
  editorSub: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  seturiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 6 },
  colLabel: { fontSize: 11, fontWeight: '800' },

  serieRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 8 },
  serieNr: { width: 44, fontSize: 15, fontWeight: '800' },
  counterGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  miniBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  miniBtnText: { fontSize: 16, fontWeight: '700' },
  serieVal: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  serieInputText: { width: 54, height: 32, textAlign: 'center', fontSize: 14, fontWeight: '700', borderRadius: 8, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2 },
  durataInputText: { width: 70, height: 44, textAlign: 'center', fontSize: 18, fontWeight: '800', borderRadius: 12, borderWidth: 1 },
  delBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },

  addSerieBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', marginTop: 6, marginBottom: 20 },
  addSerieText: { fontSize: 14, fontWeight: '700' },

  cardioBox: { padding: 18, borderRadius: 18, borderWidth: 1, marginBottom: 20 },
  cardioLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  counterBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  counterText: { fontSize: 20, fontWeight: '800' },
  durataText: { fontSize: 18, fontWeight: '800' },

  saveMainBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 10 },
  editorRankBox: { borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  saveGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  saveMainText: { fontSize: 15, fontWeight: '800' }
});
