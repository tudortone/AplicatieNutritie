import React from 'react'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { LIMITE_ONBOARDING } from '../../lib/onboarding'

const IMPLICIT = 175

export default function PasInaltime() {
	const { date, actualizeaza } = useOnboarding()
	const valoare = date.inaltimeCm ?? IMPLICIT

	return (
		<EcranPas
			pas="/onboarding/inaltime"
			titlu="Cat de inalt esti?"
			subtitlu="Impreuna cu greutatea, ne spune de cata energie ai nevoie zilnic."
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
