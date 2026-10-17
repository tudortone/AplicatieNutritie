import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface StepperQuantityControlProps {
  grams: number;
  onChangeGrams: (nextGrams: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function StepperQuantityControl({
  grams,
  onChangeGrams,
  step = 25,
  min = 1,
  max = 5000,
  disabled = false,
}: StepperQuantityControlProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState(String(grams));

  useEffect(() => {
    if (!isEditing) {
      setInputText(String(grams));
    }
  }, [grams, isEditing]);

  const handleDecrement = () => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const next = Math.max(min, grams - step);
    onChangeGrams(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const next = Math.min(max, grams + step);
    onChangeGrams(next);
  };

  const handleTextCommit = () => {
    setIsEditing(false);
    const parsed = parseInt(inputText.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed >= min) {
      const clamped = Math.min(max, parsed);
      onChangeGrams(clamped);
    } else {
      setInputText(String(grams));
    }
  };

  return (
    <View style={styles.container} testID="stepper-quantity-control">
      {/* Minus Button (48dp min touch area) */}
      <TouchableOpacity
        testID="stepper-minus-btn"
        onPress={handleDecrement}
        disabled={disabled || grams <= min}
        style={[
          styles.stepperBtn,
          (disabled || grams <= min) && styles.btnDisabled,
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Scade cantitatea cu 25 grame"
      >
        <Minus size={16} color={disabled || grams <= min ? '#475569' : '#FFFFFF'} />
      </TouchableOpacity>

      {/* Center Numeric Chip / Input */}
      {isEditing ? (
        <TextInput
          testID="stepper-gram-input"
          style={styles.numericInput}
          value={inputText}
          onChangeText={setInputText}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
          onBlur={handleTextCommit}
          onSubmitEditing={handleTextCommit}
          maxLength={4}
          returnKeyType="done"
        />
      ) : (
        <TouchableOpacity
          testID="stepper-gram-chip"
          onPress={() => !disabled && setIsEditing(true)}
          style={styles.gramChip}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Cantitate: ${grams} grame. Apasă pentru a edita valoarea numerică.`}
        >
          <Text style={styles.gramText}>{grams}</Text>
          <Text style={styles.unitText}>g</Text>
        </TouchableOpacity>
      )}

      {/* Plus Button (48dp min touch area) */}
      <TouchableOpacity
        testID="stepper-plus-btn"
        onPress={handleIncrement}
        disabled={disabled || grams >= max}
        style={[
          styles.stepperBtn,
          (disabled || grams >= max) && styles.btnDisabled,
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Crește cantitatea cu 25 grame"
      >
        <Plus size={16} color={disabled || grams >= max ? '#475569' : '#FFFFFF'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090C0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: 2,
    height: 48, // 48dp Android touch target
  },
  stepperBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  gramChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    minWidth: 54,
    height: 44,
  },
  gramText: {
    color: '#CCFF00',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    color: '#8B93A0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  numericInput: {
    color: '#CCFF00',
    fontSize: 16,
    fontWeight: '800',
    minWidth: 54,
    height: 44,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: '#CCFF00',
    fontVariant: ['tabular-nums'],
  },
});
