import React from 'react'
import { StyleSheet, Text } from 'react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING } from '../../lib/onboarding'

export default function PasGreutateTinta() {
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()

	const curenta = date.greutateKg ?? 75
	// Propunem o tinta plauzibila: 10% mai jos la slabire, 8% mai sus la masa.
	const implicit =
		date.scop === 'masa'
			? Math.round(curenta * 1.08 * 2) / 2
			: Math.round(curenta * 0.9 * 2) / 2
	const valoare = date.greutateTintaKg ?? implicit

	const diferenta = valoare - curenta
	const directieGresita =
		(date.scop === 'slabire' && diferenta >= 0) || (date.scop === 'masa' && diferenta <= 0)

	const avertizare = directieGresita
		? date.scop === 'slabire'
			? 'Ai ales sa slabesti, deci tinta trebuie sa fie sub greutatea actuala.'
			: 'Ai ales sa pui in greutate, deci tinta trebuie sa fie peste greutatea actuala.'
		: null

	return (
		<EcranPas
			pas="/onboarding/greutate-tinta"
			titlu="Ce greutate vrei sa atingi?"
			subtitlu="Unde vrei sa ajungi? Poti schimba tinta oricand."
			poateContinua={!directieGresita}
			laContinuare={() => {
				if (date.greutateTintaKg === null) actualizeaza({ greutateTintaKg: implicit })
			}}
		>
			<SelectorValoare
				valoare={valoare}
				min={LIMITE_ONBOARDING.greutateKg.min}
				max={LIMITE_ONBOARDING.greutateKg.max}
				pas={0.5}
				zecimale={1}
				unitate="kg"
				laSchimbare={(greutateTintaKg) => actualizeaza({ greutateTintaKg })}
				avertizare={avertizare}
			/>

			{!directieGresita ? (
				<Text style={[styles.rezumat, { color: colors.textSecondary }]}>
					{diferenta === 0
						? 'Iti pastrezi greutatea actuala.'
						: `${Math.abs(diferenta).toFixed(1)} kg ${diferenta < 0 ? 'de pierdut' : 'de adaugat'} fata de ${curenta.toFixed(1)} kg.`}
				</Text>
			) : null}
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	rezumat: { textAlign: 'center', marginTop: 24, fontSize: 15, fontWeight: '600', lineHeight: 21 },
})
