import React, { useCallback, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  ScrollView,
  Modal
} from 'react-native';
import BottomSheet, { 
  BottomSheetScrollView, 
  BottomSheetBackdrop, 
  BottomSheetTextInput 
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, X, Heart, Trash2, Scale, Search, UtensilsCrossed } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../supabase';

import { API_URL } from '../constants/config';
import { API_PREFIX } from '../lib/api';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFavorite } from '../hooks/useFavorite';
import { useGamificareActions } from '../context/GamificareContext';
import { Masa, TipMasa, AlimentDetaliat } from '../types';
import { getTipMasaDupaOra, MEAL_CATEGORIES, insereazaMasaCuPoza, actualizeazaMasaCuPoza, parseAlimente, construiesteAlimenteLaSalvare } from '../lib/mealUtils';
import { pushOfflineMeal, MasaOfflinePayload } from '../lib/offlineQueue';
import { localDayKey } from '../lib/dateUtils';
import { foodPresets, categories, FoodPreset } from '../constants/foodPresets';
import { ProductSearch } from './food/ProductSearch';

export interface AddMealBottomSheetRef {
  open: (masaToEdit?: Masa | null, defaultCategory?: TipMasa, imagineUrl?: string) => void;
  openWithItem: (item: {
    nume: string;
    calorii: number;
    proteine: number;
    carbohidrati: number;
    grasimi: number;
    gramajDefault?: number;
    imagineUrl?: string;
    /** Dacă provine din cămară, numele produsului pentru deducere automată */
    pantryProductName?: string;
  }) => void;
  close: () => void;
}

interface AddMealBottomSheetProps {
  onSuccess?: () => void;
  // S10 (U-09): apelat DUPĂ ce insertul a reușit, cu rândul creat (id real).
  // Permite jurnalului să facă o adăugare optimistă instant + reconciliere,
  // fără un refetch prelungit în așteptare.
  onMasaCreata?: (masa: Masa) => void;
  /** Callback apelat după salvarea unei mese provenite din cămară */
  onPantryUsed?: (productName: string) => void;
}

interface BaseNutrition {
  defaultGrame: number;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
}

export const AddMealBottomSheet = forwardRef<AddMealBottomSheetRef, AddMealBottomSheetProps>(
  ({ onSuccess, onMasaCreata, onPantryUsed }, ref) => {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { favorite, addFavorite, removeFavorite, isFavorite } = useFavorite();
    const { adaugaProgres } = useGamificareActions();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const scrollViewRef = useRef<any>(null);
    const [formSectionY, setFormSectionY] = useState<number>(0);
    const [gramajSectionY, setGramajSectionY] = useState<number>(0);
    const [highlightGramaj, setHighlightGramaj] = useState(false);
    const pantryProductNameRef = useRef<string | undefined>(undefined);
    // BUG-041: guard sincron anti dublu-tap (ref, nu stare — răspunde în același
    // tick), ca două atingeri rapide pe „Adaugă Masă" să nu creeze două insert-uri.
    const savingRef = useRef(false);

    const snapPoints = useMemo(() => ['75%', '90%'], []);

    const [editingMasaId, setEditingMasaId] = useState<string | null>(null);
    const [tipMasa, setTipMasa] = useState<TipMasa>(() => getTipMasaDupaOra());
    const [nume, setNume] = useState('');
    const [grame, setGrame] = useState('');
    const [calorii, setCalorii] = useState('');
    const [proteine, setProteine] = useState('');
    const [carbohidrati, setCarbohidrati] = useState('');
    const [grasimi, setGrasimi] = useState('');
    const [fibre, setFibre] = useState('');
    const [imagineUrl, setImagineUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // BUG-002: descompunerea originala a mesei editate, pastrata la save cand
    // utilizatorul modifica doar numele/macro-urile (nu redefineste alimentul).
    const alimenteOriginaleRef = useRef<AlimentDetaliat[] | null>(null);

    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiEstimating, setAiEstimating] = useState(false);
    const [productSearchModalVisible, setProductSearchModalVisible] = useState(false);
    const [baseNutrition, setBaseNutrition] = useState<BaseNutrition | null>(null);
    const [selectedPreset, setSelectedPreset] = useState<FoodPreset | null>(null);

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

    // BUG-025: sugestiile după nume se filtrează o singură dată pe render (useMemo
    // pe `nume`), nu de 3 ori la fiecare keystroke peste 150+ presets. Rezultatul
    // e folosit și pentru numărul afișat în antet și pentru lista de 10.
    const presetsNume = useMemo(() => {
      const q = nume.trim().toLowerCase();
      return foodPresets.filter((p) => p.nume.toLowerCase().includes(q));
    }, [nume]);

    const scrollToGramajSection = useCallback(() => {
      setHighlightGramaj(true);
      setTimeout(() => setHighlightGramaj(false), 2000);
      setTimeout(() => {
        if (scrollViewRef.current) {
          const targetY = Math.max(0, formSectionY + gramajSectionY - 20);
          scrollViewRef.current.scrollTo({
            y: targetY,
            animated: true,
          });
        }
      }, 150);
    }, [formSectionY, gramajSectionY]);

    const handleGramajChange = useCallback((newGrameStr: string) => {
      setGrame(newGrameStr);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      const grNum = parseFloat(newGrameStr);
      if (baseNutrition && !isNaN(grNum) && grNum > 0) {
        const factor = grNum / baseNutrition.defaultGrame;
        setCalorii(String(Math.round(baseNutrition.calorii * factor)));
        setProteine(String(Math.round(baseNutrition.proteine * factor * 10) / 10));
        setCarbohidrati(String(Math.round(baseNutrition.carbohidrati * factor * 10) / 10));
        setGrasimi(String(Math.round(baseNutrition.grasimi * factor * 10) / 10));
      }
    }, [baseNutrition]);

    const applyPreset = useCallback((preset: FoodPreset) => {
      setSelectedPreset(preset);
      const defaultGr = preset.gramajDefault || preset.gramajImplicit || 100;
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

      setSearchQuery('');
      setSelectedCategory(null);
      scrollToGramajSection();
    }, [scrollToGramajSection]);

    const estimateWithAI = async (query: string) => {
      if (!query.trim()) return;
      setAiEstimating(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.nuEstiAutentificat'));
          return;
        }
        const res = await fetch(`${API_URL}${API_PREFIX}/estimeaza-mancare-text`, {
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
          setSearchQuery('');
          setSelectedCategory(null);
          scrollToGramajSection();
        } else {
          Alert.alert(t('alerts.titluri.eroareAI'), t('alerts.mesaje.aiEstimareEsueaza'));
        }
      } catch {
        Alert.alert(t('alerts.titluri.eroareConexiune'), t('alerts.mesaje.verificaConexiunea'));
      } finally {
        setAiEstimating(false);
      }
    };

    useImperativeHandle(ref, () => ({
      open: (masaToEdit?: Masa | null, defaultCategory?: TipMasa, fotoUrl?: string) => {
        if (masaToEdit) {
          setEditingMasaId(masaToEdit.id);
          setTipMasa(masaToEdit.tip_masa || defaultCategory || getTipMasaDupaOra());
          setNume(masaToEdit.nume || '');
          setCalorii(String(masaToEdit.calorii || 0));
          setProteine(String(masaToEdit.proteine || 0));
          setCarbohidrati(String(masaToEdit.carbohidrati || 0));
          setGrasimi(String(masaToEdit.grasimi || 0));
          setFibre(masaToEdit.fibre != null ? String(masaToEdit.fibre) : '');
          setImagineUrl(masaToEdit.imagine_url || fotoUrl || null);
          setGrame('');
          setBaseNutrition(null);
          const alimenteOrig = parseAlimente(masaToEdit);
          alimenteOriginaleRef.current = alimenteOrig.length > 0 ? alimenteOrig : null;
        } else {
          alimenteOriginaleRef.current = null;
          setEditingMasaId(null);
          setTipMasa(defaultCategory || getTipMasaDupaOra());
          setNume('');
          setGrame('');
          setCalorii('');
          setProteine('');
          setCarbohidrati('');
          setGrasimi('');
          setFibre('');
          setImagineUrl(fotoUrl || null);
          setBaseNutrition(null);
        }
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
        bottomSheetRef.current?.expand();
      },
      openWithItem: (item) => {
        const defaultGr = item.gramajDefault || 100;
        alimenteOriginaleRef.current = null;
        setEditingMasaId(null);
        setNume(item.nume);
        setGrame(String(defaultGr));
        setCalorii(String(item.calorii));
        setProteine(String(item.proteine));
        setCarbohidrati(String(item.carbohidrati));
        setGrasimi(String(item.grasimi));
        setImagineUrl(item.imagineUrl || null);
        pantryProductNameRef.current = item.pantryProductName;

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

    // Helper: parse macro with 1 decimal precision
    const parseMacro = (val: string) => Math.round((parseFloat(val) || 0) * 10) / 10;

    const handleSave = async () => {
      if (!isFormValid) {
        Alert.alert(t('alerts.titluri.formularInvalid'), t('alerts.mesaje.formularInvalidDetalii'));
        return;
      }

      if (!user) {
        Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.autentificareNecesaraInregistrare'));
        return;
      }

      if (savingRef.current) return;
      savingRef.current = true;

      setLoading(true);
      try {
        const alimentePayload: AlimentDetaliat[] = [
          {
            nume: nume.trim(),
            grame: parseFloat(grame) || 0,
            calorii: calNumber,
            proteine: parseMacro(proteine),
            carbohidrati: parseMacro(carbohidrati),
            grasimi: parseMacro(grasimi),
            fibre: parseMacro(fibre)
          }
        ];

        // BUG-002: pastram descompunerea originala a mesei editate cand nu se
        // redefineste alimentul (gramaj gol), ca editarea numelui/macro sa nu
        // transforme o masa cu 5 ingrediente intr-un array de un element.
        const alimenteFinal = construiesteAlimenteLaSalvare({
          original: editingMasaId ? alimenteOriginaleRef.current : null,
          aRedefinitAlimentul: grame.trim() !== '',
          alimentNou: alimentePayload[0],
        });

        const payload: any = {
          user_id: user.id,
          nume: nume.trim(),
          calorii: calNumber,
          proteine: parseMacro(proteine),
          carbohidrati: parseMacro(carbohidrati),
          grasimi: parseMacro(grasimi),
          fibre: parseMacro(fibre),
          tip_masa: tipMasa,
          imagine_url: imagineUrl || null,
          alimente: alimenteFinal,
        };

        let err = null;
        let masaCreata: Masa | null = null;
        // BUG-043: pe „conectat dar fără internet efectiv" (captive portal / DNS
        // blackhole), call-ul Supabase rămâne blocat fără timeout — masa nu era nici
        // salvată, nici pusă în coada offline. Aici convertim ORICE rută de eșec
        // (reject aruncat, {error} rezolvat SAU hang via salvareMasaCuTimeout) în
        // `err`, ca branch-ul offline de mai jos să rețină masa în coadă, exact ca
        // scanul din camera.tsx.
        try {
          if (editingMasaId) {
            const { error } = await salvareMasaCuTimeout(
              actualizeazaMasaCuPoza(supabase, editingMasaId, payload),
              9000,
            );
            err = error;
          } else {
            const { data, error } = await salvareMasaCuTimeout(
              insereazaMasaCuPoza(supabase, payload),
              9000,
            );
            err = error;
            if (!error && data && data[0]) masaCreata = data[0] as Masa;
          }
        } catch (e: any) {
          // Respingere (timeout-ul nostru, db.timeout sau eroare de rețea) = `err`,
          // ca masa să ajungă în coada offline (insert) / alert de eroare (edit).
          err = e;
        }

        if (err) {
          if (editingMasaId) {
            // Eroare la EDITARE: coada offline e doar de insert, asa ca raportam
            // eroarea ca inainte — nu putem pune o actualizare in coada.
            Alert.alert(t('alerts.titluri.eroareSalvare'), t('alerts.mesaje.eroareSalvareDinamica', { eroare: err.message }));
          } else {
            // BUG-009: salvare manuala offline -> coada FIFO, exact ca scanul AI.
            // Fara asta, masa manuala se pierdea cu un alert generic, in timp ce
            // scanul era pastrat. Eroarea de retea nu mai inseamna pierdere.
            try {
              const payloadOffline: MasaOfflinePayload = {
                id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                user_id: user.id,
                nume: payload.nume,
                calorii: payload.calorii,
                proteine: payload.proteine,
                grasimi: payload.grasimi,
                carbohidrati: payload.carbohidrati,
                fibre: payload.fibre,
                tip_masa: payload.tip_masa,
                alimente: payload.alimente,
                imagine_url: payload.imagine_url ?? null,
                data: localDayKey(new Date()),
                created_at: new Date().toISOString(),
              };
              await pushOfflineMeal(payloadOffline);
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch {}
              bottomSheetRef.current?.close();
              onSuccess?.();
              Alert.alert('Salvat offline', 'Masa a fost salvată local în coada offline și va fi sincronizată automat la reconectarea la rețea.');
            } catch {
              Alert.alert(t('alerts.titluri.eroareSalvare'), t('alerts.mesaje.eroareSalvareDinamica', { eroare: err.message }));
            }
          }
        } else {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          adaugaProgres('proteine', payload.proteine);
          bottomSheetRef.current?.close();
          // S10: informează jurnalul despre rândul creat (DOAR la insert, nu la edit)
          if (masaCreata) onMasaCreata?.(masaCreata);
          onSuccess?.();
          // Deducere automată din cămară
          if (pantryProductNameRef.current && onPantryUsed) {
            onPantryUsed(pantryProductNameRef.current);
            pantryProductNameRef.current = undefined;
          }
        }
      } catch {
        Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.problemaNeasteptataSalvare'));
      } finally {
        savingRef.current = false;
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
        {/* BUG-042: primul tap în timp ce tastatura e deschisă nu mai „înghite" apăsarea
            (dismiss keyboard) — butonul Adaugă/Salvează se declanșează direct. */}
        <BottomSheetScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {editingMasaId ? 'Editează Masa' : 'Adaugă Masă Nouă'}
            </Text>
            <TouchableOpacity onPress={() => bottomSheetRef.current?.close()} style={[styles.closeBtn, { backgroundColor: colors.surfaceBg }]} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Închide">
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Favorite Foods Section */}
          {favorite.length > 0 && !editingMasaId && (
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Heart size={14} color={colors.textSecondary} />
                <Text style={[styles.favHeaderTitle, { color: colors.textSecondary, marginBottom: 0 }]}>ALIMENTE FAVORITE RAPIDE</Text>
              </View>
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
                        setSearchQuery('');
                        setSelectedCategory(null);
                        try {
                          Haptics.selectionAsync();
                        } catch {}
                        scrollToGramajSection();
                      }}
                      activeOpacity={0.8}
                      style={{ flex: 1 }}
                    >
                      <Text style={[styles.favChipTitle, { color: colors.textPrimary }]}>{fav.nume}</Text>
                      <Text style={[styles.favChipSub, { color: colors.accent }]}>
                        {fav.calorii} kcal • {fav.proteine}g P
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeFavorite(fav.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.favChipDelete}
                      accessibilityRole="button"
                      accessibilityLabel={`Elimină ${fav.nume} din favorite`}
                    >
                      <Trash2 size={13} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Preset Foods Section */}
          {!editingMasaId && (
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <UtensilsCrossed size={14} color={colors.textSecondary} />
                <Text style={[styles.favHeaderTitle, { color: colors.textSecondary, marginBottom: 0 }]}>
                  ALEGE DIN PRESETURI RAPIDE
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: colors.accent + '18',
                  borderWidth: 1,
                  borderColor: colors.accent + '55',
                  marginBottom: 10,
                  gap: 8,
                }}
                onPress={() => setProductSearchModalVisible(true)}
              >
                <Search size={16} color={colors.accent} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>
                  Caută Produs, Brand sau Introducere Complet Manuală
                </Text>
              </TouchableOpacity>

              {/* Search */}
              <BottomSheetTextInput
                style={[styles.input, { marginBottom: 12, color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                accessibilityLabel="Caută aliment"
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

          <View style={styles.formSection} onLayout={(e) => setFormSectionY(e.nativeEvent.layout.y)}>
            {/* Meal Category Selector */}
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>🍽️ Categoria Mesei *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEAL_CATEGORIES.map((cat) => {
                  const isSelected = tipMasa === cat.id;
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
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setTipMasa(cat.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
                      <Text style={[
                        styles.categoryText,
                        { color: isSelected ? '#000000' : colors.textPrimary, fontWeight: isSelected ? '800' : '600' }
                      ]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

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
              accessibilityLabel="Nume aliment / preparat"
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
                  💡 Sugestii automate găsite ({presetsNume.length}):
                </Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                  {presetsNume
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
                  {presetsNume.length === 0 && (
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

              {/* Porții și unități aproximative pentru fructe / preset-uri */}
              {selectedPreset?.unitati && selectedPreset.unitati.length > 0 && (
                <View style={{ marginTop: 10, marginBottom: 4 }}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 6, fontSize: 13 }]}>
                    Alege cantitatea (porții rapide):
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {selectedPreset.unitati.map((unit) => {
                      const isActive = grame === String(unit.grame);
                      return (
                        <TouchableOpacity
                          key={unit.label}
                          style={[
                            styles.gramChip,
                            {
                              backgroundColor: isActive ? colors.accent : colors.surfaceBg,
                              borderColor: isActive ? colors.accent : colors.cardBorder,
                              paddingHorizontal: 14,
                            },
                          ]}
                          onPress={() => handleGramajChange(String(unit.grame))}
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
                            {unit.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

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

            <View style={[styles.row, { marginTop: 12 }]}>
              <View style={styles.halfWidth}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Fibre (g) (opțional)</Text>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                  placeholder="Ex: 5"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={fibre}
                  onChangeText={setFibre}
                  selectionColor={colors.accent}
                />
              </View>
              <View style={styles.halfWidth} />
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

        <Modal
          visible={productSearchModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setProductSearchModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
            <ProductSearch
              onSelectProductWithGrams={(prod, gr) => {
                const al = prod;
                setNume(al.brand ? `${al.name} (${al.brand})` : al.name);
                const factor = gr / 100;
                setCalorii(String(Math.round(al.kcalPer100g * factor)));
                setProteine(String(Math.round(al.proteinPer100g * factor * 10) / 10));
                setCarbohidrati(String(Math.round(al.carbsPer100g * factor * 10) / 10));
                setGrasimi(String(Math.round(al.fatPer100g * factor * 10) / 10));
                // Product path: macro-urile vin din produs (per 100g); nu mai
                // recalcula din baseNutrition expirat (preset/AI) si il curatam
                // ca o editare ulterioara a gramajului sa nu rescrie valorile.
                setGrame(String(gr));
                setBaseNutrition(null);
                setProductSearchModalVisible(false);
              }}
              onClose={() => setProductSearchModalVisible(false)}
            />
          </View>
        </Modal>
      </BottomSheet>
    );
  }
);

/**
 * BUG-043: race cu timeout pentru call-urile Supabase din handleSave. Dacă
 * promisiunea nu se rezolvă în `ms` (hang pe captive portal / DNS blackhole),
 * respingem cu un Error. Promisiunea care „pierde" cursa rămâne handled de
 * Promise.race, deci o respingere ulterioară a ei (ex: db.timeout) nu devine
 * unhandled rejection. `finally` curăță timer-ul ori de câte ori cursa se
 * stinge (câștigă una dintre părți).
 */
function salvareMasaCuTimeout<T>(promisiune: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const race = Promise.race([
    promisiune,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Salvarea a durat prea mult (fără conexiune)')),
        ms,
      );
    }),
  ]);
  // Curățăm timer-ul DOAR când cursa s-a stins (a câștigat / respins o parte),
  // nu înainte de construire — altfel timeout-ul era șters imediat și guard-ul
  // de hang rămânea mort (doar db.timeout din supabase.ts acoperea cazul).
  return race.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 160,
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
  favChipDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 6,
    borderRadius: 8,
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
  inputLabel: {
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
