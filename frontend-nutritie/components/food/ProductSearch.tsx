import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator
} from 'react-native';
import { Search, Plus, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import { API_URL } from '../../constants/config';
import { foodPresets } from '../../constants/foodPresets';
import { FoodProduct } from './types';
import { ProductSearchResult } from './ProductSearchResult';
import { QuantityEditor } from './QuantityEditor';
import { ManualProductForm } from './ManualProductForm';

interface ProductSearchProps {
  initialBarcode?: string;
  onSelectProductWithGrams: (product: FoodProduct, grams: number) => void;
  onClose?: () => void;
}

export function ProductSearch({
  initialBarcode = '',
  onSelectProductWithGrams,
  onClose
}: ProductSearchProps) {
  const { colors } = useTheme();
  const { session } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedForQuantity, setSelectedForQuantity] = useState<FoodProduct | null>(null);
  const [isManualMode, setIsManualMode] = useState(Boolean(initialBarcode));

  const abortControllerRef = useRef<AbortController | null>(null);

  const normalizeText = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // 1. Căutare locală în foodPresets & produse personalizate din Supabase
  const searchCombined = useCallback(async (qRaw: string) => {
    const q = normalizeText(qRaw);
    const list: FoodProduct[] = [];

    // A) Presets locale
    foodPresets.forEach((p) => {
      const n = normalizeText(p.nume);
      if (!q || n.includes(q)) {
        list.push({
          id: `preset_${p.id}`,
          source: 'preset',
          name: p.nume,
          kcalPer100g: Math.round((p.calorii / (p.gramajDefault || 100)) * 100),
          proteinPer100g: Math.round((p.proteine / (p.gramajDefault || 100)) * 100),
          carbsPer100g: Math.round((p.carbohidrati / (p.gramajDefault || 100)) * 100),
          fatPer100g: Math.round((p.grasimi / (p.gramajDefault || 100)) * 100),
          servingGrams: p.gramajDefault || 100,
        });
      }
    });

    // B) Produse salvate anterior din Supabase (dacă user-ul e autentificat)
    if (session?.user?.id) {
      try {
        let sbQuery = supabase
          .from('produse_camara')
          .select('*')
          .eq('user_id', session.user.id)
          .limit(20);

        if (q) {
          sbQuery = sbQuery.ilike('nume', `%${qRaw}%`);
        }

        const { data } = await sbQuery;
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
        const res = await fetch(`${API_URL}/api/cauta-produs?q=${encodeURIComponent(qRaw)}`, {
          signal: abortControllerRef.current.signal,
        });
        if (res.ok) {
          const extData = await res.json();
          if (Array.isArray(extData)) {
            extData.forEach((item: any, idx: number) => {
              list.push({
                id: `ext_${item.code || idx}`,
                source: 'openfoodfacts',
                name: item.product_name || item.nume || 'Produs',
                brand: item.brands || item.brand || undefined,
                barcode: item.code || undefined,
                kcalPer100g: Number(item.nutriments?.['energy-kcal_100g'] || item.calorii_per_100g || 0),
                proteinPer100g: Number(item.nutriments?.proteins_100g || item.proteine_per_100g || 0),
                carbsPer100g: Number(item.nutriments?.carbohydrates_100g || item.carbohidrati_per_100g || 0),
                fatPer100g: Number(item.nutriments?.fat_100g || item.grasimi_per_100g || 0),
              });
            });
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('Eroare căutare externă:', e);
        }
      } finally {
        setLoading(false);
      }
    }

    // Deduplicare după barcode sau nume+brand
    const seen = new Set<string>();
    const deduped = list.filter((p) => {
      const key = p.barcode ? `barcode_${p.barcode}` : `name_${normalizeText(p.name)}_${normalizeText(p.brand || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setResults(deduped.slice(0, 25));
  }, [session?.user?.id]);

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
            onSelectProductWithGrams(prod, gr);
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
            onSelectProductWithGrams(prod, gr);
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
            placeholder="Caută produs, brand sau aliment..."
            placeholderTextColor={colors.textSecondary + '77'}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Căutăm în cataloage...</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <ProductSearchResult
            product={item}
            onSelect={(p) => setSelectedForQuantity(p)}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.manualRowFooter, { backgroundColor: colors.cardBg, borderColor: colors.accent }]}
            onPress={() => setIsManualMode(true)}
          >
            <Plus size={18} color={colors.accent} />
            <Text style={[styles.manualFooterText, { color: colors.accent }]}>
              Nu găsești produsul? Introdu-l complet manual
            </Text>
          </TouchableOpacity>
        }
      />
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
