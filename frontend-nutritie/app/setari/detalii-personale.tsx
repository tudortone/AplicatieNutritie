import { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Camera, Save } from 'lucide-react-native'

import KeyboardAwareScreen from '../../components/ui/KeyboardAwareScreen'
import GrupSetari from '../../components/setari/GrupSetari'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useNotificationBanner } from '../../context/NotificationBannerContext'
import { useNotify } from '../../hooks/useNotify'
import { supabase } from '../../supabase'

type CampNumeric = {
	eticheta: string
	valoare: string
	seteaza: (v: string) => void
	unitate: string
}

export default function EcranDetaliiPersonale() {
	const { colors } = useTheme()
	const router = useRouter()
	const { session, user, loadingAuth } = useAuth()
	const { showBanner } = useNotificationBanner()
	const notify = useNotify()

	const [nume, setNume] = useState('')
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
	const [greutate, setGreutate] = useState('75')
	const [greutateTinta, setGreutateTinta] = useState('70')
	const [caloriiTinta, setCaloriiTinta] = useState('2000')
	const [proteineTinta, setProteineTinta] = useState('150')
	const [carbiTinta, setCarbiTinta] = useState('250')
	const [grasimiTinta, setGrasimiTinta] = useState('70')
	const [seIncarca, setSeIncarca] = useState(true)
	const [salveazaAcum, setSalveazaAcum] = useState(false)

	useEffect(() => {
		const incarca = async () => {
			if (loadingAuth) return
			setSeIncarca(true)
			try {
				if (!session) return
				const meta = user?.user_metadata || session.user.user_metadata || {}

				// Metadata din cont are prioritate; AsyncStorage e doar copia locala.
				const citeste = async (cheieMeta: string, cheieLocala: string, implicit: string) => {
					const dinMeta = meta[cheieMeta]
					if (dinMeta !== undefined && dinMeta !== null && dinMeta !== '') return String(dinMeta)
					const local = await AsyncStorage.getItem(cheieLocala)
					return local ? String(local) : implicit
				}

				const [g, gt, c, p, cb, gr] = await Promise.all([
					citeste('greutate', 'greutate', '75'),
					citeste('greutateTinta', 'greutateTinta', '70'),
					citeste('caloriiTinta', 'caloriiTinta', '2000'),
					citeste('proteineTinta', 'proteineTinta', '150'),
					citeste('carbiTinta', 'carbiTinta', '250'),
					citeste('grasimiTinta', 'grasimiTinta', '70'),
				])
				setGreutate(g)
				setGreutateTinta(gt)
				setCaloriiTinta(c)
				setProteineTinta(p)
				setCarbiTinta(cb)
				setGrasimiTinta(gr)

				const numeSalvat =
					meta.nume || meta.display_name || (await AsyncStorage.getItem('nume_profil'))
				setNume(numeSalvat ? String(numeSalvat) : session.user.email?.split('@')[0] || 'Utilizator')

				const avatarSalvat = meta.avatar_url || (await AsyncStorage.getItem('avatar_url'))
				setAvatarUrl(avatarSalvat ? String(avatarSalvat) : null)
			} finally {
				setSeIncarca(false)
			}
		}
		void incarca()
	}, [session, user, loadingAuth])

	const alegePoza = async () => {
		try {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
			const permisiune = await ImagePicker.requestMediaLibraryPermissionsAsync()
			if (!permisiune.granted) {
				Alert.alert(
					'Permisiune necesara',
					'Avem nevoie de acces la galerie ca sa poti alege o poza de profil.'
				)
				return
			}
			const rezultat = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ['images'],
				allowsEditing: true,
				aspect: [1, 1],
				quality: 0.7,
			})
			if (!rezultat.canceled && rezultat.assets?.length) {
				setAvatarUrl(rezultat.assets[0].uri)
				void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
			}
		} catch {
			showBanner({
				title: 'Nu am putut deschide galeria',
				message: 'Incearca din nou peste cateva momente.',
				type: 'warning',
			})
		}
	}

	const salveaza = async () => {
		const campuri = [greutate, greutateTinta, caloriiTinta, proteineTinta, carbiTinta, grasimiTinta]
		if (campuri.some((v) => !v || Number.isNaN(Number(v)) || Number(v) <= 0)) {
			showBanner({
				title: 'Date incomplete',
				message: 'Toate obiectivele trebuie sa fie numere mai mari decat zero.',
				type: 'warning',
			})
			return
		}

		setSalveazaAcum(true)
		try {
			// Intai contul, apoi copia locala, ca sa nu ramana local ceva ce serverul a refuzat.
			const { error } = await supabase.auth.updateUser({
				data: {
					nume: nume.trim() || session?.user.email?.split('@')[0],
					avatar_url: avatarUrl || '',
					greutate: parseFloat(greutate),
					greutateTinta: parseFloat(greutateTinta),
					caloriiTinta: parseInt(caloriiTinta, 10),
					proteineTinta: parseInt(proteineTinta, 10),
					carbiTinta: parseInt(carbiTinta, 10),
					grasimiTinta: parseInt(grasimiTinta, 10),
				},
			})
			if (error) throw error

			await AsyncStorage.multiSet([
				['greutate', greutate],
				['greutateTinta', greutateTinta],
				['caloriiTinta', caloriiTinta],
				['proteineTinta', proteineTinta],
				['carbiTinta', carbiTinta],
				['grasimiTinta', grasimiTinta],
				['nume_profil', nume],
			])
			if (avatarUrl) await AsyncStorage.setItem('avatar_url', avatarUrl)

			notify.success('Profil actualizat', 'Modificarile au fost salvate')
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
			if (router.canGoBack()) router.back()
		} catch {
			showBanner({
				title: 'Salvat local',
				message: 'Conexiunea nu este disponibila. Datele raman pe telefon.',
				type: 'info',
			})
		} finally {
			setSalveazaAcum(false)
		}
	}

	const campuri: CampNumeric[] = [
		{ eticheta: 'Greutate actuala', valoare: greutate, seteaza: setGreutate, unitate: 'kg' },
		{ eticheta: 'Greutate tinta', valoare: greutateTinta, seteaza: setGreutateTinta, unitate: 'kg' },
		{ eticheta: 'Calorii', valoare: caloriiTinta, seteaza: setCaloriiTinta, unitate: 'kcal/zi' },
		{ eticheta: 'Proteine', valoare: proteineTinta, seteaza: setProteineTinta, unitate: 'g/zi' },
		{ eticheta: 'Carbohidrati', valoare: carbiTinta, seteaza: setCarbiTinta, unitate: 'g/zi' },
		{ eticheta: 'Grasimi', valoare: grasimiTinta, seteaza: setGrasimiTinta, unitate: 'g/zi' },
	]

	const initiale = session?.user.email?.slice(0, 2).toUpperCase() || 'NU'

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
			<View style={styles.antet}>
				<TouchableOpacity
					onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'))}
					hitSlop={12}
					style={{ padding: 4 }}
					accessibilityRole="button"
					accessibilityLabel="Inapoi"
				>
					<ArrowLeft size={24} color={colors.textPrimary} />
				</TouchableOpacity>
				<Text style={[styles.titluAntet, { color: colors.textPrimary }]}>Detalii personale</Text>
			</View>

			{seIncarca ? (
				<View style={styles.centrat}>
					<ActivityIndicator size="large" color={colors.accent} />
				</View>
			) : (
				// KeyboardAwareScreen exista fiindca tastatura acoperea campurile numerice.
				<KeyboardAwareScreen style={{ flex: 1 }}>
					<ScrollView
						contentContainerStyle={styles.continut}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
					>
						<View style={styles.zonaAvatar}>
							<TouchableOpacity onPress={alegePoza} activeOpacity={0.85}>
								<LinearGradient colors={colors.accentGradient} style={styles.inelAvatar}>
									<View style={styles.interiorAvatar}>
										{avatarUrl ? (
											<Image
												source={{ uri: avatarUrl }}
												style={{ width: '100%', height: '100%', borderRadius: 27 }}
												resizeMode="cover"
												accessibilityLabel="Poza de profil"
											/>
										) : (
											<Text style={[styles.initiale, { color: colors.accent }]}>{initiale}</Text>
										)}
									</View>
								</LinearGradient>
								<View
									style={[
										styles.insignaCamera,
										{ backgroundColor: colors.accent, borderColor: colors.background },
									]}
								>
									<Camera size={13} color="#000" />
								</View>
							</TouchableOpacity>
							<Text style={[styles.indiciuAvatar, { color: colors.textSecondary }]}>
								Apasa pe poza ca sa o schimbi
							</Text>
						</View>

						<GrupSetari titlu="Identitate">
							<View style={styles.camp}>
								<Text style={[styles.etichetaCamp, { color: colors.textSecondary }]}>
									Nume afisat
								</Text>
								<TextInput
									value={nume}
									onChangeText={setNume}
									placeholder="Introdu numele tau"
									placeholderTextColor={colors.textTertiary}
									selectionColor={colors.accent}
									style={[styles.inputText, { color: colors.textPrimary }]}
								/>
							</View>
							<View style={styles.camp}>
								<Text style={[styles.etichetaCamp, { color: colors.textSecondary }]}>Email</Text>
								<Text style={[styles.inputText, { color: colors.textTertiary }]}>
									{session?.user.email}
								</Text>
							</View>
						</GrupSetari>

						<GrupSetari titlu="Obiective zilnice">
							{campuri.map((camp) => (
								<View key={camp.eticheta} style={styles.campNumeric}>
									<Text style={[styles.etichetaNumeric, { color: colors.textPrimary }]}>
										{camp.eticheta}
									</Text>
									<View style={styles.zonaInputNumeric}>
										<TextInput
											value={camp.valoare}
											onChangeText={camp.seteaza}
											keyboardType="numeric"
											selectionColor={colors.accent}
											style={[styles.inputNumeric, { color: colors.textPrimary }]}
										/>
										<Text style={[styles.unitate, { color: colors.textTertiary }]}>
											{camp.unitate}
										</Text>
									</View>
								</View>
							))}
						</GrupSetari>

						<TouchableOpacity
							onPress={salveaza}
							disabled={salveazaAcum}
							activeOpacity={0.85}
							style={styles.butonSalvare}
						>
							<LinearGradient colors={colors.accentGradient} style={styles.gradientSalvare}>
								{salveazaAcum ? (
									<ActivityIndicator color={colors.background} />
								) : (
									<>
										<Save size={19} color={colors.background} strokeWidth={2.5} />
										<Text style={[styles.textSalvare, { color: colors.background }]}>
											Salveaza
										</Text>
									</>
								)}
							</LinearGradient>
						</TouchableOpacity>
					</ScrollView>
				</KeyboardAwareScreen>
			)}
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	antet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, gap: 14 },
	titluAntet: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, flex: 1 },
	centrat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	continut: { paddingHorizontal: 18, paddingBottom: 40 },

	zonaAvatar: { alignItems: 'center', marginTop: 4, marginBottom: 26 },
	inelAvatar: { width: 90, height: 90, borderRadius: 30, padding: 3 },
	interiorAvatar: {
		flex: 1,
		borderRadius: 27,
		backgroundColor: '#0F1318',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	initiale: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
	insignaCamera: {
		position: 'absolute',
		bottom: -2,
		right: -2,
		width: 28,
		height: 28,
		borderRadius: 14,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	indiciuAvatar: { fontSize: 12.5, marginTop: 12 },

	camp: { paddingHorizontal: 16, paddingVertical: 13 },
	etichetaCamp: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
	inputText: { fontSize: 16.5, fontWeight: '600', padding: 0 },

	campNumeric: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 14,
		gap: 12,
	},
	etichetaNumeric: { fontSize: 15, fontWeight: '600', flex: 1 },
	zonaInputNumeric: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
	inputNumeric: { fontSize: 17, fontWeight: '800', padding: 0, minWidth: 52, textAlign: 'right' },
	unitate: { fontSize: 12.5, fontWeight: '600', minWidth: 46 },

	butonSalvare: { borderRadius: 17, overflow: 'hidden', marginTop: 4 },
	gradientSalvare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 9 },
	textSalvare: { fontSize: 16.5, fontWeight: '900' },
})
