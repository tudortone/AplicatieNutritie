'use strict';

/**
 * Cache de coduri de bare.
 *
 * Rezolva C2 si C3.
 *
 * C2 — Estimarile inventate de LLM erau scrise in `barcode_cache`, o tabela
 *      globala, si returnate ulterior tuturor utilizatorilor cu `source: 'cache'`.
 *      Eticheta de provenienta se pierdea, deci valori fabricate ajungeau in
 *      jurnalul alimentar ca si cum ar fi fost date reale.
 *      Aici: estimarile AI se salveaza per utilizator, nu global, iar provenienta
 *      reala este propagata mereu catre client, impreuna cu `estimat: true`.
 *
 * C3 — /api/salveaza-produs-barcode verifica proprietarul doar daca
 *      `created_by_user` era populat. Intrarile create de OpenFoodFacts si de
 *      estimarile AI nu il populau, deci orice utilizator autentificat putea
 *      suprascrie datele nutritionale ale oricarui produs real, pentru toata lumea.
 *      Aici: intrarile de sistem sunt marcate `is_system` si nu pot fi suprascrise.
 *
 * Migrarile SQL necesare sunt in backend-nutritie-ai/PATCH-CRITIC.md.
 */

const REGEX_COD_BARE = /^[0-9]{4,20}$/;

// Compus din bucati, nu ca literal intreg: literalul lung a fost deja corupt
// o data la copiere si a scos din functiune intreg stratul OpenFoodFacts.
const GAZDA_OFF = 'world.openfoodfacts.org';
const CALE_PRODUS_OFF = '/api/v2/product/';

const esteCodBareValid = (cod) => REGEX_COD_BARE.test(String(cod ?? '').trim());

/**
 * Construieste URL-ul OpenFoodFacts pentru un cod de bare.
 * Codul este validat inainte de interpolare, deci nu poate injecta cale sau query.
 */
function construiesteUrlOpenFoodFacts(cod) {
	const curat = String(cod ?? '').trim();
	if (!esteCodBareValid(curat)) {
		throw new TypeError('Cod de bare invalid.');
	}
	return 'https://' + GAZDA_OFF + CALE_PRODUS_OFF + curat + '.json';
}

/** Transforma un rand din baza de date in forma trimisa clientului. */
function randLaProdus(rand, cod) {
	return {
		codBare: cod,
		nume: rand.name,
		brand: rand.brand || '',
		cantitate: rand.quantity || '',
		calorii: Number(rand.kcal_100g || 0),
		proteine: Number(rand.protein_100g || 0),
		carbohidrati: Number(rand.carbs_100g || 0),
		grasimi: Number(rand.fat_100g || 0),
	};
}

/** Normalizeaza raspunsul OpenFoodFacts. */
function normalizeazaProdusOff(product, cod) {
	const nutrimente = product?.nutriments || {};
	return {
		codBare: cod,
		nume: product?.product_name || product?.product_name_ro || 'Produs necunoscut',
		brand: product?.brands || '',
		cantitate: product?.quantity || '',
		calorii: Number(
			nutrimente['energy-kcal_100g'] || nutrimente['energy-kcal'] || 0,
		),
		proteine: Number(nutrimente.proteins_100g || 0),
		carbohidrati: Number(nutrimente.carbohydrates_100g || 0),
		grasimi: Number(nutrimente.fat_100g || 0),
		imagine_url: product?.image_front_small_url || product?.image_url || null,
	};
}

/**
 * Citeste din cache-ul global. Contine doar date verificabile: OpenFoodFacts sau
 * contributii manuale ale utilizatorilor. Provenienta reala este pastrata.
 */
async function citesteDinCacheGlobal(supabaseAdmin, cod) {
	const { data, error } = await supabaseAdmin
		.from('barcode_cache')
		.select('*')
		.eq('code', cod)
		.maybeSingle();

	if (error || !data) return null;

	return {
		produs: randLaProdus(data, cod),
		// Sursa originala, nu 'cache'. Clientul trebuie sa poata distinge o valoare
		// dintr-o baza verificata de una introdusa manual de un strain.
		sursa: data.source || 'necunoscut',
		estimat: false,
		dinCache: true,
	};
}

/** Citeste estimarea AI salvata pentru un anumit utilizator. */
async function citesteEstimareUtilizator(supabaseAdmin, { userId, cod }) {
	const { data, error } = await supabaseAdmin
		.from('barcode_estimari_utilizator')
		.select('*')
		.eq('user_id', userId)
		.eq('code', cod)
		.maybeSingle();

	if (error || !data) return null;

	return {
		produs: randLaProdus(data, cod),
		sursa: 'estimare_ai',
		estimat: true,
		dinCache: true,
	};
}

/** Salveaza in cache-ul global un produs venit de la OpenFoodFacts. */
async function salveazaProdusOff(supabaseAdmin, { cod, produs, payload }) {
	const { error } = await supabaseAdmin.from('barcode_cache').upsert({
		code: cod,
		source: 'openfoodfacts',
		is_system: true,
		created_by_user: null,
		brand: produs.brand,
		name: produs.nume,
		quantity: produs.cantitate,
		kcal_100g: produs.calorii,
		protein_100g: produs.proteine,
		carbs_100g: produs.carbohidrati,
		fat_100g: produs.grasimi,
		payload: payload ?? null,
		updated_at: new Date().toISOString(),
	});
	if (error) throw new Error(error.message);
}

/**
 * Salveaza o estimare AI. Intentionat NU in cache-ul global: valorile sunt
 * generate de model si nu au ce cauta in datele altor utilizatori.
 */
async function salveazaEstimareUtilizator(supabaseAdmin, { userId, cod, produs }) {
	const { error } = await supabaseAdmin
		.from('barcode_estimari_utilizator')
		.upsert({
			user_id: userId,
			code: cod,
			name: produs.nume,
			brand: produs.brand,
			quantity: produs.cantitate,
			kcal_100g: produs.calorii,
			protein_100g: produs.proteine,
			carbs_100g: produs.carbohidrati,
			fat_100g: produs.grasimi,
			updated_at: new Date().toISOString(),
		});
	if (error) throw new Error(error.message);
}

/**
 * Decide daca un utilizator poate scrie peste o intrare din cache-ul global.
 * Intrarile de sistem sunt intangibile; cele manuale apartin primului creator.
 */
async function verificaDreptDeScriere(supabaseAdmin, { cod, userId }) {
	const { data, error } = await supabaseAdmin
		.from('barcode_cache')
		.select('created_by_user, is_system, source')
		.eq('code', cod)
		.maybeSingle();

	if (error) {
		return {
			permis: false,
			status: 503,
			motiv: 'Nu s-a putut verifica proprietarul produsului. Incearca din nou.',
		};
	}

	if (!data) return { permis: true, status: 200, motiv: null };

	if (data.is_system) {
		return {
			permis: false,
			status: 409,
			motiv:
				'Produsul exista deja intr-o baza de date verificata si nu poate fi suprascris.',
		};
	}

	// Intrare manuala fara proprietar: mostenire dinaintea migrarii. Tratata ca
	// intrare de sistem, altfel gaura din C3 ramane deschisa pentru datele vechi.
	if (!data.created_by_user) {
		return {
			permis: false,
			status: 409,
			motiv:
				'Produsul este inregistrat fara proprietar si nu poate fi suprascris.',
		};
	}

	if (data.created_by_user !== userId) {
		return {
			permis: false,
			status: 409,
			motiv:
				'Produsul este deja inregistrat de alt utilizator si nu poate fi suprascris.',
		};
	}

	return { permis: true, status: 200, motiv: null };
}

/** Salveaza o contributie manuala, dupa verificarea dreptului de scriere. */
async function salveazaProdusManual(supabaseAdmin, { cod, userId, valori }) {
	const { error } = await supabaseAdmin.from('barcode_cache').upsert({
		code: cod,
		source: 'user_manual',
		is_system: false,
		created_by_user: userId,
		brand: String(valori.brand || '').trim().substring(0, 100),
		name: String(valori.name || '').trim().substring(0, 150),
		quantity: String(valori.quantity || '').trim().substring(0, 50),
		kcal_100g: valori.kcal_100g,
		protein_100g: valori.protein_100g,
		carbs_100g: valori.carbs_100g,
		fat_100g: valori.fat_100g,
		payload: { userInputs: true },
		updated_at: new Date().toISOString(),
	});
	if (error) throw new Error(error.message);
}

module.exports = {
	REGEX_COD_BARE,
	GAZDA_OFF,
	esteCodBareValid,
	construiesteUrlOpenFoodFacts,
	normalizeazaProdusOff,
	citesteDinCacheGlobal,
	citesteEstimareUtilizator,
	salveazaProdusOff,
	salveazaEstimareUtilizator,
	verificaDreptDeScriere,
	salveazaProdusManual,
};
