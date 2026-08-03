import React from 'react'
import { Text } from 'react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { ETICHETE_DIETA, type TipDieta } from '../../lib/onboarding'

const ORDINE: TipDieta[] = [
	'echilibrata',
	'low_carb',
	'bogata_proteine',
	'mediteraneana',
	'vegetariana',
	'vegana',
	'keto',
]

const SIMBOL: Record<TipDieta, string> = {
	echilibrata: '\u{1F37D}',
	low_carb: '\u{1F957}',
	bogata_proteine: '\u{1F969}',
	mediteraneana: '\u{1F41F}',
	vegetariana: '\u{1F95A}',
	vegana: '\u{1F331}',
	keto: '\u{1F951}',
}

export default function PasDieta() {
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/dieta"
			titlu="Ce stil de alimentatie preferi?"
			subtitlu="Stabileste impartirea macronutrientilor si recomandarile primite."
			poateContinua={date.dieta !== null}
		>
			{ORDINE.map((d) => (
				<CardOptiune
					key={d}
					titlu={ETICHETE_DIETA[d].titlu}
					detaliu={ETICHETE_DIETA[d].detaliu}
					pictograma={<Text style={{ fontSize: 20 }}>{SIMBOL[d]}</Text>}
					selectat={date.dieta === d}
					laSelectare={() => actualizeaza({ dieta: d })}
				/>
			))}
		</EcranPas>
	)
}
