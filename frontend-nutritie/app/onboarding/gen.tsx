import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import type { Gen } from '../../lib/onboarding'

export default function PasGen() {
	const { date, actualizeaza } = useOnboarding()
	const { t } = useTranslation()

	const optiuni: { valoare: Gen; titlu: string; simbol: string }[] = [
		{ valoare: 'masculin', titlu: t('onboarding.genderMale'), simbol: '♂' },
		{ valoare: 'feminin', titlu: t('onboarding.genderFemale'), simbol: '♀' },
	]

	return (
		<EcranPas
			pas="/onboarding/gen"
			titlu={t('onboarding.genderTitle')}
			subtitlu={t('onboarding.genderSubtitle')}
			poateContinua={date.gen !== null}
		>
			{optiuni.map((o) => (
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
