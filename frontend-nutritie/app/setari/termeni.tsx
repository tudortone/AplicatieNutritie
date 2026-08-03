import { StyleSheet, Text, View } from 'react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import { useTheme } from '../../context/ThemeContext'

type Sectiune = { titlu: string; paragrafe: string[] }

const SECTIUNI: Sectiune[] = [
	{
		titlu: '1. Acceptarea termenilor',
		paragrafe: [
			'Prin crearea unui cont si prin folosirea aplicatiei confirmi ca ai citit si accepti acesti termeni. Daca nu esti de acord cu ei, nu folosi aplicatia.',
		],
	},
	{
		titlu: '2. Cine poate folosi aplicatia',
		paragrafe: [
			'Trebuie sa ai cel putin 16 ani. Aplicatia nu este destinata copiilor si nu ar trebui folosita pentru a urmari alimentatia unui minor fara supravegherea unui adult si a unui specialist.',
		],
	},
	{
		titlu: '3. Aplicatia nu inlocuieste sfatul medical',
		paragrafe: [
			'Toate valorile calorice, obiectivele si recomandarile sunt estimari generate automat, pe baza unor formule statistice si a datelor introduse de tine.',
			'Nu sunt diagnostic, tratament sau plan alimentar personalizat. Consulta un medic inainte de a incepe o dieta restrictiva, mai ales daca ai diabet, o afectiune cardiaca, renala, o tulburare de alimentatie sau daca esti insarcinata.',
			'Estimarile obtinute din fotografii sau din coduri de bare pot fi gresite. Verifica etichetele produselor cand precizia conteaza.',
		],
	},
	{
		titlu: '4. Contul tau',
		paragrafe: [
			'Esti responsabil pentru pastrarea in siguranta a datelor de autentificare si pentru activitatea desfasurata prin contul tau.',
			'Ne poti anunta oricand daca banuiesti ca cineva ti-a accesat contul.',
		],
	},
	{
		titlu: '5. Abonamente',
		paragrafe: [
			'Functiile premium se pot achizitiona ca abonament, prin magazinul de aplicatii al platformei tale.',
			'Plata, reinnoirea automata si rambursarile sunt gestionate de magazinul respectiv, conform regulilor lui. Abonamentul se reinnoieste automat pana cand il anulezi din setarile contului din magazin.',
		],
	},
	{
		titlu: '6. Continutul tau',
		paragrafe: [
			'Datele si pozele pe care le adaugi raman ale tale. Ne oferi doar dreptul limitat de a le procesa pentru a-ti furniza functiile aplicatiei.',
		],
	},
	{
		titlu: '7. Limitarea raspunderii',
		paragrafe: [
			'Aplicatia este oferita ca atare. Nu garantam ca va functiona neintrerupt sau fara erori si nu raspundem pentru decizii alimentare luate exclusiv pe baza estimarilor din aplicatie.',
		],
	},
	{
		titlu: '8. Modificari',
		paragrafe: [
			'Putem actualiza acesti termeni. Daca schimbarile sunt importante, te vom anunta in aplicatie inainte sa intre in vigoare.',
		],
	},
]

export default function EcranTermeni() {
	const { colors } = useTheme()

	return (
		<EcranSetari titlu="Termeni si conditii">
			<View
				style={[
					styles.avertisment,
					{ backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
				]}
			>
				<Text style={[styles.textAvertisment, { color: colors.danger }]}>
					Schelet needitat juridic. Completeaza denumirea firmei, jurisdictia si datele de contact,
					apoi cere o revizuire de specialitate inainte de lansare.
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
				Operator: [completeaza denumirea] \u00b7 Contact: [completeaza adresa de email]
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
