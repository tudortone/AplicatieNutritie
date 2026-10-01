import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
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
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /**
   * REMED-006: conținut opțional randat între mesaj și butoane (cardul de
   * propunere + picker-ul explicit de categorie, compus în chat.tsx).
   */
  extra?: React.ReactNode;
  /**
   * REMED-006: permite dezactivarea confirmării când starea internă a extras-ului
   * nu e încă validă (ex. categorie nealeasă).
   */
  confirmDisabled?: boolean;
  /** Pictogramă opțională afișată în antetul foii (ex. Trash2, LogOut). */
  icon?: React.ReactNode;
  /** Culoare de fundal pentru cercul pictogramei. */
  iconBg?: string;
  /** Indică dacă acțiunea de confirmare este în curs de execuție. */
  loading?: boolean;
  /** Dispunerea butoanelor: vertical (standard) sau horizontal (side-by-side [Cancel] [Confirm]). */
  buttonLayout?: 'horizontal' | 'vertical';
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  extra,
  confirmDisabled = false,
  icon,
  iconBg,
  loading = false,
  buttonLayout = 'vertical',
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const actionColor = destructive ? colors.danger : colors.accent;
  const confirmText = confirmLabel ?? t('chat.confirmSheet.confirmDefault');
  const cancelText = cancelLabel ?? t('chat.confirmSheet.cancelDefault');
  const isHorizontal = buttonLayout === 'horizontal';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
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
          onPress={() => {
            if (!loading) onCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('chat.confirmSheet.a11yClose')}
        />
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : SlideInDown.springify().damping(20)}
          exiting={reduceMotion ? FadeOut.duration(100) : SlideOutDown.duration(180)}
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

            {icon ? (
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor:
                      iconBg || (destructive ? `${colors.danger}1A` : `${colors.accent}1A`),
                  },
                ]}
              >
                {icon}
              </View>
            ) : null}

            <Text
              style={[
                styles.title,
                { color: colors.textPrimary, textAlign: icon ? 'center' : 'left' },
              ]}
            >
              {title}
            </Text>
            {message ? (
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.message,
                  { color: colors.textSecondary, textAlign: icon ? 'center' : 'left' },
                ]}
              >
                {message}
              </Text>
            ) : null}
            {extra ? <View style={styles.extra}>{extra}</View> : null}

            {isHorizontal ? (
              <View style={styles.horizontalRow}>
                <Pressable
                  onPress={onCancel}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={cancelText}
                  style={({ pressed }) => [
                    styles.horizontalBtn,
                    styles.ghostButton,
                    { borderColor: colors.border, opacity: pressed ? 0.65 : (loading ? 0.45 : 1) },
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.ghostText, { color: colors.textPrimary }]}>
                    {cancelText}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onConfirm}
                  disabled={confirmDisabled || loading}
                  accessibilityRole="button"
                  accessibilityLabel={confirmText}
                  accessibilityState={{ disabled: confirmDisabled || loading }}
                  style={({ pressed }) => [
                    styles.horizontalBtn,
                    styles.button,
                    {
                      backgroundColor: confirmDisabled ? colors.disabledBg : actionColor,
                      opacity: pressed && !confirmDisabled && !loading ? 0.82 : 1,
                      marginBottom: 0,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={destructive ? colors.textOnDanger : colors.textOnAccent} />
                  ) : (
                    <Text
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                      style={[
                        styles.confirmText,
                        {
                          color: confirmDisabled
                            ? colors.disabledText
                            : (destructive ? colors.textOnDanger : colors.textOnAccent),
                        },
                      ]}
                    >
                      {confirmText}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={onConfirm}
                  disabled={confirmDisabled || loading}
                  accessibilityRole="button"
                  accessibilityLabel={confirmText}
                  accessibilityState={{ disabled: confirmDisabled || loading }}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: confirmDisabled ? colors.disabledBg : actionColor,
                      opacity: pressed && !confirmDisabled && !loading ? 0.82 : 1,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={destructive ? colors.textOnDanger : colors.textOnAccent} />
                  ) : (
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={[
                        styles.confirmText,
                        {
                          color: confirmDisabled
                            ? colors.disabledText
                            : (destructive ? colors.textOnDanger : colors.textOnAccent),
                        },
                      ]}
                    >
                      {confirmText}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={onCancel}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={cancelText}
                  style={({ pressed }) => [
                    styles.ghostButton,
                    { borderColor: colors.border, opacity: pressed ? 0.65 : (loading ? 0.45 : 1) },
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.ghostText, { color: colors.textPrimary }]}>
                    {cancelText}
                  </Text>
                </Pressable>
              </>
            )}
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
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
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
  horizontalRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  horizontalBtn: {
    flex: 1,
    marginBottom: 0,
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

export default ConfirmSheet;
