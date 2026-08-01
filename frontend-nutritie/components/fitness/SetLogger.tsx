import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus, Check, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import * as Haptics from 'expo-haptics';
import type { SetExercitiu, SetType } from '../../hooks/useAntrenamente';

interface SetLoggerProps {
  initialSets?: SetExercitiu[];
  onChange: (sets: SetExercitiu[]) => void;
  onSetCompleted?: (setIndex: number) => void;
}

export function SetLogger({ initialSets = [], onChange, onSetCompleted }: SetLoggerProps) {
  const { colors } = useTheme();
  
  const [sets, setSets] = useState<SetExercitiu[]>(
    initialSets.length > 0 ? initialSets : [{ serie: 1, repetari: 10, greutate: 0, set_type: 'working', rpe: 8, completed: false }]
  );

  // Sincronizează cu prop-ul inițial când se schimbă (ex: editare antrenament existent)
  useEffect(() => {
    if (initialSets.length > 0) {
      setSets(initialSets);
    }
  }, [initialSets]);

  const notifyChange = (newSets: SetExercitiu[]) => {
    setSets(newSets);
    onChange(newSets);
  };

  const addSet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lastSet = sets[sets.length - 1];
    const newSet: SetExercitiu = {
      serie: sets.length + 1,
      repetari: lastSet?.repetari || 10,
      greutate: lastSet?.greutate || 0,
      set_type: 'working',
      rpe: lastSet?.rpe || 8,
      completed: false,
    };
    notifyChange([...sets, newSet]);
  };

  const removeSet = (index: number) => {
    if (sets.length <= 1) return; // nu permite ștergerea ultimului set
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newSets = sets.filter((_, i) => i !== index).map((s, i) => ({ ...s, serie: i + 1 }));
    notifyChange(newSets);
  };

  const updateSet = (index: number, field: keyof SetExercitiu, val: any) => {
    const newSets = [...sets];
    newSets[index] = { ...newSets[index], [field]: val };
    notifyChange(newSets);
  };

  const toggleComplete = (index: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newSets = [...sets];
    newSets[index].completed = !newSets[index].completed;
    notifyChange(newSets);
    if (newSets[index].completed && onSetCompleted) {
      onSetCompleted(index);
    }
  };

  const cycleSetType = (index: number) => {
    Haptics.selectionAsync();
    const current = sets[index].set_type || 'working';
    const flow: SetType[] = ['warmup', 'working', 'dropset', 'failure'];
    const nextIdx = (flow.indexOf(current) + 1) % flow.length;
    updateSet(index, 'set_type', flow[nextIdx]);
  };

  const getTypeColor = (type?: SetType) => {
    switch (type) {
      case 'warmup': return '#F59E0B';
      case 'dropset': return '#8B5CF6';
      case 'failure': return '#EF4444';
      case 'working':
      default: return colors.accent;
    }
  };

  // Helper: adaugă opacitate la o culoare hex (sigur, fără concatenare fragilă)
  const withAlpha = (hex: string, alpha: number) => {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return hex + a;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCol, styles.colSet, { color: colors.textSecondary }]}>SET</Text>
        <Text style={[styles.headerCol, styles.colMain, { color: colors.textSecondary }]}>KG</Text>
        <Text style={[styles.headerCol, styles.colMain, { color: colors.textSecondary }]}>REP</Text>
        <Text style={[styles.headerCol, styles.colExtra, { color: colors.textSecondary }]}>RPE</Text>
        <Text style={[styles.headerCol, styles.colAction, { color: colors.textSecondary }]}></Text>
      </View>

      {sets.map((set, idx) => (
        <View key={idx} style={[styles.setRow, set.completed && { opacity: 0.6 }]}>
          <TouchableOpacity 
            style={[styles.colSet, styles.setBtn, { backgroundColor: withAlpha(getTypeColor(set.set_type), 0.13), borderColor: getTypeColor(set.set_type) }]}
            onPress={() => cycleSetType(idx)}
          >
            <Text style={[styles.setBtnText, { color: getTypeColor(set.set_type) }]}>
              {set.set_type === 'warmup' ? 'W' : set.set_type === 'dropset' ? 'D' : set.set_type === 'failure' ? 'F' : set.serie}
            </Text>
          </TouchableOpacity>

          <View style={[styles.colMain, styles.stepperWrap, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => updateSet(idx, 'greutate', Math.round(Math.max(0, (set.greutate || 0) - 2.5) * 10) / 10)} style={styles.stepBtn} hitSlop={8}>
              <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: colors.textPrimary }]}>{set.greutate}</Text>
            <TouchableOpacity onPress={() => updateSet(idx, 'greutate', Math.round(((set.greutate || 0) + 2.5) * 10) / 10)} style={styles.stepBtn} hitSlop={8}>
              <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.colMain, styles.stepperWrap, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => updateSet(idx, 'repetari', Math.max(0, set.repetari - 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: colors.textPrimary }]}>{set.repetari}</Text>
            <TouchableOpacity onPress={() => updateSet(idx, 'repetari', Math.min(999, set.repetari + 1))} style={styles.stepBtn} hitSlop={8}>
              <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.colExtra, styles.rpeWrap, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => updateSet(idx, 'rpe', Math.min(10, (set.rpe || 8) + 1))}>
              <Text style={[styles.rpeArrow, { color: colors.textTertiary }]}>▲</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: colors.warning }]}>{set.rpe || 8}</Text>
            <TouchableOpacity onPress={() => updateSet(idx, 'rpe', Math.max(1, (set.rpe || 8) - 1))}>
              <Text style={[styles.rpeArrow, { color: colors.textTertiary }]}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.colAction, styles.actionsWrap]}>
            {!set.completed ? (
              <TouchableOpacity onPress={() => toggleComplete(idx)} style={[styles.actionBtn, { backgroundColor: withAlpha(colors.accent, 0.13) }]}>
                <Check size={18} color={colors.accent} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => toggleComplete(idx)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                <Check size={18} color={colors.background} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => removeSet(idx)} style={{ padding: 4 }}>
              <Trash2 size={16} color={colors.danger} opacity={0.7} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity style={[styles.addSetBtn, { borderColor: colors.border }]} onPress={addSet}>
        <Plus size={18} color={colors.textSecondary} />
        <Text style={[styles.addSetText, { color: colors.textSecondary }]}>Adauga Set</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  headerRow: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 8 },
  headerCol: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  colSet: { width: 36 },
  colMain: { flex: 1, marginHorizontal: 4 },
  colExtra: { width: 40, marginHorizontal: 4 },
  colAction: { width: 60, alignItems: 'flex-end' },
  
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  setBtn: { height: 36, borderRadius: 8, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  setBtnText: { fontSize: 13, fontWeight: '900' },
  
  stepperWrap: { flexDirection: 'row', height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  stepBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '600' },
  stepVal: { fontSize: 15, fontWeight: '800' },

  rpeWrap: { height: 36, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  rpeArrow: { fontSize: 8, fontWeight: '700', lineHeight: 10 },

  actionsWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  actionBtn: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  
  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderRadius: 18, borderStyle: 'dashed', marginTop: 10, gap: 6 },
  addSetText: { fontSize: 14, fontWeight: '700' },
});
