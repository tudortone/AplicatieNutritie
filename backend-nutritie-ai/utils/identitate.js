'use strict';

/**
 * Rezolvarea identitatii utilizatorului dintr-un token.
 *
 * Rezolva C4. Varianta anterioara accepta token-uri Supabase SAU Clerk si punea
 * direct `clerkPayload.sub` in req.user.id. Acel `sub` are forma `user_2abc...`,
 * nu un UUID, dar ajungea in coloana `user_id` din tabela `mese`:
 *   - daca `user_id` este `uuid`, fiecare scriere venita pe calea Clerk esua cu
 *     eroare Postgres si clientul primea un 500 generic;
 *   - daca este `text`, acelasi om avea doua identitati si doua jurnale separate,
 *     in functie de metoda de autentificare.
 *
 * Aici, un token Clerk este acceptat doar daca exista o mapare explicita catre
 * un cont Supabase in tabela `clerk_user_map`. Fara mapare -> 409, fail-closed.
 * Nu se scrie NICIODATA in baza de date un identificator care nu e UUID.
 *
 * Migrarea SQL necesara este in backend-nutritie-ai/PATCH-CRITIC.md.
 */

const REGEX_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const esteUuid = (valoare) =>
	typeof valoare === 'string' && REGEX_UUID.test(valoare);

class EroareIdentitate extends Error {
	constructor(mesaj, cod, status = 401) {
		super(mesaj);
		this.name = 'EroareIdentitate';
		this.cod = cod;
		this.status = status;
	}
}

/**
 * Cauta contul Supabase legat de un cont Clerk.
 * @returns {Promise<string|null>} UUID-ul Supabase sau null daca nu exista mapare.
 */
async function gasesteMapareClerk(supabaseAdmin, clerkUserId) {
	const { data, error } = await supabaseAdmin
		.from('clerk_user_map')
		.select('supabase_user_id')
		.eq('clerk_user_id', clerkUserId)
		.maybeSingle();

	if (error) {
		throw new EroareIdentitate(
			'Eroare la verificarea identitatii.',
			'MAPARE_INDISPONIBILA',
			503,
		);
	}

	return data?.supabase_user_id ?? null;
}

/**
 * Leaga un cont Clerk de un cont Supabase existent.
 * De apelat dintr-un flux explicit de asociere, dupa ce ambele identitati au
 * fost dovedite. Nu se apeleaza automat din requireAuth.
 */
async function leagaContClerk(supabaseAdmin, { clerkUserId, supabaseUserId }) {
	if (typeof clerkUserId !== 'string' || !clerkUserId.trim()) {
		throw new TypeError('clerkUserId invalid.');
	}
	if (!esteUuid(supabaseUserId)) {
		throw new TypeError('supabaseUserId trebuie sa fie un UUID.');
	}

	const { error } = await supabaseAdmin.from('clerk_user_map').upsert({
		clerk_user_id: clerkUserId.trim(),
		supabase_user_id: supabaseUserId,
	});

	if (error) throw new Error(`Nu s-a putut lega contul Clerk: ${error.message}`);
	return { clerkUserId: clerkUserId.trim(), supabaseUserId };
}

/**
 * Valideaza un token si intoarce o identitate normalizata.
 *
 * @returns {Promise<{id: string, email: string|null, provider: 'supabase'|'clerk'}>}
 *   `id` este garantat un UUID Supabase, indiferent de furnizorul de autentificare.
 * @throws {EroareIdentitate}
 */
async function rezolvaIdentitate({
	token,
	supabase,
	supabaseAdmin,
	clerkSecretKey,
}) {
	if (typeof token !== 'string' || !token) {
		throw new EroareIdentitate('Token lipsa.', 'TOKEN_LIPSA', 401);
	}

	// 1. Supabase Auth — calea principala.
	const { data, error } = await supabase.auth.getUser(token);
	const utilizator = data?.user;
	if (!error && utilizator) {
		if (!esteUuid(utilizator.id)) {
			throw new EroareIdentitate(
				'Identitate Supabase invalida.',
				'ID_NEVALID',
				401,
			);
		}
		return {
			id: utilizator.id,
			email: utilizator.email ?? null,
			provider: 'supabase',
		};
	}

	// 2. Clerk — acceptat doar daca exista o mapare catre un cont Supabase.
	if (!clerkSecretKey) {
		throw new EroareIdentitate(
			'Token invalid sau respins de serverul Auth.',
			'TOKEN_INVALID',
			401,
		);
	}

	let payloadClerk = null;
	try {
		// Import lazy: pachetul e optional, iar absenta lui nu trebuie sa doboare
		// procesul. Spre deosebire de varianta anterioara, esecul NU e inghitit tacut.
		const { verifyToken } = require('@clerk/express');
		payloadClerk = await verifyToken(token, { secretKey: clerkSecretKey });
	} catch (err) {
		if (err && err.code === 'MODULE_NOT_FOUND') {
			throw new EroareIdentitate(
				'Autentificarea Clerk nu este disponibila pe server.',
				'CLERK_INDISPONIBIL',
				503,
			);
		}
		throw new EroareIdentitate(
			'Token invalid sau respins de serverul Auth.',
			'TOKEN_INVALID',
			401,
		);
	}

	if (!payloadClerk?.sub) {
		throw new EroareIdentitate(
			'Token invalid sau respins de serverul Auth.',
			'TOKEN_INVALID',
			401,
		);
	}

	const idSupabase = await gasesteMapareClerk(supabaseAdmin, payloadClerk.sub);
	if (!idSupabase) {
		// Fail-closed. Mai bine o eroare explicita decat date scrise sub o
		// identitate paralela care rupe jurnalul utilizatorului in doua.
		throw new EroareIdentitate(
			'Contul Clerk nu este asociat unui cont NutriAI. Autentifica-te o data cu emailul contului pentru a le lega.',
			'CLERK_NEMAPAT',
			409,
		);
	}

	return {
		id: idSupabase,
		email: payloadClerk.email ?? null,
		provider: 'clerk',
	};
}

module.exports = {
	esteUuid,
	EroareIdentitate,
	rezolvaIdentitate,
	leagaContClerk,
	gasesteMapareClerk,
};
