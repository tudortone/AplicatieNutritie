import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
	NativeScrollEvent,
	NativeSyntheticEvent,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Minus, Plus } from 'lucide-react-native'

import { useTheme } from '../../context/ThemeContext'

const LATIME_PAS = 14

export type SelectorValoareProps = {
	valoare: number
	min: number
	max: number
	/** Incrementul dintre doua gradatii. */
	pas?: number
	/** Unitatea afisata sub valoare, ex. `kg`. */
	unitate: string
	/** Numarul de zecimale la afisare. */
	zecimale?: number
	laSchimbare: (valoare: number) => void
	/** Text de avertizare afisat sub rigla. */
	avertizare?: string | null
}

/**
 * Rigla orizontala pentru alegerea unei valori numerice.
 *
 * Foloseste un ScrollView cu snap, ca sa avem inertie nativa fara sa adaugam
 * inca o librarie de gesturi.
 */
export default function SelectorValoare({
	valoare,
	min,
	max,
	pas = 1,
	unitate,
	zecimale = 0,
	laSchimbare,
	avertizare,
}: SelectorValoareProps) {
	const { colors } = useTheme()
	const { width } = useWindowDimensions()
	const refScroll = useRef<ScrollView>(null)
	const ultimaValoare = useRef(valoare)
	const initializat = useRef(false)
	const ultimulTimpHaptic = useRef(0)
	// Cat timp utilizatorul trage, efectul de sincronizare nu trebuie sa sara inapoi.
	const manevreaza = useRef(false)

	const gradatii = useMemo(() => {
		const rezultat: number[] = []
		const nr = Math.round((max - min) / pas)
		for (let i = 0; i <= nr; i++) rezultat.push(Number((min + i * pas).toFixed(zecimale)))
		return rezultat
	}, [min, max, pas, zecimale])

	const padding = width / 2 - LATIME_PAS / 2

	const indiceDinValoare = useCallback((v: number) => Math.round((v - min) / pas), [min, pas])

	const sincronizeazaPozitie = useCallback(
		(v: number, animated = false) => {
			const x = Math.max(0, indiceDinValoare(v) * LATIME_PAS)
			refScroll.current?.scrollTo({ x, animated })
		},
		[indiceDinValoare]
	)

	// Offset inițial pentru ca ScrollView-ul să se monteze direct la valoarea selectată,
	// nu la x=0 (care ar corespunde minimului).
	const initialOffset = useMemo(
		() => ({ x: Math.max(0, indiceDinValoare(valoare) * LATIME_PAS), y: 0 }),
		// Offset calculat intenționat exclusiv la prima montare a componentei
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	)

	// Sincronizare la rezolvarea dimensiunilor native de layout (Android 16 fix).
	const laLayout = useCallback(() => {
		if (!initializat.current) {
			initializat.current = true
			sincronizeazaPozitie(valoare, false)
		}
	}, [sincronizeazaPozitie, valoare])

	// Pozitionam rigla pe valoarea curenta cand aceasta se schimba din exterior.
	useEffect(() => {
		if (manevreaza.current) return
		if (!initializat.current) {
			initializat.current = true
			sincronizeazaPozitie(valoare, false)
			return
		}
		if (valoare === ultimaValoare.current) return
		ultimaValoare.current = valoare
		sincronizeazaPozitie(valoare, false)
	}, [valoare, sincronizeazaPozitie])

	const laDerulare = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const indice = Math.round(e.nativeEvent.contentOffset.x / LATIME_PAS)
		const limitat = Math.min(Math.max(indice, 0), gradatii.length - 1)
		const noua = gradatii[limitat]
		if (noua !== ultimaValoare.current) {
			ultimaValoare.current = noua
			const acum = Date.now()
			if (acum - ultimulTimpHaptic.current > 35) {
				ultimulTimpHaptic.current = acum
				try {
					Haptics.selectionAsync()
				} catch {}
			}
			laSchimbare(noua)
		}
	}

	const ajusteazaPas = (directie: number) => {
		const pasCuSemn = directie * pas
		const noua = Math.min(max, Math.max(min, Number((valoare + pasCuSemn).toFixed(zecimale))))
		if (noua !== valoare) {
			ultimaValoare.current = noua
			sincronizeazaPozitie(noua, true)
			try {
				Haptics.selectionAsync()
			} catch {}
			laSchimbare(noua)
		}
	}

	// Pentru TalkBack/VoiceOver rigla expune controale increment/decrement.
	const laActiuneAccesibilitate = (e: { nativeEvent: { actionName: string } }) => {
		ajusteazaPas(e.nativeEvent.actionName === 'increment' ? 1 : -1)
	}

	const valoareAfisata = Number.isFinite(valoare) ? valoare.toFixed(zecimale) : Number(min.toFixed(zecimale))

	return (
		<View onLayout={laLayout}>
			<View style={styles.valoareWrap}>
				<TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel={`Scade ${unitate}`}
					hitSlop={12}
					onPress={() => ajusteazaPas(-1)}
					disabled={valoare <= min}
					style={[
						styles.stepperBtn,
						{
							borderColor: colors.cardBorder,
							backgroundColor: colors.surfaceElevated,
							opacity: valoare <= min ? 0.3 : 1,
						},
					]}
				>
					<Minus size={18} color={colors.textPrimary} />
				</TouchableOpacity>

				<View style={styles.valoareCenter}>
					<Text style={[styles.valoare, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
						{valoareAfisata}
					</Text>
					<Text style={[styles.unitate, { color: colors.accent }]}>{unitate}</Text>
				</View>

				<TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel={`Crește ${unitate}`}
					hitSlop={12}
					onPress={() => ajusteazaPas(1)}
					disabled={valoare >= max}
					style={[
						styles.stepperBtn,
						{
							borderColor: colors.cardBorder,
							backgroundColor: colors.surfaceElevated,
							opacity: valoare >= max ? 0.3 : 1,
						},
					]}
				>
					<Plus size={18} color={colors.textPrimary} />
				</TouchableOpacity>
			</View>

			<View style={styles.riglaWrap}>
				<ScrollView
					ref={refScroll}
					horizontal
					showsHorizontalScrollIndicator={false}
					snapToInterval={LATIME_PAS}
					decelerationRate="fast"
					bounces={false}
					overScrollMode="never"
					contentOffset={initialOffset}
					contentContainerStyle={{ paddingHorizontal: padding }}
					onScroll={laDerulare}
					scrollEventThrottle={16}
					accessibilityRole="adjustable"
					accessibilityLabel={`Selectează ${unitate}`}
					accessibilityValue={{ min, max, now: valoare, text: `${valoareAfisata} ${unitate}` }}
					accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
					onAccessibilityAction={laActiuneAccesibilitate}
					onScrollBeginDrag={() => {
						manevreaza.current = true
					}}
					onMomentumScrollBegin={() => {
						manevreaza.current = true
					}}
					onMomentumScrollEnd={() => {
						manevreaza.current = false
					}}
					onScrollEndDrag={() => {
						setTimeout(() => {
							manevreaza.current = false
						}, 150)
					}}
				>
					{gradatii.map((g, i) => {
						const mare = i % 5 === 0
						return (
							<View key={g} style={styles.gradatie}>
								<View
									style={{
										width: 2,
										height: mare ? 34 : 18,
										borderRadius: 1,
										backgroundColor: mare ? colors.textSecondary : colors.overlayStrong,
									}}
								/>
							</View>
						)
					})}
				</ScrollView>

				<View pointerEvents="none" style={styles.indicatorWrap}>
					<View style={[styles.indicator, { backgroundColor: colors.accent }]} />
				</View>
			</View>

			{avertizare ? (
				<Text style={[styles.avertizare, { color: colors.danger }]}>{avertizare}</Text>
			) : null}
		</View>
	)
}

const styles = StyleSheet.create({
	valoareWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
	valoareCenter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, minWidth: 140 },
	stepperBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	valoare: { fontSize: 60, fontWeight: '900', letterSpacing: -2 },
	unitate: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
	riglaWrap: { height: 60, marginTop: 24, justifyContent: 'center' },
	gradatie: { width: LATIME_PAS, alignItems: 'center', justifyContent: 'center', height: 40 },
	indicatorWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
	indicator: { width: 3, height: 44, borderRadius: 2 },
	avertizare: { fontSize: 13, textAlign: 'center', marginTop: 20, lineHeight: 19, fontWeight: '600' },
})
