import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw, Image as ImageIcon, Home, WifiOff, Lock, Camera, ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

export type PhotoErrorType =
  | 'not_food'
  | 'network_error'
  | 'provider_error'
  | 'malformed_result'
  | 'permission_denied';

interface PhotoMealErrorViewProps {
  testID?: string;
  errorType: PhotoErrorType;
  customTitle?: string | null;
  customMessage?: string | null;
  onRetake: () => void;
  onGallery: () => void;
  onHome: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
}

export function PhotoMealErrorView({
  testID,
  errorType,
  customTitle,
  customMessage,
  onRetake,
  onGallery,
  onHome,
  onOpenSettings,
  onRetry,
}: PhotoMealErrorViewProps) {
  const { t } = useTranslation();

  const getErrorContent = () => {
    switch (errorType) {
      case 'not_food':
        return {
          icon: <AlertTriangle size={36} color="#CCFF00" />,
          title: customTitle || t('camera.notFoodTitle'),
          body: customMessage || t('camera.notFoodMessage'),
          primaryLabel: t('camera.retakePhoto'),
          primaryAction: onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'network_error':
        return {
          icon: <WifiOff size={36} color="#FB923C" />,
          title: customTitle || t('camera.networkErrorTitle'),
          body: customMessage || t('camera.networkErrorMessage'),
          primaryLabel: onRetry ? t('photoJob.retry') : t('camera.retrySafe'),
          primaryAction: onRetry || onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'provider_error':
        return {
          icon: <AlertTriangle size={36} color="#FB923C" />,
          title: customTitle || (testID === 'camera-failed-job' ? t('photoJob.failedTitle') : t('camera.providerErrorTitle')),
          body: customMessage || (testID === 'camera-failed-job' ? t('photoJob.failedBody') : t('camera.aiProviderErrorMessage')),
          primaryLabel: onRetry ? t('photoJob.retry') : t('camera.retrySafe'),
          primaryAction: onRetry || onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'permission_denied':
        return {
          icon: <Lock size={36} color="#CCFF00" />,
          title: customTitle || t('camera.permissionTitle'),
          body: customMessage || t('camera.permissionSubtitle'),
          primaryLabel: t('camera.openSettings'),
          primaryAction: onOpenSettings || onRetake,
          primaryIcon: <Camera size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'malformed_result':
      default:
        return {
          icon: <AlertTriangle size={36} color="#EF4444" />,
          title: customTitle || (testID === 'camera-failed-job' ? t('photoJob.failedTitle') : t('camera.malformedResultTitle')),
          body: customMessage || (testID === 'camera-failed-job' ? t('photoJob.failedBody') : t('camera.malformedResultMessage')),
          primaryLabel: onRetry ? t('photoJob.retry') : t('camera.scanAgain'),
          primaryAction: onRetry || onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
    }
  };

  const content = getErrorContent();

  return (
    <View
      style={styles.container}
      testID={testID || (errorType === 'not_food' ? 'camera-not-food-card' : 'photo-meal-error-view')}
    >
      <BlurView intensity={75} tint="dark" style={styles.blurCard}>
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.contentWrap}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>{content.icon}</View>

          <Text maxFontSizeMultiplier={1.3} style={styles.titleText}>
            {content.title}
          </Text>

          <Text maxFontSizeMultiplier={1.3} style={styles.bodyText}>
            {content.body}
          </Text>

          {errorType !== 'permission_denied' && (
            <View style={styles.refundBadge} testID="credit-refund-reassurance-badge">
              <ShieldCheck size={14} color="#CCFF00" />
              <Text maxFontSizeMultiplier={1.3} style={styles.refundBadgeText}>
                {t('camera.creditProtectedNotice')}
              </Text>
            </View>
          )}

          <View style={styles.actionsArea}>
            {/* 1. Primary Action */}
            <TouchableOpacity
              testID={testID === 'camera-failed-job' ? 'camera-failed-retry' : (errorType === 'not_food' ? 'not-food-retake-btn' : 'error-primary-btn')}
              onPress={content.primaryAction}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={content.primaryLabel}
            >
              <LinearGradient
                colors={['#CCFF00', '#A8FF3E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGrad}
              >
                {content.primaryIcon}
                <Text maxFontSizeMultiplier={1.3} style={styles.primaryBtnText}>{content.primaryLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 1b. Acțiune suplimentară „Refă fotografia” când onRetry este acțiunea primară */}
            {onRetry && onRetake && (
              <TouchableOpacity
                testID="camera-failed-retake"
                onPress={onRetake}
                style={styles.secondaryBtn}
                accessibilityRole="button"
                accessibilityLabel={t('camera.retakePhoto')}
              >
                <Camera size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text maxFontSizeMultiplier={1.3} style={styles.secondaryBtnText}>
                  {t('camera.retakePhoto')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 2. Secondary: Gallery */}
            {content.hasGallery && (
              <TouchableOpacity
                testID={errorType === 'not_food' ? 'not-food-gallery-btn' : 'error-gallery-btn'}
                onPress={onGallery}
                style={styles.secondaryBtn}
                accessibilityRole="button"
                accessibilityLabel={t('camera.chooseFromGallery')}
              >
                <ImageIcon size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text maxFontSizeMultiplier={1.3} style={styles.secondaryBtnText}>
                  {t('camera.chooseFromGallery')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 3. Ghost: Go to Home */}
            <TouchableOpacity
              testID={errorType === 'not_food' ? 'not-food-home-btn' : 'error-home-btn'}
              onPress={onHome}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel={t('camera.goToHome')}
            >
              <Home size={16} color="#CCFF00" style={{ marginRight: 6 }} />
              <Text maxFontSizeMultiplier={1.3} style={styles.ghostBtnText}>
                {t('camera.goToHome')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10000,
    elevation: 10,
  },
  blurCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 22, 26, 0.92)',
  },
  cardScroll: {
    width: '100%',
  },
  contentWrap: {
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(204, 255, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  bodyText: {
    color: '#8B93A0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  actionsArea: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryGrad: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostBtn: {
    minHeight: 44,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  ghostBtnText: {
    color: '#CCFF00',
    fontSize: 14,
    fontWeight: '700',
  },
  refundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(204, 255, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.25)',
    marginTop: 10,
    marginBottom: 4,
    alignSelf: 'center',
  },
  refundBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CCFF00',
  },
});
