import React, { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BarChart3, Camera, Flame, PieChart, TrendingUp } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { useAppStore } from '../../hooks/useAppStore'

export default function PasPrezentare() {
	const { t } = useTranslation()
	const { plan } = useOnboarding()
	const { colors } = useTheme()
	const { setOnboardingDone } = useAppStore()
	const router = useRouter()
	const [seIncarca, setSeIncarca] = useState(false)

	const FUNCTII = [
		{
			Pictograma: Flame,
			titlu: t('onboarding.featureCaloriesTitle'),
			detaliu: t('onboarding.featureCaloriesDesc'),
		},
		{
			Pictograma: Camera,
			titlu: t('onboarding.featureAiScanTitle'),
			detaliu: t('onboarding.featureAiScanDesc'),
		},
		{
			Pictograma: PieChart,
			titlu: t('onboarding.featureMacrosTitle'),
			detaliu: t('onboarding.featureMacrosDesc'),
		},
		{
			Pictograma: BarChart3,
			titlu: t('onboarding.featureWorkoutsTitle'),
			detaliu: t('onboarding.featureWorkoutsDesc'),
		},
		{
			Pictograma: TrendingUp,
			titlu: t('onboarding.featureProgressTitle'),
			detaliu: t('onboarding.featureProgressDesc'),
		},
	]

	const finalizeaza = async () => {
		setSeIncarca(true)
		try {
			// Confirmăm scrierea durabilă înainte de navigare, astfel încât un
			// reload/kill imediat să nu repornească onboarding-ul.
			await setOnboardingDone(true)
			router.replace('/auth')
			// Oprim navigarea automata; am mers deja catre ecranul de autentificare.
			return false
		} catch (eroare) {
			setSeIncarca(false)
			Alert.alert(
				t('onboarding.featuresSaveErrorTitle'),
				t('onboarding.featuresSaveErrorMsg'),
			)
			// EcranPas eliberează protecția de navigare în ramura de eroare.
			throw eroare
		}
	}

	return (
		<EcranPas
			pas="/onboarding/prezentare"
			titlu={t('onboarding.featuresTitle')}
			subtitlu={
				plan
					? t('onboarding.featuresSubtitle', { calories: plan.calorii })
					: t('onboarding.featuresGenericSubtitle')
			}
			poateContinua
			etichetaButon={t('onboarding.featuresCreateAccountBtn')}
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
