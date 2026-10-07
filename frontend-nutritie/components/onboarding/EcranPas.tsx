import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	ScrollView,
	ActivityIndicator,
	BackHandler,
	Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import { ArrowLeft, ArrowRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from '../../hooks/useReducedMotion'

import { useTheme } from '../../context/ThemeContext'
import { useOnboarding } from '../../context/OnboardingContext'
import { pasiActivi, pasulUrmator, type PasOnboarding } from './pasi'
import {
	anuleazaProtectieNavigare,
	incepeProtectieNavigare,
} from '../../lib/onboardingNavigationGuard'

export type EcranPasProps = {
	/** Ruta acestui pas, folosita pentru progres si pentru pasul urmator. */
	pas: PasOnboarding
	titlu: string
	subtitlu?: string
	children: React.ReactNode
	poateContinua?: boolean
	etichetaButon?: string
	/** Callback optional inainte de a naviga. Poate returna false pentru a anula navigarea automata. */
	laContinuare?: () => Promise<boolean | void> | boolean | void
	seIncarca?: boolean
	faraAntet?: boolean
}

/**
 * Structura comuna a tuturor pasilor: bara de progres, titlu, continut si
 * butonul de continuare fixat jos.
 */
export default function EcranPas({
	pas,
	titlu,
	subtitlu,
	children,
	poateContinua = true,
	etichetaButon,
	laContinuare,
	seIncarca = false,
	faraAntet = false,
}: EcranPasProps) {
	const { t, i18n } = useTranslation()
	const { colors } = useTheme()
	const reduceMotion = useReducedMotion()
	const { date } = useOnboarding()
	const router = useRouter()
	const textButon = etichetaButon || (
		(i18n?.isInitialized && i18n.language !== 'ro')
			? t('onboarding.continue', 'Continue')
			: (t('onboarding.continue') !== 'onboarding.continue' ? t('onboarding.continue') : 'Continuă')
	)
	const textInapoi = t('onboarding.back')
	const apasareInCursRef = useRef(false)
	const [apasareInCurs, setApasareInCurs] = useState(false)
	const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Stabilizare referențială: pasiActivi alocă un nou array, deci îl memoizăm după date.scop
	const pasi = useMemo(() => pasiActivi(date.scop), [date.scop])
	const indice = pasi.indexOf(pas)
	// pasAnterior este o valoare primitivă stabilă (string | null)
	const pasAnterior = indice > 0 ? pasi[indice - 1] : null

	// NAV-BACK-001: navigare „Înapoi” logică și sigură.
	// Depinde doar de valori semantice stabile (router, pasAnterior), NU de array-ul nou alocat pasi.
	const handleBack = useCallback(() => {
		if (safetyTimerRef.current) {
			clearTimeout(safetyTimerRef.current)
			safetyTimerRef.current = null
		}
		anuleazaProtectieNavigare()
		apasareInCursRef.current = false
		setApasareInCurs(false)
		if (router.canGoBack()) {
			router.back()
			return true
		}
		if (pasAnterior) {
			router.replace(pasAnterior as any)
			return true
		}
		return false
	}, [router, pasAnterior])

	// P0-01: Focus-scoped lifecycle behavior:
	// 1. Când ecranul primește focus (montare inițială sau revenire via Back):
	//    - deblocăm lock-urile dacă ecranul fusese blocat la navigare înainte
	//    - înregistrăm listener-ul de hardware Back pe Android doar pentru ecranul curent activ
	// 2. Când ecranul pierde focusul (navigare înainte către pasul următor sau demontare):
	//    - listener-ul de Back este imediat eliminat (prevenind handlere multiple / conflict de stivă)
	// 3. Stabilitate la rerender:
	//    - handleBack, pasAnterior și router sunt stabile referențial pe durata acestui pas
	//    - rerender-urile cauzate de busy-state (setApasareInCurs) NU declanșează cleanup/re-entry!
	useFocusEffect(
		useCallback(() => {
			apasareInCursRef.current = false
			setApasareInCurs(false)
			anuleazaProtectieNavigare()

			let backSubscription: { remove: () => void } | null = null
			if (Platform.OS === 'android') {
				backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
					if (pasAnterior !== null || router.canGoBack()) {
						handleBack()
						return true
					}
					return false
				})
			}

			return () => {
				if (backSubscription) {
					backSubscription.remove()
					backSubscription = null
				}
				if (safetyTimerRef.current) {
					clearTimeout(safetyTimerRef.current)
					safetyTimerRef.current = null
				}
			}
		}, [handleBack, pasAnterior, router])
	)

	useEffect(() => {
		return () => {
			if (safetyTimerRef.current) {
				clearTimeout(safetyTimerRef.current)
				safetyTimerRef.current = null
			}
		}
	}, [])

	const apasa = async () => {
		if (!poateContinua || seIncarca || apasareInCursRef.current) return
		apasareInCursRef.current = true
		setApasareInCurs(true)
		try {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		} catch {}

		if (safetyTimerRef.current) {
			clearTimeout(safetyTimerRef.current)
		}
		// Failsafe timer (1200ms) ca sa nu ramana NICIODATA blocat butonul daca router.push intarzie,
		// ecranul nu se demonteaza imediat, sau utilizatorul re-incearca
		safetyTimerRef.current = setTimeout(() => {
			apasareInCursRef.current = false
			setApasareInCurs(false)
			anuleazaProtectieNavigare()
		}, 1200)

		try {
			if (laContinuare) {
				const rezultat = await laContinuare()
				// Un pas care navigheaza singur returneaza false ca sa nu mergem de doua ori.
				if (rezultat === false) {
					if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
					anuleazaProtectieNavigare()
					apasareInCursRef.current = false
					setApasareInCurs(false)
					return
				}
			}

			const urmator = pasulUrmator(pas, date.scop)
			if (urmator) {
				incepeProtectieNavigare()
				try {
					router.push(urmator as any)
				} catch (navErr) {
					console.warn('[Onboarding] router.push a esuat, fallback pe replace:', navErr)
					router.replace(urmator as any)
				}
			} else {
				if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
				anuleazaProtectieNavigare()
				apasareInCursRef.current = false
				setApasareInCurs(false)
			}
		} catch (eroare) {
			if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
			anuleazaProtectieNavigare()
			apasareInCursRef.current = false
			setApasareInCurs(false)
			console.error('[Onboarding] Continuarea pasului a eșuat:', eroare)
		}
	}

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
			{!faraAntet && (
				<View style={styles.antet}>
					{indice > 0 || router.canGoBack() ? (
						<TouchableOpacity
							onPress={handleBack}
							style={styles.butonInapoi}
							hitSlop={12}
							accessibilityLabel={textInapoi}
							accessibilityRole="button"
						>
							<ArrowLeft size={24} color={colors.textPrimary} />
						</TouchableOpacity>
					) : (
						<View style={styles.butonInapoi} />
					)}

					<View style={styles.progresWrap}>
						{pasi.map((p, i) => (
							<View
								key={p}
								style={[
									styles.segment,
									{ backgroundColor: i <= indice ? colors.accent : colors.overlayStrong },
								]}
							/>
						))}
					</View>
				</View>
			)}

			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.continut}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				<Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(420)}>
					<Text style={[styles.titlu, { color: colors.textPrimary }]}>{titlu}</Text>
					{subtitlu ? (
						<Text style={[styles.subtitlu, { color: colors.textSecondary }]}>{subtitlu}</Text>
					) : null}
				</Animated.View>

				<Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(460).delay(90)} style={styles.corp}>
					{children}
				</Animated.View>
			</ScrollView>

			<View style={styles.subsol}>
				<TouchableOpacity
					onPress={apasa}
					disabled={!poateContinua || seIncarca || apasareInCurs}
					style={[styles.buton, (!poateContinua || seIncarca || apasareInCurs) && styles.butonInactiv]}
					accessibilityRole="button"
					accessibilityLabel={textButon}
					accessibilityState={{ disabled: !poateContinua || seIncarca || apasareInCurs, busy: seIncarca || apasareInCurs }}
				>
					<LinearGradient
						colors={colors.accentGradient}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={styles.butonGrad}
					>
						{seIncarca || apasareInCurs ? (
							<ActivityIndicator color={colors.background} />
						) : (
							<>
								<Text style={[styles.butonText, { color: colors.background }]}>{textButon}</Text>
								<ArrowRight size={20} color={colors.background} strokeWidth={2.5} />
							</>
						)}
					</LinearGradient>
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	scroll: { flex: 1 },
	antet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 14 },
	butonInapoi: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
	progresWrap: { flex: 1, flexDirection: 'row', gap: 6 },
	segment: { flex: 1, height: 4, borderRadius: 2 },
	continut: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, flexGrow: 1 },
	titlu: { fontSize: 28, fontWeight: '900', letterSpacing: -0.8, lineHeight: 34 },
	subtitlu: { fontSize: 14, marginTop: 8, lineHeight: 20 },
	corp: { marginTop: 18, flex: 1 },
	subsol: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 8 },
	buton: { borderRadius: 18, overflow: 'hidden' },
	butonInactiv: { opacity: 0.4 },
	butonGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 19, gap: 10 },
	butonText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
})
