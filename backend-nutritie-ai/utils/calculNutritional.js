'use strict';

/**
 * F-08 — SURSA UNICA DE ADEVAR pentru calculul nutritional pe backend.
 *
 * ==========================================================================
 * PROBLEMA
 * ==========================================================================
 * Existau DOUA formule diferite care produceau tinte calorice/macro:
 *
 *   1. frontend-nutritie/lib/onboarding.ts -> `calculeazaPlan`
 *      Mifflin-St Jeor, 5 niveluri de activitate, deficit derivat din ritmul
 *      cerut (kg/saptamana * 7700 / 7), macro-uri procentuale per tip de dieta,
 *      prag minim de siguranta pe gen (1500 M / 1200 F).
 *
 *   2. backend POST /api/v1/calculeaza-profil (routes/profil.js)
 *      Mifflin-St Jeor, 3 niveluri de activitate, deficit/surplus FIX
 *      (-500 / +350), proteine 1.6-2.0 g/kg, grasimi 25% fix, restul carbo.
 *
 * Acelasi utilizator primea deci tinte DIFERITE dupa cum ajungea la ele prin
 * chestionar sau prin ecranul „Asistent Profil", fara nicio explicatie.
 *
 * ==========================================================================
 * DECIZIA
 * ==========================================================================
 * Sursa de adevar este `calculeazaPlan` din onboarding:
 *   - este calea prin care trec TOTI utilizatorii (onboarding-ul e obligatoriu);
 *   - rezultatul ei este cel persistat in `profil` si folosit de tot restul app-ului;
 *   - este strict mai bogata (dieta, ritm, prag de siguranta).
 *
 * Modulul de fata reproduce acea matematica IDENTIC, iar endpointul o foloseste.
 * Parametrii pe care endpointul nu ii primeste cad pe aceleasi valori implicite
 * ca in onboarding: ritm 0.5 kg/saptamana si dieta „echilibrata".
 *
 * Orice modificare aici trebuie oglindita in lib/onboarding.ts si invers —
 * echivalenta este verificata de vectorii comuni din
 * contracts/nutritie/vectori-nutritie.json (testati pe ambele parti).
 */

/** Factorii de activitate, identici cu ETICHETE_ACTIVITATE din onboarding.ts. */
const FACTORI_ACTIVITATE = Object.freeze({
	sedentar: 1.2,
	usor: 1.375,
	moderat: 1.55,
	intens: 1.725,
	foarte_intens: 1.9,
});

/** Procentele macro per dieta, identice cu ETICHETE_DIETA din onboarding.ts. */
const MACRO_DIETA = Object.freeze({
	echilibrata: { proteine: 0.3, carbohidrati: 0.4, grasimi: 0.3 },
	low_carb: { proteine: 0.35, carbohidrati: 0.25, grasimi: 0.4 },
	bogata_proteine: { proteine: 0.4, carbohidrati: 0.35, grasimi: 0.25 },
	mediteraneana: { proteine: 0.25, carbohidrati: 0.45, grasimi: 0.3 },
	vegetariana: { proteine: 0.25, carbohidrati: 0.45, grasimi: 0.3 },
	vegana: { proteine: 0.22, carbohidrati: 0.5, grasimi: 0.28 },
	keto: { proteine: 0.25, carbohidrati: 0.07, grasimi: 0.68 },
});

/** Sub aceste praguri planul devine nesigur, indiferent de deficit. */
const CALORII_MINIME = Object.freeze({ masculin: 1500, feminin: 1200 });

/** Energia dintr-un kilogram de tesut adipos, in kcal. */
const KCAL_PER_KG = 7700;

const RITM_IMPLICIT_KG_SAPTAMANA = 0.5;
const DIETA_IMPLICITA = 'echilibrata';

/** Metabolism bazal, formula Mifflin-St Jeor. */
function calculeazaBMR({ gen, greutateKg, inaltimeCm, varsta }) {
	const baza = 10 * greutateKg + 6.25 * inaltimeCm - 5 * varsta;
	return gen === 'masculin' ? baza + 5 : baza - 161;
}

/**
 * Reproduce `calculeazaPlan` din lib/onboarding.ts.
 *
 * @returns {{bmr:number,tdee:number,calorii:number,proteineG:number,carbohidratiG:number,grasimiG:number,limitatLaMinim:boolean}|null}
 */
function calculeazaPlanNutritional({
	gen,
	varsta,
	greutateKg,
	inaltimeCm,
	activitate,
	scop,
	ritmKgSaptamana = null,
	dieta = DIETA_IMPLICITA,
}) {
	const factor = FACTORI_ACTIVITATE[activitate];
	const macro = MACRO_DIETA[dieta];
	const minim = CALORII_MINIME[gen];
	if (!factor || !macro || !minim) return null;
	if (![varsta, greutateKg, inaltimeCm].every((v) => Number.isFinite(v))) return null;
	if (!Number.isInteger(varsta) || varsta < 10 || varsta > 100) return null;
	if (greutateKg < 30 || greutateKg > 300) return null;
	if (inaltimeCm < 100 || inaltimeCm > 250) return null;
	if (!['slabire', 'mentinere', 'masa'].includes(scop)) return null;
	if (ritmKgSaptamana !== null && (!Number.isFinite(ritmKgSaptamana) || ritmKgSaptamana < 0 || ritmKgSaptamana > 1.5)) {
		return null;
	}

	const bmr = calculeazaBMR({ gen, greutateKg, inaltimeCm, varsta });
	const tdee = bmr * factor;

	const ritm = scop === 'mentinere' ? 0 : (ritmKgSaptamana ?? RITM_IMPLICIT_KG_SAPTAMANA);
	if (!Number.isFinite(ritm) || ritm < 0 || (scop !== 'mentinere' && (ritm < 0.1 || ritm > 1.5))) {
		return null;
	}
	let ajustare = (ritm * KCAL_PER_KG) / 7;
	if (scop === 'slabire') ajustare = -ajustare;
	else if (scop === 'mentinere') ajustare = 0;

	const brut = tdee + ajustare;
	const limitatLaMinim = brut < minim;
	const calorii = Math.round(limitatLaMinim ? minim : brut);

	return {
		bmr: Math.round(bmr),
		tdee: Math.round(tdee),
		calorii,
		proteineG: Math.round((calorii * macro.proteine) / 4),
		carbohidratiG: Math.round((calorii * macro.carbohidrati) / 4),
		grasimiG: Math.round((calorii * macro.grasimi) / 9),
		limitatLaMinim,
	};
}

/**
 * Traduce etichetele folosite de POST /calculeaza-profil in vocabularul canonic
 * al onboarding-ului. Endpointul nu primeste dieta si ritm, deci cad pe aceleasi
 * valori implicite ca in onboarding.
 */
const MAPARE_SEX = Object.freeze({ Masculin: 'masculin', Feminin: 'feminin' });
const MAPARE_ACTIVITATE = Object.freeze({
	Sedentar: 'sedentar',
	Moderat: 'moderat',
	'Foarte Activ': 'intens',
});
const MAPARE_OBIECTIV = Object.freeze({
	'Slăbire': 'slabire',
	'Menținere': 'mentinere',
	'Masă Musculară': 'masa',
});

module.exports = {
	FACTORI_ACTIVITATE,
	MACRO_DIETA,
	CALORII_MINIME,
	KCAL_PER_KG,
	RITM_IMPLICIT_KG_SAPTAMANA,
	DIETA_IMPLICITA,
	calculeazaBMR,
	calculeazaPlanNutritional,
	MAPARE_SEX,
	MAPARE_ACTIVITATE,
	MAPARE_OBIECTIV,
};
