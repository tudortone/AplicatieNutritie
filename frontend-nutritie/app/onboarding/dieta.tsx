import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

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

const MAPARE_DIETA: Record<TipDieta, { titluKey: string; detaliuKey: string }> = {
	echilibrata: { titluKey: 'onboarding.dietBalancedTitle', detaliuKey: 'onboarding.dietBalancedDesc' },
	low_carb: { titluKey: 'onboarding.dietLowCarbTitle', detaliuKey: 'onboarding.dietLowCarbDesc' },
	bogata_proteine: { titluKey: 'onboarding.dietHighProteinTitle', detaliuKey: 'onboarding.dietHighProteinDesc' },
	mediteraneana: { titluKey: 'onboarding.dietMediterraneanTitle', detaliuKey: 'onboarding.dietMediterraneanDesc' },
	vegetariana: { titluKey: 'onboarding.dietVegetarianTitle', detaliuKey: 'onboarding.dietVegetarianDesc' },
	vegana: { titluKey: 'onboarding.dietVeganTitle', detaliuKey: 'onboarding.dietVeganDesc' },
	keto: { titluKey: 'onboarding.dietKetoTitle', detaliuKey: 'onboarding.dietKetoDesc' },
}

export default function PasDieta() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/dieta"
			titlu={t('onboarding.dietTitle')}
			subtitlu={t('onboarding.dietSubtitle')}
			poateContinua={date.dieta !== null}
		>
			{ORDINE.map((d) => (
				<CardOptiune
					key={d}
					titlu={t(MAPARE_DIETA[d].titluKey, ETICHETE_DIETA[d].titlu)}
					detaliu={t(MAPARE_DIETA[d].detaliuKey, ETICHETE_DIETA[d].detaliu)}
					pictograma={<Text style={{ fontSize: 20 }}>{SIMBOL[d]}</Text>}
					selectat={date.dieta === d}
					laSelectare={() => actualizeaza({ dieta: d })}
				/>
			))}
		</EcranPas>
	)
}
