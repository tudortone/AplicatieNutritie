/**
 * FoodDetailModal.tsx — Detaliu nutrițional complet pentru un aliment
 * Afișează: macronutrienți, aminoacizi, vitamine, minerale
 * Datele vin din AlimentDetaliat (per porție) sau AlimentAI (per 100g)
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { X, Beaker, Zap, Droplets, Pill } from 'lucide-react-native';
import type { AlimentDetaliat, AminoaciziEsentiali, Micronutrienti } from '../../types';

interface FoodDetailModalProps {
  visible: boolean;
  onClose: () => void;
  aliment: AlimentDetaliat | null;
  /** Dacă datele sunt per 100g în loc de per porție */
  per100g?: boolean;
}

const AMINO_LABELS: Record<keyof AminoaciziEsentiali, string> = {
  leucina: 'Leucină',
  izoleucina: 'Izoleucină',
  valina: 'Valină',
  lizina: 'Lizină',
  metionina: 'Metionină',
  fenilalanina: 'Fenilalanină',
  treonina: 'Treonină',
  triptofan: 'Triptofan',
  istidina: 'Istidină',
};

const VITAMIN_LABELS: Array<{ key: keyof Micronutrienti; label: string; unit: string }> = [
  { key: 'vitamina_a', label: 'Vitamina A', unit: 'µg' },
  { key: 'vitamina_c', label: 'Vitamina C', unit: 'mg' },
  { key: 'vitamina_d', label: 'Vitamina D', unit: 'µg' },
  { key: 'vitamina_e', label: 'Vitamina E', unit: 'mg' },
  { key: 'vitamina_k', label: 'Vitamina K', unit: 'µg' },
  { key: 'vitamina_b1', label: 'Vitamina B1 (Tiamină)', unit: 'mg' },
  { key: 'vitamina_b2', label: 'Vitamina B2 (Riboflavină)', unit: 'mg' },
  { key: 'vitamina_b3', label: 'Vitamina B3 (Niacină)', unit: 'mg' },
  { key: 'vitamina_b6', label: 'Vitamina B6', unit: 'mg' },
  { key: 'vitamina_b9', label: 'Vitamina B9 (Folat)', unit: 'µg' },
  { key: 'vitamina_b12', label: 'Vitamina B12', unit: 'µg' },
];

const MINERAL_LABELS: Array<{ key: keyof Micronutrienti; label: string; unit: string }> = [
  { key: 'calciu', label: 'Calciu', unit: 'mg' },
  { key: 'fier', label: 'Fier', unit: 'mg' },
  { key: 'magneziu', label: 'Magneziu', unit: 'mg' },
  { key: 'fosfor', label: 'Fosfor', unit: 'mg' },
  { key: 'potasiu', label: 'Potasiu', unit: 'mg' },
  { key: 'sodiu', label: 'Sodiu (Sare)', unit: 'mg' },
  { key: 'zinc', label: 'Zinc', unit: 'mg' },
  { key: 'cupru', label: 'Cupru', unit: 'mg' },
  { key: 'mangan', label: 'Mangan', unit: 'mg' },
  { key: 'seleniu', label: 'Seleniu', unit: 'µg' },
  { key: 'iod', label: 'Iod', unit: 'µg' },
];

const OTHER_LABELS: Array<{ key: keyof Micronutrienti; label: string; unit: string }> = [
  { key: 'zaharuri', label: 'Zaharuri', unit: 'g' },
  { key: 'grasimi_saturate', label: 'Grăsimi Saturate', unit: 'g' },
  { key: 'grasimi_trans', label: 'Grăsimi Trans', unit: 'g' },
  { key: 'colesterol', label: 'Colesterol', unit: 'mg' },
  { key: 'fibra', label: 'Fibre', unit: 'g' },
];

function NutrientRow({ label, value, unit, color = '#94A3B8' }: { label: string; value: number; unit: string; color?: string }) {
  return (
    <View style={styles.nutrientRow}>
      <Text style={styles.nutrientLabel}>{label}</Text>
      <Text style={[styles.nutrientValue, { color }]}>
        {value.toFixed(value < 1 ? 1 : 0)} {unit}
      </Text>
    </View>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon size={16} color={color} />
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    </View>
  );
}

export function FoodDetailModal({ visible, onClose, aliment, per100g }: FoodDetailModalProps) {
  if (!aliment) return null;

  const micronutrienti = aliment.micronutrienti;
  const aminoacizi = aliment.aminoacizi;

  const gramaj = aliment.grame || 100;
  const prefix = per100g ? ' (per 100g)' : ` (${gramaj}g)`;

  const hasAminoacizi = aminoacizi && Object.values(aminoacizi).some(v => (v ?? 0) > 0);
  const hasVitamins = micronutrienti && VITAMIN_LABELS.some(v => (micronutrienti[v.key] ?? 0) > 0);
  const hasMinerals = micronutrienti && MINERAL_LABELS.some(m => (micronutrienti[m.key] ?? 0) > 0);
  const hasOther = micronutrienti && OTHER_LABELS.some(o => (micronutrienti[o.key] ?? 0) > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{aliment.nume}</Text>
              <Text style={styles.subtitle}>Detalii nutriționale{prefix}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Macronutrienți */}
            <SectionHeader icon={Zap} title="Macronutrienți" color="#38BDF8" />
            <View style={styles.card}>
              <NutrientRow label="Calorii" value={aliment.calorii} unit="kcal" color="#F1F5F9" />
              <NutrientRow label="Proteine" value={aliment.proteine} unit="g" color="#34D399" />
              <NutrientRow label="Carbohidrați" value={aliment.carbohidrati} unit="g" color="#FBBF24" />
              <NutrientRow label="Grăsimi" value={aliment.grasimi} unit="g" color="#F87171" />
              {(aliment.fibre ?? 0) > 0 && (
                <NutrientRow label="Fibre" value={aliment.fibre!} unit="g" color="#A78BFA" />
              )}
            </View>

            {/* Aminoacizi */}
            {hasAminoacizi && (
              <>
                <SectionHeader icon={Beaker} title="Aminoacizi Esențiali" color="#C084FC" />
                <View style={styles.card}>
                  {Object.entries(AMINO_LABELS).map(([key, label]) => {
                    const val = aminoacizi![key as keyof AminoaciziEsentiali];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit="mg" color="#D8B4FE" />;
                  })}
                  {/* Total BCAA */}
                  {((aminoacizi?.leucina ?? 0) + (aminoacizi?.izoleucina ?? 0) + (aminoacizi?.valina ?? 0)) > 0 && (
                    <View style={styles.bcaaRow}>
                      <Text style={styles.bcaaLabel}>Total BCAA</Text>
                      <Text style={styles.bcaaValue}>
                        {((aminoacizi?.leucina ?? 0) + (aminoacizi?.izoleucina ?? 0) + (aminoacizi?.valina ?? 0)).toFixed(0)} mg
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Vitamine */}
            {hasVitamins && (
              <>
                <SectionHeader icon={Pill} title="Vitamine" color="#34D399" />
                <View style={styles.card}>
                  {VITAMIN_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color="#6EE7B7" />;
                  })}
                </View>
              </>
            )}

            {/* Minerale */}
            {hasMinerals && (
              <>
                <SectionHeader icon={Droplets} title="Minerale" color="#F59E0B" />
                <View style={styles.card}>
                  {MINERAL_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color="#FCD34D" />;
                  })}
                </View>
              </>
            )}

            {/* Alte detalii */}
            {hasOther && (
              <>
                <SectionHeader icon={Zap} title="Alte Detalii" color="#94A3B8" />
                <View style={styles.card}>
                  {OTHER_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color="#CBD5E1" />;
                  })}
                </View>
              </>
            )}

            {/* Fallback: nicio informație suplimentară */}
            {!hasAminoacizi && !hasVitamins && !hasMinerals && !hasOther && (
              <View style={styles.emptyCard}>
                <Beaker size={32} color="#475569" />
                <Text style={styles.emptyText}>
                  Datele nutriționale detaliate (aminoacizi, vitamine, minerale) nu sunt disponibile pentru acest aliment.
                </Text>
                <Text style={styles.emptyHint}>
                  Scanează codul de bare al produsului pentru a obține informații complete din baza de date OpenFoodFacts.
                </Text>
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 2,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#33415550',
  },
  nutrientLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  nutrientValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bcaaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#C084FC30',
  },
  bcaaLabel: {
    fontSize: 13,
    color: '#C084FC',
    fontWeight: '800',
  },
  bcaaValue: {
    fontSize: 14,
    color: '#C084FC',
    fontWeight: '900',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
  },
});
