import React from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { type Scop } from '../../lib/onboarding'

const SIMBOL: Record<Scop, string> = {
	slabire: '\u2193',
	mentinere: '\u2194',
	masa: '\u2191',
}

const ORDINE: Scop[] = ['slabire', 'mentinere', 'masa']

export default function PasScop() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/scop"
			titlu={t('onboarding.scop.titlu')}
			subtitlu={t('onboarding.scop.subtitlu')}
			poateContinua={date.scop !== null}
		>
			{ORDINE.map((s) => (
				<CardOptiune
					key={s}
					titlu={t(`onboarding.scop.optiuni.${s}.titlu`)}
					detaliu={t(`onboarding.scop.optiuni.${s}.detaliu`)}
					pictograma={<Text style={{ fontSize: 22 }}>{SIMBOL[s]}</Text>}
					selectat={date.scop === s}
					laSelectare={() => {
						// La mentinere, tinta este chiar greutatea curenta si ritmul zero.
						if (s === 'mentinere') {
							actualizeaza({ scop: s, greutateTintaKg: date.greutateKg, ritmKgSaptamana: 0 })
						} else {
							actualizeaza({ scop: s })
						}
					}}
				/>
			))}
		</EcranPas>
	)
}
