import { StyleSheet, Text, View } from 'react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import { useTheme } from '../../context/ThemeContext'

type Sectiune = { titlu: string; paragrafe: string[] }

const SECTIUNI: Sectiune[] = [
	{
		titlu: '1. Ce date colectam',
		paragrafe: [
			'Date de cont: adresa de email si, optional, numele afisat si poza de profil pe care le alegi tu.',
			'Date de sanatate introduse de tine: greutate, inaltime, varsta, obiective calorice si de macronutrienti, mesele inregistrate si antrenamentele.',
			'Date tehnice: rapoarte de eroare si informatii despre dispozitiv, folosite ca sa reparam defectele aplicatiei.',
			'Daca activezi sincronizarea cu o aplicatie de fitness, preluam numarul de pasi si caloriile estimate de acea aplicatie.',
		],
	},
	{
		titlu: '2. De ce le folosim',
		paragrafe: [
			'Ca sa calculam necesarul caloric si sa iti aratam progresul.',
			'Ca sa iti oferim recomandari prin asistentul AI.',
			'Ca sa mentinem aplicatia stabila si sa investigam erorile.',
		],
	},
	{
		titlu: '3. Cui le transmitem',
		paragrafe: [
			'Datele contului si continutul jurnalului sunt stocate la furnizorul nostru de baze de date.',
			'Pozele analizate sunt trimise catre serviciul de procesare a imaginilor si catre modelul AI, doar pentru a returna estimarea nutritionala.',
			'Rapoartele de eroare ajung la serviciul de monitorizare a erorilor.',
			'Nu vindem datele tale si nu le folosim pentru publicitate.',
		],
	},
	{
		titlu: '4. Cat timp le pastram',
		paragrafe: [
			'Datele raman stocate cat timp contul este activ. La stergerea contului, datele asociate sunt eliminate, cu exceptia celor pe care legea ne obliga sa le pastram.',
		],
	},
	{
		titlu: '5. Drepturile tale',
		paragrafe: [
			'Poti cere accesul la datele tale, corectarea lor, stergerea contului sau exportul informatiilor. Ne poti scrie la adresa de contact de mai jos.',
		],
	},
	{
		titlu: '6. Aplicatia nu ofera sfat medical',
		paragrafe: [
			'Estimarile calorice si recomandarile sunt orientative. Nu inlocuiesc consultul unui medic sau al unui nutritionist, mai ales daca ai o afectiune sau urmezi un tratament.',
		],
	},
]

export default function EcranConfidentialitate() {
	const { colors } = useTheme()

	return (
		<EcranSetari titlu="Politica de confidentialitate">
			<View
				style={[
					styles.avertisment,
					{ backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
				]}
			>
				<Text style={[styles.textAvertisment, { color: colors.danger }]}>
					Schelet needitat juridic. Inainte de lansare, completeaza denumirea operatorului, adresa,
					emailul de contact si lista exacta a furnizorilor, apoi cere o revizuire de specialitate.
				</Text>
			</View>

			{SECTIUNI.map((sectiune) => (
				<View key={sectiune.titlu} style={styles.sectiune}>
					<Text style={[styles.titluSectiune, { color: colors.textPrimary }]}>{sectiune.titlu}</Text>
					{sectiune.paragrafe.map((p, i) => (
						<Text key={i} style={[styles.paragraf, { color: colors.textSecondary }]}>
							{p}
						</Text>
					))}
				</View>
			))}

			<Text style={[styles.contact, { color: colors.textTertiary }]}>
				Contact pentru protectia datelor: [completeaza adresa de email]
			</Text>
		</EcranSetari>
	)
}

const styles = StyleSheet.create({
	avertisment: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 22 },
	textAvertisment: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
	sectiune: { marginBottom: 22 },
	titluSectiune: { fontSize: 15.5, fontWeight: '800', marginBottom: 8 },
	paragraf: { fontSize: 14, lineHeight: 21, marginBottom: 7 },
	contact: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
})
