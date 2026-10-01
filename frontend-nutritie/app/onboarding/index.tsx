import React, { useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { changeLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from '../../i18n'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export default function PasLimba() {
	const { t, i18n } = useTranslation()
	const reduceMotion = useReducedMotion()
	const [currentLang, setCurrentLang] = useState<SupportedLanguage>(
		() => (i18n.language as SupportedLanguage) || 'en'
	)

	const handleSelectLanguage = async (lang: SupportedLanguage) => {
		try {
			Haptics.selectionAsync()
		} catch {}
		setCurrentLang(lang)
		await changeLanguage(lang)
	}

	return (
		<EcranPas
			pas="/onboarding"
			titlu={t('onboarding.chooseLanguageTitle', 'Choose your language')}
			subtitlu={t('onboarding.chooseLanguageSubtitle', 'Select your preferred language for GetFlow.')}
			poateContinua={true}
		>
			<View style={{ marginTop: 8 }}>
				{SUPPORTED_LANGUAGES.map((lang, index) => {
					const isSelected = currentLang === lang
					const info = LANGUAGE_NAMES[lang]
					return (
						<Animated.View
							key={lang}
							entering={reduceMotion ? undefined : FadeInDown.duration(350).delay(index * 60)}
						>
							<CardOptiune
								titlu={info.label}
								pictograma={<Text style={{ fontSize: 24 }}>{info.flag}</Text>}
								selectat={isSelected}
								laSelectare={() => handleSelectLanguage(lang)}
							/>
						</Animated.View>
					)
				})}
			</View>
		</EcranPas>
	)
}
