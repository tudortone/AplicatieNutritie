import AsyncStorage from '@react-native-async-storage/async-storage'

/** Cheia sub care tinem raspunsurile pana cand utilizatorul isi face cont. */
export const CHEIE_ONBOARDING = 'nutriai-onboarding-date'

export type Gen = 'masculin' | 'feminin'
export type Scop = 'slabire' | 'mentinere' | 'masa'
export type Activitate = 'sedentar' | 'usor' | 'moderat' | 'intens' | 'foarte_intens'
export type TipDieta =
	| 'echilibrata'
	| 'low_carb'
	| 'bogata_proteine'
	| 'mediteraneana'
	| 'vegetariana'
	| 'vegana'
	| 'keto'

export type DateOnboarding = {
	gen: Gen | null
	/** ISO `YYYY-MM-DD` */
	dataNasterii: string | null
	inaltimeCm: number | null
	greutateKg: number | null
	scop: Scop | null
	greutateTintaKg: number | null
	activitate: Activitate | null
	/** kg pe saptamana, mereu pozitiv; sensul vine din `scop` */
	ritmKgSaptamana: number | null
	dieta: TipDieta | null
}

export const DATE_INITIALE: DateOnboarding = {
	gen: null,
	dataNasterii: null,
	inaltimeCm: null,
	greutateKg: null,
	scop: null,
	greutateTintaKg: null,
	activitate: null,
	ritmKgSaptamana: null,
	dieta: null,
}

// ---------------------------------------------------------------- etichete

export const ETICHETE_SCOP: Record<Scop, { titlu: string; detaliu: string }> = {
	slabire: { titlu: 'Vreau sa slabesc', detaliu: 'Pierdere de grasime, pastrand masa musculara' },
	mentinere: { titlu: 'Vreau sa ma mentin', detaliu: 'Greutate stabila, compozitie mai buna' },
	masa: { titlu: 'Vreau sa pun in greutate', detaliu: 'Crestere de masa musculara' },
}

export const ETICHETE_ACTIVITATE: Record<
	Activitate,
	{ titlu: string; detaliu: string; factor: number }
> = {
	sedentar: { titlu: 'Sedentar', detaliu: 'Birou, foarte putina miscare', factor: 1.2 },
	usor: { titlu: 'Usor activ', detaliu: '1-3 antrenamente pe saptamana', factor: 1.375 },
	moderat: { titlu: 'Moderat activ', detaliu: '3-5 antrenamente pe saptamana', factor: 1.55 },
	intens: { titlu: 'Foarte activ', detaliu: '6-7 antrenamente pe saptamana', factor: 1.725 },
	foarte_intens: { titlu: 'Extrem de activ', detaliu: 'Munca fizica sau doua antrenamente pe zi', factor: 1.9 },
}

/** Procentele sunt din caloriile totale si insumeaza 1. */
export const ETICHETE_DIETA: Record<
	TipDieta,
	{ titlu: string; detaliu: string; proteine: number; carbohidrati: number; grasimi: number }
> = {
	echilibrata: { titlu: 'Echilibrata', detaliu: 'Fara restrictii, macro clasice', proteine: 0.3, carbohidrati: 0.4, grasimi: 0.3 },
	low_carb: { titlu: 'Saraca in carbohidrati', detaliu: 'Mai putine paste, paine si zahar', proteine: 0.35, carbohidrati: 0.25, grasimi: 0.4 },
	bogata_proteine: { titlu: 'Bogata in proteine', detaliu: 'Pentru masa musculara si satietate', proteine: 0.4, carbohidrati: 0.35, grasimi: 0.25 },
	mediteraneana: { titlu: 'Mediteraneana', detaliu: 'Peste, legume, ulei de masline', proteine: 0.25, carbohidrati: 0.45, grasimi: 0.3 },
	vegetariana: { titlu: 'Vegetariana', detaliu: 'Fara carne, cu lactate si oua', proteine: 0.25, carbohidrati: 0.45, grasimi: 0.3 },
	vegana: { titlu: 'Vegana', detaliu: 'Exclusiv din surse vegetale', proteine: 0.22, carbohidrati: 0.5, grasimi: 0.28 },
	keto: { titlu: 'Keto', detaliu: 'Foarte putini carbohidrati, multe grasimi', proteine: 0.25, carbohidrati: 0.07, grasimi: 0.68 },
}

// ---------------------------------------------------------------- limite

export const LIMITE_ONBOARDING = {
	inaltimeCm: { min: 120, max: 230 },
	greutateKg: { min: 35, max: 250 },
	varsta: { min: 13, max: 100 },
	ritmKgSaptamana: { min: 0.1, max: 1.5 },
} as const

/** Sub aceste praguri planul devine nesigur, indiferent de deficit. */
const CALORII_MINIME: Record<Gen, number> = { masculin: 1500, feminin: 1200 }

/** Energia dintr-un kilogram de tesut adipos, in kcal. */
const KCAL_PER_KG = 7700

// ---------------------------------------------------------------- calcule

export function calculeazaVarsta(dataNasterii: string, acum: Date = new Date()): number {
	const n = new Date(dataNasterii)
	let varsta = acum.getFullYear() - n.getFullYear()
	const luna = acum.getMonth() - n.getMonth()
	if (luna < 0 || (luna === 0 && acum.getDate() < n.getDate())) varsta--
	return varsta
}

/** Metabolism bazal, formula Mifflin-St Jeor. */
export function calculeazaBMR(args: {
	gen: Gen
	greutateKg: number
	inaltimeCm: number
	varsta: number
}): number {
	const baza = 10 * args.greutateKg + 6.25 * args.inaltimeCm - 5 * args.varsta
	return args.gen === 'masculin' ? baza + 5 : baza - 161
}

export type PlanNutritional = {
	varsta: number
	bmr: number
	/** consum total zilnic estimat, fara ajustarea de obiectiv */
	tdee: number
	/** caloriile tinta zilnice, dupa deficit sau surplus */
	calorii: number
	/** diferenta fata de TDEE; negativa la slabire */
	ajustare: number
	proteineG: number
	carbohidratiG: number
	grasimiG: number
	/** saptamani estimate pana la greutatea dorita, `null` la mentinere */
	saptamaniEstimate: number | null
	/** data estimata a atingerii obiectivului */
	dataEstimata: Date | null
	/** true daca deficitul a fost limitat ca sa nu coboare sub pragul sigur */
	limitatLaMinim: boolean
}

/**
 * Transforma raspunsurile din onboarding intr-un plan nutritional.
 * Returneaza `null` daca lipseste ceva esential.
 */
export function calculeazaPlan(d: DateOnboarding, acum: Date = new Date()): PlanNutritional | null {
	if (!d.gen || !d.dataNasterii || !d.inaltimeCm || !d.greutateKg || !d.scop || !d.activitate || !d.dieta) {
		return null
	}

	const varsta = calculeazaVarsta(d.dataNasterii, acum)
	const bmr = calculeazaBMR({
		gen: d.gen,
		greutateKg: d.greutateKg,
		inaltimeCm: d.inaltimeCm,
		varsta,
	})
	const tdee = bmr * ETICHETE_ACTIVITATE[d.activitate].factor

	const ritm = d.scop === 'mentinere' ? 0 : (d.ritmKgSaptamana ?? 0.5)
	let ajustare = (ritm * KCAL_PER_KG) / 7
	if (d.scop === 'slabire') ajustare = -ajustare
	else if (d.scop === 'mentinere') ajustare = 0

	const brut = tdee + ajustare
	const minim = CALORII_MINIME[d.gen]
	const limitatLaMinim = brut < minim
	const calorii = Math.round(limitatLaMinim ? minim : brut)

	const dieta = ETICHETE_DIETA[d.dieta]
	const proteineG = Math.round((calorii * dieta.proteine) / 4)
	const carbohidratiG = Math.round((calorii * dieta.carbohidrati) / 4)
	const grasimiG = Math.round((calorii * dieta.grasimi) / 9)

	// Recalculam ritmul real, fiindca pragul minim poate reduce deficitul cerut.
	const ajustareReala = calorii - tdee
	let saptamaniEstimate: number | null = null
	let dataEstimata: Date | null = null
	if (d.scop !== 'mentinere' && d.greutateTintaKg && Math.abs(ajustareReala) > 1) {
		const diferenta = Math.abs(d.greutateTintaKg - d.greutateKg)
		const kgPeSaptamana = (Math.abs(ajustareReala) * 7) / KCAL_PER_KG
		if (diferenta > 0 && kgPeSaptamana > 0) {
			saptamaniEstimate = Math.ceil(diferenta / kgPeSaptamana)
			dataEstimata = new Date(acum.getTime() + saptamaniEstimate * 7 * 86400000)
		}
	}

	return {
		varsta,
		bmr: Math.round(bmr),
		tdee: Math.round(tdee),
		calorii,
		ajustare: Math.round(ajustareReala),
		proteineG,
		carbohidratiG,
		grasimiG,
		saptamaniEstimate,
		dataEstimata,
		limitatLaMinim,
	}
}

/** Ritmul cerut e prea agresiv daca depaseste 1% din greutatea corporala pe saptamana. */
export function ritmEsteAgresiv(greutateKg: number | null, ritm: number | null): boolean {
	if (!greutateKg || !ritm) return false
	return ritm > greutateKg * 0.01
}

// ---------------------------------------------------------------- stocare

export async function salveazaDateOnboarding(date: DateOnboarding): Promise<void> {
	await AsyncStorage.setItem(CHEIE_ONBOARDING, JSON.stringify(date))
}

export async function incarcaDateOnboarding(): Promise<DateOnboarding | null> {
	try {
		const brut = await AsyncStorage.getItem(CHEIE_ONBOARDING)
		if (!brut) return null
		return { ...DATE_INITIALE, ...(JSON.parse(brut) as Partial<DateOnboarding>) }
	} catch {
		return null
	}
}

export async function stergeDateOnboarding(): Promise<void> {
	await AsyncStorage.removeItem(CHEIE_ONBOARDING)
}
