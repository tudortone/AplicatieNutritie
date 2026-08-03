import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
	DATE_INITIALE,
	calculeazaPlan,
	incarcaDateOnboarding,
	salveazaDateOnboarding,
	stergeDateOnboarding,
	type DateOnboarding,
	type PlanNutritional,
} from '../lib/onboarding'

type OnboardingContextType = {
	date: DateOnboarding
	/** Actualizeaza campurile primite si le persista imediat. */
	actualizeaza: (patch: Partial<DateOnboarding>) => void
	/** Planul calculat, sau `null` cat timp lipsesc raspunsuri. */
	plan: PlanNutritional | null
	/** True cat timp inca citim raspunsurile salvate. */
	seIncarca: boolean
	reseteaza: () => void
}

const OnboardingContext = createContext<OnboardingContextType | null>(null)

/**
 * Tine raspunsurile din onboarding cat timp utilizatorul parcurge pasii.
 *
 * Raspunsurile sunt salvate local la fiecare pas, deci daca inchide aplicatia
 * la jumatate le regaseste la revenire. Sincronizarea catre cont se face abia
 * dupa autentificare, fiindca pana atunci nu exista un utilizator.
 */
export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [date, setDate] = useState<DateOnboarding>(DATE_INITIALE)
	const [seIncarca, setSeIncarca] = useState(true)

	useEffect(() => {
		let activ = true
		incarcaDateOnboarding()
			.then((salvate) => {
				if (activ && salvate) setDate(salvate)
			})
			.finally(() => {
				if (activ) setSeIncarca(false)
			})
		return () => {
			activ = false
		}
	}, [])

	const actualizeaza = useCallback((patch: Partial<DateOnboarding>) => {
		setDate((precedent) => {
			const urmator = { ...precedent, ...patch }
			// Persistam in fundal; o eroare de scriere nu trebuie sa blocheze pasul.
			void salveazaDateOnboarding(urmator).catch(() => {})
			return urmator
		})
	}, [])

	const reseteaza = useCallback(() => {
		setDate(DATE_INITIALE)
		void stergeDateOnboarding().catch(() => {})
	}, [])

	const plan = useMemo(() => calculeazaPlan(date), [date])

	const valoare = useMemo(
		() => ({ date, actualizeaza, plan, seIncarca, reseteaza }),
		[date, actualizeaza, plan, seIncarca, reseteaza],
	)

	return <OnboardingContext.Provider value={valoare}>{children}</OnboardingContext.Provider>
}

export const useOnboarding = () => {
	const context = useContext(OnboardingContext)
	if (!context) throw new Error('useOnboarding trebuie utilizat in interiorul unui OnboardingProvider')
	return context
}
