import React from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import { ArrowLeft, ArrowRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'

import { useTheme } from '../../context/ThemeContext'
import { useOnboarding } from '../../context/OnboardingContext'
import { pasiActivi, pasulUrmator, type PasOnboarding } from './pasi'

export type EcranPasProps = {
	/** Ruta acestui pas, folosita pentru progres si pentru pasul urmator. */
	pas: PasOnboarding
	titlu: string
	subtitlu?: string
	children: React.ReactNode
	/** Cand e false, butonul de continuare e dezactivat. */
	poateContinua: boolean
	/** Eticheta butonului principal. Implicit `Continua`. */
	etichetaButon?: string
	/**
	 * Actiune la apasarea butonului, rulata inainte de navigare.
	 * Returneaza `false` ca sa opresti navigarea automata catre pasul urmator.
	 */
	laContinuare?: () => void | boolean | Promise<void | boolean>
	/** Afiseaza un indicator in buton. */
	seIncarca?: boolean
	/** Ascunde bara de progres si sageata de intoarcere. */
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
	poateContinua,
	etichetaButon = 'Continua',
	laContinuare,
	seIncarca = false,
	faraAntet = false,
}: EcranPasProps) {
	const { colors } = useTheme()
	const { date } = useOnboarding()
	const router = useRouter()

	const pasi = pasiActivi(date.scop)
	const indice = pasi.indexOf(pas)

	const apasa = async () => {
		if (!poateContinua || seIncarca) return
		try {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		} catch {}

		if (laContinuare) {
			const rezultat = await laContinuare()
			// Un pas care navigheaza singur returneaza false ca sa nu mergem de doua ori.
			if (rezultat === false) return
		}

		const urmator = pasulUrmator(pas, date.scop)
		if (urmator) router.push(urmator as any)
	}

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
			{!faraAntet && (
				<View style={styles.antet}>
					<TouchableOpacity
						onPress={() => router.canGoBack() && router.back()}
						style={styles.butonInapoi}
						hitSlop={12}
						accessibilityLabel="Inapoi"
						accessibilityRole="button"
					>
						<ArrowLeft size={24} color={colors.textPrimary} />
					</TouchableOpacity>

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
				contentContainerStyle={styles.continut}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				<Animated.View entering={FadeInUp.duration(420)}>
					<Text style={[styles.titlu, { color: colors.textPrimary }]}>{titlu}</Text>
					{subtitlu ? (
						<Text style={[styles.subtitlu, { color: colors.textSecondary }]}>{subtitlu}</Text>
					) : null}
				</Animated.View>

				<Animated.View entering={FadeInDown.duration(460).delay(90)} style={styles.corp}>
					{children}
				</Animated.View>
			</ScrollView>

			<View style={styles.subsol}>
				<TouchableOpacity
					onPress={apasa}
					disabled={!poateContinua || seIncarca}
					style={[styles.buton, (!poateContinua || seIncarca) && styles.butonInactiv]}
					accessibilityRole="button"
					accessibilityState={{ disabled: !poateContinua || seIncarca }}
				>
					<LinearGradient
						colors={colors.accentGradient}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={styles.butonGrad}
					>
						{seIncarca ? (
							<ActivityIndicator color={colors.background} />
						) : (
							<>
								<Text style={[styles.butonText, { color: colors.background }]}>{etichetaButon}</Text>
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
	antet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 14 },
	butonInapoi: { padding: 4 },
	progresWrap: { flex: 1, flexDirection: 'row', gap: 6 },
	segment: { flex: 1, height: 4, borderRadius: 2 },
	continut: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, flexGrow: 1 },
	titlu: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8, lineHeight: 36 },
	subtitlu: { fontSize: 15, marginTop: 10, lineHeight: 21 },
	corp: { marginTop: 28, flex: 1 },
	subsol: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 8 },
	buton: { borderRadius: 18, overflow: 'hidden' },
	butonInactiv: { opacity: 0.4 },
	butonGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 19, gap: 10 },
	butonText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
})
