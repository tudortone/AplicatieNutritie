import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useTheme } from '../../context/ThemeContext'

export type GrupSetariProps = {
	/** Antetul de deasupra cardului, ex. "Cont". Optional. */
	titlu?: string
	children: React.ReactNode
}

/**
 * Card cu colturi rotunjite care grupeaza mai multe `RandSetare`.
 *
 * Insereaza singur separatoarele intre randuri si le omite dupa ultimul,
 * ca sa nu ramana o linie suspendata la baza cardului.
 */
export default function GrupSetari({ titlu, children }: GrupSetariProps) {
	const { colors } = useTheme()
	// Ignoram copiii falsy, ca randurile conditionate sa nu lase separatoare goale.
	const randuri = React.Children.toArray(children).filter(Boolean)

	return (
		<View style={styles.container}>
			{titlu ? <Text style={[styles.titlu, { color: colors.textSecondary }]}>{titlu}</Text> : null}

			<View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
				{randuri.map((rand, i) => (
					<View key={i}>
						{rand}
						{i < randuri.length - 1 ? (
							<View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
						) : null}
					</View>
				))}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { marginBottom: 26 },
	titlu: {
		fontSize: 12.5,
		fontWeight: '700',
		letterSpacing: 0.6,
		marginBottom: 9,
		marginLeft: 6,
		textTransform: 'uppercase',
	},
	card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
	// Aliniat sub text, nu sub pictograma, ca in listele native.
	separator: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
})
