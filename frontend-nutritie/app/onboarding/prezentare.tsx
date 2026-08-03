import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BarChart3, Camera, Flame, PieChart, TrendingUp } from 'lucide-react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { useAppStore } from '../../hooks/useAppStore'

const FUNCTII = [
	{
		Pictograma: Flame,
		titlu: 'Urmarirea caloriilor',
		detaliu: 'Adaugi mesele in cateva secunde si vezi cat ti-a mai ramas pe ziua respectiva.',
	},
	{
		Pictograma: Camera,
		titlu: 'Scanare cu AI',
		detaliu: 'Fotografiezi farfuria sau codul de bare si primesti valorile nutritionale instant.',
	},
	{
		Pictograma: PieChart,
		titlu: 'Impartirea macronutrientilor',
		detaliu: 'Proteine, carbohidrati si grasimi, calculate pentru fiecare masa.',
	},
	{
		Pictograma: BarChart3,
		titlu: 'Antrenamente si harta musculara',
		detaliu: 'Vezi ce grupe musculare ai lucrat si care raman in urma.',
	},
	{
		Pictograma: TrendingUp,
		titlu: 'Progres si serii zilnice',
		detaliu: 'Grafice pe termen lung si streak-uri care te tin consecvent.',
	},
]

export default function PasPrezentare() {
	const { plan } = useOnboarding()
	const { colors } = useTheme()
	const { setOnboardingDone } = useAppStore()
	const router = useRouter()
	const [seIncarca, setSeIncarca] = useState(false)

	const finalizeaza = () => {
		setSeIncarca(true)
		// Raspunsurile raman in AsyncStorage si se urca in cont dupa autentificare.
		setOnboardingDone(true)
		router.replace('/auth')
		// Oprim navigarea automata; am mers deja catre ecranul de autentificare.
		return false
	}

	return (
		<EcranPas
			pas="/onboarding/prezentare"
			titlu="Ce primesti in aplicatie"
			subtitlu={
				plan
					? `Planul tau de ${plan.calorii} kcal pe zi te asteapta dupa ce iti creezi contul.`
					: 'Tot ce ai nevoie ca sa iti tii nutritia sub control.'
			}
			poateContinua
			etichetaButon="Creeaza-ti contul"
			seIncarca={seIncarca}
			laContinuare={finalizeaza}
		>
			{FUNCTII.map((f, i) => (
				<Animated.View
					key={f.titlu}
					entering={FadeInDown.duration(420).delay(i * 70)}
					style={styles.rand}
				>
					<View style={[styles.pictogramaWrap, { backgroundColor: colors.overlayLight }]}>
						<f.Pictograma size={20} color={colors.accent} strokeWidth={2.2} />
					</View>
					<View style={styles.text}>
						<Text style={[styles.titlu, { color: colors.textPrimary }]}>{f.titlu}</Text>
						<Text style={[styles.detaliu, { color: colors.textSecondary }]}>{f.detaliu}</Text>
					</View>
				</Animated.View>
			))}
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	rand: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 22 },
	pictogramaWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
	text: { flex: 1, paddingTop: 2 },
	titlu: { fontSize: 16, fontWeight: '800' },
	detaliu: { fontSize: 13, marginTop: 4, lineHeight: 19 },
})
