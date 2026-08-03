import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'

import { useTheme } from '../../context/ThemeContext'

export type EcranSetariProps = {
	titlu: string
	subtitlu?: string
	children: React.ReactNode
	/** Element fixat la baza ecranului, ex. butonul de salvare. */
	subsol?: React.ReactNode
}

/** Structura comuna a sub-paginilor de setari: antet cu sageata inapoi si continut derulabil. */
export default function EcranSetari({ titlu, subtitlu, children, subsol }: EcranSetariProps) {
	const { colors } = useTheme()
	const router = useRouter()

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
			<View style={styles.antet}>
				<TouchableOpacity
					onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'))}
					hitSlop={12}
					style={styles.butonInapoi}
					accessibilityRole="button"
					accessibilityLabel="Inapoi"
				>
					<ArrowLeft size={24} color={colors.textPrimary} />
				</TouchableOpacity>
				<Text style={[styles.titlu, { color: colors.textPrimary }]} numberOfLines={1}>
					{titlu}
				</Text>
			</View>

			<ScrollView
				contentContainerStyle={styles.continut}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				{subtitlu ? (
					<Text style={[styles.subtitlu, { color: colors.textSecondary }]}>{subtitlu}</Text>
				) : null}
				{children}
			</ScrollView>

			{subsol ? <View style={styles.subsol}>{subsol}</View> : null}
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	antet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, gap: 14 },
	butonInapoi: { padding: 4 },
	titlu: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, flex: 1 },
	continut: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 32 },
	subtitlu: { fontSize: 14, lineHeight: 20, marginBottom: 22 },
	subsol: { paddingHorizontal: 18, paddingBottom: 10, paddingTop: 6 },
})
