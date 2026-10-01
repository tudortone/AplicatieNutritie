import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { ETICHETE_ACTIVITATE, type Activitate } from '../../lib/onboarding'

const ORDINE: Activitate[] = ['sedentar', 'usor', 'moderat', 'intens', 'foarte_intens']

const SIMBOL: Record<Activitate, string> = {
	sedentar: '\u{1F4BB}',
	usor: '\u{1F6B6}',
	moderat: '\u{1F3C3}',
	intens: '\u{1F3CB}',
	foarte_intens: '\u{1F525}',
}

const MAPARE_ACTIVITATE: Record<Activitate, { titluKey: string; detaliuKey: string }> = {
	sedentar: { titluKey: 'onboarding.activitySedentaryTitle', detaliuKey: 'onboarding.activitySedentaryDesc' },
	usor: { titluKey: 'onboarding.activityLightTitle', detaliuKey: 'onboarding.activityLightDesc' },
	moderat: { titluKey: 'onboarding.activityModerateTitle', detaliuKey: 'onboarding.activityModerateDesc' },
	intens: { titluKey: 'onboarding.activityIntenseTitle', detaliuKey: 'onboarding.activityIntenseDesc' },
	foarte_intens: { titluKey: 'onboarding.activityVeryIntenseTitle', detaliuKey: 'onboarding.activityVeryIntenseDesc' },
}

export default function PasActivitate() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/activitate"
			titlu={t('onboarding.activityTitle')}
			subtitlu={t('onboarding.activitySubtitle')}
			poateContinua={date.activitate !== null}
		>
			{ORDINE.map((a) => (
				<CardOptiune
					key={a}
					titlu={t(MAPARE_ACTIVITATE[a].titluKey, ETICHETE_ACTIVITATE[a].titlu)}
					detaliu={t(MAPARE_ACTIVITATE[a].detaliuKey, ETICHETE_ACTIVITATE[a].detaliu)}
					pictograma={<Text style={{ fontSize: 20 }}>{SIMBOL[a]}</Text>}
					selectat={date.activitate === a}
					laSelectare={() => actualizeaza({ activitate: a })}
				/>
			))}
		</EcranPas>
	)
}
