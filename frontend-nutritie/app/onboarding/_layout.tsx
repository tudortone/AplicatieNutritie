import React from 'react'
import { Stack } from 'expo-router'

import { useTheme } from '../../context/ThemeContext'

/**
 * Stiva pasilor de onboarding.
 *
 * Gestul de intoarcere ramane activ ca utilizatorul sa poata corecta un
 * raspuns, dar primul ecran si prezentarea finala nu se pot inchide cu gest.
 */
export default function OnboardingLayout() {
	const { colors } = useTheme()

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				animation: 'slide_from_right',
				animationDuration: 240,
				gestureEnabled: true,
				contentStyle: { backgroundColor: colors.background },
			}}
		>
			<Stack.Screen name="index" options={{ gestureEnabled: false }} />
		</Stack>
	)
}
