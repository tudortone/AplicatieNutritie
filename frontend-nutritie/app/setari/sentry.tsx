import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { AlertTriangle, Bug, Flame, MessageSquare, Route } from 'lucide-react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import GrupSetari from '../../components/setari/GrupSetari'
import RandSetare from '../../components/setari/RandSetare'
import { useTheme } from '../../context/ThemeContext'

const DSN_CONFIGURAT = Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN)

/**
 * Banc de test pentru raportarea erorilor.
 *
 * Exista ca sa putem verifica pe un build real ca evenimentele chiar ajung in
 * Sentry, fara sa asteptam un crash intamplator.
 */
export default function EcranSentry() {
	const { colors } = useTheme()
	const [ultimaActiune, setUltimaActiune] = useState<string | null>(null)

	const raporteaza = (mesaj: string) => {
		const ora = new Date().toLocaleTimeString('ro-RO')
		setUltimaActiune(`${mesaj} \u00b7 ${ora}`)
	}

	return (
		<EcranSetari
			titlu="Banc de test Sentry"
			subtitlu="Trimite evenimente controlate ca sa verifici ca raportarea erorilor functioneaza."
		>
			<View
				style={[
					styles.stare,
					{
						backgroundColor: DSN_CONFIGURAT ? colors.accent + '14' : colors.dangerBg,
						borderColor: DSN_CONFIGURAT ? colors.accent + '44' : colors.dangerBorder,
					},
				]}
			>
				<Text
					style={[styles.textStare, { color: DSN_CONFIGURAT ? colors.accent : colors.danger }]}
				>
					{DSN_CONFIGURAT
						? 'DSN configurat. Evenimentele ar trebui sa apara in panoul Sentry in cateva secunde.'
						: 'EXPO_PUBLIC_SENTRY_DSN lipseste, deci Sentry.init nu a rulat. Butoanele de mai jos nu vor trimite nimic.'}
				</Text>
			</View>

			<GrupSetari titlu="Evenimente sigure">
				<RandSetare
					pictograma={<MessageSquare size={19} color={colors.accent} />}
					titlu="Trimite un mesaj de test"
					detaliu="captureMessage, nivel info. Nu afecteaza aplicatia."
					faraSageata
					laApasare={() => {
						Sentry.captureMessage('Test din bancul de setari', 'info')
						raporteaza('Mesaj trimis')
					}}
				/>
				<RandSetare
					pictograma={<Route size={19} color={colors.accent} />}
					titlu="Adauga un breadcrumb"
					detaliu="Apare in istoricul urmatorului eveniment raportat"
					faraSageata
					laApasare={() => {
						Sentry.addBreadcrumb({
							category: 'test',
							message: 'Breadcrumb din bancul de setari',
							level: 'info',
						})
						raporteaza('Breadcrumb adaugat')
					}}
				/>
				<RandSetare
					pictograma={<Bug size={19} color={colors.accent} />}
					titlu="Raporteaza o exceptie prinsa"
					detaliu="captureException dintr-un try/catch. Aplicatia continua normal."
					faraSageata
					laApasare={() => {
						try {
							throw new Error('Exceptie de test din bancul de setari')
						} catch (eroare) {
							Sentry.captureException(eroare)
						}
						raporteaza('Exceptie raportata')
					}}
				/>
			</GrupSetari>

			<GrupSetari titlu="Evenimente distructive">
				<RandSetare
					pictograma={<AlertTriangle size={19} color={colors.danger} />}
					titlu="Promisiune respinsa neprinsa"
					detaliu="Verifica handler-ul de unhandledrejection"
					distructiv
					faraSageata
					laApasare={() => {
						raporteaza('Promisiune respinsa')
						void Promise.reject(new Error('Respingere de test neprinsa'))
					}}
				/>
				<RandSetare
					pictograma={<Flame size={19} color={colors.danger} />}
					titlu="Arunca o eroare neprinsa"
					detaliu="Declanseaza ecranul de eroare. Va trebui sa repornesti aplicatia."
					distructiv
					faraSageata
					laApasare={() => {
						raporteaza('Eroare neprinsa aruncata')
						// In afara ciclului de randare, ca sa treaca prin handler-ul global
						// ErrorUtils, nu prin ErrorBoundary-ul React.
						setTimeout(() => {
							throw new Error('Crash de test din bancul de setari')
						}, 0)
					}}
				/>
			</GrupSetari>

			{ultimaActiune ? (
				<Text style={[styles.jurnal, { color: colors.textTertiary }]}>Ultima actiune: {ultimaActiune}</Text>
			) : null}
		</EcranSetari>
	)
}

const styles = StyleSheet.create({
	stare: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 22 },
	textStare: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
	jurnal: { fontSize: 12.5, marginTop: -10 },
})
