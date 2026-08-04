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
 * S-3 (audit 2026-08) — verificarea proprietarului si scrierea erau doua apeluri
 *      separate. Intre ele exista o fereastra reala de timp: doua cereri concurente
 *      pe acelasi cod treceau ambele verificarea, apoi ambele scriau. Nicio
 *      verificare facuta in aplicatie nu poate inchide fereastra — doar baza de
 *      date poate, pentru ca doar ea blocheaza randul.
 *      Aici: scrierea trece prin RPC-ul `salveaza_produs_barcode_sigur`, care face
 *      un singur INSERT ... ON CONFLICT DO UPDATE ... WHERE.
 *      Migrarea: supabase/migrations/20260804_audit_critic.sql
 *
 * Migrarile SQL necesare sunt in backend-nutritie-ai/PATCH-CRITIC.md.
 */

const REGEX_COD_BARE = /^[0-9]{4,20}$/;

// Compus din bucati, nu ca literal intreg: literalul lung a fost deja corupt
// o data la copiere si a scos din functiune intreg stratul OpenFoodFacts.
const GAZDA_OFF = 'world.openfoodfacts.org';
const CALE_PRODUS_OFF = '/api/v2/product/';

/**
 * Durata de viata a intrarilor din cache-ul global (zile).
 *
 * barcode_cache are `updated_at` cu index, dar nimic nu expira (B-21): o intrare
 * gresita sau pur si simplu veche ramanea valida la nesfarsit. Dupa TTL, intrarea
 * este tratata ca absenta, deci ruta reimprospateaza din OpenFoodFacts (upsert-ul
 * `salveazaProdusOff` reactualizeaza `updated_at`).
 *
 * Configurabil prin BARCODE_CACHE_TTL_ZILE; implicit 30 de zile.
 */
const TTL_CACHE_ZILE = (() => {
	const valoare = Number(process.env.BARCODE_CACHE_TTL_ZILE);
	return Number.isFinite(valoare) && valoare > 0 ? valoare : 30;
})();
const TTL_CACHE_MS = TTL_CACHE_ZILE * 24 * 60 * 60 * 1000;

const esteCodBareValid = (cod) => REGEX_COD_BARE.test(String(cod ?? '').trim());

/** Mesajele returnate de RPC-ul de scriere, mapate pe status HTTP si motiv. */
const REZULTATE_SCRIERE = {
	salvat: null,
	cod_invalid: {
		status: 400,
		motiv: 'Cod de bare invalid.',
	},
	produs_de_sistem: {
		status: 409,
		motiv:
			'Produsul exista deja intr-o baza de date verificata si nu poate fi suprascris.',
	},
	fara_proprietar: {
		status: 409,
		motiv:
			'Produsul este inregistrat fara proprietar si nu poate fi suprascris.',
	},
	alt_proprietar: {
		status: 409,
		motiv:
			'Produsul este deja inregistrat de alt utilizator si nu poate fi suprascris.',
	},
	refuzat: {
		status: 403,
		motiv: 'Nu ai dreptul sa scrii acest produs.',
	},
};

/**
 * Aruncata cand baza de date refuza scrierea. Poarta `status` si `motiv`, deci
 * ruta o poate transforma direct in raspuns HTTP corect in loc de 500 generic.
 */
class EroareProprietateProdus extends Error {
	constructor({ status, motiv, cod }) {
		super(motiv);
		this.name = 'EroareProprietateProdus';
		this.status = status;
		this.motiv = motiv;
		this.cod = cod;
	}
}

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
 *
 * Nota RLS: `barcode_cache` are politica `USING (FALSE)`, deci este intentionat
 * accesibila DOAR prin service_role. Aici clientul admin este corect, nu o scurtatura.
 */
async function citesteDinCacheGlobal(supabaseAdmin, cod) {
	const { data, error } = await supabaseAdmin
		.from('barcode_cache')
		.select('*')
		.eq('code', cod)
		.maybeSingle();

	if (error || !data) return null;

	// B-21: intrarea mai veche de TTL este tratata ca absenta, ca ruta sa o
	// reimprospateze din OpenFoodFacts. Un rand fara updated_at (randuri vechi,
	// inainte de coloana) e tratat la fel: `new Date(null)` da NaN, nu un TTL valid.
	const vechime = Date.now() - new Date(data.updated_at).getTime();
	if (!Number.isFinite(vechime) || vechime > TTL_CACHE_MS) {
		return null;
	}

	return {
		produs: randLaProdus(data, cod),
		// Sursa originala, nu 'cache'. Clientul trebuie sa poata distinge o valoare
		// dintr-o baza verificata de una introdusa manual de un strain.
		sursa: data.source || 'necunoscut',
		estimat: false,
		dinCache: true,
	};
}

/**
 * Citeste estimarea AI salvata pentru un anumit utilizator.
 *
 * Nota RLS: `barcode_estimari_utilizator` ARE politica `auth.uid() = user_id`.
 * Cand primeste un client legat de JWT-ul utilizatorului, filtrul `.eq('user_id')`
 * devine redundant — dar este pastrat deliberat: apararea in adancime nu se
 * bazeaza pe presupunerea ca apelantul a transmis clientul corect.
 */
async function citesteEstimareUtilizator(supabaseAdmin, { userId, cod }) {
	if (!userId) return null;

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
	if (!userId) throw new Error('Lipseste userId pentru estimarea per utilizator.');

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
 *
 * ATENTIE — aceasta functie este DOAR consultativa, pentru un mesaj de eroare
 * rapid si prietenos. NU este o bariera de securitate: intre citirea de aici si
 * scrierea de mai jos exista o fereastra de timp. Bariera reala este predicatul
 * din `salveaza_produs_barcode_sigur`, evaluat sub blocarea randului.
 * Nu adauga logica de autorizare aici. Adauga-o in RPC.
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
			motiv: REZULTATE_SCRIERE.produs_de_sistem.motiv,
		};
	}

	// Intrare manuala fara proprietar: mostenire dinaintea migrarii. Tratata ca
	// intrare de sistem, altfel gaura din C3 ramane deschisa pentru datele vechi.
	if (!data.created_by_user) {
		return {
			permis: false,
			status: 409,
			motiv: REZULTATE_SCRIERE.fara_proprietar.motiv,
		};
	}

	if (data.created_by_user !== userId) {
		return {
			permis: false,
			status: 409,
			motiv: REZULTATE_SCRIERE.alt_proprietar.motiv,
		};
	}

	return { permis: true, status: 200, motiv: null };
}

/**
 * Salveaza o contributie manuala.
 *
 * Scrierea si verificarea proprietatii se intampla acum in ACEEASI instructiune
 * SQL, deci doua cereri concurente pe acelasi cod nu se mai pot suprascrie.
 * Semnatura este neschimbata fata de varianta anterioara, deci apelantii nu
 * necesita modificari; in schimb, la refuz arunca `EroareProprietateProdus`,
 * care poarta `status` si `motiv` pentru un raspuns HTTP corect.
 */
async function salveazaProdusManual(supabaseAdmin, { cod, userId, valori }) {
	const codCurat = String(cod ?? '').trim();
	if (!esteCodBareValid(codCurat)) {
		throw new EroareProprietateProdus({
			...REZULTATE_SCRIERE.cod_invalid,
			cod: codCurat,
		});
	}

	const { data, error } = await supabaseAdmin.rpc(
		'salveaza_produs_barcode_sigur',
		{
			p_code: codCurat,
			p_user_id: userId,
			p_name: String(valori.name || '').trim().substring(0, 150),
			p_brand: String(valori.brand || '').trim().substring(0, 100),
			p_quantity: String(valori.quantity || '').trim().substring(0, 50),
			p_kcal: valori.kcal_100g,
			p_protein: valori.protein_100g,
			p_carbs: valori.carbs_100g,
			p_fat: valori.fat_100g,
		},
	);

	if (error) throw new Error(error.message);

	// RPC-ul returneaza text; supabase-js poate livra si un array cu un element.
	const rezultat = Array.isArray(data) ? data[0] : data;

	if (rezultat === 'salvat') return { rezultat };

	const detalii = REZULTATE_SCRIERE[rezultat] || REZULTATE_SCRIERE.refuzat;
	throw new EroareProprietateProdus({ ...detalii, cod: codCurat });
}

module.exports = {
	REGEX_COD_BARE,
	GAZDA_OFF,
	TTL_CACHE_ZILE,
	TTL_CACHE_MS,
	REZULTATE_SCRIERE,
	EroareProprietateProdus,
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
