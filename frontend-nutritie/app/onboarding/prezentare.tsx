import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BarChart3, Camera, Flame, PieChart, TrendingUp } from 'lucide-react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { useAppStore } from '../../hooks/useAppStore'

const FUNCTII = [
	{ cheie: 'calorii', Pictograma: Flame },
	{ cheie: 'scanare', Pictograma: Camera },
	{ cheie: 'macro', Pictograma: PieChart },
	{ cheie: 'antrenamente', Pictograma: BarChart3 },
	{ cheie: 'progres', Pictograma: TrendingUp },
]

export default function PasPrezentare() {
	const { t } = useTranslation()
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
			titlu={t('onboarding.prezentare.titlu')}
			subtitlu={
				plan
					? t('onboarding.prezentare.subtitluPlan', { kcal: plan.calorii })
					: t('onboarding.prezentare.subtitluFaraPlan')
			}
			poateContinua
			etichetaButon={t('onboarding.prezentare.buton')}
			seIncarca={seIncarca}
			laContinuare={finalizeaza}
		>
			{FUNCTII.map((f, i) => (
				<Animated.View
					key={f.cheie}
					entering={FadeInDown.duration(420).delay(i * 70)}
					style={styles.rand}
				>
					<View style={[styles.pictogramaWrap, { backgroundColor: colors.overlayLight }]}>
						<f.Pictograma size={20} color={colors.accent} strokeWidth={2.2} />
					</View>
					<View style={styles.text}>
						<Text style={[styles.titlu, { color: colors.textPrimary }]}>
							{t(`onboarding.prezentare.functii.${f.cheie}.titlu`)}
						</Text>
						<Text style={[styles.detaliu, { color: colors.textSecondary }]}>
							{t(`onboarding.prezentare.functii.${f.cheie}.detaliu`)}
						</Text>
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
