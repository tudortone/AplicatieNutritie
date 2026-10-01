import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Search, Plus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import { API_URL } from '../../constants/config';
import { API_PREFIX } from '../../lib/api';
import { foodPresets } from '../../constants/foodPresets';
import { FoodProduct } from './types';
import { ProductSearchResult } from './ProductSearchResult';
import { QuantityEditor } from './QuantityEditor';
import { ManualProductForm, LOCAL_CUSTOM_FOODS_STORAGE_KEY } from './ManualProductForm';
import { FoodProductDetailModal } from './FoodProductDetailModal';
import { cautaProduseOpenFoodFacts } from '../../lib/openfoodfacts';

interface ProductSearchProps {
  initialBarcode?: string;
  onSelectProductWithGrams?: (product: FoodProduct, grams: number) => void;
  onClose?: () => void;
  onMealAdded?: (masa: any) => void;
}

export function ProductSearch({
  initialBarcode = '',
  onSelectProductWithGrams,
  onClose,
  onMealAdded,
}: ProductSearchProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedForQuantity, setSelectedForQuantity] = useState<FoodProduct | null>(null);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<FoodProduct | null>(null);
  const [isManualMode, setIsManualMode] = useState(Boolean(initialBarcode));

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const normalizeText = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const handleSelectProduct = useCallback((p: FoodProduct) => {
    setSelectedProductForDetail(p);
  }, []);

  // Căutare combinată: presets, custom foods locale (AsyncStorage), remote (Supabase produse_camara) și Open Food Facts
  const searchCombined = useCallback(async (qRaw: string) => {
    const seq = ++searchSeqRef.current;
    const q = normalizeText(qRaw);
    const list: FoodProduct[] = [];

    // A) Presets locale (predefinite)
    foodPresets.forEach((p) => {
      const n = normalizeText(p.nume);
      if (!q || n.includes(q)) {
        list.push({
          id: `preset_${p.id}`,
          source: 'preset',
          name: p.nume,
          kcalPer100g: Math.round((p.calorii / (p.gramajDefault || 100)) * 100),
          proteinPer100g: Math.round((p.proteine / (p.gramajDefault || 100)) * 100 * 10) / 10,
          carbsPer100g: Math.round((p.carbohidrati / (p.gramajDefault || 100)) * 100 * 10) / 10,
          fatPer100g: Math.round((p.grasimi / (p.gramajDefault || 100)) * 100 * 10) / 10,
          servingGrams: p.gramajDefault || 100,
        });
      }
    });

    // B1) Produse personalizate salvate local în AsyncStorage
    try {
      const rawLocal = await AsyncStorage.getItem(LOCAL_CUSTOM_FOODS_STORAGE_KEY);
      if (rawLocal) {
        const localList: FoodProduct[] = JSON.parse(rawLocal);
        localList.forEach((prod) => {
          const n = normalizeText(prod.name);
          const b = prod.brand ? normalizeText(prod.brand) : '';
          if (!q || n.includes(q) || b.includes(q)) {
            list.push({
              ...prod,
              source: 'user_saved',
            });
          }
        });
      }
    } catch (e) {
      console.warn('Eroare citire custom_foods local:', e);
    }

    // B2) Produse salvate anterior din Supabase (dacă user-ul e autentificat)
    if (session?.user?.id) {
      try {
        let sbQuery = supabase
          .from('produse_camara')
          .select('*')
          .eq('user_id', session.user.id)
          .limit(30);

        if (q) {
          sbQuery = sbQuery.ilike('nume', `%${qRaw}%`);
        }

        const { data } = await sbQuery;
        if (!isMountedRef.current || searchSeqRef.current !== seq) return;
        if (data) {
          data.forEach((row: any) => {
            list.push({
              id: `user_${row.id}`,
              source: 'user_saved',
              name: row.nume,
              brand: row.brand || undefined,
              barcode: row.barcode || undefined,
              servingLabel: row.portie_label || undefined,
              servingGrams: row.portie_grame ? Number(row.portie_grame) : undefined,
              kcalPer100g: Number(row.calorii_100g || 0),
              proteinPer100g: Number(row.proteine_100g || 0),
              carbsPer100g: Number(row.carbohidrati_100g || 0),
              fatPer100g: Number(row.grasimi_100g || 0),
              fiberPer100g: Number(row.fibre_100g || 0),
            });
          });
        }
      } catch (err) {
        console.warn('Eroare citire produse_camara:', err);
      }
    }

    // C) Căutare externă dacă query >= 2 caractere
    if (q.length >= 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const backendPromise = fetch(`${API_URL}${API_PREFIX}/cauta-produs?q=${encodeURIComponent(qRaw)}`, {
          signal: abortControllerRef.current.signal,
          headers,
        }).then(async (res) => {
          if (res.ok) {
            const extData = await res.json();
            return Array.isArray(extData) ? extData : [];
          }
          return [];
        }).catch(() => []);

        const offPromise = cautaProduseOpenFoodFacts(qRaw, abortControllerRef.current.signal)
          .catch(() => []);

        const [extData, offProducts] = await Promise.all([backendPromise, offPromise]);
        if (!isMountedRef.current || searchSeqRef.current !== seq) return;

        if (Array.isArray(offProducts)) {
          offProducts.forEach((p) => list.push(p));
        }

        if (Array.isArray(extData)) {
          extData.forEach((item: any) => {
            const p100 = item.nutriments || item;
            list.push({
              id: item.id || `ext_${item.code || Math.random().toString(36).substring(7)}`,
              source: 'barcode_cache',
              name: item.product_name || item.name || 'Produs necunoscut',
              brand: item.brands || item.brand || undefined,
              barcode: item.code || item.barcode || undefined,
              imageUrl: item.image_url || undefined,
              nutriscoreGrade: item.nutrition_grades || undefined,
              novaGroup: item.nova_group || undefined,
              kcalPer100g: Number(p100['energy-kcal_100g'] || p100.energy_kcal_100g || p100.calories || 0),
              proteinPer100g: Number(p100.proteins_100g || p100.proteins || 0),
              carbsPer100g: Number(p100.carbohydrates_100g || p100.carbohydrates || 0),
              fatPer100g: Number(p100.fat_100g || p100.fat || 0),
              fiberPer100g: Number(p100.fiber_100g || p100.fiber || 0),
              servingGrams: Number(item.serving_quantity || 100),
            });
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Eroare cautare produse externe:', err);
        }
      } finally {
        if (isMountedRef.current && searchSeqRef.current === seq) {
          setLoading(false);
        }
      }
    } else {
      setLoading(false);
    }

    // D) Deduplicare inteligentă păstrând prioritatea: user_saved > preset > barcode_cache > openfoodfacts
    const seen = new Map<string, FoodProduct>();
    for (const p of list) {
      const key = p.barcode ? `b_${p.barcode}` : `n_${normalizeText(p.name)}_${normalizeText(p.brand || '')}`;
      if (!seen.has(key)) {
        seen.set(key, p);
      } else {
        const existing = seen.get(key)!;
        // Păstrăm cea mai bună sursă și completăm detaliile lipsă
        seen.set(key, {
          ...p,
          ...existing,
          imageUrl: existing.imageUrl || p.imageUrl,
          imageSmallUrl: existing.imageSmallUrl || p.imageSmallUrl,
          nutriscoreGrade: existing.nutriscoreGrade || p.nutriscoreGrade,
          nutriscoreScore: existing.nutriscoreScore ?? p.nutriscoreScore,
          novaGroup: existing.novaGroup ?? p.novaGroup,
          ecoscoreGrade: existing.ecoscoreGrade || p.ecoscoreGrade,
          ingredientsText: existing.ingredientsText || p.ingredientsText,
          allergens: existing.allergens || p.allergens,
        });
      }
    }

    const deduped = Array.from(seen.values());

    if (!isMountedRef.current || searchSeqRef.current !== seq) return;
    setResults(deduped.slice(0, 30));
  }, [session?.user?.id, session?.access_token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCombined(query);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, searchCombined]);

  if (isManualMode) {
    return (
      <View style={styles.container}>
        <ManualProductForm
          initialBarcode={initialBarcode}
          initialName={query}
          onSave={(prod, gr) => {
            setIsManualMode(false);
            searchCombined(query);
            setSelectedProductForDetail(prod);
          }}
          onCancel={() => setIsManualMode(false)}
        />
      </View>
    );
  }

  if (selectedForQuantity) {
    return (
      <View style={styles.container}>
        <QuantityEditor
          product={selectedForQuantity}
          onConfirm={(gr) => {
            const prod = selectedForQuantity;
            setSelectedForQuantity(null);
            if (onSelectProductWithGrams) {
              onSelectProductWithGrams(prod, gr);
            }
          }}
          onCancel={() => setSelectedForQuantity(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.headerRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={t('productSearch.inputA11y')}
            placeholder={t('productSearch.inputPlaceholder')}
            placeholderTextColor={colors.textSecondary + '77'}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityLabel={t('productSearch.clearSearchA11y')}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityLabel={t('productSearch.closeA11y')}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.loadingText, { color: colors.textSecondary }]}>{t('productSearch.searchingCatalogs')}</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <ProductSearchResult
            product={item}
            onSelect={handleSelectProduct}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity
            accessibilityLabel={t('productSearch.manualEntryA11y')}
            accessibilityRole="button"
            style={[styles.manualRowFooter, { backgroundColor: colors.cardBg, borderColor: colors.accent }]}
            onPress={() => setIsManualMode(true)}
          >
            <Plus size={18} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.manualFooterText, { color: colors.accent }]}>
              {t('productSearch.manualEntryCta')}
            </Text>
          </TouchableOpacity>
        }
      />

      {selectedProductForDetail && (
        <FoodProductDetailModal
          visible={Boolean(selectedProductForDetail)}
          product={selectedProductForDetail}
          onClose={() => setSelectedProductForDetail(null)}
          onAddSuccess={(masa) => {
            const p = selectedProductForDetail;
            setSelectedProductForDetail(null);
            if (onMealAdded) {
              onMealAdded(masa);
            } else if (p && onSelectProductWithGrams) {
              onSelectProductWithGrams(p, p.servingGrams || 100);
            }
            if (onClose) {
              onClose();
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  closeBtn: { padding: 6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  manualRowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 10,
    gap: 8,
  },
  manualFooterText: { fontSize: 14, fontWeight: '700' },
});
