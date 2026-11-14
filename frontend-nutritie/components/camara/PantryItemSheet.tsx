import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus, Snowflake, Sun, Trash2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { ProdusCamara, ProdusCamaraUpdate } from '../../hooks/useCamara';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { calculateDaysUntilExpiry } from '../../hooks/useDaysUntilExpiry';
import { StepperQuantityControl } from '../ui/StepperQuantityControl';
import { Radius, Spacing } from '../../constants/theme';

export interface PantryItemSheetProps {
  item: ProdusCamara | null;
  onClose: () => void;
  onSave: (id: string, updates: ProdusCamaraUpdate) => Promise<void> | void;
  onRequestDelete: (item: ProdusCamara) => void;
}

const DAY_MS = 86_400_000;

function useSafeInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

function addDaysToIso(baseIso: string | undefined, addDays: number): string {
  const baseMs = baseIso ? new Date(baseIso).getTime() : Date.now();
  const safeBase = Number.isNaN(baseMs) || baseMs < Date.now() ? Date.now() : baseMs;
  return new Date(safeBase + addDays * DAY_MS).toISOString().split('T')[0];
}

export function PantryItemSheet({
  item,
  onClose,
  onSave,
  onRequestDelete,
}: PantryItemSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const reducedMotion = useReducedMotion();

  const [trackGrams, setTrackGrams] = useState(false);
  const [grams, setGrams] = useState(250);
  const [units, setUnits] = useState(1);
  const [isFrozen, setIsFrozen] = useState(false);
  const [expiryIso, setExpiryIso] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const hasGrams = typeof item.cantitate_g === 'number' && item.cantitate_g > 0;
    setTrackGrams(hasGrams);
    setGrams(hasGrams ? Math.round(item.cantitate_g!) : 250);
    setUnits(Math.max(1, Math.round(item.cantitate || 1)));
    setIsFrozen(Boolean(item.is_congelat));
    setExpiryIso(
      item.data_expirare ||
        new Date(Date.now() + (item.is_congelat ? 90 : 14) * DAY_MS)
          .toISOString()
          .split('T')[0]
    );
    setSaving(false);
  }, [item]);

  if (!item) return null;

  const daysLeft = calculateDaysUntilExpiry(expiryIso) ?? (isFrozen ? 90 : 14);

  const handleToggleStorage = (nextFrozen: boolean) => {
    if (nextFrozen === isFrozen) return;
    setIsFrozen(nextFrozen);
    const defaultShift = nextFrozen ? 90 : 7;
    setExpiryIso(new Date(Date.now() + defaultShift * DAY_MS).toISOString().split('T')[0]);
  };

  const handleQuickExtend = (days: number) => {
    setExpiryIso((prev) => addDaysToIso(prev, days));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(item.id, {
        cantitate: units,
        cantitate_g: trackGrams ? grams : 0,
        is_congelat: isFrozen,
        data_expirare: expiryIso,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={Boolean(item)}
      transparent
      presentationStyle="overFullScreen"
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.64)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, Spacing.lg),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />

          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={2}
                style={[styles.title, { color: colors.textPrimary }]}
              >
                {item.nume}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.meta, { color: colors.textSecondary }]}
              >
                {`${Math.round(Number(item.calorii_100g ?? (item as { kcal_100g?: unknown }).kcal_100g) || 0)} kcal · P ${Math.round(Number(item.proteine_100g) || 0)}g · C ${Math.round(Number(item.carbohidrati_100g) || 0)}g · G ${Math.round(Number(item.grasimi_100g) || 0)}g`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.cancelAction')}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {/* Secțiune Gramaj */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.sectionLabel, { color: colors.textSecondary }]}
                >
                  {t('scannerBarcode.sheetRemainingGrams')}
                </Text>
                <TouchableOpacity
                  onPress={() => setTrackGrams((prev) => !prev)}
                  hitSlop={8}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: trackGrams }}
                  style={[
                    styles.toggleChip,
                    {
                      backgroundColor: trackGrams ? `${colors.accent}20` : colors.surfaceElevated,
                      borderColor: trackGrams ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      styles.toggleChipText,
                      { color: trackGrams ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {trackGrams
                      ? t('scannerBarcode.sheetTrackByGrams')
                      : t('scannerBarcode.sheetEnableGrams')}
                  </Text>
                </TouchableOpacity>
              </View>

              {trackGrams && (
                <>
                  <StepperQuantityControl
                    grams={grams}
                    onChangeGrams={setGrams}
                    step={25}
                    min={25}
                    max={5000}
                  />
                  <View style={styles.quickChipsRow}>
                    {[-100, -50, 100].map((delta) => (
                      <TouchableOpacity
                        key={delta}
                        onPress={() => setGrams((g) => Math.min(5000, Math.max(25, g + delta)))}
                        hitSlop={4}
                        accessibilityRole="button"
                        style={[
                          styles.quickChip,
                          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={1.3}
                          style={[styles.quickChipText, { color: colors.textPrimary }]}
                        >
                          {`${delta > 0 ? `+${delta}` : delta}g`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Secțiune Bucăți */}
            <View style={[styles.section, styles.inlineRow]}>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.sectionLabel, { color: colors.textSecondary }]}
              >
                {t('scannerBarcode.sheetUnitsCount')}
              </Text>
              <View style={styles.unitStepper}>
                <TouchableOpacity
                  onPress={() => setUnits((u) => Math.max(1, u - 1))}
                  hitSlop={6}
                  disabled={units <= 1}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.decreaseQuantityA11y', { name: item.nume })}
                  style={[
                    styles.unitBtn,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                      opacity: units <= 1 ? 0.45 : 1,
                    },
                  ]}
                >
                  <Minus size={16} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.unitValue, { color: colors.textPrimary }]}
                >
                  {`×${units}`}
                </Text>
                <TouchableOpacity
                  onPress={() => setUnits((u) => Math.min(99, u + 1))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.increaseQuantityA11y', { name: item.nume })}
                  style={[
                    styles.unitBtn,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Plus size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Secțiune Depozitare & Expirare */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.sectionLabel, { color: colors.textSecondary }]}
                >
                  {t('scannerBarcode.sheetStorageMode')}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[
                    styles.expiryPreview,
                    { color: daysLeft <= 3 && !isFrozen ? colors.warning : colors.accent },
                  ]}
                >
                  {expiryIso}
                </Text>
              </View>

              <View style={styles.storageRow}>
                <TouchableOpacity
                  onPress={() => handleToggleStorage(false)}
                  accessibilityRole="button"
                  style={[
                    styles.storagePill,
                    {
                      backgroundColor: !isFrozen ? `${colors.accent}20` : colors.surfaceElevated,
                      borderColor: !isFrozen ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Sun size={15} color={!isFrozen ? colors.accent : colors.textSecondary} />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      styles.storagePillText,
                      { color: !isFrozen ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {t('scannerBarcode.sheetFridgeMode')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleToggleStorage(true)}
                  accessibilityRole="button"
                  style={[
                    styles.storagePill,
                    {
                      backgroundColor: isFrozen
                        ? `${colors.accentTertiary}22`
                        : colors.surfaceElevated,
                      borderColor: isFrozen ? colors.accentTertiary : colors.border,
                    },
                  ]}
                >
                  <Snowflake
                    size={15}
                    color={isFrozen ? colors.accentTertiary : colors.textSecondary}
                  />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      styles.storagePillText,
                      { color: isFrozen ? colors.accentTertiary : colors.textSecondary },
                    ]}
                  >
                    {t('scannerBarcode.sheetFreezerMode')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quickChipsRow}>
                {[
                  { days: 3, label: t('scannerBarcode.sheetExtend3d') },
                  { days: 7, label: t('scannerBarcode.sheetExtend7d') },
                  { days: 14, label: t('scannerBarcode.sheetExtend14d') },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.days}
                    onPress={() => handleQuickExtend(opt.days)}
                    hitSlop={4}
                    accessibilityRole="button"
                    style={[
                      styles.quickChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={[styles.quickChipText, { color: colors.textPrimary }]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => {
                onClose();
                onRequestDelete(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.deletePantryA11y', { name: item.nume })}
              style={[
                styles.deleteBtn,
                { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
              ]}
            >
              <Trash2 size={18} color={colors.danger} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              style={[styles.saveBtn, { backgroundColor: colors.accent }]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.saveBtnText, { color: colors.textOnAccent }]}
              >
                {t('scannerBarcode.sheetSaveBtn')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: '85%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
    opacity: 0.45,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unitStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unitBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitValue: {
    fontSize: 16,
    fontWeight: '900',
    minWidth: 36,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  expiryPreview: {
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  storageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  storagePill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  storagePillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: Spacing.md,
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
