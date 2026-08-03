import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { useTheme } from '../../context/ThemeContext'

export type CardOptiuneProps = {
	titlu: string
	detaliu?: string
	/** Pictograma afisata in stanga. */
	pictograma?: React.ReactNode
	selectat: boolean
	laSelectare: () => void
}

/** Optiune dintr-o lista cu selectie unica. */
export default function CardOptiune({
	titlu,
	detaliu,
	pictograma,
	selectat,
	laSelectare,
}: CardOptiuneProps) {
	const { colors } = useTheme()

	return (
		<TouchableOpacity
			activeOpacity={0.8}
			onPress={() => {
				try {
					Haptics.selectionAsync()
				} catch {}
				laSelectare()
			}}
			style={[
				styles.card,
				{
					backgroundColor: colors.cardBg,
					borderColor: selectat ? colors.accent : colors.cardBorder,
					borderWidth: selectat ? 2 : 1,
				},
			]}
			accessibilityRole="radio"
			accessibilityState={{ selected: selectat }}
			accessibilityLabel={detaliu ? `${titlu}. ${detaliu}` : titlu}
		>
			{pictograma ? <View style={styles.pictograma}>{pictograma}</View> : null}

			<View style={styles.text}>
				<Text style={[styles.titlu, { color: colors.textPrimary }]}>{titlu}</Text>
				{detaliu ? (
					<Text style={[styles.detaliu, { color: colors.textSecondary }]}>{detaliu}</Text>
				) : null}
			</View>

			<View
				style={[
					styles.bifa,
					{
						backgroundColor: selectat ? colors.accent : 'transparent',
						borderColor: selectat ? colors.accent : colors.overlayStrong,
					},
				]}
			>
				{selectat ? <Check size={14} color={colors.background} strokeWidth={3.5} /> : null}
			</View>
		</TouchableOpacity>
	)
}

const styles = StyleSheet.create({
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 18,
		padding: 18,
		marginBottom: 12,
		gap: 14,
	},
	pictograma: { width: 28, alignItems: 'center' },
	text: { flex: 1 },
	titlu: { fontSize: 16, fontWeight: '700' },
	detaliu: { fontSize: 13, marginTop: 3, lineHeight: 18 },
	bifa: {
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center',
	},
})
