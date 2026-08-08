import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
	NativeScrollEvent,
	NativeSyntheticEvent,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from 'react-native'
import * as Haptics from 'expo-haptics'

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

	// Pozitionam rigla pe valoarea curenta cand aceasta se schimba din exterior.
	useEffect(() => {
		if (manevreaza.current) return
		if (valoare === ultimaValoare.current) return
		ultimaValoare.current = valoare
		const x = indiceDinValoare(valoare) * LATIME_PAS
		refScroll.current?.scrollTo({ x, animated: false })
	}, [valoare, indiceDinValoare])

	const laDerulare = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const indice = Math.round(e.nativeEvent.contentOffset.x / LATIME_PAS)
		const limitat = Math.min(Math.max(indice, 0), gradatii.length - 1)
		const noua = gradatii[limitat]
		if (noua !== ultimaValoare.current) {
			ultimaValoare.current = noua
			try {
				Haptics.selectionAsync()
			} catch {}
			laSchimbare(noua)
		}
	}

	// Pentru TalkBack/VoiceOver rigla expune controale increment/decrement, ca
	// valoarea sa poata fi ajustata si fara gesturi de tragere.
	const laActiuneAccesibilitate = (e: { nativeEvent: { actionName: string } }) => {
		const pasCuSemn = e.nativeEvent.actionName === 'increment' ? pas : -pas
		const noua = Math.min(max, Math.max(min, Number((valoare + pasCuSemn).toFixed(zecimale))))
		ultimaValoare.current = noua
		laSchimbare(noua)
	}

	const valoareAfisata = Number.isFinite(valoare) ? valoare.toFixed(zecimale) : Number(min.toFixed(zecimale))

	return (
		<View>
			<View style={styles.valoareWrap}>
				<Text style={[styles.valoare, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
					{valoareAfisata}
				</Text>
				<Text style={[styles.unitate, { color: colors.textSecondary }]}>{unitate}</Text>
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
						// Nu dezactivam manevreaza daca exista in continuare inertie de derulare.
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
	valoareWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
	valoare: { fontSize: 60, fontWeight: '900', letterSpacing: -2 },
	unitate: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
	riglaWrap: { height: 60, marginTop: 24, justifyContent: 'center' },
	gradatie: { width: LATIME_PAS, alignItems: 'center', justifyContent: 'center', height: 40 },
	indicatorWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
	indicator: { width: 3, height: 44, borderRadius: 2 },
	avertizare: { fontSize: 13, textAlign: 'center', marginTop: 20, lineHeight: 19, fontWeight: '600' },
})
