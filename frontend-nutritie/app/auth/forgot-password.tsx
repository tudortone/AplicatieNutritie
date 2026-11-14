import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react-native';
import KeyboardAwareScreen from '../../components/ui/KeyboardAwareScreen';
import { PressableScale } from '../../components/ui/PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { OAUTH_REDIRECT_URI } from '../../lib/oauthFlow';
import {
  forgotPasswordErrorKey,
  verifyRecoveryOtpErrorKey,
} from '../../lib/passwordRecoveryErrors';
import { supabase } from '../../supabase';

type Step = 'request' | 'verify';

const COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolvePrefillEmail(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.toLowerCase() === 'admin') return '';
  return value;
}

function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; reason?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const { isOffline } = useNetworkStatus();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState<string>(() => resolvePrefillEmail(params.email));
  const [submittedEmail, setSubmittedEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showExpiredBanner, setShowExpiredBanner] = useState<boolean>(
    () => params.reason === 'link_expired',
  );

  const isCoolingDown = cooldown > 0;
  useEffect(() => {
    if (!isCoolingDown) return;
    const intervalId = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [isCoolingDown]);

  const cardMaxWidth = Math.min(contentMaxWidth, 440);
  const onAccentColor = colors.textOnAccent ?? colors.background;

  const triggerErrorHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const triggerSuccessHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/auth');
    }
  }, [router]);

  const handleSendCode = useCallback(async () => {
    if (sending || isOffline) return;

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      triggerErrorHaptic();
      setErrorMsg(t('authForgotPassword.errorInvalidEmail'));
      return;
    }

    setSending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${OAUTH_REDIRECT_URI}?flow=recovery`,
      });
      if (error) {
        triggerErrorHaptic();
        setErrorMsg(t(forgotPasswordErrorKey(error)));
        return;
      }

      triggerSuccessHaptic();
      setSubmittedEmail(normalized);
      setOtpCode('');
      setShowExpiredBanner(false);
      setStep('verify');
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      triggerErrorHaptic();
      setErrorMsg(t('authForgotPassword.errorRequestFailed'));
    } finally {
      setSending(false);
    }
  }, [email, isOffline, sending, t, triggerErrorHaptic, triggerSuccessHaptic]);

  const handleResendCode = useCallback(async () => {
    if (resending || sending || cooldown > 0 || isOffline || !submittedEmail) return;

    setResending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: `${OAUTH_REDIRECT_URI}?flow=recovery`,
      });
      if (error) {
        triggerErrorHaptic();
        setErrorMsg(t(forgotPasswordErrorKey(error)));
        return;
      }

      triggerSuccessHaptic();
      setOtpCode('');
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      triggerErrorHaptic();
      setErrorMsg(t('authForgotPassword.errorRequestFailed'));
    } finally {
      setResending(false);
    }
  }, [
    cooldown,
    isOffline,
    resending,
    sending,
    submittedEmail,
    t,
    triggerErrorHaptic,
    triggerSuccessHaptic,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (verifying || isOffline || otpCode.length < 6 || otpCode.length > 8 || !submittedEmail) return;

    setVerifying(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: submittedEmail,
        token: otpCode,
        type: 'recovery',
      });
      if (error || !data?.session) {
        triggerErrorHaptic();
        setErrorMsg(t(verifyRecoveryOtpErrorKey(error)));
        return;
      }

      triggerSuccessHaptic();
      router.replace('/auth/noua-parola');
    } catch {
      triggerErrorHaptic();
      setErrorMsg(t('authForgotPassword.errorInvalidOrExpiredCode'));
    } finally {
      setVerifying(false);
    }
  }, [
    isOffline,
    otpCode,
    router,
    submittedEmail,
    t,
    triggerErrorHaptic,
    triggerSuccessHaptic,
    verifying,
  ]);

  const handleSwitchEmail = useCallback(() => {
    setErrorMsg(null);
    setOtpCode('');
    setStep('request');
  }, []);

  const canSend = !sending && !isOffline;
  const canVerify = !verifying && !isOffline && otpCode.length >= 6 && otpCode.length <= 8;
  const canResend = !resending && !sending && !isOffline && cooldown === 0;

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.surfaceElevated, colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.topBar, { maxWidth: cardMaxWidth }]}>
          <TouchableOpacity
            testID="forgot-back-btn"
            style={[styles.backIconBtn, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('authForgotPassword.backBtnA11y')}
          >
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View
            style={[
              styles.stepBadge,
              { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.stepBadgeText, { color: colors.accent }]} maxFontSizeMultiplier={1.2}>
              {step === 'request'
                ? t('authForgotPassword.step1Badge')
                : t('authForgotPassword.step2Badge')}
            </Text>
          </View>
        </View>

        <View style={styles.headerSection}>
          <LinearGradient
            colors={colors.accentGradient}
            style={styles.iconGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {step === 'request' ? (
              <KeyRound size={34} color={onAccentColor} />
            ) : (
              <ShieldCheck size={34} color={onAccentColor} />
            )}
          </LinearGradient>
        </View>

        <View
          style={[
            styles.formCard,
            { maxWidth: cardMaxWidth, borderColor: colors.cardBorder },
          ]}
        >
          <LinearGradient colors={[colors.surface, colors.surfaceElevated]} style={styles.formGrad}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
              {t('authForgotPassword.title')}
            </Text>
            <Text style={[styles.formSubtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.35}>
              {step === 'request'
                ? t('authForgotPassword.subtitleStep1')
                : t('authForgotPassword.subtitleStep2')}
            </Text>

            {isOffline && (
              <View
                testID="forgot-offline-banner"
                style={[
                  styles.statusBanner,
                  { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                ]}
              >
                <WifiOff size={16} color={colors.warning} />
                <Text style={[styles.statusText, { color: colors.warning }]} maxFontSizeMultiplier={1.3}>
                  {t('authForgotPassword.offlineBanner')}
                </Text>
              </View>
            )}

            {step === 'request' && showExpiredBanner && (
              <View
                testID="forgot-link-expired-banner"
                style={[
                  styles.statusBanner,
                  { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                ]}
              >
                <AlertCircle size={16} color={colors.warning} />
                <Text style={[styles.statusText, { color: colors.warning }]} maxFontSizeMultiplier={1.3}>
                  {t('authForgotPassword.linkExpiredBanner')}
                </Text>
              </View>
            )}

            {step === 'verify' && (
              <View
                style={[
                  styles.noticeBox,
                  { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder },
                ]}
              >
                <CheckCircle2 size={16} color={colors.accent} style={styles.noticeIcon} />
                <Text
                  testID="forgot-step2-notice"
                  style={[styles.noticeText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={1.35}
                >
                  {t('authForgotPassword.step2Notice', { email: submittedEmail })}
                </Text>
              </View>
            )}

            {step === 'request' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('authForgotPassword.emailLabel')}
                </Text>
                <View
                  style={[
                    styles.inputWrap,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                  ]}
                >
                  <Mail size={20} color={colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    testID="forgot-email-input"
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder={t('authForgotPassword.emailPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={handleSendCode}
                    editable={!sending}
                    accessibilityLabel={t('authForgotPassword.emailLabel')}
                  />
                  {email.length > 0 && (
                    <TouchableOpacity
                      testID="forgot-clear-email"
                      style={styles.clearBtn}
                      onPress={() => {
                        setEmail('');
                        setErrorMsg(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('authForgotPassword.clearEmailA11y')}
                    >
                      <X size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {errorMsg && (
                  <View
                    testID="forgot-error-banner"
                    style={[
                      styles.statusBanner,
                      { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                    ]}
                  >
                    <AlertCircle size={16} color={colors.danger} />
                    <Text style={[styles.statusText, { color: colors.danger }]} maxFontSizeMultiplier={1.3}>
                      {errorMsg}
                    </Text>
                  </View>
                )}

                <PressableScale
                  testID="forgot-send-btn"
                  style={[
                    styles.primaryBtn,
                    !canSend && { shadowOpacity: 0, elevation: 0 },
                  ]}
                  onPress={handleSendCode}
                  disabled={!canSend}
                  haptic
                  hapticStyle="medium"
                  accessibilityRole="button"
                  accessibilityLabel={
                    sending
                      ? t('authForgotPassword.sendingBtn')
                      : t('authForgotPassword.sendCodeBtn')
                  }
                >
                  <LinearGradient
                    colors={
                      canSend
                        ? colors.accentGradient
                        : [colors.disabledBg, colors.disabledBg]
                    }
                    style={styles.primaryGrad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text
                      style={[
                        styles.primaryText,
                        { color: canSend ? onAccentColor : colors.disabledText },
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {sending
                        ? t('authForgotPassword.sendingBtn')
                        : t('authForgotPassword.sendCodeBtn')}
                    </Text>
                    <ArrowRight size={20} color={canSend ? onAccentColor : colors.disabledText} />
                  </LinearGradient>
                </PressableScale>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('authForgotPassword.otpLabel')}
                </Text>
                <View
                  style={[
                    styles.inputWrap,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                  ]}
                >
                  <ShieldCheck size={20} color={colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    testID="forgot-otp-input"
                    style={[styles.input, styles.otpInput, { color: colors.textPrimary }]}
                    placeholder={t('authForgotPassword.otpPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    value={otpCode}
                    onChangeText={(text) => {
                      setOtpCode(normalizeOtpCode(text));
                      if (errorMsg) setErrorMsg(null);
                    }}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={16}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyCode}
                    editable={!verifying}
                    accessibilityLabel={t('authForgotPassword.otpLabel')}
                  />
                  {otpCode.length > 0 && (
                    <TouchableOpacity
                      testID="forgot-clear-otp"
                      style={styles.clearBtn}
                      onPress={() => {
                        setOtpCode('');
                        setErrorMsg(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('authForgotPassword.clearOtpA11y')}
                    >
                      <X size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {errorMsg && (
                  <View
                    testID="forgot-error-banner"
                    style={[
                      styles.statusBanner,
                      { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                    ]}
                  >
                    <AlertCircle size={16} color={colors.danger} />
                    <Text style={[styles.statusText, { color: colors.danger }]} maxFontSizeMultiplier={1.3}>
                      {errorMsg}
                    </Text>
                  </View>
                )}

                <PressableScale
                  testID="forgot-verify-btn"
                  style={[
                    styles.primaryBtn,
                    !canVerify && { shadowOpacity: 0, elevation: 0 },
                  ]}
                  onPress={handleVerifyCode}
                  disabled={!canVerify}
                  haptic
                  hapticStyle="medium"
                  accessibilityRole="button"
                  accessibilityLabel={
                    verifying
                      ? t('authForgotPassword.verifyingBtn')
                      : t('authForgotPassword.verifyCodeBtn')
                  }
                >
                  <LinearGradient
                    colors={
                      canVerify
                        ? colors.accentGradient
                        : [colors.disabledBg, colors.disabledBg]
                    }
                    style={styles.primaryGrad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text
                      style={[
                        styles.primaryText,
                        { color: canVerify ? onAccentColor : colors.disabledText },
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {verifying
                        ? t('authForgotPassword.verifyingBtn')
                        : t('authForgotPassword.verifyCodeBtn')}
                    </Text>
                    <ArrowRight size={20} color={canVerify ? onAccentColor : colors.disabledText} />
                  </LinearGradient>
                </PressableScale>

                <PressableScale
                  testID="forgot-resend-btn"
                  style={[
                    styles.secondaryBtn,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.cardBorder,
                      opacity: canResend ? 1 : 0.6,
                    },
                  ]}
                  onPress={handleResendCode}
                  disabled={!canResend}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={
                    cooldown > 0
                      ? t('authForgotPassword.resendCountdown', { seconds: cooldown })
                      : t('authForgotPassword.resendBtn')
                  }
                >
                  <RefreshCw size={16} color={canResend ? colors.accent : colors.textSecondary} />
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      { color: canResend ? colors.textPrimary : colors.textSecondary },
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {cooldown > 0
                      ? t('authForgotPassword.resendCountdown', { seconds: cooldown })
                      : t('authForgotPassword.resendBtn')}
                  </Text>
                </PressableScale>

                <TouchableOpacity
                  testID="forgot-change-email-btn"
                  style={styles.linkBtn}
                  onPress={handleSwitchEmail}
                  accessibilityRole="button"
                  accessibilityLabel={t('authForgotPassword.changeEmailBtn')}
                >
                  <Text style={[styles.linkText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                    {t('authForgotPassword.changeEmailBtn')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </LinearGradient>
        </View>
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 40,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconGrad: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCard: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
  },
  formGrad: {
    padding: 24,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 20,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 18,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    paddingLeft: 16,
    paddingRight: 6,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  otpInput: {
    letterSpacing: 4,
    fontSize: 20,
    fontWeight: '700',
  },
  clearBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryGrad: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

