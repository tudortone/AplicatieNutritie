import React from 'react'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { LIMITE_ONBOARDING } from '../../lib/onboarding'

const IMPLICIT = 75

export default function PasGreutate() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()
	const valoare = date.greutateKg ?? IMPLICIT

	return (
		<EcranPas
			pas="/onboarding/greutate"
			titlu={t('onboarding.greutate.titlu')}
			subtitlu={t('onboarding.greutate.subtitlu')}
			poateContinua
			laContinuare={() => {
				if (date.greutateKg === null) actualizeaza({ greutateKg: IMPLICIT })
			}}
		>
			<SelectorValoare
				valoare={valoare}
				min={LIMITE_ONBOARDING.greutateKg.min}
				max={LIMITE_ONBOARDING.greutateKg.max}
				pas={0.5}
				zecimale={1}
				unitate="kg"
				laSchimbare={(greutateKg) => actualizeaza({ greutateKg })}
			/>
		</EcranPas>
	)
}
