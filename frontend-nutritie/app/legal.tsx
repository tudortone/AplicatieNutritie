import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, FileText, Landmark, Mail, Building2, Scale, Calendar, ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { getLegalUrls } from '../lib/legalUrls';

// ATENȚIE: conținutul juridic este informativ și principalul document obligatoriu
// (Termenii și Politica de Confidențialitate) se deschide extern din documentele
// legale oficiale configurate prin EXPO_PUBLIC_TERMS_OF_SERVICE_URL /
// EXPO_PUBLIC_PRIVACY_POLICY_URL.

// Operator și suport: configurabile prin variabile de mediu fără date fabricate.
const OPERATOR_NAME = process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME?.trim() || null;
const EMAIL_SUPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'supportgetflow@gmail.com';

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const section = (icon: React.ReactNode, title: string, children: React.ReactNode, delay = 80) => (
    <Animated.View entering={FadeInDown.duration(450).delay(delay)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.cardIcon, { backgroundColor: colors.accent + '1F' }]}>{icon}</View>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </Animated.View>
  );

  const deschideDocument = async (tip: 'terms' | 'privacy', nume: string) => {
    try {
      const { termsUrl, privacyUrl } = getLegalUrls();
      const url = tip === 'terms' ? termsUrl : privacyUrl;
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        t('legalScreen.docUnavailableTitle'),
        t('legalScreen.docUnavailableMsg', { nume })
      );
    }
  };

  const actiuneDocument = (icon: React.ReactNode, titlu: string, subtitlu: string, urlKey: 'terms' | 'privacy') => (
    <Pressable
      style={({ pressed }) => [styles.actionRow, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
      onPress={() => deschideDocument(urlKey, titlu)}
      accessibilityRole="button"
      accessibilityLabel={titlu}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.accent + '1F' }]}>{icon}</View>
      <View style={styles.actionBody}>
        <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>{titlu}</Text>
        <Text style={[styles.actionSub, { color: colors.textSecondary }]}>{subtitlu}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />

      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 20),
            borderBottomColor: colors.border,
            backgroundColor: `${colors.surface}E8`,
          },
        ]}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceBg, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{t('legalScreen.title')}</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
      >
        {actiuneDocument(
          <FileText size={18} color={colors.accent} />,
          t('legalScreen.termsTitle'),
          t('legalScreen.termsSubtitle'),
          'terms'
        )}

        {actiuneDocument(
          <Scale size={18} color={colors.accent} />,
          t('legalScreen.privacyTitle'),
          t('legalScreen.privacySubtitle'),
          'privacy'
        )}

        {section(
          <Building2 size={18} color={colors.accent} />,
          t('legalScreen.operatorTitle'),
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {OPERATOR_NAME
              ? t('legalScreen.operatorTextWithOperator', { operator: OPERATOR_NAME, defaultValue: `${OPERATOR_NAME}, operatorul aplicației, este responsabil de prelucrarea datelor personale.` })
              : t('legalScreen.operatorText')}
          </Text>,
          120
        )}

        {section(
          <Landmark size={18} color={colors.accent} />,
          t('legalScreen.jurisdictionTitle'),
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {t('legalScreen.jurisdictionText')}
          </Text>,
          160
        )}

        {section(
          <Mail size={18} color={colors.accent} />,
          t('legalScreen.contactTitle'),
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {t('legalScreen.contactText', { email: EMAIL_SUPORT })}
          </Text>,
          200
        )}

        {section(
          <Calendar size={18} color={colors.accent} />,
          t('legalScreen.effectiveDateTitle'),
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {t('legalScreen.effectiveDateText')}
          </Text>,
          240
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 40 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '800' },
  actionSub: { fontSize: 12, marginTop: 2 },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  cardBody: { padding: 16 },

  bodyText: { fontSize: 14, lineHeight: 21 },
});
