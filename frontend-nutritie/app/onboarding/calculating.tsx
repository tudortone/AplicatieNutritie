import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Activity, CheckCircle2, Sparkles } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../context/ThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export default function PasCalculare() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [pasCurent, setPasCurent] = useState(0)

  const ETAPE_CALCUL = [
    t('onboarding.calculatingStep1'),
    t('onboarding.calculatingStep2'),
    t('onboarding.calculatingStep3'),
    t('onboarding.calculatingStep4'),
    t('onboarding.calculatingStep5'),
  ]

  const progress = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1
      setPasCurent(ETAPE_CALCUL.length - 1)
      const timer = setTimeout(() => {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
        router.replace('/onboarding/plan' as any)
      }, 700)
      return () => clearTimeout(timer)
    }

    progress.value = withTiming(1, { duration: 2800 })

    const interval = setInterval(() => {
      setPasCurent((prev) => {
        if (prev < ETAPE_CALCUL.length - 1) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
          return prev + 1
        }
        return prev
      })
    }, 550)

    const timer = setTimeout(() => {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      router.replace('/onboarding/plan' as any)
    }, 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [progress, router, ETAPE_CALCUL.length, reduceMotion])

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, progress.value * 100)}%`,
  }))

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.continut}>
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(600)} style={styles.iconWrap}>
          <LinearGradient colors={colors.accentGradient} style={styles.iconGrad}>
            <Sparkles size={40} color={colors.background} />
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(600).delay(150)} style={styles.textWrap}>
          <Text style={[styles.titlu, { color: colors.textPrimary }]}>{t('onboarding.calculatingTitle')}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.subtitlu, { color: colors.textSecondary }]}>
            {t('onboarding.calculatingSubtitle')}
          </Text>
        </Animated.View>

        {/* Progress bar container */}
        <View style={[styles.barContainer, { backgroundColor: colors.overlayLight, borderColor: colors.overlayStrong }]}>
          <Animated.View style={[styles.barFill, barStyle]}>
            <LinearGradient colors={colors.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Dynamic calculation steps list */}
        <View style={styles.etapeList}>
          {ETAPE_CALCUL.map((etape, i) => {
            const finalizat = i < pasCurent
            const activ = i === pasCurent
            return (
              <Animated.View
                key={i}
                entering={FadeInDown.duration(400).delay(i * 100)}
                style={[
                  styles.etapeRow,
                  { backgroundColor: activ ? colors.cardBg : 'transparent', borderColor: colors.cardBorder }
                ]}
              >
                {finalizat ? (
                  <CheckCircle2 size={20} color={colors.success} />
                ) : activ ? (
                  <Activity size={20} color={colors.accent} />
                ) : (
                  <View style={[styles.dotPendent, { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                )}
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[
                    styles.etapeText,
                    {
                      color: finalizat ? colors.textSecondary : activ ? colors.textPrimary : colors.textSecondary,
                      fontWeight: activ ? '700' : '500',
                      opacity: activ || finalizat ? 1 : 0.4,
                    }
                  ]}
                >
                  {etape}
                </Text>
              </Animated.View>
            )
          })}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  continut: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  iconWrap: { marginBottom: 24 },
  iconGrad: { width: 84, height: 84, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  textWrap: { alignItems: 'center', marginBottom: 32 },
  titlu: { fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  subtitlu: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: '85%' },
  barContainer: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden', borderWidth: 1, marginBottom: 32 },
  barFill: { height: '100%', borderRadius: 5 },
  etapeList: { width: '100%', gap: 10 },
  etapeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  dotPendent: { width: 8, height: 8, borderRadius: 4, marginLeft: 6, marginRight: 6 },
  etapeText: { fontSize: 13, flex: 1 },
})
