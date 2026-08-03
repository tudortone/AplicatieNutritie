import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Activity, Bell, Footprints, Lock, Palette } from 'lucide-react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import GrupSetari from '../../components/setari/GrupSetari'
import RandSetare from '../../components/setari/RandSetare'
import { useTheme } from '../../context/ThemeContext'
import { ThemeName, themeDisplayNames, themes } from '../../constants/theme'
import { useNotifications } from '../../hooks/useNotifications'
import { useBiometrics } from '../../hooks/useBiometrics'
import { HEALTH_PROVIDERS, useHealthSync } from '../../hooks/useHealthSync'

export default function EcranPreferinte() {
	const { colors, themeName, setTheme } = useTheme()
	const { enabled: notificariActive, toggleReminders, isExpoGo } = useNotifications()
	const { isSupported, biometricType, isEnabled, toggleBiometric } = useBiometrics()
	const {
		isEnabled: healthActiv,
		platformName,
		toggleSync,
		selectedProvider,
		setProvider,
	} = useHealthSync()

	return (
		<EcranSetari titlu="Preferinte">
			<GrupSetari titlu="Tema vizuala">
				<RandSetare
					pictograma={<Palette size={19} color={colors.accent} />}
					titlu="Aspect"
					detaliu="Culorile se aplica in toata aplicatia"
					valoare={themeDisplayNames[themeName]}
				/>
				<View style={styles.grilaTeme}>
					{(['midnight', 'ocean', 'sunset'] as ThemeName[]).map((nume) => {
						const culori = themes[nume]
						const selectat = themeName === nume
						return (
							<TouchableOpacity
								key={nume}
								onPress={() => setTheme(nume)}
								activeOpacity={0.8}
								accessibilityRole="radio"
								accessibilityState={{ selected: selectat }}
								style={[
									styles.cardTema,
									{
										backgroundColor: culori.surfaceBg,
										borderColor: selectat ? culori.accent : 'rgba(255,255,255,0.08)',
										borderWidth: selectat ? 2 : 1,
									},
								]}
							>
								<View style={styles.randCulori}>
									<View style={[styles.bulinaCuloare, { backgroundColor: culori.background }]} />
									<View style={[styles.bulinaCuloare, { backgroundColor: culori.accent }]} />
									<View style={[styles.bulinaCuloare, { backgroundColor: culori.accentSecondary }]} />
								</View>
								<Text
									style={[styles.numeTema, { color: selectat ? culori.accent : colors.textPrimary }]}
								>
									{themeDisplayNames[nume]}
								</Text>
							</TouchableOpacity>
						)
					})}
				</View>
			</GrupSetari>

			<GrupSetari titlu="Notificari">
				<RandSetare
					pictograma={<Bell size={19} color={colors.accent} />}
					titlu="Remindere zilnice de masa"
					detaliu={
						isExpoGo
							? 'In Expo Go push-ul are nevoie de development build; reminderele locale raman active'
							: 'Trei notificari, la 08:00, 13:00 si 19:30'
					}
					comutator={{ valoare: notificariActive, laSchimbare: toggleReminders }}
				/>
			</GrupSetari>

			{isSupported ? (
				<GrupSetari titlu="Securitate">
					<RandSetare
						pictograma={<Lock size={19} color={colors.accent} />}
						titlu={`Blocare cu ${biometricType}`}
						detaliu="Cere autentificare la pornire si dupa 5 minute de inactivitate"
						comutator={{ valoare: isEnabled, laSchimbare: toggleBiometric }}
					/>
				</GrupSetari>
			) : null}

			<GrupSetari titlu="Fitness si bratari">
				<RandSetare
					pictograma={<Footprints size={19} color={colors.accent} />}
					titlu={`Sincronizare (${platformName})`}
					detaliu="Preia pasii si calculeaza caloriile arse in jurnal"
					comutator={{
						valoare: healthActiv,
						laSchimbare: (v) => {
							toggleSync(v)
							if (v) void AsyncStorage.removeItem('ascundeCardHealth')
						},
					}}
				/>
				<View style={styles.listaSurse}>
					<Text style={[styles.etichetaSurse, { color: colors.textSecondary }]}>
						Sursa datelor
					</Text>
					{HEALTH_PROVIDERS.map((sursa) => {
						const activ = selectedProvider === sursa.id
						return (
							<TouchableOpacity
								key={sursa.id}
								onPress={() => setProvider(sursa.id)}
								activeOpacity={0.75}
								accessibilityRole="radio"
								accessibilityState={{ selected: activ }}
								style={[
									styles.cardSursa,
									{
										borderColor: activ ? colors.accent : 'rgba(255,255,255,0.08)',
										backgroundColor: activ ? colors.accent + '15' : 'rgba(255,255,255,0.02)',
									},
								]}
							>
								<Text style={{ fontSize: 20 }}>{sursa.icon}</Text>
								<View style={{ flex: 1 }}>
									<Text
										style={{
											color: activ ? colors.accent : colors.textPrimary,
											fontWeight: activ ? '800' : '600',
											fontSize: 14,
										}}
									>
										{sursa.name}
									</Text>
									<Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 1 }}>
										{sursa.description}
									</Text>
								</View>
								{activ ? <View style={[styles.bulinaActiv, { backgroundColor: colors.accent }]} /> : null}
							</TouchableOpacity>
						)
					})}
				</View>
			</GrupSetari>

			<View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: -10 }}>
				<Activity size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
				<Text style={{ color: colors.textTertiary, fontSize: 12.5, lineHeight: 18, flex: 1 }}>
					Caloriile arse preluate din aplicatiile de fitness sunt estimari ale acestora si pot diferi
					de consumul real.
				</Text>
			</View>
		</EcranSetari>
	)
}

const styles = StyleSheet.create({
	grilaTeme: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingBottom: 15, paddingTop: 2 },
	cardTema: { flex: 1, padding: 12, borderRadius: 15, alignItems: 'center' },
	randCulori: { flexDirection: 'row', gap: 5, marginBottom: 8 },
	bulinaCuloare: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
	numeTema: { fontSize: 11.5, fontWeight: '800', textAlign: 'center' },

	listaSurse: { paddingHorizontal: 14, paddingBottom: 15, gap: 7 },
	etichetaSurse: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
	cardSursa: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 13, borderWidth: 1, gap: 11 },
	bulinaActiv: { width: 9, height: 9, borderRadius: 5 },
})
