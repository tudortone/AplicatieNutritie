import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X, Pencil, Trash2, Dumbbell, Flame, Info, Lock, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { Masa, AlimentDetaliat, AminoaciziEsentiali } from '../types';
import { FoodDetailSheet, FoodDetailSheetRef } from './food/FoodDetailModal';
import { EditAlimentSheet, EditAlimentSheetRef } from './food/EditAlimentModal';
import { imbogatesteAliment } from '../lib/imbogatesteAliment';
import { obtinePozaMasaThumb, recalculeazaTotaluri, parseAlimente } from '../lib/mealUtils';

export interface MealDetailsSheetRef {
  open: (masa: Masa) => void;
  close: () => void;
}

interface Props {
  onEdit?: (masa: Masa) => void;
  onDelete?: (masa: Masa) => void;
  onUpdateMasa?: (updated: Masa) => Promise<void> | void;
}

// Funcție pentru estimarea / calcularea profilului de aminoacizi esențiali pe baza cantității de proteine (dacă nu au fost furnizați manual)
function getAminoProfile(proteineTotal: number, customAmino?: AminoaciziEsentiali) {
  if (customAmino && Object.keys(customAmino).length > 0) {
    return {
      leucina: Math.round(customAmino.leucina || (proteineTotal * 80)),
      izoleucina: Math.round(customAmino.izoleucina || (proteineTotal * 50)),
      valina: Math.round(customAmino.valina || (proteineTotal * 55)),
      lizina: Math.round(customAmino.lizina || (proteineTotal * 75)),
      metionina: Math.round(customAmino.metionina || (proteineTotal * 25)),
      fenilalanina: Math.round(customAmino.fenilalanina || (proteineTotal * 40)),
      treonina: Math.round(customAmino.treonina || (proteineTotal * 40)),
      triptofan: Math.round(customAmino.triptofan || (proteineTotal * 12)),
      istidina: Math.round(customAmino.istidina || (proteineTotal * 25)),
      isEstimated: !customAmino.leucina,
    };
  }

  // Estimare bio-nutrițională standard pentru profil proteic complet (mg per gram de proteine)
  return {
    leucina: Math.round(proteineTotal * 82),      // BCAA principal (~8.2% din prot)
    izoleucina: Math.round(proteineTotal * 48),   // BCAA (~4.8%)
    valina: Math.round(proteineTotal * 54),       // BCAA (~5.4%)
    lizina: Math.round(proteineTotal * 74),       // (~7.4%)
    metionina: Math.round(proteineTotal * 24),    // (~2.4%)
    fenilalanina: Math.round(proteineTotal * 42), // (~4.2%)
    treonina: Math.round(proteineTotal * 40),     // (~4.0%)
    triptofan: Math.round(proteineTotal * 13),    // (~1.3%)
    istidina: Math.round(proteineTotal * 26),     // (~2.6%)
    isEstimated: true,
  };
}

/**
 * Detaliul unei mese — BottomSheetModal Gorhom (fără flicker RN Modal), mereu
 * montat, deschis prin ref. Foile copil (detaliu aliment / corectare ingredient)
 * se deschid cu stackBehavior="push" deasupra, fără să închidă această foie.
 */
export const MealDetailsSheet = forwardRef<MealDetailsSheetRef, Props>(
  function MealDetailsSheet({ onEdit, onDelete, onUpdateMasa }, ref) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const { isPremium } = usePremium();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const detailSheetRef = useRef<FoodDetailSheetRef>(null);
    const editSheetRef = useRef<EditAlimentSheetRef>(null);
    const [masaLocal, setMasaLocal] = useState<Masa | null>(null);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    // REMED-010: vizibilitate proprie (BottomSheetModal = portal JS) pentru ca
    // butonul hardware de „înapoi" de pe Android să închidă foaia corectă din
    // stivă: mai întâi foile copil (edit / detaliu aliment), apoi aceasta.
    const [prezent, setPrezent] = useState(false);
    const snapPoints = useMemo(() => ['88%'], []);

    useImperativeHandle(ref, () => ({
      open: (masa: Masa) => {
        setMasaLocal(masa);
        setEditIdx(null);
        setPrezent(true);
        bottomSheetRef.current?.present();
      },
      close: () => {
        setPrezent(false);
        bottomSheetRef.current?.dismiss();
      },
    }));

    // REMED-010: handler BackHandler pe Android, eliminat la unmount. Închide
    // top-of-stack-ul (edit > detaliu aliment > această foie), nu tot odată.
    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (editSheetRef.current?.isPresent()) {
          editSheetRef.current.close();
          return true;
        }
        if (detailSheetRef.current?.isPresent()) {
          detailSheetRef.current.close();
          return true;
        }
        if (prezent) {
          bottomSheetRef.current?.dismiss();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [prezent]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
          pressBehavior="close"
        />
      ),
      [],
    );

    // REMED-018: thumbnail ImageKit (w-480) în loc de rezoluția full — foaia nu
    // mai re-descarcă imaginea originală la fiecare deschidere.
    const pozaUrl = masaLocal ? obtinePozaMasaThumb(masaLocal) : null;

    const alimenteParsate = masaLocal ? parseAlimente(masaLocal) : [];
    const alimenteList = alimenteParsate.length > 0
      ? alimenteParsate
      : masaLocal
        ? [{ nume: masaLocal.nume, calorii: masaLocal.calorii, proteine: masaLocal.proteine, carbohidrati: masaLocal.carbohidrati, grasimi: masaLocal.grasimi, grame: 100 }]
        : [];

  // Căutăm dacă vreun aliment are aminoacizi definiți, altfel calculăm totalul
  const customAmino = alimenteParsate.reduce((acc, al) => {
    if (al.aminoacizi) {
      return {
        leucina: (acc.leucina || 0) + (al.aminoacizi.leucina || 0),
        izoleucina: (acc.izoleucina || 0) + (al.aminoacizi.izoleucina || 0),
        valina: (acc.valina || 0) + (al.aminoacizi.valina || 0),
        lizina: (acc.lizina || 0) + (al.aminoacizi.lizina || 0),
        metionina: (acc.metionina || 0) + (al.aminoacizi.metionina || 0),
        fenilalanina: (acc.fenilalanina || 0) + (al.aminoacizi.fenilalanina || 0),
        treonina: (acc.treonina || 0) + (al.aminoacizi.treonina || 0),
        triptofan: (acc.triptofan || 0) + (al.aminoacizi.triptofan || 0),
        istidina: (acc.istidina || 0) + (al.aminoacizi.istidina || 0),
      };
    }
    return acc;
  }, {} as AminoaciziEsentiali);

    const aminoProfile = getAminoProfile(masaLocal ? masaLocal.proteine : 0, customAmino);
    const totalBcaa = aminoProfile.leucina + aminoProfile.izoleucina + aminoProfile.valina;

    // Salvează ingredientul editat: înlocuiește elementul, recalculează totalurile
    // din listă și actualizează — local (optimist) + upstream printr-onUpdateMasa.
    const salveazaAliment = (idx: number, actualizat: AlimentDetaliat): void => {
      if (!masaLocal) return;
      const sursa = parseAlimente(masaLocal);
      const alimente = sursa.length > 0
        ? sursa.map((a, i) => (i === idx ? { ...a, ...actualizat } : a))
        : [actualizat];
      const totaluri = recalculeazaTotaluri(alimente);
      const urmatoare: Masa = {
        ...masaLocal,
        alimente,
        calorii: totaluri.calorii,
        proteine: totaluri.proteine,
        carbohidrati: totaluri.carbohidrati,
        grasimi: totaluri.grasimi,
        fibre: totaluri.fibre,
      };
      setMasaLocal(urmatoare);
      setEditIdx(null);
      if (onUpdateMasa) {
        void Promise.resolve(onUpdateMasa(urmatoare)).catch(() => {});
      }
    };

    // BUG-017: ștergere ingredient (per-component) — elimină din listă, recalculează
    // totalurile din restul ingredientelor și actualizează optimist + upstream prin
    // onUpdateMasa. La ultimul ingredient, păstrăm macro-urile plane ale mesei
    // (alimente=[]), ca valorile să nu dispară cu lista de componente.
    const stergeAliment = (idx: number): void => {
      if (!masaLocal) return;
      const sursa = parseAlimente(masaLocal);
      const alimente = sursa.filter((_, i) => i !== idx);
      const totaluri = recalculeazaTotaluri(alimente);
      const urmatoare: Masa = {
        ...masaLocal,
        alimente,
        calorii: alimente.length > 0 ? totaluri.calorii : masaLocal.calorii,
        proteine: alimente.length > 0 ? totaluri.proteine : masaLocal.proteine,
        carbohidrati: alimente.length > 0 ? totaluri.carbohidrati : masaLocal.carbohidrati,
        grasimi: alimente.length > 0 ? totaluri.grasimi : masaLocal.grasimi,
        fibre: alimente.length > 0 ? totaluri.fibre : masaLocal.fibre,
      };
      setMasaLocal(urmatoare);
      if (onUpdateMasa) {
        void Promise.resolve(onUpdateMasa(urmatoare)).catch(() => {});
      }
    };

    // REMED-015: adaugă un aliment NOU la o masă existentă (via EditAlimentSheet în
    // mod „append", editIdx === -1) și propagă lista extinsă prin onUpdateMasa.
    const adaugaAliment = (al: AlimentDetaliat): void => {
      if (!masaLocal) return;
      const sursa = parseAlimente(masaLocal);
      const alimente = [...sursa, al];
      const totaluri = recalculeazaTotaluri(alimente);
      const urmatoare: Masa = {
        ...masaLocal,
        alimente,
        calorii: totaluri.calorii,
        proteine: totaluri.proteine,
        carbohidrati: totaluri.carbohidrati,
        grasimi: totaluri.grasimi,
        fibre: totaluri.fibre,
      };
      setMasaLocal(urmatoare);
      setEditIdx(null);
      if (onUpdateMasa) {
        void Promise.resolve(onUpdateMasa(urmatoare)).catch(() => {});
      }
    };

    // Detaliu aliment: deschidem imediat cu datele existente, apoi îmbogățim
    // async (tabel/cache/AI) și actualizăm foaia fără re-prezentare — niciodată
    // nu blochează ecranul (imbogatesteAliment nu aruncă, are timeout AI 10s).
    const deschideDetaliu = (al: AlimentDetaliat) => {
      detailSheetRef.current?.open(al);
      void imbogatesteAliment(al, { online: true }).then((imbogatit) => {
        detailSheetRef.current?.updateAliment(imbogatit);
      });
    };

    return (
      <>
        <BottomSheetModal
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          enablePanDownToClose
          enableDynamicSizing={false}
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, borderWidth: 1 }}
          handleIndicatorStyle={{ backgroundColor: colors.overlayStrong, width: 44 }}
          onDismiss={() => {
            setPrezent(false);
            detailSheetRef.current?.close();
            editSheetRef.current?.close();
          }}
        >
          {masaLocal ? (<>
            <TouchableOpacity
              onPress={() => bottomSheetRef.current?.dismiss()}
              style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('jurnal.closeMealDetails')}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                  {masaLocal.nume}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {masaLocal.tip_masa ? masaLocal.tip_masa.toUpperCase().replace('_', ' ') : t('jurnal.mealRecorded')} • {alimenteList.length} {alimenteList.length === 1 ? t('jurnal.foodSingular') : t('jurnal.foodPlural')}
                </Text>
              </View>
            </View>

            <BottomSheetScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Poza mesei (premium) — sus, imediat deasupra totalurilor */}
              {pozaUrl ? (
                isPremium ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                    }}
                    style={styles.photoContainer}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('jurnal.mealPhoto')}
                  >
                    <Image source={{ uri: pozaUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => router.push('/paywall' as never)}
                    activeOpacity={0.95}
                    style={styles.photoContainer}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('jurnal.unlockMealPhotos')}
                  >
                    <Image source={{ uri: pozaUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
                    <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.photoLockOverlay}>
                      <View style={styles.photoLockBadge}>
                        <Lock size={14} color="#FFFFFF" />
                        <Text style={styles.photoLockBadgeText}>{t('jurnal.mealPhotosPremium')}</Text>
                      </View>
                      <Text style={styles.photoLockCta}>{t('jurnal.unlockPremium')}</Text>
                    </View>
                  </TouchableOpacity>
                )
              ) : null}

              {/* Macro Summary Cards — exact sub poza */}
              <View style={[styles.summaryGrid, { marginTop: pozaUrl ? 16 : 0 }]}>
                <View style={[styles.macroBox, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
                  <Flame size={18} color={colors.accent} />
                  <Text style={[styles.macroVal, { color: colors.accent }]}>{masaLocal.calorii}</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>kcal</Text>
                </View>

                <View style={[styles.macroBox, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder }]}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{masaLocal.proteine}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('jurnal.macroProtein')}</Text>
                </View>

                <View style={[styles.macroBox, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder }]}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{masaLocal.carbohidrati}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('jurnal.macroCarbs')}</Text>
                </View>

                <View style={[styles.macroBox, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder }]}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{masaLocal.grasimi}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('jurnal.macroFats')}</Text>
                </View>
              </View>

              {/* Secțiune Alimente Componente */}
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                  {t('jurnal.componentsTitle', { count: alimenteList.length })}
                </Text>
                {/* REMED-015: mesele existente puteau doar edita/șterge ingrediente —
                    acum pot și ADĂUGA un aliment (mod „append" în EditAlimentSheet). */}
                {onUpdateMasa && (
                  <TouchableOpacity
                    style={[styles.addIngredientBtn, { borderColor: colors.accent + '40', backgroundColor: colors.accent + '15' }]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setEditIdx(-1);
                      editSheetRef.current?.open({
                        nume: '',
                        grame: 100,
                        calorii: 0,
                        proteine: 0,
                        carbohidrati: 0,
                        grasimi: 0,
                        fibre: 0,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('jurnal.addIngredient')}
                  >
                    <Plus size={15} color={colors.accent} />
                    <Text style={[styles.addIngredientBtnText, { color: colors.accent }]}>{t('jurnal.addIngredient')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.ingredientsSection}>
                {alimenteList.map((al, idx) => (
                  <View key={idx} style={[styles.ingredientItem, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: colors.cardBorder }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ingredientName, { color: colors.textPrimary }]}>{al.nume}</Text>
                      {al.grame ? <Text style={[styles.ingredientGram, { color: colors.textTertiary }]}>{t('jurnal.ingredientPortion', { gramaj: al.grame })}</Text> : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => { setEditIdx(idx); editSheetRef.current?.open(al); }}
                      style={styles.editBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('jurnal.correctIngredient', { nume: al.nume })}
                    >
                      <Pencil size={15} color={colors.accentSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deschideDetaliu(al)}
                      style={styles.detailBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('jurnal.ingredientDetails', { nume: al.nume })}
                    >
                      <Info size={15} color={colors.accent} />
                    </TouchableOpacity>
                    {alimenteParsate.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => stergeAliment(idx)}
                        style={[styles.deleteBtn, { backgroundColor: colors.danger + '0F' }]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('jurnal.deleteIngredient', { nume: al.nume })}
                      >
                        <Trash2 size={15} color={colors.danger} />
                      </TouchableOpacity>
                    ) : null}
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.ingredientKcal, { color: colors.accent }]}>{al.calorii} kcal</Text>
                      <Text style={[styles.ingredientMacros, { color: colors.textSecondary }]}>
                        P:{al.proteine}g • C:{al.carbohidrati}g • G:{al.grasimi}g
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Secțiune Aminoacizi Esențiali */}
              <View style={[styles.aminoSection, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: colors.cardBorder }]}>
                <View style={styles.aminoHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Dumbbell size={16} color={colors.accentTertiary} />
                    <Text style={[styles.aminoTitle, { color: colors.textPrimary }]}>
                      {t('jurnal.aminoProfile')}
                    </Text>
                  </View>
                  <View style={[styles.bcaaBadge, { backgroundColor: colors.accentTertiary + '1F', borderColor: colors.accentTertiary + '55' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.accentTertiary }}>
                      BCAA: {totalBcaa} mg
                    </Text>
                  </View>
                </View>

                <Text style={[styles.aminoSub, { color: colors.textSecondary }]}>
                  {aminoProfile.isEstimated
                    ? t('jurnal.aminoEstimated', { proteine: masaLocal.proteine })
                    : t('jurnal.aminoDetailed')}
                </Text>

                <View style={styles.aminoGrid}>
                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.accentTertiary }]}>Leucină (BCAA)</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.leucina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.accentTertiary }]}>Izoleucină (BCAA)</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.izoleucina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.accentTertiary }]}>Valină (BCAA)</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.valina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Lizină</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.lizina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Metionină</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.metionina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Treonină</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.treonina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Fenilalanină</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.fenilalanina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Istidină</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.istidina} mg</Text>
                  </View>

                  <View style={[styles.aminoCard, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.aminoName, { color: colors.textSecondary }]}>Triptofan</Text>
                    <Text style={[styles.aminoVal, { color: colors.textPrimary }]}>{aminoProfile.triptofan} mg</Text>
                  </View>
                </View>
              </View>
            </BottomSheetScrollView>

            {/* Actions Footer */}
            <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
              {onEdit && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.cardBorder }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    bottomSheetRef.current?.dismiss();
                    onEdit(masaLocal);
                  }}
                >
                  <Pencil size={16} color={colors.textPrimary} />
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>{t('jurnal.edit')}</Text>
                </TouchableOpacity>
              )}

              {onDelete && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.danger + '1F', borderColor: colors.danger + '55' }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    bottomSheetRef.current?.dismiss();
                    onDelete(masaLocal);
                  }}
                >
                  <Trash2 size={16} color={colors.danger} />
                  <Text style={[styles.actionBtnText, { color: colors.danger }]}>{t('jurnal.delete')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
                onPress={() => bottomSheetRef.current?.dismiss()}
              >
                <Text style={[styles.confirmBtnText, { color: colors.textOnAccent }]}>{t('jurnal.close')}</Text>
              </TouchableOpacity>
            </View>
          </>)
          : null}
        </BottomSheetModal>

        {/* Detaliu nutrițional complet (foie deasupra, stackBehavior='push') */}
        <FoodDetailSheet ref={detailSheetRef} />

        {/* Editare inline ingredient (corectare greșeli) */}
        <EditAlimentSheet
          ref={editSheetRef}
          onSave={(actualizat) => {
            if (editIdx == null) return;
            // REMED-015: editIdx === -1 = mod „append" (ingredient NOU), altfel edit.
            if (editIdx >= 0) {
              salveazaAliment(editIdx, actualizat);
            } else {
              adaugaAliment(actualizat);
            }
            editSheetRef.current?.close();
          }}
        />
      </>
    );
  },
);

MealDetailsSheet.displayName = 'MealDetailsSheet';

const styles = StyleSheet.create({
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 16,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  photoContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photo: {
    width: '100%',
    height: 300,
  },
  photoLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  photoLockBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  photoLockCta: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  macroVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  macroLbl: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addIngredientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  addIngredientBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  ingredientsSection: {
    gap: 8,
    marginBottom: 24,
  },
  ingredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  ingredientName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  ingredientGram: {
    fontSize: 12,
    fontWeight: '600',
  },
  ingredientKcal: {
    fontSize: 14,
    fontWeight: '800',
  },
  ingredientMacros: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  editBtn: {
    padding: 6,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  detailBtn: {
    padding: 6,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  deleteBtn: {
    padding: 6,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  aminoSection: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  aminoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  aminoTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bcaaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  aminoSub: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  aminoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aminoCard: {
    width: '31%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  aminoName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  aminoVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  confirmBtnText: {
    // REMED-005: culoarea textului se pune inline (colors.textOnAccent pe accent).
    fontSize: 15,
    fontWeight: '800',
  },
});