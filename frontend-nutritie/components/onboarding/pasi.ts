/** Ordinea pasilor din onboarding. Bara de progres se calculeaza din ea. */
export const PASI_ONBOARDING = [
	'/onboarding',
	'/onboarding/data-nasterii',
	'/onboarding/inaltime',
	'/onboarding/greutate',
	'/onboarding/scop',
	'/onboarding/greutate-tinta',
	'/onboarding/activitate',
	'/onboarding/ritm',
	'/onboarding/dieta',
	'/onboarding/plan',
	'/onboarding/prezentare',
] as const

export type PasOnboarding = (typeof PASI_ONBOARDING)[number]

/** Pasii care se sar cand utilizatorul alege doar mentinerea greutatii. */
export const PASI_DOAR_PENTRU_SCOP: PasOnboarding[] = [
	'/onboarding/greutate-tinta',
	'/onboarding/ritm',
]

/**
 * Returneaza lista de pasi valabila pentru raspunsurile curente.
 * La mentinere, greutatea tinta si ritmul nu au sens, deci dispar si din
 * bara de progres, nu doar din navigare.
 */
export function pasiActivi(scop: string | null): PasOnboarding[] {
	const toti = [...PASI_ONBOARDING]
	if (scop !== 'mentinere') return toti
	return toti.filter((p) => !PASI_DOAR_PENTRU_SCOP.includes(p))
}

/** Pasul urmator din flux, sau `null` daca acesta era ultimul. */
export function pasulUrmator(curent: PasOnboarding, scop: string | null): PasOnboarding | null {
	const pasi = pasiActivi(scop)
	const i = pasi.indexOf(curent)
	if (i === -1 || i === pasi.length - 1) return null
	return pasi[i + 1]
}
