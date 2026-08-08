import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { AlimentDetaliat } from '../../types';

interface EditAlimentModalProps {
  visible: boolean;
  aliment: AlimentDetaliat | null;
  onClose: () => void;
  onSave: (aliment: AlimentDetaliat) => void;
}

/** Parsează un string numeric (acceptă virgulă) și clamp ≥0. */
function parseNumar(text: string): number {
  const n = parseFloat(text.replace(/,/g, '.'));
  return isNaN(n) || !isFinite(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
}

export function EditAlimentModal({ visible, aliment, onClose, onSave }: EditAlimentModalProps) {
  const { colors } = useTheme();
  const [nume, setNume] = useState<string>('');
  const [grame, setGrame] = useState<string>('');
  const [kcal, setKcal] = useState<string>('');
  const [proteine, setProteine] = useState<string>('');
  const [carbohidrati, setCarbohidrati] = useState<string>('');
  const [grasimi, setGrasimi] = useState<string>('');

  // Sincronizare cu alimentul curent la fiecare deschidere.
  useEffect(() => {
    if (aliment) {
      setNume(aliment.nume || '');
      setGrame(aliment.grame != null ? String(aliment.grame) : '');
      setKcal(aliment.calorii != null ? String(aliment.calorii) : '');
      setProteine(aliment.proteine != null ? String(aliment.proteine) : '');
      setCarbohidrati(aliment.carbohidrati != null ? String(aliment.carbohidrati) : '');
      setGrasimi(aliment.grasimi != null ? String(aliment.grasimi) : '');
    }
  }, [aliment, visible]);

  if (!aliment) return null;

  const salveaza = () => {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Corectează alimentul</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Numele pentru {aliment.nume}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Nume</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
            value={nume}
            onChangeText={setNume}
            placeholder="ex: Piept de pui 200g"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Gramaj (g)</Text>
          <TextInput
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
              <TextInput
                style={[styles.input, { color: colors.accent, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                value={kcal}
                onChangeText={setKcal}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={styles.macroCol}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Proteine (g)</Text>
              <TextInput
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
              <Text style={[styles.label, { color: colors.textSecondary }]}>Carbs (g)</Text>
              <TextInput
                style={[styles.input, { color: colors.accentTertiary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                value={carbohidrati}
                onChangeText={setCarbohidrati}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={styles.macroCol}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Grăsimi (g)</Text>
              <TextInput
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
            <Check size={18} color="#000" />
            <Text style={styles.saveBtnText}>Salvează și recalculează totalurile</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});