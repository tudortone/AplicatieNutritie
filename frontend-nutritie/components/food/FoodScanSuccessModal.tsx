import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Check, Plus, X } from 'lucide-react-native';
import { AminoaciziEsentiali } from '../../types';

export interface AlimentScanat {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
  aminoacizi_per_100g?: AminoaciziEsentiali;
}

interface Props {
  visible: boolean;
  alimente: AlimentScanat[];
  onAddToDiary: () => void;
  onClose: () => void;
}

const kcalTotal = (a: AlimentScanat) =>
  Math.round((a.calorii_per_100g * a.estimare_grame) / 100);

export default function FoodScanSuccessModal({ visible, alimente, onAddToDiary, onClose }: Props) {
  const totalCalorii = alimente.reduce((s, a) => s + kcalTotal(a), 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.card}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color="#9CA3AF" />
          </Pressable>

          <View style={styles.badge}>
            <Check size={28} color="#090C0E" strokeWidth={3} />
          </View>

          <Text style={styles.title}>Mâncare identificată!</Text>
          <Text style={styles.subtitle}>
            {alimente.length} {alimente.length === 1 ? 'aliment' : 'alimente'} · {totalCalorii} kcal
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {alimente.map((a, i) => (
              <View key={`${a.nume}-${i}`} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{a.nume}</Text>
                  <Text style={styles.rowMeta}>{a.estimare_grame} g</Text>
                </View>
                <Text style={styles.rowKcal}>{kcalTotal(a)} kcal</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.cta} onPress={onAddToDiary}>
            <Plus size={20} color="#090C0E" strokeWidth={2.5} />
            <Text style={styles.ctaText}>Adaugă în Jurnal</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  badge: {
    alignSelf: 'center',
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#CCFF00',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, marginTop: 4,
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  list: { flexGrow: 0, marginBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#232331',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  rowName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  rowKcal: { color: '#CCFF00', fontSize: 14, fontWeight: '700' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#CCFF00',
    borderRadius: 16, paddingVertical: 16, width: '100%',
  },
  ctaText: { color: '#090C0E', fontSize: 16, fontWeight: '700' },
});
