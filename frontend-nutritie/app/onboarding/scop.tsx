import React from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, TrendingDown, TrendingUp } from 'lucide-react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { ETICHETE_SCOP, type Scop } from '../../lib/onboarding'

const PICTOGRAMA: Record<Scop, typeof TrendingDown> = {
	slabire: TrendingDown,
	mentinere: Scale,
	masa: TrendingUp,
}

const ORDINE: Scop[] = ['slabire', 'mentinere', 'masa']

export default function PasScop() {
	const { date, actualizeaza } = useOnboarding()
	const { t } = useTranslation()

	const getEticheta = (s: Scop) => {
		switch (s) {
			case 'slabire':
				return {
					titlu: t('onboarding.goalLoseTitle', { defaultValue: ETICHETE_SCOP[s].titlu }),
					detaliu: t('onboarding.goalLoseDesc', { defaultValue: ETICHETE_SCOP[s].detaliu }),
				}
			case 'mentinere':
				return {
					titlu: t('onboarding.goalMaintainTitle', { defaultValue: ETICHETE_SCOP[s].titlu }),
					detaliu: t('onboarding.goalMaintainDesc', { defaultValue: ETICHETE_SCOP[s].detaliu }),
				}
			case 'masa':
				return {
					titlu: t('onboarding.goalGainTitle', { defaultValue: ETICHETE_SCOP[s].titlu }),
					detaliu: t('onboarding.goalGainDesc', { defaultValue: ETICHETE_SCOP[s].detaliu }),
				}
		}
	}

	return (
		<EcranPas
			pas="/onboarding/scop"
			titlu={t('onboarding.goalTitle')}
			subtitlu={t('onboarding.goalSubtitle')}
			poateContinua={date.scop !== null}
		>
			{ORDINE.map((s) => {
				const info = getEticheta(s)
				const Pictograma = PICTOGRAMA[s]
				return (
					<CardOptiune
						key={s}
						titlu={info.titlu}
						detaliu={info.detaliu}
						pictograma={<Pictograma testID={`goal-icon-${s}`} size={21} strokeWidth={2.1} />}
						accentIcon
						pictogramaTestID={`goal-icon-${s}`}
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
				)
			})}
		</EcranPas>
	)
}
