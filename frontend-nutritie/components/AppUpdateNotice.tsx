import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useOtaUpdate, usePlayDestination, useUpdatePolicy } from '../hooks/useAppUpdate';
import { useReducedMotion } from '../hooks/useReducedMotion';

const COPY = {
  ro: {
    title: 'Actualizare disponibilă',
    requiredTitle: 'Actualizare obligatorie',
    requiredBody: 'A apărut o versiune nouă GetFlow. Pentru a continua să folosești aplicația în siguranță și fără erori, actualizează acum din Google Play.',
    body: 'Verifică versiunea disponibilă pentru contul tău în Google Play. Aplicația rămâne accesibilă.',
    otaTitle: 'Actualizăm GetFlow…',
    otaBody: 'Descărcăm ultima versiune și repornim aplicația automat.',
    open: 'Actualizează în Google Play',
    openOptional: 'Deschide Google Play',
    recheck: 'Verifică din nou',
    checking: 'Se verifică…',
    close: 'Închide mesajul de actualizare',
    support: 'Contactează asistența',
    error: 'Google Play nu s-a deschis. Reîncearcă sau contactează asistența.',
  },
  en: {
    title: 'Update available',
    requiredTitle: 'Update required',
    requiredBody: 'A new version of GetFlow is available. Update now from Google Play to continue using the app safely without outdated bugs.',
    body: 'Check the version available to your account in Google Play. The app remains accessible.',
    otaTitle: 'Updating GetFlow…',
    otaBody: 'Downloading the latest update and restarting automatically.',
    open: 'Update on Google Play',
    openOptional: 'Open Google Play',
    recheck: 'Check again',
    checking: 'Checking…',
    close: 'Dismiss update notice',
    support: 'Contact support',
    error: 'Google Play could not open. Retry or contact support.',
  },
  fr: {
    title: 'Mise à jour disponible',
    requiredTitle: 'Mise à jour obligatoire',
    requiredBody: 'Une nouvelle version de GetFlow est disponible. Mettez à jour depuis Google Play pour continuer en toute sécurité.',
    body: 'Vérifiez la version disponible pour votre compte sur Google Play. L’application reste accessible.',
    otaTitle: 'Mise à jour de GetFlow…',
    otaBody: 'Téléchargement de la dernière mise à jour et redémarrage automatique.',
    open: 'Mettre à jour sur Google Play',
    openOptional: 'Ouvrir Google Play',
    recheck: 'Vérifier à nouveau',
    checking: 'Vérification…',
    close: 'Fermer le message de mise à jour',
    support: 'Contacter l’assistance',
    error: 'Google Play ne s’est pas ouvert. Réessayez ou contactez l’assistance.',
  },
  de: {
    title: 'Update verfügbar',
    requiredTitle: 'Update erforderlich',
    requiredBody: 'Eine neue GetFlow-Version ist verfügbar. Bitte aktualisiere über Google Play, um die App sicher weiter zu nutzen.',
    body: 'Prüfe die für dein Konto verfügbare Version bei Google Play. Die App bleibt zugänglich.',
    otaTitle: 'GetFlow wird aktualisiert…',
    otaBody: 'Das neueste Update wird geladen und die App startet automatisch neu.',
    open: 'Bei Google Play aktualisieren',
    openOptional: 'Google Play öffnen',
    recheck: 'Erneut prüfen',
    checking: 'Wird geprüft…',
    close: 'Update-Hinweis schließen',
    support: 'Support kontaktieren',
    error: 'Google Play konnte nicht geöffnet werden. Erneut versuchen oder Support kontaktieren.',
  },
};

export function AppUpdateNotice({ enabled }: { enabled: boolean }) {
  const { result, checking, recheck, dismiss } = useUpdatePolicy(enabled);
  const { otaUpdating } = useOtaUpdate(enabled);
  const { opening, failed, open } = usePlayDestination();
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const reducedMotion = useReducedMotion();

  const language = (i18n.resolvedLanguage || 'en').split('-')[0];
  const copy = COPY[language as keyof typeof COPY] || COPY.en;

  const isForced = Boolean(result?.needsForceUpdate || result?.requiresUpdate);
  const isBlocking = otaUpdating || (enabled && Boolean(result?.updateInfo) && isForced);

  useEffect(() => {
    if (!isBlocking) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isBlocking]);

  if (!enabled) return null;

  if (otaUpdating) {
    return (
      <View
        testID="ota-update-blocking-screen"
        accessibilityViewIsModal
        importantForAccessibility="yes"
        style={[
          styles.blockingOverlay,
          { backgroundColor: colors.background ?? '#090C0E', paddingTop: top + 24, paddingBottom: bottom + 24 },
        ]}
      >
        <View
          style={[
            styles.blockingCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: 'rgba(204, 255, 0, 0.28)',
            },
          ]}
        >
          <View style={[styles.brandBadge, { borderColor: colors.accent }]}>
            <Text style={[styles.brandLetter, { color: colors.accent }]}>G</Text>
          </View>
          {!reducedMotion ? <ActivityIndicator size="large" color={colors.accent} /> : null}
          <Text accessibilityRole="header" style={[styles.blockingTitle, { color: colors.textPrimary }]}>
            {copy.otaTitle}
          </Text>
          <Text style={[styles.blockingBody, { color: colors.textSecondary }]}>
            {copy.otaBody}
          </Text>
        </View>
      </View>
    );
  }

  if (!result?.updateInfo) return null;

  if (isForced) {
    const versionBadge = result.updateInfo.latestVersionName
      ? `v${result.updateInfo.latestVersionName} (${result.updateInfo.latestVersionCode})`
      : null;

    return (
      <View
        testID="force-update-blocking-screen"
        accessibilityViewIsModal
        importantForAccessibility="yes"
        style={[
          styles.blockingOverlay,
          { backgroundColor: colors.background ?? '#090C0E', paddingTop: top + 24, paddingBottom: bottom + 24 },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.blockingScroll}
          showsVerticalScrollIndicator={false}
          bounces={!reducedMotion}
        >
          <View
            style={[
              styles.blockingCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: 'rgba(204, 255, 0, 0.28)',
              },
            ]}
          >
            <View style={[styles.brandBadge, { borderColor: colors.accent }]}>
              <Text style={[styles.brandLetter, { color: colors.accent }]}>G</Text>
            </View>

            {versionBadge ? (
              <View style={[styles.versionPill, { borderColor: 'rgba(204, 255, 0, 0.3)' }]}>
                <Text style={[styles.versionPillText, { color: colors.accent }]}>{versionBadge}</Text>
              </View>
            ) : null}

            <Text accessibilityRole="header" style={[styles.blockingTitle, { color: colors.textPrimary }]}>
              {copy.requiredTitle}
            </Text>
            <Text style={[styles.blockingBody, { color: colors.textSecondary }]}>
              {copy.requiredBody}
            </Text>

            {failed ? (
              <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.textPrimary }]}>
                {copy.error}
              </Text>
            ) : null}

            <Pressable
              testID="force-update-play-btn"
              accessibilityRole="button"
              accessibilityState={{ disabled: opening, busy: opening }}
              disabled={opening}
              onPress={() => { void open(); }}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.accent, opacity: pressed || opening ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.primaryLabel, { color: colors.textOnAccent }]}>{copy.open}</Text>
            </Pressable>

            <Pressable
              testID="force-update-recheck-btn"
              accessibilityRole="button"
              accessibilityState={{ disabled: checking, busy: checking }}
              disabled={checking}
              onPress={recheck}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: 'rgba(255, 255, 255, 0.14)',
                  opacity: pressed || checking ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.secondaryLabel, { color: colors.textPrimary }]}>
                {checking ? copy.checking : copy.recheck}
              </Text>
            </Pressable>

            {failed ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => { void Linking.openURL('mailto:supportgetflow@gmail.com').catch(() => {}); }}
                style={styles.button}
              >
                <Text style={[styles.label, { color: colors.textSecondary }]}>{copy.support}</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.host, { top: top + 8 }]}>
      <ScrollView style={[styles.card, { backgroundColor: colors.surfaceElevated }]} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{copy.body}</Text>
        {failed ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.textPrimary }]}>{copy.error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: opening, busy: opening }} disabled={opening} onPress={() => { void open(); }} style={[styles.button, { backgroundColor: colors.accent }]}>
          <Text style={[styles.label, { color: colors.textOnAccent }]}>{copy.openOptional}</Text>
        </Pressable>
        {failed ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL('mailto:supportgetflow@gmail.com').catch(() => {}); }} style={styles.button}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{copy.support}</Text>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={dismiss} style={styles.button}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{copy.close}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 100, elevation: 10, maxHeight: '70%' },
  card: { borderRadius: 16 },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
  label: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  blockingScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  blockingCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  brandBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandLetter: {
    fontSize: 26,
    fontWeight: '800',
  },
  versionPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(204, 255, 0, 0.1)',
  },
  versionPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  blockingTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  blockingBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
