/**
 * ConfirmSheet.tsx — Modal de confirmare in-app (înlocuiește Alert.alert nativ)
 * Conform specificației NutriAI v6 (Secțiunea 5.1)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Șterge',
  cancelLabel = 'Anulează',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  const danger = '#FF3B5C';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.duration(180)}
          style={styles.sheetWrap}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={[styles.sheet, { borderColor: colors.border || '#334155' }]}
          >
            <View
              style={[
                styles.grip,
                { backgroundColor: (colors.textTertiary || '#64748B') + '55' },
              ]}
            />
            <Text style={[styles.title, { color: colors.textPrimary || '#FFF' }]}>
              {title}
            </Text>
            {!!message && (
              <Text style={[styles.msg, { color: colors.textSecondary || '#94A3B8' }]}>
                {message}
              </Text>
            )}
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: destructive ? danger : colors.accent,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={styles.btnConfirmText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.btnGhost,
                {
                  borderColor: colors.border || '#334155',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.btnGhostText,
                  { color: colors.textPrimary || '#FFF' },
                ]}
              >
                {cancelLabel}
              </Text>
            </Pressable>
          </BlurView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    padding: 12,
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22,
  },
  grip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 8,
  },
  msg: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  btn: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  btnGhost: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
