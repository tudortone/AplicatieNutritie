import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../context/ThemeContext';
import {
  ANPC_URL,
  MANAGE_SUBSCRIPTIONS_URL,
  openExternalUrlSafe,
  resolveLegalDocumentUrl,
  type LegalSectionContent,
} from '../../constants/legal';

interface LegalDocumentScreenProps {
  docType: 'terms' | 'privacy';
  title: string;
  sections: LegalSectionContent[];
  showSubscriptionShortcut?: boolean;
}

/**
 * Ecran intern comun pentru afișarea completă offline/fallback a documentelor legale.
 */
export function LegalDocumentScreen({
  docType,
  title,
  sections,
  showSubscriptionShortcut = false,
}: LegalDocumentScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const handleOpenWeb = () => {
    const url = resolveLegalDocumentUrl(docType);
    void openExternalUrlSafe(url, {
      title: t('legalScreen.docUnavailableTitle'),
      message: t('legalScreen.docUnavailableMsg', { nume: title }),
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/legal'))}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceBg, borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>

        <Pressable
          onPress={handleOpenWeb}
          accessibilityRole="button"
          accessibilityLabel={t('legalScreen.openWebA11y', 'Deschide documentul în browser')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceBg, borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <ExternalLink size={18} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 28 }]}
      >
        {sections.map((section) => (
          <View
            key={section.title}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
              <FileText size={16} color={colors.accent} />
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{section.title}</Text>
            </View>
            <View style={styles.cardBody}>
              {section.paragraphs.map((paragraph, idx) => (
                <Text key={`${section.title}-${idx}`} style={[styles.paragraph, { color: colors.textSecondary }]}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </View>
        ))}

        {showSubscriptionShortcut ? (
          <View style={styles.actionsWrap}>
            <Pressable
              onPress={() =>
                void openExternalUrlSafe(MANAGE_SUBSCRIPTIONS_URL, {
                  title: t('common.error'),
                  message: t('alerts.mesaje.conexiuneServerEsueaza'),
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: colors.accent, backgroundColor: `${colors.accent}14`, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: colors.accent }]}>
                {t('profile.manageSubscription')}
              </Text>
              <ExternalLink size={16} color={colors.accent} />
            </Pressable>

            <Pressable
              onPress={() =>
                void openExternalUrlSafe(ANPC_URL, {
                  title: t('common.error'),
                  message: t('alerts.mesaje.conexiuneServerEsueaza'),
                })
              }
              accessibilityRole="link"
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>
                {t('legalScreen.anpcLink', 'ANPC — Protecția Consumatorilor (anpc.ro)')}
              </Text>
              <ExternalLink size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  scroll: { paddingHorizontal: 18, paddingTop: 16 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  cardBody: { padding: 16, gap: 10 },
  paragraph: { fontSize: 14, lineHeight: 21 },
  actionsWrap: { gap: 10, marginTop: 4 },
  actionBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8 },
});
