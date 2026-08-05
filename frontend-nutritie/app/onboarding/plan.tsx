import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'

function formateazaData(d: Date, limba: string): string {
	return d.toLocaleDateString(limba === 'en' ? 'en-US' : 'ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Rand({ eticheta, valoare }: { eticheta: string; valoare: string }) {
	const { colors } = useTheme()
	return (
		<View style={styles.randDetaliu}>
			<Text style={[styles.randEticheta, { color: colors.textSecondary }]}>{eticheta}</Text>
			<Text style={[styles.randValoare, { color: colors.textPrimary }]}>{valoare}</Text>
		</View>
	)
}

export default function PasPlan() {
	const { t, i18n } = useTranslation()
	const { date, plan } = useOnboarding()
	const { colors } = useTheme()

	// Planul lipseste doar daca un pas a fost ocolit; atunci nu inventam cifre.
	if (!plan) {
		return (
			<EcranPas
				pas="/onboarding/plan"
				titlu={t('onboarding.plan.titluIncomplet')}
				subtitlu={t('onboarding.plan.subtitluIncomplet')}
				poateContinua={false}
			>
				<View />
			</EcranPas>
		)
	}

	const macro = [
		{ cheie: 'macroProteine', valoare: `${plan.proteineG} g`, culoare: colors.accent },
		{ cheie: 'macroCarbohidrati', valoare: `${plan.carbohidratiG} g`, culoare: colors.accentSecondary },
		{ cheie: 'macroGrasimi', valoare: `${plan.grasimiG} g`, culoare: colors.success },
	]

	return (
		<EcranPas
			pas="/onboarding/plan"
			titlu={t('onboarding.plan.titluGata')}
			subtitlu={
				date.scop === 'mentinere'
					? t('onboarding.plan.subtitluMentinere')
					: t('onboarding.plan.subtitluEstimare', { greutate: date.greutateTintaKg?.toFixed(1) })
			}
			poateContinua
		>
			<Animated.View entering={FadeInDown.duration(500)}>
				<LinearGradient
					colors={colors.accentGradient}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={styles.cardPrincipal}
				>
					<Text style={[styles.etichetaMare, { color: colors.background }]}>{t('onboarding.plan.caloriiZilnice')}</Text>
					<Text style={[styles.calorii, { color: colors.background }]}>{plan.calorii}</Text>
					<Text style={[styles.etichetaMare, { color: colors.background }]}>{t('onboarding.plan.kcalPeZi')}</Text>
				</LinearGradient>
			</Animated.View>

			<View style={styles.macroRand}>
				{macro.map((m) => (
					<View
						key={m.cheie}
						style={[styles.macroCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
					>
						<View style={[styles.punct, { backgroundColor: m.culoare }]} />
						<Text style={[styles.macroValoare, { color: colors.textPrimary }]}>{m.valoare}</Text>
						<Text style={[styles.macroEticheta, { color: colors.textSecondary }]}>{t(`onboarding.plan.${m.cheie}`)}</Text>
					</View>
				))}
			</View>

			<View style={[styles.detalii, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
				<Rand eticheta={t('onboarding.plan.bmr')} valoare={`${plan.bmr} kcal`} />
				<Rand eticheta={t('onboarding.plan.tdee')} valoare={`${plan.tdee} kcal`} />
				<Rand
					eticheta={
						plan.ajustare < 0
							? t('onboarding.plan.deficitZilnic')
							: plan.ajustare > 0
								? t('onboarding.plan.surplusZilnic')
								: t('onboarding.plan.ajustare')
					}
					valoare={plan.ajustare === 0 ? t('onboarding.plan.fara') : `${Math.abs(plan.ajustare)} kcal`}
				/>
				<Rand
					eticheta={t('onboarding.plan.stilAlimentar')}
					valoare={date.dieta ? t(`onboarding.dieta.optiuni.${date.dieta}.titlu`) : '-'}
				/>
				{plan.dataEstimata ? (
					<Rand eticheta={t('onboarding.plan.estimareObiectiv')} valoare={formateazaData(plan.dataEstimata, i18n.language)} />
				) : null}
			</View>

			{plan.limitatLaMinim ? (
				<Text style={[styles.avertizare, { color: colors.danger }]}>
					{t('onboarding.plan.limitatLaMinim')}
				</Text>
			) : null}

			<Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
				{t('onboarding.plan.disclaimer')}
			</Text>
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	cardPrincipal: { borderRadius: 26, paddingVertical: 30, alignItems: 'center' },
	calorii: { fontSize: 60, fontWeight: '900', letterSpacing: -2.5, marginVertical: 2 },
	etichetaMare: { fontSize: 14, fontWeight: '700', opacity: 0.75 },
	macroRand: { flexDirection: 'row', gap: 10, marginTop: 14 },
	macroCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, alignItems: 'center' },
	punct: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
	macroValoare: { fontSize: 18, fontWeight: '900' },
	macroEticheta: { fontSize: 12, marginTop: 3 },
	detalii: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 14, gap: 12 },
	randDetaliu: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
	randEticheta: { fontSize: 14, flex: 1 },
	randValoare: { fontSize: 14, fontWeight: '800' },
	avertizare: { fontSize: 13, lineHeight: 19, marginTop: 16, fontWeight: '600' },
	disclaimer: { fontSize: 12, lineHeight: 17, marginTop: 16, textAlign: 'center' },
})
