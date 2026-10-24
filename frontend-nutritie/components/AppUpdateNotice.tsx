import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { usePlayDestination, useUpdatePolicy } from '../hooks/useAppUpdate';

const COPY = {
  ro: { title:'Actualizare disponibilă', required:'Actualizare recomandată pentru a continua în siguranță', body:'Verifică versiunea disponibilă pentru contul tău în Google Play. Aplicația rămâne accesibilă.', open:'Deschide Google Play', close:'Închide mesajul de actualizare', support:'Contactează asistența', error:'Google Play nu s-a deschis. Reîncearcă sau contactează asistența.' },
  en: { title:'Update available', required:'Update recommended to continue safely', body:'Check the version available to your account in Google Play. The app remains accessible.', open:'Open Google Play', close:'Dismiss update notice', support:'Contact support', error:'Google Play could not open. Retry or contact support.' },
  fr: { title:'Mise à jour disponible', required:'Mise à jour recommandée pour continuer en sécurité', body:'Vérifiez la version disponible pour votre compte sur Google Play. L’application reste accessible.', open:'Ouvrir Google Play', close:'Fermer le message de mise à jour', support:'Contacter l’assistance', error:'Google Play ne s’est pas ouvert. Réessayez ou contactez l’assistance.' },
  de: { title:'Update verfügbar', required:'Update für eine sichere Nutzung empfohlen', body:'Prüfe die für dein Konto verfügbare Version bei Google Play. Die App bleibt zugänglich.', open:'Google Play öffnen', close:'Update-Hinweis schließen', support:'Support kontaktieren', error:'Google Play konnte nicht geöffnet werden. Erneut versuchen oder Support kontaktieren.' },
};

export function AppUpdateNotice({ enabled }: { enabled: boolean }) {
  const { result, dismiss } = useUpdatePolicy(enabled);
  const { opening, failed, open } = usePlayDestination();
  const { colors } = useTheme();
  const { top } = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || 'en').split('-')[0];
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  if (!enabled || !result?.updateInfo) return null;
  return <View style={[styles.host, { top: top + 8 }]}>
    <ScrollView style={[styles.card, { backgroundColor: colors.surfaceElevated }]} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{result.requiresUpdate ? copy.required : copy.title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{copy.body}</Text>
      {failed ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.textPrimary }]}>{copy.error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: opening, busy: opening }} disabled={opening} onPress={() => { void open(); }} style={[styles.button, { backgroundColor: colors.accent }]}>
        <Text style={[styles.label, { color: colors.textOnAccent }]}>{copy.open}</Text>
      </Pressable>
      {failed ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL('mailto:supportgetflow@gmail.com').catch(() => {}); }} style={styles.button}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{copy.support}</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={dismiss} style={styles.button}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{copy.close}</Text>
      </Pressable>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  host: { position:'absolute', left:16, right:16, zIndex:100, elevation:10, maxHeight:'70%' },
  card: { borderRadius:16 }, content: { padding:16, gap:8 },
  title: { fontSize:18, fontWeight:'700' }, body: { fontSize:16, lineHeight:23 },
  button: { minHeight:48, justifyContent:'center', alignItems:'center', paddingHorizontal:12, paddingVertical:12, borderRadius:12 },
  label: { fontSize:16, fontWeight:'600', textAlign:'center' },
});
