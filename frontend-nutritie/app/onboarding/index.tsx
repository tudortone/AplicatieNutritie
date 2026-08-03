import React from 'react'
import { Text } from 'react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import type { Gen } from '../../lib/onboarding'

const OPTIUNI: { valoare: Gen; titlu: string; simbol: string }[] = [
	{ valoare: 'masculin', titlu: 'Masculin', simbol: '\u2642' },
	{ valoare: 'feminin', titlu: 'Feminin', simbol: '\u2640' },
]

export default function PasGen() {
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding"
			titlu="Hai sa te cunoastem"
			subtitlu="Ne ajuta sa personalizam planul si recomandarile pentru tine."
			poateContinua={date.gen !== null}
		>
			{OPTIUNI.map((o) => (
				<CardOptiune
					key={o.valoare}
					titlu={o.titlu}
					pictograma={<Text style={{ fontSize: 22 }}>{o.simbol}</Text>}
					selectat={date.gen === o.valoare}
					laSelectare={() => actualizeaza({ gen: o.valoare })}
				/>
			))}
		</EcranPas>
	)
}
