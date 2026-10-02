import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { WorkoutV2Experience } from '../components/workout-v2/WorkoutV2Experience';
import {
  AnatomyV2VisualQA,
  type AnatomyV2QaScenario,
} from '../components/workout-v2/AnatomyV2VisualQA';
import { useTheme } from '../context/ThemeContext';
import { isWorkoutV2PreviewEnabled } from '../lib/workout-v2/featureFlag';

const PREVIEW_ENABLED = isWorkoutV2PreviewEnabled(
  process.env.EXPO_PUBLIC_ENABLE_WORKOUT_V2_PREVIEW,
  __DEV__,
);

export default function WorkoutV2PreviewScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ qa?: string; view?: string }>();
  const qaScenario = typeof params.qa === 'string' ? params.qa as AnatomyV2QaScenario : null;
  const qaView = params.view === 'back' ? 'back' : 'front';

  if (!PREVIEW_ENABLED) return <Redirect href="/(tabs)/antrenamente" />;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.surfaceBg }]}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('workoutV2.preview.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('workoutV2.preview.subtitle')}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {qaScenario
          ? <AnatomyV2VisualQA scenario={qaScenario} initialView={qaView} />
          : <WorkoutV2Experience />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  content: { padding: 16, paddingBottom: 32 },
});
