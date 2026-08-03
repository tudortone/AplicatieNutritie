import React from 'react'
import { Text } from 'react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { useOnboarding } from '../../context/OnboardingContext'
import { ETICHETE_SCOP, type Scop } from '../../lib/onboarding'

const SIMBOL: Record<Scop, string> = {
	slabire: '\u2193',
	mentinere: '\u2194',
	masa: '\u2191',
}

const ORDINE: Scop[] = ['slabire', 'mentinere', 'masa']

export default function PasScop() {
	const { date, actualizeaza } = useOnboarding()

	return (
		<EcranPas
			pas="/onboarding/scop"
			titlu="Care este obiectivul tau?"
			subtitlu="Alege directia. Restul planului se construieste in jurul ei."
			poateContinua={date.scop !== null}
		>
			{ORDINE.map((s) => (
				<CardOptiune
					key={s}
					titlu={ETICHETE_SCOP[s].titlu}
					detaliu={ETICHETE_SCOP[s].detaliu}
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
