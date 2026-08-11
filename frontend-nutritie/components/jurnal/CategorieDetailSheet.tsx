import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { X, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Masa, TipMasa } from '../../types';
import { CategorieMasaGrupata } from '../../hooks/useMeseAzi';
import { MasaCard } from '../MasaCard';

export interface CategorieDetailSheetRef {
  open: (categorie: CategorieMasaGrupata) => void;
  close: () => void;
}

interface CategorieDetailSheetProps {
  /** Poze afișate/nu — același comutator ca jurnalul, propagat la MasaCard. */
  afisarePoze: boolean;
  onPressMasa: (masa: Masa) => void;
  onEditMasa: (masa: Masa) => void;
  onDeleteMasa: (masa: Masa) => void;
  onAddMasa: (tip: TipMasa) => void;
}

/**
 * Drill-down pe o categorie de masă (Mic Dejun / Prânz / Gustări / Cină):
 * antet cu macro-urile (incl. fibre) + lista meselor ca MasaCard (poze,
 * ingrediente, acțiuni). Bottom sheet Gorhom — fără flicker de Modal.
 */
export const CategorieDetailSheet = forwardRef<CategorieDetailSheetRef, CategorieDetailSheetProps>(
  function CategorieDetailSheet(
    { afisarePoze, onPressMasa, onEditMasa, onDeleteMasa, onAddMasa },
    ref,
  ) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [categorie, setCategorie] = useState<CategorieMasaGrupata | null>(null);
    const snapPoints = useMemo(() => ['72%'], []);
    // REMED-010 (Android BackHandler): urmărim index-ul (BottomSheetModal) ca să
    // închidem sheet-ul cu back DOAR când e deschis (>= 0).
    const [sheetIndex, setSheetIndex] = useState(-1);

    useEffect(() => {
      if (Platform.OS !== 'android' || sheetIndex < 0) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        bottomSheetRef.current?.dismiss();
        return true;
      });
      return () => sub.remove();
    }, [sheetIndex]);

    useImperativeHandle(ref, () => ({
      open: (cat: CategorieMasaGrupata) => {
        setCategorie(cat);
        bottomSheetRef.current?.present();
      },
      close: () => bottomSheetRef.current?.dismiss(),
    }));

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

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        onChange={(index) => setSheetIndex(index)}
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background, borderColor: colors.cardBorder, borderWidth: 1 }}
        handleIndicatorStyle={{ backgroundColor: colors.overlayStrong, width: 44 }}
      >
        {categorie ? (<>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => bottomSheetRef.current?.dismiss()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Închide')}
        >
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={{ fontSize: 28 }}>{categorie.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{categorie.label}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {categorie.mese.length === 1
                ? '1 masă înregistrată'
                : `${categorie.mese.length} mese înregistrate`}
            </Text>
          </View>
        </View>

        <View style={[styles.macroBar, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.accent }]}>{categorie.totalCalorii}</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>kcal</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.accentSecondary }]}>{categorie.totalProteine}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>proteine</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.accentTertiary }]}>{categorie.totalCarbohidrati}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.warning }]}>{categorie.totalGrasimi}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>grăsimi</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.success }]}>{categorie.totalFibre}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>fibre</Text>
          </View>
        </View>

        <BottomSheetScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {categorie.mese.map((m) => (
            <MasaCard
              key={m.id}
              masa={m}
              afisarePoze={afisarePoze}
              onPress={onPressMasa}
              onEdit={onEditMasa}
              onDelete={onDeleteMasa}
            />
          ))}
        </BottomSheetScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch {}
              bottomSheetRef.current?.dismiss();
              onAddMasa(categorie.id);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Adaugă masă la ${categorie.label}`}
          >
            <PlusCircle size={16} color={colors.accent} />
            <Text style={[styles.addBtnText, { color: colors.accent }]}>
              Adaugă masă la {categorie.label}
            </Text>
          </TouchableOpacity>
        </View>
        </>)
        : null}
      </BottomSheetModal>
    );
  },
);

CategorieDetailSheet.displayName = 'CategorieDetailSheet';

const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, marginTop: 4, paddingHorizontal: 20 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  macroBar: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 16, borderWidth: 1, paddingVertical: 10, marginBottom: 8 },
  macroItem: { flex: 1, alignItems: 'center', gap: 2 },
  macroValue: { fontSize: 15, fontWeight: '800' },
  macroLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  footer: { paddingHorizontal: 20, paddingVertical: 10, paddingBottom: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  addBtnText: { fontSize: 14, fontWeight: '800' },
});