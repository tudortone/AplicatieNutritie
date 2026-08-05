import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import EcranPas from '../../components/onboarding/EcranPas'
import SelectorValoare from '../../components/onboarding/SelectorValoare'
import { useOnboarding } from '../../context/OnboardingContext'
import { useTheme } from '../../context/ThemeContext'
import { LIMITE_ONBOARDING } from '../../lib/onboarding'

export default function PasGreutateTinta() {
	const { t } = useTranslation()
	const { date, actualizeaza } = useOnboarding()
	const { colors } = useTheme()

	const curenta = date.greutateKg ?? 75
	// Propunem o tinta plauzibila: 10% mai jos la slabire, 8% mai sus la masa.
	const implicit =
		date.scop === 'masa'
			? Math.round(curenta * 1.08 * 2) / 2
			: Math.round(curenta * 0.9 * 2) / 2
	const valoare = date.greutateTintaKg ?? implicit

	const diferenta = valoare - curenta
	const directieGresita =
		(date.scop === 'slabire' && diferenta >= 0) || (date.scop === 'masa' && diferenta <= 0)

	const avertizare = directieGresita
		? date.scop === 'slabire'
			? t('onboarding.greutateTinta.avertizareSlabire')
			: t('onboarding.greutateTinta.avertizareMasa')
		: null

	return (
		<EcranPas
			pas="/onboarding/greutate-tinta"
			titlu={t('onboarding.greutateTinta.titlu')}
			subtitlu={t('onboarding.greutateTinta.subtitlu')}
			poateContinua={!directieGresita}
			laContinuare={() => {
				if (date.greutateTintaKg === null) actualizeaza({ greutateTintaKg: implicit })
			}}
		>
			<SelectorValoare
				valoare={valoare}
				min={LIMITE_ONBOARDING.greutateKg.min}
				max={LIMITE_ONBOARDING.greutateKg.max}
				pas={0.5}
				zecimale={1}
				unitate="kg"
				laSchimbare={(greutateTintaKg) => actualizeaza({ greutateTintaKg })}
				avertizare={avertizare}
			/>

			{!directieGresita ? (
				<Text style={[styles.rezumat, { color: colors.textSecondary }]}>
					{diferenta === 0
						? t('onboarding.greutateTinta.rezumatMentinere')
						: t(
								diferenta < 0
									? 'onboarding.greutateTinta.rezumatPierdere'
									: 'onboarding.greutateTinta.rezumatAdaugare',
								{
									diferenta: Math.abs(diferenta).toFixed(1),
									curenta: curenta.toFixed(1),
								},
							)}
				</Text>
			) : null}
		</EcranPas>
	)
}

const styles = StyleSheet.create({
	rezumat: { textAlign: 'center', marginTop: 24, fontSize: 15, fontWeight: '600', lineHeight: 21 },
})
