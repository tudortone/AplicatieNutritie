import { StyleSheet, Text, View } from 'react-native'
import { Lock, Trophy } from 'lucide-react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import { useTheme } from '../../context/ThemeContext'
import { useGamificare } from '../../hooks/useGamificare'
import { INSIGNE_LIST } from '../../constants/insigne'

export default function EcranInsigne() {
	const { colors } = useTheme()
	const { insigne } = useGamificare()

	return (
		<EcranSetari
			titlu="Insigne si recompense"
			subtitlu={`Ai deblocat ${insigne.length} din ${INSIGNE_LIST.length} insigne.`}
		>
			<View style={styles.grila}>
				{INSIGNE_LIST.map((insigna) => {
					const deblocata = insigne.includes(insigna.id)
					return (
						<View
							key={insigna.id}
							style={[
								styles.card,
								{
									backgroundColor: deblocata ? colors.accent + '14' : 'rgba(255,255,255,0.03)',
									borderColor: deblocata ? colors.accent + '44' : 'rgba(255,255,255,0.07)',
								},
							]}
						>
							<View
								style={[
									styles.pictograma,
									{
										backgroundColor: deblocata ? colors.accent + '25' : 'rgba(255,255,255,0.05)',
									},
								]}
							>
								{deblocata ? (
									<Trophy size={18} color={colors.accent} />
								) : (
									<Lock size={16} color={colors.textTertiary} />
								)}
							</View>
							<View style={{ flex: 1 }}>
								<Text
									numberOfLines={1}
									style={{
										fontSize: 13,
										fontWeight: '700',
										color: deblocata ? colors.textPrimary : colors.textTertiary,
									}}
								>
									{insigna.nume}
								</Text>
								<Text
									numberOfLines={2}
									style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}
								>
									{insigna.conditie}
								</Text>
							</View>
						</View>
					)
				})}
			</View>
		</EcranSetari>
	)
}

const styles = StyleSheet.create({
	grila: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
	card: {
		width: '48%',
		borderWidth: 1,
		borderRadius: 14,
		padding: 12,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	pictograma: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
