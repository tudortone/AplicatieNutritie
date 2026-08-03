import { useMemo } from 'react'
import {
	Alert,
	Image,
	Linking,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown } from 'react-native-reanimated'
import {
	Bug,
	CalendarDays,
	Crown,
	FileText,
	Globe,
	LifeBuoy,
	LogOut,
	Mail,
	RotateCcw,
	ScrollText,
	Settings,
	ShieldCheck,
	Trophy,
	User,
} from 'lucide-react-native'

import GrupSetari from '../../components/setari/GrupSetari'
import RandSetare from '../../components/setari/RandSetare'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useAppStore } from '../../hooks/useAppStore'
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout'
import { stergeDateOnboarding } from '../../lib/onboarding'
import { numeLimba } from '../../lib/limba'
import { supabase } from '../../supabase'
import { useTranslation } from 'react-i18next'

// TODO inainte de lansare: completeaza adresa reala de suport.
const EMAIL_SUPORT = ''

/** Cheile locale sterse la deconectare, ca datele sa nu ramana pentru urmatorul cont. */
const CHEI_UTILIZATOR = [
	'greutate',
	'greutateTinta',
	'caloriiTinta',
	'proteineTinta',
	'carbiTinta',
	'grasimiTinta',
	'nume_profil',
	'greutate_istoric',
	'sex',
	'varsta',
	'inaltime',
	'nivel_activitate',
	'obiectiv',
	'current_workout_session',
	'nutriai_workouts',
	'gamificare_v1',
	'notificari_v1',
	'nutriai_theme',
	'favorite_foods',
	'health_sync_enabled',
	'health_step_goal',
	'health_sync_provider',
	'nutriai_tip_closed_date',
	'avatar_url',
	'onboarding_done',
	'chat_history',
]

export default function EcranProfil() {
	const { colors } = useTheme()
	const router = useRouter()
	const { session } = useAuth()
	const { setOnboardingDone } = useAppStore()
	const { scrollPaddingTop, scrollPaddingBottom } = useResponsiveLayout()
	const { i18n } = useTranslation()

	const membruDin = useMemo(() => {
		const brut = session?.user.created_at
		if (!brut) return undefined
		const data = new Date(brut)
		if (Number.isNaN(data.getTime())) return undefined
		return data.toLocaleDateString('ro-RO', { month: 'short', year: 'numeric' })
	}, [session?.user.created_at])

	const numeAfisat =
		(session?.user.user_metadata?.nume as string) ||
		(session?.user.user_metadata?.display_name as string) ||
		session?.user.email?.split('@')[0] ||
		'Utilizator'
	const avatarUrl = (session?.user.user_metadata?.avatar_url as string) || null
	const initiale = session?.user.email?.slice(0, 2).toUpperCase() || 'NU'
	const versiune = Constants.expoConfig?.version ?? '-'

	const deschideEmail = () => {
		if (!EMAIL_SUPORT) {
			Alert.alert(
				'Adresa de suport nu este configurata',
				'Completeaza constanta EMAIL_SUPORT din app/(tabs)/profil.tsx inainte de lansare.'
			)
			return
		}
		void Linking.openURL(`mailto:${EMAIL_SUPORT}?subject=Suport%20NutriAI`)
	}

	const reiaChestionarul = () => {
		Alert.alert(
			'Reia chestionarul',
			'Raspunsurile de la configurarea initiala vor fi sterse si vei relua pasii de la inceput. Obiectivele salvate in profil raman neschimbate.',
			[
				{ text: 'Anuleaza', style: 'cancel' },
				{
					text: 'Reia',
					onPress: async () => {
						await stergeDateOnboarding()
						setOnboardingDone(false)
						router.replace('/onboarding')
					},
				},
			]
		)
	}

	const deconecteaza = () => {
		Alert.alert('Deconectare', 'Sigur vrei sa te deconectezi?', [
			{ text: 'Anuleaza', style: 'cancel' },
			{
				text: 'Deconecteaza',
				style: 'destructive',
				onPress: async () => {
					const toate = await AsyncStorage.getAllKeys()
					const aleUtilizatorului = toate.filter(
						(k) => k.startsWith('chat_history_') || CHEI_UTILIZATOR.includes(k)
					)
					if (aleUtilizatorului.length > 0) await AsyncStorage.multiRemove(aleUtilizatorului)
					await supabase.auth.signOut()
				},
			},
		])
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={[
					styles.continut,
					{ paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom },
				]}
			>
				<Animated.View entering={FadeInDown.duration(450)} style={styles.antet}>
					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() => router.push('/setari/detalii-personale')}
						accessibilityRole="button"
						accessibilityLabel="Editeaza detaliile personale"
					>
						<LinearGradient colors={colors.accentGradient} style={styles.inelAvatar}>
							<View style={styles.interiorAvatar}>
								{avatarUrl ? (
									<Image
										source={{ uri: avatarUrl }}
										style={{ width: '100%', height: '100%', borderRadius: 25 }}
										resizeMode="cover"
										accessibilityLabel="Poza de profil"
									/>
								) : (
									<Text style={[styles.initiale, { color: colors.accent }]}>{initiale}</Text>
								)}
							</View>
						</LinearGradient>
					</TouchableOpacity>

					<View style={{ flex: 1 }}>
						<Text style={[styles.nume, { color: colors.textPrimary }]} numberOfLines={1}>
							{numeAfisat}
						</Text>
						<Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>
							{session?.user.email}
						</Text>
					</View>
				</Animated.View>

				<Animated.View entering={FadeInDown.duration(450).delay(40)}>
					<GrupSetari titlu="Cont">
						{membruDin ? (
							<RandSetare
								pictograma={<CalendarDays size={19} color={colors.accent} />}
								titlu="Membru din"
								valoare={membruDin}
							/>
						) : null}
						<RandSetare
							pictograma={<User size={19} color={colors.accent} />}
							titlu="Detalii personale"
							detaliu="Nume, poza si obiectivele zilnice"
							laApasare={() => router.push('/setari/detalii-personale')}
						/>
						<RandSetare
							pictograma={<Settings size={19} color={colors.accent} />}
							titlu="Preferinte"
							detaliu="Tema, notificari, securitate si sincronizare"
							laApasare={() => router.push('/setari/preferinte')}
						/>
						<RandSetare
							pictograma={<Globe size={19} color={colors.accent} />}
							titlu="Limba"
							valoare={numeLimba(i18n.language?.split('-')[0] ?? 'ro')}
							laApasare={() => router.push('/setari/limba')}
						/>
						<RandSetare
							pictograma={<Trophy size={19} color={colors.accent} />}
							titlu="Insigne si recompense"
							laApasare={() => router.push('/setari/insigne')}
						/>
						<RandSetare
							pictograma={<Crown size={19} color="#FFD45A" />}
							titlu="Treci la Premium"
							detaliu="Scanari AI nelimitate si chat fara restrictii"
							laApasare={() => router.push('/paywall')}
						/>
					</GrupSetari>
				</Animated.View>

				<Animated.View entering={FadeInDown.duration(450).delay(80)}>
					<GrupSetari titlu="Despre">
						<RandSetare
							pictograma={<ShieldCheck size={19} color={colors.accent} />}
							titlu="Politica de confidentialitate"
							laApasare={() => router.push('/setari/confidentialitate')}
						/>
						<RandSetare
							pictograma={<ScrollText size={19} color={colors.accent} />}
							titlu="Termeni si conditii"
							laApasare={() => router.push('/setari/termeni')}
						/>
						{__DEV__ ? (
							<RandSetare
								pictograma={<Bug size={19} color={colors.accent} />}
								titlu="Banc de test Sentry"
								detaliu="Vizibil doar in build-urile de dezvoltare"
								laApasare={() => router.push('/setari/sentry')}
							/>
						) : null}
						<RandSetare
							pictograma={<FileText size={19} color={colors.accent} />}
							titlu="Versiune"
							valoare={versiune}
						/>
					</GrupSetari>
				</Animated.View>

				<Animated.View entering={FadeInDown.duration(450).delay(120)}>
					<GrupSetari titlu="Suport">
						<RandSetare
							pictograma={<Mail size={19} color={colors.accent} />}
							titlu="Contacteaza-ne"
							detaliu="Raporteaza o problema sau trimite o sugestie"
							laApasare={deschideEmail}
						/>
						<RandSetare
							pictograma={<LifeBuoy size={19} color={colors.accent} />}
							titlu="Recalculeaza planul cu AI"
							detaliu="Asistentul iti propune tinte noi"
							laApasare={() => router.push('/calculator-ai')}
						/>
						<RandSetare
							pictograma={<RotateCcw size={19} color={colors.accent} />}
							titlu="Reia chestionarul initial"
							laApasare={reiaChestionarul}
						/>
					</GrupSetari>
				</Animated.View>

				<Animated.View entering={FadeInDown.duration(450).delay(160)}>
					<GrupSetari>
						<RandSetare
							pictograma={<LogOut size={19} color={colors.danger} />}
							titlu="Deconectare"
							distructiv
							faraSageata
							laApasare={deconecteaza}
						/>
					</GrupSetari>
				</Animated.View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	continut: { paddingHorizontal: 18 },
	antet: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 28, paddingHorizontal: 4 },
	inelAvatar: { width: 64, height: 64, borderRadius: 28, padding: 3 },
	interiorAvatar: {
		flex: 1,
		borderRadius: 25,
		backgroundColor: '#0F1318',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	initiale: { fontSize: 20, fontWeight: '900', letterSpacing: -0.8 },
	nume: { fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
	email: { fontSize: 13.5, marginTop: 2 },
})
