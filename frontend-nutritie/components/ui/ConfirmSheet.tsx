import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * REMED-006: conținut opțional randat între mesaj și butoane (cardul de
   * propunere + picker-ul explicit de categorie, compus în chat.tsx).
   */
  extra?: React.ReactNode;
  /**
   * REMED-006: blochează confirmarea până când utilizatorul a ales o categorie.
   * Default false => ceilalți apelanți nu sunt afectați.
   */
  confirmDisabled?: boolean;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  onCancel,
  extra,
  confirmDisabled = false,
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  // REMED-002: default-urile ConfirmSheet + a11y trec prin i18n (chei chat.*).
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const actionColor = destructive ? colors.danger : colors.accent;
  const confirmText = confirmLabel ?? t('chat.confirmSheet.confirmDefault');
  const cancelText = cancelLabel ?? t('chat.confirmSheet.cancelDefault');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
    >
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(150)}
        style={styles.backdrop}
        accessibilityViewIsModal
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('chat.confirmSheet.a11yClose')}
        />
        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          exiting={SlideOutDown.duration(180)}
          style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={[
              styles.sheet,
              {
                backgroundColor: `${colors.surface}F2`,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.grip, { backgroundColor: `${colors.textTertiary}55` }]} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            {message ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            ) : null}
            {extra ? <View style={styles.extra}>{extra}</View> : null}

            <Pressable
              onPress={onConfirm}
              disabled={confirmDisabled}
              accessibilityRole="button"
              accessibilityLabel={confirmText}
              accessibilityState={{ disabled: confirmDisabled }}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: confirmDisabled ? colors.disabledBg : actionColor,
                  opacity: pressed && !confirmDisabled ? 0.82 : 1,
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.confirmText,
                  { color: confirmDisabled ? colors.disabledText : (destructive ? colors.textOnDanger : colors.textOnAccent) },
                ]}
              >
                {confirmText}
              </Text>
            </Pressable>

            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelText}
              style={({ pressed }) => [
                styles.ghostButton,
                { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text maxFontSizeMultiplier={1.3} style={[styles.ghostText, { color: colors.textPrimary }]}>{cancelText}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 22,
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
    lineHeight: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  // REMED-006/007: zonă opțională (cardul propunerii + picker de categorie).
  extra: {
    marginBottom: 20,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '900',
  },
  ghostButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
