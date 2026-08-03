import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown } from 'react-native-reanimated'

import EcranPas from '../../components/onboarding/EcranPas'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { ETICHETE_DIETA } from '../../lib/onboarding'

function formateazaData(d: Date): string {
	return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
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
	const { date, plan } = useOnboarding()
	const { colors } = useTheme()

	// Planul lipseste doar daca un pas a fost ocolit; atunci nu inventam cifre.
	if (!plan) {
		return (
			<EcranPas
				pas="/onboarding/plan"
				titlu="Mai avem nevoie de cateva raspunsuri"
				subtitlu="Intoarce-te si completeaza pasii ramasi ca sa putem calcula planul."
				poateContinua={false}
			>
				<View />
			</EcranPas>
		)
	}

	const macro = [
		{ eticheta: 'Proteine', valoare: `${plan.proteineG} g`, culoare: colors.accent },
		{ eticheta: 'Carbohidrati', valoare: `${plan.carbohidratiG} g`, culoare: colors.accentSecondary },
		{ eticheta: 'Grasimi', valoare: `${plan.grasimiG} g`, culoare: colors.success },
	]

	return (
		<EcranPas
			pas="/onboarding/plan"
			titlu="Planul tau este gata"
			subtitlu={
				date.scop === 'mentinere'
					? 'Atat iti trebuie zilnic ca sa iti mentii greutatea actuala.'
					: `Estimarea noastra ca sa ajungi la ${date.greutateTintaKg?.toFixed(1)} kg.`
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
					<Text style={[styles.etichetaMare, { color: colors.background }]}>Calorii zilnice</Text>
					<Text style={[styles.calorii, { color: colors.background }]}>{plan.calorii}</Text>
					<Text style={[styles.etichetaMare, { color: colors.background }]}>kcal pe zi</Text>
				</LinearGradient>
			</Animated.View>

			<View style={styles.macroRand}>
				{macro.map((m) => (
					<View
						key={m.eticheta}
						style={[styles.macroCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
					>
						<View style={[styles.punct, { backgroundColor: m.culoare }]} />
						<Text style={[styles.macroValoare, { color: colors.textPrimary }]}>{m.valoare}</Text>
						<Text style={[styles.macroEticheta, { color: colors.textSecondary }]}>{m.eticheta}</Text>
					</View>
				))}
			</View>

			<View style={[styles.detalii, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
				<Rand eticheta="Metabolism bazal" valoare={`${plan.bmr} kcal`} />
				<Rand eticheta="Consum total estimat" valoare={`${plan.tdee} kcal`} />
				<Rand
					eticheta={plan.ajustare < 0 ? 'Deficit zilnic' : plan.ajustare > 0 ? 'Surplus zilnic' : 'Ajustare'}
					valoare={plan.ajustare === 0 ? 'fara' : `${Math.abs(plan.ajustare)} kcal`}
				/>
				<Rand eticheta="Stil alimentar" valoare={date.dieta ? ETICHETE_DIETA[date.dieta].titlu : '-'} />
				{plan.dataEstimata ? (
					<Rand eticheta="Estimare atingere obiectiv" valoare={formateazaData(plan.dataEstimata)} />
				) : null}
			</View>

			{plan.limitatLaMinim ? (
				<Text style={[styles.avertizare, { color: colors.danger }]}>
					Am limitat deficitul ca sa nu cobori sub pragul sigur de calorii. Obiectivul va fi atins
					putin mai lent, dar mai sanatos.
				</Text>
			) : null}

			<Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
				Sunt estimari orientative, nu sfat medical. Consulta un specialist daca ai o afectiune
				sau urmezi un tratament.
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
