import React from 'react'
import { Text } from 'react-native'

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

export default function PasActivitate() {
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/activitate"
			titlu="Cat de activ esti intr-o zi obisnuita?"
			subtitlu="Ne ajuta sa estimam de cate calorii ai nevoie zilnic."
			poateContinua={date.activitate !== null}
		>
			{ORDINE.map((a) => (
				<CardOptiune
					key={a}
					titlu={ETICHETE_ACTIVITATE[a].titlu}
					detaliu={ETICHETE_ACTIVITATE[a].detaliu}
					pictograma={<Text style={{ fontSize: 20 }}>{SIMBOL[a]}</Text>}
					selectat={date.activitate === a}
					laSelectare={() => actualizeaza({ activitate: a })}
				/>
			))}
		</EcranPas>
	)
}
