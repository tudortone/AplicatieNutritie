import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import type { Gen } from '../../lib/onboarding'

const OPTIUNI: { valoare: Gen; simbol: string }[] = [
	{ valoare: 'masculin', simbol: '\u2642' },
	{ valoare: 'feminin', simbol: '\u2640' },
]

export default function PasGen() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding"
			titlu={t('onboarding.gen.titlu')}
			subtitlu={t('onboarding.gen.subtitlu')}
			poateContinua={date.gen !== null}
		>
			{OPTIUNI.map((o) => (
				<CardOptiune
					key={o.valoare}
					titlu={t(`onboarding.gen.optiuni.${o.valoare}`)}
					pictograma={<Text style={{ fontSize: 22 }}>{o.simbol}</Text>}
					selectat={date.gen === o.valoare}
					laSelectare={() => actualizeaza({ gen: o.valoare })}
				/>
			))}
		</EcranPas>
	)
}
