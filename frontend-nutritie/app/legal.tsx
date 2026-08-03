import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, AlertTriangle, FileText, Landmark, Mail, Building2, Scale } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

// ATENȚIE: acest ecran este un schelet — textele legale NU sunt revizuite juridic.
// Înainte de lansare trebuie completate denumirea operatorului, jurisdicția și
// contactul, apoi întregul conținut revizuit de un specialist.

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const placeholder = (text: string) => (
    <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>{text}</Text>
  );

  const section = (icon: React.ReactNode, title: string, children: React.ReactNode) => (
    <Animated.View entering={FadeInDown.duration(450).delay(80)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.cardIcon, { backgroundColor: colors.accent + '1F' }]}>{icon}</View>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </Animated.View>
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
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Înapoi"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceBg, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>Documente legale</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
      >
        {/* Avertisment roșu: documente nefinalizate */}
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={[styles.warningBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
        >
          <AlertTriangle size={22} color={colors.danger} />
          <View style={styles.warningBody}>
            <Text style={[styles.warningTitle, { color: colors.danger }]}>DOCUMENTE NEFINALIZATE</Text>
            <Text style={[styles.warningText, { color: colors.textSecondary }]}>
              Aceste texte sunt un schelet și nu au fost revizuite juridic. Datele operatorului, jurisdicția și
              conținutul complet trebuie adăugate și aprobate înainte de publicare. Nu distribuie aplicația cu acest
              ecran în forma actuală.
            </Text>
          </View>
        </Animated.View>

        {section(
          <Building2 size={18} color={colors.accent} />,
          'Operator / Denumirea persoanei juridice',
          placeholder('[De completat] Denumirea completă a operatorului, forma juridică și numărul de înregistrare.')
        )}

        {section(
          <Landmark size={18} color={colors.accent} />,
          'Jurisdicție',
          placeholder('[De completat] Sediul social, țara de înregistrare, limba aplicabilă și instanța competentă.')
        )}

        {section(
          <Mail size={18} color={colors.accent} />,
          'Contact',
          placeholder('[De completat] Adresa de e-mail și numărul de telefon ale operatorului pentru relații cu utilizatorii.')
        )}

        {section(
          <FileText size={18} color={colors.accent} />,
          'Termeni și Condiții de Utilizare',
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            [De completat] Condițiile de utilizare a aplicației, inclusiv limitarea răspunderii pentru informațiile
            furnizate, regulile privind abonamentele și drepturile de proprietate intelectuală. Textul provizoriu:
            utilizarea aplicației presupune acceptarea prezentelor condiții; conținutul are scop informativ și nu
            înlocuiește sfatul medical profesional.
          </Text>
        )}

        {section(
          <Scale size={18} color={colors.accent} />,
          'Politica de Confidențialitate',
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            [De completat] Modul în care colectăm, procesăm și stocăm datele personale (inclusiv datele de sănătate),
            temeiul legal al procesării, perioada de stocare și drepturile utilizatorilor conform reglementărilor
            aplicabile. Textul provizoriu: datele tale sunt folosite doar pentru funcționalitățile aplicației și nu
            sunt vândute terților.
          </Text>
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

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
  },
  warningBody: { flex: 1 },
  warningTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  warningText: { fontSize: 13, lineHeight: 19 },

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

  placeholderText: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  bodyText: { fontSize: 13, lineHeight: 20 },
});
