import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native'
import * as Haptics from 'expo-haptics'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING, calculeazaVarsta } from '../../lib/onboarding'
import { useTranslation } from 'react-i18next'

const INALTIME_RAND = 46

/** O coloana din selectorul de data, cu snap pe randuri si suport touch + click + mouse wheel. */
export function Coloana({
	valori,
	etichete,
	selectat,
	laSchimbare,
	latime,
	etichetaAccesibila,
}: {
	valori: number[]
	etichete?: string[]
	selectat: number
	laSchimbare: (v: number) => void
	latime: number
	etichetaAccesibila: string
}) {
	const { colors } = useTheme()
	const refScroll = useRef<ScrollView>(null)
	const indice = Math.max(0, valori.indexOf(selectat))
	const [indiceVizual, setIndiceVizual] = useState(indice)
	const indiceVizualRef = useRef(indice)

	useEffect(() => {
		indiceVizualRef.current = indice
		setIndiceVizual(indice)
		const timer = setTimeout(() => {
			refScroll.current?.scrollTo({ y: indice * INALTIME_RAND, animated: false })
		}, 50)
		return () => clearTimeout(timer)
	}, [indice])

	const actualizeazaIndice = (y: number) => {
		const i = Math.round(y / INALTIME_RAND)
		const limitat = Math.min(Math.max(i, 0), valori.length - 1)
		const valNoua = valori[limitat]
		if (valNoua !== undefined && valNoua !== selectat) {
			try {
				Haptics.selectionAsync()
			} catch {}
			laSchimbare(valNoua)
		}
	}

	const actualizeazaSelectiaVizuala = (y: number) => {
		const urmatorul = Math.min(Math.max(Math.round(y / INALTIME_RAND), 0), valori.length - 1)
		if (urmatorul !== indiceVizualRef.current) {
			indiceVizualRef.current = urmatorul
			setIndiceVizual(urmatorul)
		}
	}

	return (
		<View style={{ width: latime, height: INALTIME_RAND * 5 }}>
			<ScrollView
				ref={refScroll}
				style={{ width: latime, height: INALTIME_RAND * 5 }}
				showsVerticalScrollIndicator={false}
				snapToInterval={INALTIME_RAND}
				decelerationRate="fast"
				contentContainerStyle={{ paddingVertical: INALTIME_RAND * 2 }}
				scrollEventThrottle={16}
				onScroll={(e) => actualizeazaSelectiaVizuala(e.nativeEvent.contentOffset.y)}
				onScrollEndDrag={(e) => {
					actualizeazaSelectiaVizuala(e.nativeEvent.contentOffset.y)
					actualizeazaIndice(e.nativeEvent.contentOffset.y)
				}}
				onMomentumScrollEnd={(e) => {
					actualizeazaSelectiaVizuala(e.nativeEvent.contentOffset.y)
					actualizeazaIndice(e.nativeEvent.contentOffset.y)
				}}
				accessible
				accessibilityRole="adjustable"
				accessibilityLabel={etichetaAccesibila}
				accessibilityValue={{ text: etichete ? etichete[indice] : String(selectat) }}
				accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
				onAccessibilityAction={(e) => {
					const delta = e.nativeEvent.actionName === 'increment' ? 1 : -1
					const urmatorul = Math.min(Math.max(indice + delta, 0), valori.length - 1)
					if (valori[urmatorul] !== selectat) {
						laSchimbare(valori[urmatorul])
						refScroll.current?.scrollTo({ y: urmatorul * INALTIME_RAND, animated: true })
					}
				}}
			>
				{valori.map((v, i) => {
					const activ = i === indiceVizual
					const eticheta = etichete ? etichete[i] : String(v)
					return (
						<TouchableOpacity
							key={v}
							activeOpacity={0.7}
							onPress={() => {
								laSchimbare(v)
								refScroll.current?.scrollTo({ y: i * INALTIME_RAND, animated: true })
							}}
							style={styles.rand}
						>
							<Text
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.75}
								style={[
									styles.textRand,
									{
										color: activ ? colors.textPrimary : colors.textSecondary,
										opacity: activ ? 1 : 0.35,
										fontWeight: activ ? '800' : '500',
										fontSize: activ ? 20 : 17,
									},
								]}
							>
								{eticheta}
							</Text>
						</TouchableOpacity>
					)
				})}
			</ScrollView>
		</View>
	)
}

export default function PasDataNasterii() {
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()
	const { t } = useTranslation()
	const { width } = useWindowDimensions()

	const luniEtichete = useMemo(
		() => [
			t('months.m1'),
			t('months.m2'),
			t('months.m3'),
			t('months.m4'),
			t('months.m5'),
			t('months.m6'),
			t('months.m7'),
			t('months.m8'),
			t('months.m9'),
			t('months.m10'),
			t('months.m11'),
			t('months.m12'),
		],
		[t],
	)

	const latimeDisponibila = Math.max(250, width - 48)
	const latimeZi = Math.round(latimeDisponibila * 0.24)
	const latimeLuna = Math.round(latimeDisponibila * 0.46)
	const latimeAn = Math.round(latimeDisponibila * 0.3)

	const anCurent = new Date().getFullYear()
	const anMin = anCurent - LIMITE_ONBOARDING.varsta.max
	const anMax = anCurent - LIMITE_ONBOARDING.varsta.min

	// Robust date parsing (fara deviere de fus orar UTC)
	const curent = useMemo(() => {
		if (date.dataNasterii) {
			const parts = date.dataNasterii.split('-')
			if (parts.length === 3) {
				const an = parseInt(parts[0], 10)
				const luna = parseInt(parts[1], 10) - 1
				const zi = parseInt(parts[2], 10)
				if (!isNaN(an) && !isNaN(luna) && !isNaN(zi)) {
					return { zi, luna, an }
				}
			}
		}
		return { zi: 1, luna: 0, an: anCurent - 25 }
	}, [date.dataNasterii, anCurent])

	const zileInLuna = new Date(curent.an, curent.luna + 1, 0).getDate()

	const zile = useMemo(() => Array.from({ length: zileInLuna }, (_, i) => i + 1), [zileInLuna])
	const luni = useMemo(() => luniEtichete.map((_, i) => i), [luniEtichete])
	const ani = useMemo(
		() => Array.from({ length: anMax - anMin + 1 }, (_, i) => anMax - i),
		[anMin, anMax],
	)

	const seteaza = (patch: Partial<{ zi: number; luna: number; an: number }>) => {
		const nou = { ...curent, ...patch }
		const maxZi = new Date(nou.an, nou.luna + 1, 0).getDate()
		const zi = Math.min(nou.zi, maxZi)
		const luna = String(nou.luna + 1).padStart(2, '0')
		actualizeaza({ dataNasterii: `${nou.an}-${luna}-${String(zi).padStart(2, '0')}` })
	}

	const varsta = date.dataNasterii ? calculeazaVarsta(date.dataNasterii) : 25

	return (
		<EcranPas
			pas="/onboarding/data-nasterii"
			titlu={t('onboarding.birthdateTitle')}
			subtitlu={t('onboarding.birthdateSubtitle')}
			poateContinua
			laContinuare={() => {
				const luna = String(curent.luna + 1).padStart(2, '0')
				const zi = String(curent.zi).padStart(2, "0")
				const valoare = curent.an + "-" + luna + "-" + zi
				if (date.dataNasterii !== valoare) {
					actualizeaza({ dataNasterii: valoare })
				}
			}}
		>
			<View style={[styles.roataWrap, { borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}>
				<View pointerEvents="none" style={[styles.evidentiere, { backgroundColor: colors.overlayLight }]} />
				<View style={styles.coloane}>
					<Coloana valori={zile} selectat={curent.zi} laSchimbare={(zi) => seteaza({ zi })} latime={latimeZi} etichetaAccesibila={t('onboarding.birthdateDayA11y')} />
					<Coloana
						valori={luni}
						etichete={luniEtichete}
						selectat={curent.luna}
						laSchimbare={(luna) => seteaza({ luna })}
						latime={latimeLuna}
						etichetaAccesibila={t('onboarding.birthdateMonthA11y')}
					/>
					<Coloana valori={ani} selectat={curent.an} laSchimbare={(an) => seteaza({ an })} latime={latimeAn} etichetaAccesibila={t('onboarding.birthdateYearA11y')} />
				</View>
			</View>

			<Text style={[styles.varsta, { color: colors.textSecondary }]}>{t('onboarding.birthdateAge', { varsta })}</Text>
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	roataWrap: {
		height: INALTIME_RAND * 5,
		borderRadius: 22,
		borderWidth: 1,
		overflow: 'hidden',
		justifyContent: 'center',
	},
	evidentiere: {
		position: 'absolute',
		left: 10,
		right: 10,
		height: INALTIME_RAND,
		top: INALTIME_RAND * 2,
		borderRadius: 12,
	},
	coloane: { flexDirection: 'row', justifyContent: 'center', height: INALTIME_RAND * 5 },
	rand: { height: INALTIME_RAND, alignItems: 'center', justifyContent: 'center' },
	textRand: { fontSize: 18, width: '100%', textAlign: 'center' },
	varsta: { textAlign: 'center', marginTop: 18, fontSize: 15, fontWeight: '600' },
})
