import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

export interface FoodCandidate {
  nume: string;
  calorii_per_100g: number;
  proteine_per_100g: number;
  carbohidrati_per_100g: number;
  grasimi_per_100g: number;
  fibre_per_100g: number;
}

const COMMON_FOOD_DATABASE: FoodCandidate[] = [
  { nume: 'Piept de pui la grătar', calorii_per_100g: 165, proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6, fibre_per_100g: 0 },
  { nume: 'Piept de curcan la grătar', calorii_per_100g: 135, proteine_per_100g: 30, carbohidrati_per_100g: 0, grasimi_per_100g: 1.5, fibre_per_100g: 0 },
  { nume: 'Pulpe de pui fără piele', calorii_per_100g: 170, proteine_per_100g: 24, carbohidrati_per_100g: 0, grasimi_per_100g: 8, fibre_per_100g: 0 },
  { nume: 'Somon la cuptor', calorii_per_100g: 208, proteine_per_100g: 20, carbohidrati_per_100g: 0, grasimi_per_100g: 13, fibre_per_100g: 0 },
  { nume: 'Mușchi de vită la grătar', calorii_per_100g: 215, proteine_per_100g: 26, carbohidrati_per_100g: 0, grasimi_per_100g: 12, fibre_per_100g: 0 },
  { nume: 'Ouă fierte (ou întreg)', calorii_per_100g: 155, proteine_per_100g: 13, carbohidrati_per_100g: 1.1, grasimi_per_100g: 11, fibre_per_100g: 0 },
  { nume: 'Albuș de ou', calorii_per_100g: 52, proteine_per_100g: 11, carbohidrati_per_100g: 0.7, grasimi_per_100g: 0.2, fibre_per_100g: 0 },
  { nume: 'Tofu ferm la grătar', calorii_per_100g: 120, proteine_per_100g: 14, carbohidrati_per_100g: 3, grasimi_per_100g: 6, fibre_per_100g: 2 },
  { nume: 'Orez alb fiert', calorii_per_100g: 130, proteine_per_100g: 2.7, carbohidrati_per_100g: 28, grasimi_per_100g: 0.3, fibre_per_100g: 0.4 },
  { nume: 'Orez brun fiert', calorii_per_100g: 123, proteine_per_100g: 2.7, carbohidrati_per_100g: 25.6, grasimi_per_100g: 1, fibre_per_100g: 1.6 },
  { nume: 'Quinoa fiartă', calorii_per_100g: 120, proteine_per_100g: 4.4, carbohidrati_per_100g: 21.3, grasimi_per_100g: 1.9, fibre_per_100g: 2.8 },
  { nume: 'Cartofi copți / fierți', calorii_per_100g: 87, proteine_per_100g: 1.9, carbohidrati_per_100g: 20, grasimi_per_100g: 0.1, fibre_per_100g: 1.8 },
  { nume: 'Cartofi dulci copți', calorii_per_100g: 90, proteine_per_100g: 2, carbohidrati_per_100g: 21, grasimi_per_100g: 0.2, fibre_per_100g: 3 },
  { nume: 'Paste integrale fierte', calorii_per_100g: 140, proteine_per_100g: 5.5, carbohidrati_per_100g: 28, grasimi_per_100g: 0.8, fibre_per_100g: 3.5 },
  { nume: 'Ovăz fiert cu apă', calorii_per_100g: 71, proteine_per_100g: 2.5, carbohidrati_per_100g: 12, grasimi_per_100g: 1.5, fibre_per_100g: 1.7 },
  { nume: 'Avocado proaspăt', calorii_per_100g: 160, proteine_per_100g: 2, carbohidrati_per_100g: 8.5, grasimi_per_100g: 14.7, fibre_per_100g: 6.7 },
  { nume: 'Ulei de măsline extravirgin', calorii_per_100g: 884, proteine_per_100g: 0, carbohidrati_per_100g: 0, grasimi_per_100g: 100, fibre_per_100g: 0 },
  { nume: 'Unt 82%', calorii_per_100g: 742, proteine_per_100g: 0.8, carbohidrati_per_100g: 0.7, grasimi_per_100g: 82, fibre_per_100g: 0 },
  { nume: 'Iaurt grecesc 2%', calorii_per_100g: 73, proteine_per_100g: 10, carbohidrati_per_100g: 3.8, grasimi_per_100g: 2, fibre_per_100g: 0 },
  { nume: 'Iaurt grecesc 10%', calorii_per_100g: 120, proteine_per_100g: 9, carbohidrati_per_100g: 3.5, grasimi_per_100g: 10, fibre_per_100g: 0 },
  { nume: 'Brânză cottage degresată', calorii_per_100g: 85, proteine_per_100g: 12.5, carbohidrati_per_100g: 3.5, grasimi_per_100g: 2.2, fibre_per_100g: 0 },
  { nume: 'Mix salată verde', calorii_per_100g: 17, proteine_per_100g: 1.5, carbohidrati_per_100g: 2.5, grasimi_per_100g: 0.2, fibre_per_100g: 1.8 },
  { nume: 'Broccoli la abur', calorii_per_100g: 35, proteine_per_100g: 2.4, carbohidrati_per_100g: 7, grasimi_per_100g: 0.4, fibre_per_100g: 2.6 },
  { nume: 'Roșii proaspete', calorii_per_100g: 18, proteine_per_100g: 0.9, carbohidrati_per_100g: 3.9, grasimi_per_100g: 0.2, fibre_per_100g: 1.2 },
  { nume: 'Castraveți proaspeți', calorii_per_100g: 15, proteine_per_100g: 0.7, carbohidrati_per_100g: 3.6, grasimi_per_100g: 0.1, fibre_per_100g: 0.5 },
  { nume: 'Măr roșu proaspăt', calorii_per_100g: 52, proteine_per_100g: 0.3, carbohidrati_per_100g: 13.8, grasimi_per_100g: 0.2, fibre_per_100g: 2.4 },
  { nume: 'Banană proaspătă', calorii_per_100g: 89, proteine_per_100g: 1.1, carbohidrati_per_100g: 22.8, grasimi_per_100g: 0.3, fibre_per_100g: 2.6 },
  { nume: 'Nuci românești', calorii_per_100g: 654, proteine_per_100g: 15.2, carbohidrati_per_100g: 13.7, grasimi_per_100g: 65.2, fibre_per_100g: 6.7 },
  { nume: 'Migdale crude', calorii_per_100g: 579, proteine_per_100g: 21.2, carbohidrati_per_100g: 21.6, grasimi_per_100g: 49.9, fibre_per_100g: 12.5 },
  { nume: 'Pudră proteică Whey', calorii_per_100g: 390, proteine_per_100g: 78, carbohidrati_per_100g: 6, grasimi_per_100g: 4, fibre_per_100g: 1 },
];

interface ChangeIngredientSheetProps {
  visible: boolean;
  currentIngredientName?: string;
  onClose: () => void;
  onSelectCandidate: (candidate: FoodCandidate) => void;
}

export function ChangeIngredientSheet({
  visible,
  currentIngredientName = '',
  onClose,
  onSelectCandidate,
}: ChangeIngredientSheetProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COMMON_FOOD_DATABASE;
    return COMMON_FOOD_DATABASE.filter((item) =>
      item.nume.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleSelect = (candidate: FoodCandidate) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onSelectCandidate(candidate);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheetContainer} testID="change-ingredient-sheet">
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text maxFontSizeMultiplier={1.3} style={styles.title}>
                {t('camera.changeIngredientTitle', 'Schimbă ingredientul')}
              </Text>
              {currentIngredientName ? (
                <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>
                  Înlocuiește: {currentIngredientName}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              testID="change-ingredient-close-btn"
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Închide"
            >
              <X size={20} color="#8B93A0" />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchBar}>
            <Search size={18} color="#8B93A0" style={styles.searchIcon} />
            <TextInput
              testID="change-ingredient-search-input"
              style={styles.searchInput}
              placeholder={t('camera.searchFoodPlaceholder', 'Caută aliment sau ingredient...')}
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
          </View>

          {/* List of Candidates */}
          <FlatList
            data={filteredCandidates}
            keyExtractor={(item) => item.nume}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`candidate-${item.nume}`}
                style={styles.candidateRow}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`Selectează ${item.nume}, ${item.calorii_per_100g} calorii la 100g`}
              >
                <View style={styles.candidateInfo}>
                  <Text style={styles.candidateName}>{item.nume}</Text>
                  <Text style={styles.candidateMacros}>
                    {item.calorii_per_100g} kcal/100g · {item.proteine_per_100g}g P · {item.carbohidrati_per_100g}g C · {item.grasimi_per_100g}g F
                  </Text>
                </View>

                <View style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>Selectează</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Nu am găsit rezultate pentru „{searchQuery}”.
                </Text>
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    backgroundColor: '#12161A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxHeight: '80%',
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8B93A0',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090C0E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 20,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  candidateInfo: {
    flex: 1,
    paddingRight: 12,
  },
  candidateName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  candidateMacros: {
    color: '#8B93A0',
    fontSize: 12,
  },
  selectBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8B93A0',
    fontSize: 14,
  },
});
