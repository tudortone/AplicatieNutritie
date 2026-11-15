import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { ArrowRight } from 'lucide-react-native'

import EcranPas from '../../components/onboarding/EcranPas'
import CardOptiune from '../../components/onboarding/CardOptiune'
import { changeLanguage, i18nReady, SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from '../../i18n'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useTheme } from '../../context/ThemeContext'
import { useAppStore } from '../../hooks/useAppStore'

function toSupportedLang(lng?: string | null): SupportedLanguage {
	const short = (lng || 'en').split('-')[0] as SupportedLanguage
	return SUPPORTED_LANGUAGES.includes(short) ? short : 'en'
}

export default function PasLimba() {
	const { t, i18n } = useTranslation()
	const reduceMotion = useReducedMotion()
	const { colors } = useTheme()
	const router = useRouter()
	const setSkipOnboardingToAuth = useAppStore((s) => s.setSkipOnboardingToAuth)
	const [currentLang, setCurrentLang] = useState<SupportedLanguage>(
		() => toSupportedLang(i18n.resolvedLanguage || i18n.language)
	)
	const hasSyncedReadyRef = useRef(false)
	const userSelectedRef = useRef(false)

	useEffect(() => {
		let active = true
		if (!hasSyncedReadyRef.current) {
			hasSyncedReadyRef.current = true
			void Promise.resolve(i18nReady).then((resolved) => {
				if (active && !userSelectedRef.current && resolved) {
					setCurrentLang(toSupportedLang(i18n.resolvedLanguage || i18n.language || resolved))
				}
			}).catch(() => { })
		}
		const onChanged = (lng: string) => {
			if (active) {
				setCurrentLang(toSupportedLang(lng))
			}
		}
		i18n.on?.('languageChanged', onChanged)
		return () => {
			active = false
			i18n.off?.('languageChanged', onChanged)
		}
	}, [i18n])

	const handleSelectLanguage = async (lang: SupportedLanguage) => {
		try {
			Haptics.selectionAsync()
		} catch { }
		userSelectedRef.current = true
		setCurrentLang(lang)
		await changeLanguage(lang)
	}

	const handleSkipToSignIn = () => {
		try {
			Haptics.selectionAsync()
		} catch { }
		// Flag doar in memorie: nu setam onboardingDone=true ca RootLayout sa
		// poata restaura profilul din DB automat dupa autentificare.
		setSkipOnboardingToAuth(true)
		router.replace('/auth' as any)
	}

	return (
		<EcranPas
			pas="/onboarding"
			titlu={t('onboarding.chooseLanguageTitle', 'Choose your language')}
			subtitlu={t('onboarding.chooseLanguageSubtitle', 'Select your preferred language for GetFlow.')}
			poateContinua={true}
			subsolSecundar={
				<TouchableOpacity
					onPress={handleSkipToSignIn}
					accessibilityRole="button"
					accessibilityLabel={t('onboarding.alreadyHaveAccountA11y')}
					testID="onboarding-skip-signin"
					activeOpacity={0.78}
					style={[styles.skipBtn, { backgroundColor: colors.surface, borderColor: colors.accent + '4D' }]}
				>
					<Text style={[styles.skipText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
						{t('onboarding.alreadyHaveAccountPrefix')}{' '}
						<Text style={[styles.skipAccent, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
							{t('onboarding.alreadyHaveAccountAction')}
						</Text>
					</Text>
					<ArrowRight size={15} color={colors.accent} strokeWidth={2.4} />
				</TouchableOpacity>
			}
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
								pictograma={
									<View
										style={[
											styles.flagBadge,
											{
												backgroundColor: isSelected ? colors.accent + '1A' : colors.surfaceElevated,
												borderColor: isSelected ? colors.accent + '4D' : colors.cardBorder,
											},
										]}
									>
										<Text style={[styles.flagText, { color: colors.textPrimary }]}>{info.flag}</Text>
									</View>
								}
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

const styles = StyleSheet.create({
	flagBadge: {
		width: 42,
		height: 42,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	flagText: {
		fontSize: 20,
		fontWeight: '700',
		includeFontPadding: false,
	},
	skipBtn: {
		marginTop: 12,
		minHeight: 48,
		borderRadius: 15,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 11,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
	},
	skipText: {
		fontSize: 13.5,
		fontWeight: '600',
		textAlign: 'center',
	},
	skipAccent: {
		fontWeight: '800',
	},
})
