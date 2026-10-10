import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Mail } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { buildSupportMailto, SUPPORT_EMAIL } from '../../constants/support';

export function SupportEmailFooter() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const openMailComposer = async () => {
    try {
      await Linking.openURL(buildSupportMailto());
      // Opening the user's mail composer does not mean an email was sent.
    } catch {
      Alert.alert(t('profile.supportEmailLabel'), t('profile.supportEmailOpenFailed'));
    }
  };

  const copyEmail = async () => {
    try {
      const copiedToClipboard = await Clipboard.setStringAsync(SUPPORT_EMAIL);
      if (copiedToClipboard === false) throw new Error('clipboard unavailable');
      setCopied(true);
    } catch {
      setCopied(false);
      Alert.alert(t('profile.supportEmailLabel'), t('profile.supportEmailCopyFailed'));
    }
  };

  return (
    <View
      testID="profile-support-email-footer"
      style={[styles.container, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
    >
      <View style={styles.emailRow}>
        <View style={[styles.icon, { backgroundColor: `${colors.accent}1F` }]}>
          <Mail size={17} color={colors.accent} />
        </View>
        <View style={styles.emailContent}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.supportEmailLabel')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('profile.supportEmailOpenA11y')}
            onPress={openMailComposer}
            style={styles.addressButton}
            testID="support-email-open"
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.address, { color: colors.textPrimary }]}>
              {SUPPORT_EMAIL}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('profile.supportEmailCopyA11y')}
          onPress={() => { void copyEmail(); }}
          style={[styles.copyButton, { borderColor: colors.cardBorder }]}
          testID="support-email-copy"
        >
          <Copy size={16} color={colors.accent} />
          <Text style={[styles.copyText, { color: colors.accent }]}>
            {copied ? t('profile.supportEmailCopied') : t('profile.supportEmailCopy')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 8, marginBottom: 18 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emailContent: { flex: 1, minWidth: 0 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  addressButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  address: { fontSize: 14, fontWeight: '800', letterSpacing: 0.05 },
  copyButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 },
  copyText: { fontSize: 11, fontWeight: '800' },
});
