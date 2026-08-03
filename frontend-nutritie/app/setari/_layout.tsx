import { Stack } from 'expo-router'

import { useTheme } from '../../context/ThemeContext'

/** Sub-paginile de setari isi deseneaza singure antetul, prin EcranSetari. */
export default function LayoutSetari() {
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
		/>
	)
}
