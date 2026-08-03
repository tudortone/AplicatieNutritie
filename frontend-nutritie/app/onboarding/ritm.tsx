import React from 'react'
import { StyleSheet, Text } from 'react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING, ritmEsteAgresiv } from '../../lib/onboarding'

const IMPLICIT = 0.5

export default function PasRitm() {
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()

	const valoare = date.ritmKgSaptamana ?? IMPLICIT
	const agresiv = ritmEsteAgresiv(date.greutateKg, valoare)
	const verb = date.scop === 'masa' ? 'pui in greutate' : 'slabesti'

	return (
		<EcranPas
			pas="/onboarding/ritm"
			titlu={`Cat de repede vrei sa ${verb}?`}
			subtitlu="Poti schimba ritmul oricand, din setari."
			poateContinua
			laContinuare={() => {
				if (date.ritmKgSaptamana === null) actualizeaza({ ritmKgSaptamana: IMPLICIT })
			}}
		>
			<SelectorValoare
				valoare={valoare}
				min={LIMITE_ONBOARDING.ritmKgSaptamana.min}
				max={LIMITE_ONBOARDING.ritmKgSaptamana.max}
				pas={0.1}
				zecimale={1}
				unitate="kg / saptamana"
				laSchimbare={(ritmKgSaptamana) => actualizeaza({ ritmKgSaptamana })}
				avertizare={
					agresiv
						? 'Este un ritm agresiv: e mai greu de sustinut si risti sa pierzi masa musculara.'
						: null
				}
			/>

			{!agresiv ? (
				<Text style={[styles.nota, { color: colors.textSecondary }]}>
					Un ritm intre 0,3 si 0,8 kg pe saptamana este cel mai usor de mentinut pe termen lung.
				</Text>
			) : null}
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	nota: { textAlign: 'center', marginTop: 24, fontSize: 14, lineHeight: 20 },
})
