import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import { FoodProduct } from './types';

interface ManualProductFormProps {
  initialBarcode?: string;
  initialName?: string;
  onSave: (product: FoodProduct, gramsConsumed: number) => void;
  onCancel?: () => void;
}

export function ManualProductForm({
  initialBarcode = '',
  initialName = '',
  onSave,
  onCancel,
}: ManualProductFormProps) {
  const { colors } = useTheme();
  const { session } = useAuth();

  const [nume, setNume] = useState(initialName);
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [cantitateGrameStr, setCantitateGrameStr] = useState('100');
  const [kcal100Str, setKcal100Str] = useState('');
  const [prot100Str, setProt100Str] = useState('');
  const [carb100Str, setCarb100Str] = useState('');
  const [fat100Str, setFat100Str] = useState('');
  const [fibre100Str, setFibre100Str] = useState('');
  const [zahar100Str, setZahar100Str] = useState('');
  const [sare100Str, setSare100Str] = useState('');
  const [portieLabel] = useState('');
  const [portieGrameStr] = useState('');
  const [salveazaInCatalog, setSalveazaInCatalog] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const parseNum = (str: string): number => {
    if (!str) return 0;
    const clean = str.replace(/,/g, '.').trim();
    const val = parseFloat(clean);
    return isNaN(val) || !isFinite(val) ? 0 : val;
  };

  const cantitateGrame = parseNum(cantitateGrameStr);
  const kcal100 = parseNum(kcal100Str);
  const prot100 = parseNum(prot100Str);
  const carb100 = parseNum(carb100Str);
  const fat100 = parseNum(fat100Str);

  const previewMacro = useMemo(() => {
    const factor = cantitateGrame / 100;
    return {
      kcal: Math.round(kcal100 * factor * 10) / 10,
      prot: Math.round(prot100 * factor * 10) / 10,
      carb: Math.round(carb100 * factor * 10) / 10,
      fat: Math.round(fat100 * factor * 10) / 10,
    };
  }, [cantitateGrame, kcal100, prot100, carb100, fat100]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!nume.trim()) {
      errs.nume = 'Numele produsului este obligatoriu.';
    }
    if (cantitateGrame <= 0) {
      errs.cantitate = 'Cantitatea trebuie să fie mai mare decât 0g.';
    }
    if (kcal100 < 0 || kcal100 > 1000) {
      errs.kcal = 'Caloriile per 100g trebuie să fie între 0 și 1000.';
    }
    if (prot100 < 0 || prot100 > 100) {
      errs.prot = 'Proteinele per 100g trebuie să fie între 0 și 100.';
    }
    if (carb100 < 0 || carb100 > 100) {
      errs.carb = 'Carbohidrații per 100g trebuie să fie între 0 și 100.';
    }
    if (fat100 < 0 || fat100 > 100) {
      errs.fat = 'Grăsimile per 100g trebuie să fie între 0 și 100.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);

    const product: FoodProduct = {
      id: `manual_${Date.now()}`,
      source: 'manual',
      name: nume.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      servingLabel: portieLabel.trim() || undefined,
      servingGrams: parseNum(portieGrameStr) || undefined,
      kcalPer100g: kcal100,
      proteinPer100g: prot100,
      carbsPer100g: carb100,
      fatPer100g: fat100,
      fiberPer100g: parseNum(fibre100Str) || undefined,
      sugarPer100g: parseNum(zahar100Str) || undefined,
      saltPer100g: parseNum(sare100Str) || undefined,
      verified: false,
    };

    if (salveazaInCatalog && session?.user?.id) {
      try {
        await supabase.from('produse_camara').insert({
          user_id: session.user.id,
          nume: product.name,
          brand: product.brand || null,
          barcode: product.barcode || null,
          calorii_100g: product.kcalPer100g,
          proteine_100g: product.proteinPer100g,
          carbohidrati_100g: product.carbsPer100g,
          grasimi_100g: product.fatPer100g,
          fibre_100g: product.fiberPer100g || 0,
          portie_label: product.servingLabel || null,
          portie_grame: product.servingGrams || null,
          source: 'manual',
        });
      } catch (err) {
        console.warn('Nu s-a putut salva produsul în catalogul personal:', err);
      }
    }

    setIsSaving(false);
    onSave(product, cantitateGrame);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Introducere Complet Manuală
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Completează valorile nutriționale fără nicio restricție.
        </Text>

        {/* Live Preview Card */}
        <View style={[styles.previewCard, { backgroundColor: colors.cardBg, borderColor: colors.accent + '40' }]}>
          <Text style={[styles.previewTitle, { color: colors.textSecondary }]}>
            PREVIZUALIZARE PENTRU {cantitateGrame || 0}g CONSUMATE
          </Text>
          <View style={styles.previewRow}>
            <View style={styles.previewItem}>
              <Text style={[styles.previewVal, { color: colors.accent }]}>{previewMacro.kcal}</Text>
              <Text style={[styles.previewLab, { color: colors.textSecondary }]}>kcal</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={[styles.previewVal, { color: colors.accentSecondary }]}>{previewMacro.prot}g</Text>
              <Text style={[styles.previewLab, { color: colors.textSecondary }]}>proteine</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={[styles.previewVal, { color: colors.accentTertiary }]}>{previewMacro.carb}g</Text>
              <Text style={[styles.previewLab, { color: colors.textSecondary }]}>carbs</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={[styles.previewVal, { color: colors.warning }]}>{previewMacro.fat}g</Text>
              <Text style={[styles.previewLab, { color: colors.textSecondary }]}>grăsimi</Text>
            </View>
          </View>
        </View>

        {/* Câmpuri Obligatorii */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Informații Principale *</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Nume Produs *</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: errors.nume ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
            placeholder="ex: Iaurt grecesc 10%"
            placeholderTextColor={colors.textSecondary + '77'}
            value={nume}
            onChangeText={(t) => {
              setNume(t);
              if (errors.nume) setErrors({ ...errors, nume: '' });
            }}
          />
          {errors.nume ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.nume}</Text> : null}
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Cantitate Consumată (g) *</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: errors.cantitate ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="100"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={cantitateGrameStr}
              onChangeText={(t) => {
                setCantitateGrameStr(t);
                if (errors.cantitate) setErrors({ ...errors, cantitate: '' });
              }}
            />
            {errors.cantitate ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.cantitate}</Text> : null}
          </View>

          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Calorii per 100g *</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: errors.kcal ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="ex: 125"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={kcal100Str}
              onChangeText={(t) => {
                setKcal100Str(t);
                if (errors.kcal) setErrors({ ...errors, kcal: '' });
              }}
            />
            {errors.kcal ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.kcal}</Text> : null}
          </View>
        </View>

        {/* Macronutrienți */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Macronutrienți per 100g</Text>
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Proteine (g)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: errors.prot ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={prot100Str}
              onChangeText={(t) => {
                setProt100Str(t);
                if (errors.prot) setErrors({ ...errors, prot: '' });
              }}
            />
            {errors.prot ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.prot}</Text> : null}
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Carbohidrați (g)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: errors.carb ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={carb100Str}
              onChangeText={(t) => {
                setCarb100Str(t);
                if (errors.carb) setErrors({ ...errors, carb: '' });
              }}
            />
            {errors.carb ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.carb}</Text> : null}
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Grăsimi (g)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: errors.fat ? colors.danger : colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={fat100Str}
              onChangeText={(t) => {
                setFat100Str(t);
                if (errors.fat) setErrors({ ...errors, fat: '' });
              }}
            />
            {errors.fat ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.fat}</Text> : null}
          </View>
        </View>

        {/* Detalii opționale */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Informații Opționale</Text>
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Brand</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="ex: Napolact"
              placeholderTextColor={colors.textSecondary + '77'}
              value={brand}
              onChangeText={setBrand}
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Cod de bare</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="Cod scanat"
              placeholderTextColor={colors.textSecondary + '77'}
              value={barcode}
              onChangeText={setBarcode}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Fibre per 100g (g)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={fibre100Str}
              onChangeText={setFibre100Str}
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Zahăr per 100g (g)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary + '77'}
              keyboardType="numeric"
              value={zahar100Str}
              onChangeText={setZahar100Str}
            />
          </View>
        </View>

        {/* Comutator Salvare pentru data viitoare */}
        <View style={[styles.switchCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>Salvează produsul pentru data viitoare</Text>
            <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
              Produsul va apărea automat în căutările tale viitoare.
            </Text>
          </View>
          <Switch
            value={salveazaInCatalog}
            onValueChange={setSalveazaInCatalog}
            trackColor={{ false: colors.cardBorder, true: colors.accent + '88' }}
            thumbColor={salveazaInCatalog ? colors.accent : colors.textSecondary}
          />
        </View>

        <View style={styles.actionRow}>
          {onCancel ? (
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: colors.cardBorder }]}
              onPress={onCancel}
            >
              <Text style={[styles.btnCancelText, { color: colors.textSecondary }]}>Anulează</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.btnSave, { backgroundColor: colors.accent, opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Plus size={18} color="#000" />
            <Text style={styles.btnSaveText}>{isSaving ? 'Se salvează...' : 'Adaugă Produsul'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  previewCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  previewTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-around' },
  previewItem: { alignItems: 'center' },
  previewVal: { fontSize: 18, fontWeight: '800' },
  previewLab: { fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  errorText: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 24,
  },
  switchTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  switchDesc: { fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: { fontSize: 14, fontWeight: '700' },
  btnSave: {
    flex: 2,
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSaveText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
