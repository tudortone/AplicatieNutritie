import React from 'react'
import { StyleSheet, Switch, Text, TouchableOpacity, View, Platform } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { useTheme } from '../../context/ThemeContext'

export type RandSetareProps = {
	/** Pictograma din stanga, de obicei un icon lucide de 20px. */
	pictograma?: React.ReactNode
	titlu: string
	detaliu?: string
	/** Text static afisat in dreapta, ex. data inscrierii sau limba curenta. */
	valoare?: string
	laApasare?: () => void
	/** Cand e prezent, randul afiseaza un Switch in locul sagetii. */
	comutator?: { valoare: boolean; laSchimbare: (v: boolean) => void }
	/** Coloreaza textul in rosu, pentru actiuni ireversibile. */
	distructiv?: boolean
	/** Ascunde sageata chiar daca randul e apasabil. */
	faraSageata?: boolean
}

/**
 * Un rand dintr-o lista de setari.
 *
 * Nu deseneaza separator; de asta se ocupa `GrupSetari`, ca ultimul rand sa nu
 * aiba o linie in plus sub el.
 */
export default function RandSetare({
	pictograma,
	titlu,
	detaliu,
	valoare,
	laApasare,
	comutator,
	distructiv = false,
	faraSageata = false,
}: RandSetareProps) {
	const { colors } = useTheme()
	const culoareTitlu = distructiv ? colors.danger : colors.textPrimary
	const apasabil = Boolean(laApasare) && !comutator

	const continut = (
		<View style={styles.rand}>
			{pictograma ? (
				<View
					style={[
						styles.pictogramaWrap,
						{ backgroundColor: distructiv ? colors.danger + '1A' : colors.accent + '1A' },
					]}
				>
					{pictograma}
				</View>
			) : null}

			<View style={styles.text}>
				<Text style={[styles.titlu, { color: culoareTitlu }]}>{titlu}</Text>
				{detaliu ? (
					<Text style={[styles.detaliu, { color: colors.textSecondary }]}>{detaliu}</Text>
				) : null}
			</View>

			{valoare ? (
				<Text style={[styles.valoare, { color: colors.textSecondary }]} numberOfLines={1}>
					{valoare}
				</Text>
			) : null}

			{comutator ? (
				<Switch
					value={comutator.valoare}
					onValueChange={(v) => {
						try {
							Haptics.selectionAsync()
						} catch {}
						comutator.laSchimbare(v)
					}}
					trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
					thumbColor={
						Platform.OS === 'ios' ? '#FFFFFF' : comutator.valoare ? colors.background : '#f4f3f4'
					}
				/>
			) : null}

			{apasabil && !faraSageata ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
		</View>
	)

	if (!apasabil) return continut

	return (
		<TouchableOpacity
			activeOpacity={0.6}
			accessibilityRole="button"
			accessibilityLabel={detaliu ? `${titlu}. ${detaliu}` : titlu}
			onPress={() => {
				try {
					Haptics.selectionAsync()
				} catch {}
				laApasare?.()
			}}
		>
			{continut}
		</TouchableOpacity>
	)
}

const styles = StyleSheet.create({
	rand: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 14 },
	pictogramaWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
	text: { flex: 1 },
	titlu: { fontSize: 15.5, fontWeight: '600' },
	detaliu: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
	valoare: { fontSize: 14, fontWeight: '600', maxWidth: 140 },
})
