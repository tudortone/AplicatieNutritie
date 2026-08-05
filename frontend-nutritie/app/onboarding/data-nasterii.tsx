import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING, calculeazaVarsta } from '../../lib/onboarding'

const INALTIME_RAND = 46

const LUNI = [
	'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
	'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

/** O coloana din selectorul de data, cu snap pe randuri. */
function Coloana({
	valori,
	etichete,
	selectat,
	laSchimbare,
	latime,
}: {
	valori: number[]
	etichete?: string[]
	selectat: number
	laSchimbare: (v: number) => void
	latime: number
}) {
	const { colors } = useTheme()
	const indice = Math.max(0, valori.indexOf(selectat))

	return (
		<ScrollView
			style={{ width: latime }}
			showsVerticalScrollIndicator={false}
			snapToInterval={INALTIME_RAND}
			decelerationRate="fast"
			contentOffset={{ x: 0, y: indice * INALTIME_RAND }}
			contentContainerStyle={{ paddingVertical: INALTIME_RAND * 2 }}
			scrollEventThrottle={16}
			onMomentumScrollEnd={(e) => {
				const i = Math.round(e.nativeEvent.contentOffset.y / INALTIME_RAND)
				const limitat = Math.min(Math.max(i, 0), valori.length - 1)
				if (valori[limitat] !== selectat) laSchimbare(valori[limitat])
			}}
		>
			{valori.map((v, i) => {
				const activ = v === selectat
				const eticheta = etichete ? etichete[i] : String(v)
				return (
					<View key={v} style={styles.rand}>
						<Text
							style={[
								styles.textRand,
								{
									color: activ ? colors.textPrimary : colors.textSecondary,
									opacity: activ ? 1 : 0.35,
									fontWeight: activ ? '800' : '500',
								},
							]}
						>
							{eticheta}
						</Text>
					</View>
				)
			})}
		</ScrollView>
	)
}

export default function PasDataNasterii() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()

	const eticheteLuni = useMemo(() => LUNI.map((l) => t(`onboarding.luni.${l}`)), [t])

	const anCurent = new Date().getFullYear()
	const anMin = anCurent - LIMITE_ONBOARDING.varsta.max
	const anMax = anCurent - LIMITE_ONBOARDING.varsta.min

	// Implicit 25 de ani, ca rotile sa nu porneasca dintr-un capat.
	const curent = useMemo(() => {
		if (date.dataNasterii) {
			const d = new Date(date.dataNasterii)
			return { zi: d.getDate(), luna: d.getMonth(), an: d.getFullYear() }
		}
		return { zi: 1, luna: 0, an: anCurent - 25 }
	}, [date.dataNasterii, anCurent])

	const zileInLuna = new Date(curent.an, curent.luna + 1, 0).getDate()

	const zile = useMemo(() => Array.from({ length: zileInLuna }, (_, i) => i + 1), [zileInLuna])
	const luni = useMemo(() => LUNI.map((_, i) => i), [])
	const ani = useMemo(
		() => Array.from({ length: anMax - anMin + 1 }, (_, i) => anMax - i),
		[anMin, anMax],
	)

	const seteaza = (patch: Partial<{ zi: number; luna: number; an: number }>) => {
		const nou = { ...curent, ...patch }
		// Trecand de la 31 ianuarie la februarie, ziua trebuie limitata.
		const maxZi = new Date(nou.an, nou.luna + 1, 0).getDate()
		const zi = Math.min(nou.zi, maxZi)
		const luna = String(nou.luna + 1).padStart(2, '0')
		actualizeaza({ dataNasterii: `${nou.an}-${luna}-${String(zi).padStart(2, '0')}` })
	}

	const varsta = date.dataNasterii ? calculeazaVarsta(date.dataNasterii) : null

	return (
		<EcranPas
			pas="/onboarding/data-nasterii"
			titlu={t('onboarding.dataNasterii.titlu')}
			subtitlu={t('onboarding.dataNasterii.subtitlu')}
			poateContinua
			laContinuare={() => {
				// Confirmam valoarea implicita daca nu a atins nicio roata.
				if (date.dataNasterii === null) seteaza({})
			}}
		>
			<View style={[styles.roataWrap, { borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}>
				<View pointerEvents="none" style={[styles.evidentiere, { backgroundColor: colors.overlayLight }]} />
				<View style={styles.coloane}>
					<Coloana valori={zile} selectat={curent.zi} laSchimbare={(zi) => seteaza({ zi })} latime={70} />
					<Coloana
						valori={luni}
						etichete={eticheteLuni}
						selectat={curent.luna}
						laSchimbare={(luna) => seteaza({ luna })}
						latime={140}
					/>
					<Coloana valori={ani} selectat={curent.an} laSchimbare={(an) => seteaza({ an })} latime={90} />
				</View>
			</View>

			{varsta !== null ? (
				<Text style={[styles.varsta, { color: colors.textSecondary }]}>
					{t('onboarding.dataNasterii.varsta', { ani: varsta })}
				</Text>
			) : null}
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
	coloane: { flexDirection: 'row', justifyContent: 'center' },
	rand: { height: INALTIME_RAND, alignItems: 'center', justifyContent: 'center' },
	textRand: { fontSize: 19 },
	varsta: { textAlign: 'center', marginTop: 20, fontSize: 15, fontWeight: '600' },
})
