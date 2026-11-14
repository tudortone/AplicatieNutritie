import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowUpDown,
  Camera,
  ChefHat,
  Plus,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { ProdusCamara, ProdusCamaraUpdate } from '../../hooks/useCamara';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { Radius, Spacing } from '../../constants/theme';
import { PantryItemCard } from './PantryItemCard';
import { PantryItemSheet } from './PantryItemSheet';
import {
  isExpiringSoonItem,
  matchesPantryFilter,
  matchesPantryQuery,
  PantryFilter,
  PantrySort,
  sortPantryItems,
} from './pantryUtils';

export interface PantryViewProps {
  produse: ProdusCamara[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  onQuickAdd: (prefillName?: string) => void;
  onScanFirst: () => void;
  onAddMeal: (item: ProdusCamara) => void;
  onStepUnit: (id: string, delta: number) => void;
  onStepGrams: (id: string, nextGrams: number) => void;
  onSaveEdit: (id: string, updates: ProdusCamaraUpdate) => Promise<void> | void;
  onDeleteItem: (id: string) => Promise<void> | void;
  onGenerateRecipes: (selected: ProdusCamara[]) => void;
}

const SORT_CYCLE: PantrySort[] = ['urgency', 'low_stock', 'alpha', 'recent'];

function useSafeInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export function PantryView({
  produse,
  loading = false,
  error = null,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onQuickAdd,
  onScanFirst,
  onAddMeal,
  onStepUnit,
  onStepGrams,
  onSaveEdit,
  onDeleteItem,
  onGenerateRecipes,
}: PantryViewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeInsets();

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<PantryFilter>('all');
  const [sortMode, setSortMode] = useState<PantrySort>('urgency');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ProdusCamara | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const counts = useMemo(() => {
    let expiring = 0;
    let low = 0;
    let frozen = 0;
    let ambient = 0;
    for (const item of produse) {
      if (isExpiringSoonItem(item)) expiring += 1;
      if (matchesPantryFilter(item, 'low')) low += 1;
      if (item.is_congelat) frozen += 1;
      else ambient += 1;
    }
    return {
      all: produse.length,
      expiring,
      low,
      frozen,
      ambient,
    };
  }, [produse]);

  const filteredItems = useMemo(() => {
    const matching = produse.filter(
      (item) => matchesPantryFilter(item, activeFilter) && matchesPantryQuery(item, query)
    );
    return sortPantryItems(matching, sortMode);
  }, [produse, activeFilter, query, sortMode]);

  const editingItem = useMemo(
    () => (editingItemId ? produse.find((p) => p.id === editingItemId) ?? null : null),
    [editingItemId, produse]
  );

  const cycleSort = () => {
    const idx = SORT_CYCLE.indexOf(sortMode);
    setSortMode(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]);
  };

  const sortLabelMap: Record<PantrySort, string> = {
    urgency: t('scannerBarcode.sortUrgency'),
    low_stock: t('scannerBarcode.sortLowStock'),
    alpha: t('scannerBarcode.sortAlpha'),
    recent: t('scannerBarcode.sortRecent'),
  };

  const filterChips: { key: PantryFilter; label: string; count: number }[] = [
    { key: 'all', label: t('scannerBarcode.filterAll', { count: counts.all }), count: counts.all },
    {
      key: 'expiring',
      label: t('scannerBarcode.filterExpiring', { count: counts.expiring }),
      count: counts.expiring,
    },
    {
      key: 'low',
      label: t('scannerBarcode.filterLowStock', { count: counts.low }),
      count: counts.low,
    },
    {
      key: 'frozen',
      label: t('scannerBarcode.filterFrozen', { count: counts.frozen }),
      count: counts.frozen,
    },
    {
      key: 'ambient',
      label: t('scannerBarcode.filterAmbient', { count: counts.ambient }),
      count: counts.ambient,
    },
  ];

  const handleQuickDecrement = useCallback(
    (item: ProdusCamara) => {
      if (typeof item.cantitate_g === 'number' && item.cantitate_g > 0) {
        if (item.cantitate_g <= 50) {
          setPendingDeleteItem(item);
          return;
        }
        onStepGrams(item.id, item.cantitate_g - 50);
        return;
      }
      if ((item.cantitate || 1) <= 1) {
        setPendingDeleteItem(item);
        return;
      }
      onStepUnit(item.id, -1);
    },
    [onStepGrams, onStepUnit]
  );

  const handleQuickIncrement = useCallback(
    (item: ProdusCamara) => {
      if (typeof item.cantitate_g === 'number' && item.cantitate_g > 0) {
        onStepGrams(item.id, item.cantitate_g + 50);
        return;
      }
      onStepUnit(item.id, 1);
    },
    [onStepGrams, onStepUnit]
  );

  const handleConfirmDelete = async () => {
    if (!pendingDeleteItem || deleting) return;
    setDeleting(true);
    try {
      await onDeleteItem(pendingDeleteItem.id);
      setPendingDeleteItem(null);
    } finally {
      setDeleting(false);
    }
  };

  const renderCard = useCallback(
    ({ item }: { item: ProdusCamara }) => (
      <PantryItemCard
        item={item}
        isSelected={selectedSet.has(item.id)}
        onToggleSelect={onToggleSelect}
        onQuickDecrement={handleQuickDecrement}
        onQuickIncrement={handleQuickIncrement}
        onAddMeal={onAddMeal}
        onOpenEdit={(target) => setEditingItemId(target.id)}
      />
    ),
    [selectedSet, onToggleSelect, handleQuickDecrement, handleQuickIncrement, onAddMeal]
  );

  const trimmedQuery = query.trim();

  return (
    <View style={styles.root} testID="pantry-view">
      {/* Zonă sticky: Statistici + Sort + Căutare + Filtre */}
      <View style={styles.controlsHeader}>
        <View style={styles.summaryRow}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.summaryText, { color: colors.textSecondary }]}
          >
            {t('scannerBarcode.summaryStats', {
              total: counts.all,
              expiring: counts.expiring,
            })}
          </Text>

          <TouchableOpacity
            onPress={cycleSort}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('scannerBarcode.sortToggleA11y')}
            style={[
              styles.sortBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
            ]}
          >
            <ArrowUpDown size={13} color={colors.accent} />
            <Text
              maxFontSizeMultiplier={1.3}
              style={[styles.sortBtnText, { color: colors.textPrimary }]}
            >
              {sortLabelMap[sortMode]}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search + Quick Add */}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
            ]}
          >
            <Search size={17} color={colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('scannerBarcode.searchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              testID="pantry-search-input"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('scannerBarcode.clearSearchA11y')}
                style={styles.clearSearchBtn}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => onQuickAdd()}
            accessibilityRole="button"
            accessibilityLabel={t('scannerBarcode.addManualA11y')}
            style={[styles.quickAddBtn, { backgroundColor: colors.accent }]}
            testID="pantry-quick-add-btn"
          >
            <Plus size={20} color={colors.textOnAccent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {filterChips.map((chip) => {
            const active = activeFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setActiveFilter(chip.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceElevated,
                    borderColor: active ? colors.accent : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.textOnAccent : colors.textSecondary },
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Stare încărcare / eroare / gol / listă */}
      {loading && produse.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateText, { color: colors.textSecondary }]}
          >
            {t('scannerBarcode.loadingPantry')}
          </Text>
        </View>
      ) : error && produse.length === 0 ? (
        <View style={styles.centerState}>
          <AlertTriangle size={40} color={colors.warning} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateTitle, { color: colors.textPrimary }]}
          >
            {t('scannerBarcode.loadErrorTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateSub, { color: colors.textSecondary }]}
          >
            {error}
          </Text>
          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              accessibilityRole="button"
              style={[styles.primaryStateBtn, { backgroundColor: colors.accent }]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.primaryStateBtnText, { color: colors.textOnAccent }]}
              >
                {t('scannerBarcode.retryLoad')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : produse.length === 0 ? (
        <View style={styles.centerState}>
          <ShoppingBag size={46} color={colors.textTertiary} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateTitle, { color: colors.textPrimary }]}
          >
            {t('scannerBarcode.inventoryEmptyTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateSub, { color: colors.textSecondary }]}
          >
            {t('scannerBarcode.inventoryEmptyMessage')}
          </Text>
          <View style={styles.emptyActionsRow}>
            <TouchableOpacity
              onPress={onScanFirst}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.scanFirstA11y')}
              style={[styles.primaryStateBtn, { backgroundColor: colors.accent }]}
            >
              <Camera size={17} color={colors.textOnAccent} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.primaryStateBtnText, { color: colors.textOnAccent }]}
              >
                {t('scannerBarcode.scanFirst')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onQuickAdd()}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.addManualA11y')}
              style={[
                styles.secondaryStateBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
              ]}
            >
              <Plus size={17} color={colors.accent} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.secondaryStateBtnText, { color: colors.accent }]}
              >
                {t('scannerBarcode.addManual')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centerState}>
          <Search size={40} color={colors.textTertiary} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateTitle, { color: colors.textPrimary }]}
          >
            {t('scannerBarcode.searchEmptyTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.stateSub, { color: colors.textSecondary }]}
          >
            {t('scannerBarcode.searchEmptyMessage')}
          </Text>
          <View style={styles.emptyActionsRow}>
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setActiveFilter('all');
              }}
              accessibilityRole="button"
              style={[
                styles.secondaryStateBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.secondaryStateBtnText, { color: colors.textPrimary }]}
              >
                {t('scannerBarcode.resetFilters')}
              </Text>
            </TouchableOpacity>

            {trimmedQuery.length >= 2 && (
              <TouchableOpacity
                onPress={() => onQuickAdd(trimmedQuery)}
                accessibilityRole="button"
                style={[styles.primaryStateBtn, { backgroundColor: colors.accent }]}
              >
                <Plus size={17} color={colors.textOnAccent} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.primaryStateBtnText, { color: colors.textOnAccent }]}
                >
                  {t('scannerBarcode.addSearchItem', { query: trimmedQuery })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.xs,
            paddingBottom: Math.max(insets.bottom, Spacing.lg) + 92,
          }}
        />
      )}

      {/* Bară contextuală AI Rețete */}
      {produse.length > 0 && (
        <View
          style={[
            styles.floatingBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.cardBorder,
              paddingBottom: Math.max(insets.bottom, Spacing.md),
            },
          ]}
        >
          {selectedIds.length > 0 ? (
            <View style={styles.floatingSelectedRow}>
              <View style={styles.selectedBadgeGroup}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.selectedBadgeText, { color: colors.textPrimary }]}
                >
                  {t('scannerBarcode.selectedSummary', { count: selectedIds.length })}
                </Text>
                <TouchableOpacity
                  onPress={onClearSelection}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.clearSelectionA11y')}
                  style={[styles.clearSelBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <X size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() =>
                  onGenerateRecipes(produse.filter((p) => selectedSet.has(p.id)))
                }
                accessibilityRole="button"
                accessibilityLabel={t('scannerBarcode.cookSelectedA11y', { count: selectedIds.length })}
                style={[styles.floatingCta, { backgroundColor: colors.accent }]}
              >
                <ChefHat size={18} color={colors.textOnAccent} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.floatingCtaText, { color: colors.textOnAccent }]}
                >
                  {t('scannerBarcode.cookWithSelectedCount', { count: selectedIds.length })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => onGenerateRecipes(produse)}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.askRecipesA11y')}
              style={[styles.floatingCtaFull, { backgroundColor: colors.accent }]}
            >
              <ChefHat size={18} color={colors.textOnAccent} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.floatingCtaText, { color: colors.textOnAccent }]}
              >
                {t('scannerBarcode.askRecipes')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Modal Editare Gramaj & Valabilitate */}
      <PantryItemSheet
        item={editingItem}
        onClose={() => setEditingItemId(null)}
        onSave={onSaveEdit}
        onRequestDelete={(target) => setPendingDeleteItem(target)}
      />

      {/* Confirmare Ștergere */}
      <ConfirmSheet
        visible={Boolean(pendingDeleteItem)}
        title={t('scannerBarcode.deleteConfirmTitle')}
        message={t('scannerBarcode.deleteConfirmMessage', {
          name: pendingDeleteItem?.nume ?? '',
        })}
        confirmLabel={t('scannerBarcode.deleteConfirmAction')}
        cancelLabel={t('scannerBarcode.cancelAction')}
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleting) setPendingDeleteItem(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  controlsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersContent: {
    gap: 8,
    paddingRight: Spacing.md,
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
  },
  stateSub: {
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  stateText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  primaryStateBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryStateBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryStateBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryStateBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  floatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  floatingSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  clearSelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCta: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  floatingCtaFull: {
    height: 48,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  floatingCtaText: {
    fontSize: 14.5,
    fontWeight: '900',
  },
});
