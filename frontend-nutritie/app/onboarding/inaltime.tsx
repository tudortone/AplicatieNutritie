import React from 'react'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { LIMITE_ONBOARDING } from '../../lib/onboarding'

const IMPLICIT = 175

export default function PasInaltime() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()
	const valoare = date.inaltimeCm ?? IMPLICIT

	return (
		<EcranPas
			pas="/onboarding/inaltime"
			titlu={t('onboarding.inaltime.titlu')}
			subtitlu={t('onboarding.inaltime.subtitlu')}
			poateContinua
			laContinuare={() => {
				// Salvam explicit valoarea implicita daca nu a atins rigla.
				if (date.inaltimeCm === null) actualizeaza({ inaltimeCm: IMPLICIT })
			}}
		>
			<SelectorValoare
				valoare={valoare}
				min={LIMITE_ONBOARDING.inaltimeCm.min}
				max={LIMITE_ONBOARDING.inaltimeCm.max}
				pas={1}
				unitate="cm"
				laSchimbare={(inaltimeCm) => actualizeaza({ inaltimeCm })}
			/>
		</EcranPas>
	)
}
