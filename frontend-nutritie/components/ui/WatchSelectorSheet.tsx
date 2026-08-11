import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Watch, CheckCircle2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { useHealthSync, HEALTH_PROVIDERS, HealthProvider } from '../../hooks/useHealthSync';
import { useTranslation } from 'react-i18next';

export interface WatchSelectorSheetRef {
  open: () => void;
  close: () => void;
}

export const WatchSelectorSheet = forwardRef<WatchSelectorSheetRef>((_, ref) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { selectedProvider, setProvider } = useHealthSync();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['58%'], []);
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
    open: () => bottomSheetRef.current?.present(),
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
    []
  );

  const selectHandler = async (providerId: HealthProvider) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await setProvider(providerId);
    bottomSheetRef.current?.dismiss();
  };

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
      <View style={styles.indicatorWrap}>
        <View style={[styles.indicator, { backgroundColor: colors.overlayStrong }]} />
      </View>

      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => bottomSheetRef.current?.dismiss()}
        accessibilityRole="button"
        accessibilityLabel={t('common.close', 'Închide')}
      >
        <X size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={[styles.iconBg, { backgroundColor: colors.accent + '20' }]}>
          <Watch size={24} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('profile.watch_selector_title', 'Selectează Ceasul / Dispozitivul')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('profile.watch_selector_sub', 'Alege eticheta pentru sursa ta de pași (sincronizare externă: în curând)')}
          </Text>
        </View>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {HEALTH_PROVIDERS.map((p, index) => {
          const active = selectedProvider === p.id;
          return (
            <Animated.View key={p.id} entering={FadeInDown.duration(350).delay(index * 30)}>
              <TouchableOpacity
                style={[
                  styles.item,
                  {
                    backgroundColor: active ? colors.accent + '15' : colors.cardBg,
                    borderColor: active ? colors.accent : colors.cardBorder,
                  }
                ]}
                onPress={() => selectHandler(p.id)}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={p.name}
                testID={`watch_option_${p.id}`}
              >
                <Text style={{ fontSize: 24 }}>{p.icon}</Text>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: active ? colors.accent : colors.textPrimary, fontWeight: active ? '800' : '600' }]}>
                    {p.name}
                  </Text>
                  <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>
                    {p.description}
                  </Text>
                </View>

                {active ? (
                  <CheckCircle2 size={22} color={colors.accent} />
                ) : (
                  <View style={[styles.radioCircle, { borderColor: colors.overlayStrong }]} />
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <Text style={{ fontSize: 12, lineHeight: 16, color: colors.textTertiary }}>
            Integrarea reală cu Google Fit, Garmin, Fitbit etc. va veni într-o versiune viitoare. Până atunci, pașii provin din senzorul telefonului și din adăugarea manuală.
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

WatchSelectorSheet.displayName = 'WatchSelectorSheet';

const styles = StyleSheet.create({
  indicatorWrap: { alignItems: 'center', paddingVertical: 12 },
  indicator: { width: 44, height: 5, borderRadius: 3 },
  closeBtn: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20, marginTop: 4 },
  iconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  list: { paddingBottom: 32, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 14 },
  itemName: { fontSize: 15 },
  itemDesc: { fontSize: 12, marginTop: 2 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
});
