import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Check, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { AlimentDetaliat } from '../../types';

export interface EditAlimentSheetRef {
  open: (aliment: AlimentDetaliat) => void;
  close: () => void;
  /** REMED-010: pentru BackHandler-ul foii-părinte (top-of-stack corect pe Android). */
  isPresent: () => boolean;
}

interface EditAlimentSheetProps {
  onSave: (aliment: AlimentDetaliat) => void;
}

/** Parsează un string numeric (acceptă virgulă) și clamp ≥0. */
function parseNumar(text: string): number {
  const n = parseFloat(text.replace(/,/g, '.'));
  return isNaN(n) || !isFinite(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
}

export const EditAlimentSheet = forwardRef<EditAlimentSheetRef, EditAlimentSheetProps>(
  function EditAlimentSheet({ onSave }, ref) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [nume, setNume] = useState<string>('');
    const [grame, setGrame] = useState<string>('');
    const [kcal, setKcal] = useState<string>('');
    const [proteine, setProteine] = useState<string>('');
    const [carbohidrati, setCarbohidrati] = useState<string>('');
    const [grasimi, setGrasimi] = useState<string>('');
    const [aliment, setAliment] = useState<AlimentDetaliat | null>(null);
    // REMED-010: vizibilitate proprie pentru închiderea pe hardware-back (Android).
    const [prezent, setPrezent] = useState(false);
    const snapPoints = useMemo(() => ['78%'], []);

    // Resetează formularul cu datele alimentului la fiecare deschidere.
    useImperativeHandle(ref, () => ({
      open: (al: AlimentDetaliat) => {
        setAliment(al);
        setNume(al.nume || '');
        setGrame(al.grame != null ? String(al.grame) : '');
        setKcal(al.calorii != null ? String(al.calorii) : '');
        setProteine(al.proteine != null ? String(al.proteine) : '');
        setCarbohidrati(al.carbohidrati != null ? String(al.carbohidrati) : '');
        setGrasimi(al.grasimi != null ? String(al.grasimi) : '');
        setPrezent(true);
        bottomSheetRef.current?.present();
      },
      close: () => {
        setPrezent(false);
        bottomSheetRef.current?.dismiss();
      },
      isPresent: () => prezent,
    }));

    // REMED-010: hardware-back pe Android închide DOAR această foie (dacă e deschisă).
    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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

    const salveaza = () => {
      if (!aliment) return;
      onSave({
        ...aliment,
        nume: nume.trim() || aliment.nume,
        grame: parseNumar(grame),
        calorii: parseNumar(kcal),
        proteine: parseNumar(proteine),
        carbohidrati: parseNumar(carbohidrati),
        grasimi: parseNumar(grasimi),
      });
    };

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        stackBehavior="push"
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, borderWidth: 1 }}
        handleIndicatorStyle={{ backgroundColor: colors.overlayStrong, width: 44 }}
        onDismiss={() => setPrezent(false)}
      >
        {aliment ? (
          <>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('jurnal.correctIngredientTitle')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('jurnal.correctIngredientFor', { nume: aliment.nume })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => bottomSheetRef.current?.dismiss()}
                style={styles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('jurnal.closeCorrectIngredient')}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('jurnal.nameLabel')}</Text>
              <BottomSheetTextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                value={nume}
                onChangeText={setNume}
                placeholder={t('jurnal.namePlaceholderEdit')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('jurnal.gramajShort')}</Text>
              <BottomSheetTextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                value={grame}
                onChangeText={setGrame}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={colors.textTertiary}
              />

              <View style={styles.macroRow}>
                <View style={styles.macroCol}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>kcal</Text>
                  <BottomSheetTextInput
                    style={[styles.input, { color: colors.accent, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                    value={kcal}
                    onChangeText={setKcal}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.macroCol}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('jurnal.proteinLabel')}</Text>
                  <BottomSheetTextInput
                    style={[styles.input, { color: colors.accentSecondary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                    value={proteine}
                    onChangeText={setProteine}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              <View style={styles.macroRow}>
                <View style={styles.macroCol}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('jurnal.carbsLabel')}</Text>
                  <BottomSheetTextInput
                    style={[styles.input, { color: colors.accentTertiary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                    value={carbohidrati}
                    onChangeText={setCarbohidrati}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.macroCol}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('jurnal.fatsLabel')}</Text>
                  <BottomSheetTextInput
                    style={[styles.input, { color: colors.warning, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                    value={grasimi}
                    onChangeText={setGrasimi}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.accent }]} onPress={salveaza}>
                <Check size={18} color={colors.textOnAccent} />
                <Text style={[styles.saveBtnText, { color: colors.textOnAccent }]}>{t('jurnal.saveAndRecalc')}</Text>
              </TouchableOpacity>
            </BottomSheetScrollView>
          </>
        ) : null}
      </BottomSheetModal>
    );
  },
);

EditAlimentSheet.displayName = 'EditAlimentSheet';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroCol: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800' },
});