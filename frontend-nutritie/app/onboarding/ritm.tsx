import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING, ritmEsteAgresiv } from '../../lib/onboarding'

const IMPLICIT = 0.5

export default function PasRitm() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()

	const valoare = date.ritmKgSaptamana ?? IMPLICIT
	const agresiv = ritmEsteAgresiv(date.greutateKg, valoare)
	const titlu =
		date.scop === 'masa' ? t('onboarding.ritm.titluMasa') : t('onboarding.ritm.titluSlabire')

	return (
		<EcranPas
			pas="/onboarding/ritm"
			titlu={titlu}
			subtitlu={t('onboarding.ritm.subtitlu')}
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
				unitate={t('onboarding.ritm.unitate')}
				laSchimbare={(ritmKgSaptamana) => actualizeaza({ ritmKgSaptamana })}
				avertizare={
					agresiv ? t('onboarding.ritm.avertizareAgresiv') : null
				}
			/>

			{!agresiv ? (
				<Text style={[styles.nota, { color: colors.textSecondary }]}>
					{t('onboarding.ritm.nota')}
				</Text>
			) : null}
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	nota: { textAlign: 'center', marginTop: 24, fontSize: 14, lineHeight: 20 },
})
