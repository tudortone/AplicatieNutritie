'use strict';

/**
 * Rezolvarea identitatii utilizatorului dintr-un token.
 *
 * Endpointurile ordinare accepta exclusiv tokenuri Supabase verificate remote.
 * Clerk ramane un furnizor de sincronizare prin webhook-urile semnate, nu o cale
 * bearer alternativa: un JWT Clerk nu poate furniza un context `auth.uid()`
 * Supabase si, prin urmare, nu poate primi acces la datele utilizatorului.
 *
 * Rolul de admin si dreptul de tester se citesc exclusiv din `app_metadata`,
 * NU din `user_metadata`:
 * `app_metadata` este controlat de server (GoTrue/admin API), in timp ce
 * `user_metadata` poate fi rescris de orice utilizator prin SDK-ul client
 * (supabase.auth.updateUser({ data: ... })). Folosirea `user_metadata` pentru
 * privilegii ar permite auto-escaladare la admin.
 *
 * Adaugat dupa auditul urmator: identitatea returnata include `expiraLaMs`,
 * momentul real de expirare al tokenului. Fara el, cache-ul de sesiuni memora
 * orbeste 60 de secunde, deci un token expirat ramanea acceptat.
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
 * Citeste `exp` dintr-un JWT, FARA sa verifice semnatura.
 *
 * De apelat exclusiv DUPA ce tokenul a fost validat criptografic de Supabase Auth
 * sau de Clerk. Scopul nu este autentificarea, ci sa nu memoram in cache o sesiune
 * mai mult decat este ea valabila. Daca `exp` lipseste sau e ilizibil, intoarcem
 * null si ramane in vigoare TTL-ul scurt al cache-ului.
 */
function citesteExpiraLaMs(token) {
	try {
		const parti = String(token).split('.');
		if (parti.length !== 3) return null;
		const payload = JSON.parse(Buffer.from(parti[1], 'base64url').toString('utf8'));
		const exp = Number(payload?.exp);
		if (!Number.isFinite(exp) || exp <= 0) return null;
		return exp * 1000;
	} catch {
		return null;
	}
}

/**
 * Valideaza un token si intoarce o identitate normalizata.
 *
 * @returns {Promise<{id: string, email: string|null, provider: 'supabase', expiraLaMs: number|null, esteAdmin: boolean, esteTester: boolean}>}
 * @throws {EroareIdentitate}
 */
async function rezolvaIdentitate({
	token,
	supabase,
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
			expiraLaMs: citesteExpiraLaMs(token),
			esteAdmin: utilizator.app_metadata?.rol === 'admin',
			esteTester: utilizator.app_metadata?.full_access === true,
		};
	}

	// B-6: daca serviciul Auth este indisponibil (eroare de transport cu status 0,
	// sau 5xx de la GoTrue), NU raportam 401 — clientul ar deconecta utilizatori cu
	// sesiuni valide la o pana. Doar respingerea explicita a tokenului (4xx) cade
	// mai departe, pe 401 existent.
	if (error && (error.status === 0 || error.status >= 500)) {
		throw new EroareIdentitate(
			'Serviciul de autentificare este indisponibil.',
			'AUTH_INDISPONIBIL',
			503,
		);
	}

	throw new EroareIdentitate(
		'Token invalid sau respins de serverul Auth.',
		'TOKEN_INVALID',
		401,
	);
}

module.exports = {
	esteUuid,
	EroareIdentitate,
	rezolvaIdentitate,
	citesteExpiraLaMs,
};
