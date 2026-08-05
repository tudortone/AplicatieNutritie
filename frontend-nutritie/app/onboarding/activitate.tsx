import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { type Activitate } from '../../lib/onboarding'

const ORDINE: Activitate[] = ['sedentar', 'usor', 'moderat', 'intens', 'foarte_intens']

const SIMBOL: Record<Activitate, string> = {
	sedentar: '\u{1F4BB}',
	usor: '\u{1F6B6}',
	moderat: '\u{1F3C3}',
	intens: '\u{1F3CB}',
	foarte_intens: '\u{1F525}',
}

export default function PasActivitate() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/activitate"
			titlu={t('onboarding.activitate.titlu')}
			subtitlu={t('onboarding.activitate.subtitlu')}
			poateContinua={date.activitate !== null}
		>
			{ORDINE.map((a) => (
				<CardOptiune
					key={a}
					titlu={t(`onboarding.activitate.optiuni.${a}.titlu`)}
					detaliu={t(`onboarding.activitate.optiuni.${a}.detaliu`)}
					pictograma={<Text style={{ fontSize: 20 }}>{SIMBOL[a]}</Text>}
					selectat={date.activitate === a}
					laSelectare={() => actualizeaza({ activitate: a })}
				/>
			))}
		</EcranPas>
	)
}
