import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw, Image as ImageIcon, Home, WifiOff, Lock, Camera } from 'lucide-react-native';
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
          title: t('camera.notFoodTitle', 'Nu am identificat alimente în fotografie.'),
          body: customMessage || t('camera.notFoodMessage', 'Încearcă o fotografie cu mâncarea bine încadrată sau alege o imagine din galerie. Creditul tău este păstrat.'),
          primaryLabel: t('camera.retakePhoto', 'Refă fotografia'),
          primaryAction: onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'network_error':
        return {
          icon: <WifiOff size={36} color="#FB923C" />,
          title: 'Conexiunea a fost întreruptă',
          body: customMessage || 'Nu am putut comunica cu serverul de analiză. Verifică conexiunea la internet.',
          primaryLabel: 'Reîncearcă analiza',
          primaryAction: onRetry || onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'provider_error':
        return {
          icon: <AlertTriangle size={36} color="#FB923C" />,
          title: 'Modelul AI este temporar ocupat',
          body: customMessage || 'Analiza foto a durat prea mult sau modelul AI este suprasolicitat. Creditul tău Flow a fost restituit integral.',
          primaryLabel: 'Reîncearcă în siguranță',
          primaryAction: onRetry || onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'permission_denied':
        return {
          icon: <Lock size={36} color="#CCFF00" />,
          title: t('camera.permissionTitle', 'Permisiune Cameră Necesară'),
          body: customMessage || t('camera.permissionSubtitle', 'GetFlow are nevoie de acces la cameră pentru a analiza mâncarea din farfurie.'),
          primaryLabel: t('camera.openSettings', 'Deschide Setări'),
          primaryAction: onOpenSettings || onRetake,
          primaryIcon: <Camera size={18} color="#000000" />,
          hasGallery: true,
        };
      case 'malformed_result':
      default:
        return {
          icon: <AlertTriangle size={36} color="#EF4444" />,
          title: 'Nu am putut structura datele',
          body: customMessage || 'Imaginea nu a putut fi procesată în valori nutriționale sigure. Creditul tău nu a fost consumat.',
          primaryLabel: 'Scanează din nou',
          primaryAction: onRetake,
          primaryIcon: <RefreshCw size={18} color="#000000" />,
          hasGallery: true,
        };
    }
  };

  const content = getErrorContent();

  return (
    <View style={styles.container} testID={testID || (errorType === 'not_food' ? 'camera-not-food-card' : 'photo-meal-error-view')}>
      <BlurView intensity={75} tint="dark" style={styles.blurCard}>
        <View style={styles.contentWrap}>
          <View style={styles.iconCircle}>{content.icon}</View>

          <Text maxFontSizeMultiplier={1.3} style={styles.titleText}>
            {content.title}
          </Text>

          <Text maxFontSizeMultiplier={1.3} style={styles.bodyText}>
            {content.body}
          </Text>

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
                <Text style={styles.primaryBtnText}>{content.primaryLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 2. Secondary: Gallery */}
            {content.hasGallery && (
              <TouchableOpacity
                testID={errorType === 'not_food' ? 'not-food-gallery-btn' : 'error-gallery-btn'}
                onPress={onGallery}
                style={styles.secondaryBtn}
                accessibilityRole="button"
                accessibilityLabel={t('camera.chooseFromGallery', 'Alege din galerie')}
              >
                <ImageIcon size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryBtnText}>
                  {t('camera.chooseFromGallery', 'Alege din galerie')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 3. Ghost: Go to Home */}
            <TouchableOpacity
              testID={errorType === 'not_food' ? 'not-food-home-btn' : 'error-home-btn'}
              onPress={onHome}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel={t('camera.goToHome', 'Mergi la Acasă')}
            >
              <Home size={16} color="#CCFF00" style={{ marginRight: 6 }} />
              <Text style={styles.ghostBtnText}>
                {t('camera.goToHome', 'Mergi la Acasă')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    zIndex: 999,
  },
  blurCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 22, 26, 0.92)',
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
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryGrad: {
    flex: 1,
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
    height: 48,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  ghostBtnText: {
    color: '#CCFF00',
    fontSize: 14,
    fontWeight: '700',
  },
});
