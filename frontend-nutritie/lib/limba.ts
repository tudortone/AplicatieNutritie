import AsyncStorage from '@react-native-async-storage/async-storage'

import i18n from '../i18n'

/** Cheia sub care retinem limba aleasa manual de utilizator. */
export const CHEIE_LIMBA = 'nutriai-limba'

export type CodLimba = 'ro' | 'en'

/** Limbile pentru care exista fisiere de traducere in i18n/locales. */
export const LIMBI: { cod: CodLimba; nume: string; nativ: string; steag: string }[] = [
	{ cod: 'ro', nume: 'Romana', nativ: 'Romana', steag: '\u{1F1F7}\u{1F1F4}' },
	{ cod: 'en', nume: 'Engleza', nativ: 'English', steag: '\u{1F1EC}\u{1F1E7}' },
]

export function esteCodLimba(valoare: unknown): valoare is CodLimba {
	return LIMBI.some((l) => l.cod === valoare)
}

/** Numele de afisat pentru un cod de limba, cu revenire la cod daca nu e cunoscut. */
export function numeLimba(cod: string): string {
	return LIMBI.find((l) => l.cod === cod)?.nativ ?? cod.toUpperCase()
}

/** Schimba limba activa si o retine pentru pornirile urmatoare. */
export async function schimbaLimba(cod: CodLimba): Promise<void> {
	await i18n.changeLanguage(cod)
	try {
		await AsyncStorage.setItem(CHEIE_LIMBA, cod)
	} catch {
		// Limba ramane schimbata in sesiunea curenta chiar daca scrierea esueaza.
	}
}
