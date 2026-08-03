import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react-native'
import { Text } from 'react-native'

import EcranSetari from '../../components/setari/EcranSetari'
import GrupSetari from '../../components/setari/GrupSetari'
import RandSetare from '../../components/setari/RandSetare'
import { useTheme } from '../../context/ThemeContext'
import { CodLimba, LIMBI, schimbaLimba } from '../../lib/limba'

export default function EcranLimba() {
	const { colors } = useTheme()
	const { i18n } = useTranslation()
	// i18n.language poate fi 'en-US'; comparam doar prefixul.
	const curenta = i18n.language?.split('-')[0]

	return (
		<EcranSetari titlu="Limba" subtitlu="Alegerea se aplica imediat si se retine la urmatoarea pornire.">
			<GrupSetari>
				{LIMBI.map((limba) => (
					<RandSetare
						key={limba.cod}
						pictograma={<Text style={{ fontSize: 20 }}>{limba.steag}</Text>}
						titlu={limba.nativ}
						detaliu={limba.nativ === limba.nume ? undefined : limba.nume}
						faraSageata
						laApasare={() => {
							void schimbaLimba(limba.cod as CodLimba)
						}}
					/>
				))}
			</GrupSetari>

			<Text style={{ color: colors.textTertiary, fontSize: 12.5, lineHeight: 18, marginTop: -12 }}>
				Limba activa: {LIMBI.find((l) => l.cod === curenta)?.nativ ?? curenta}. Textele care nu au inca
				traducere raman in engleza.
			</Text>
		</EcranSetari>
	)
}
