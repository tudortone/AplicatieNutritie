'use strict';

/**
 * Client Supabase per-cerere, legat de identitatea utilizatorului.
 *
 * ==========================================================================
 * PROBLEMA (S-1, audit 2026-08)
 * ==========================================================================
 * Baza de date are deja politici RLS corecte:
 *
 *     create policy ... on mese for all
 *       using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * Aceste politici nu au niciun efect asupra backendului, pentru ca backendul se
 * conecteaza cu `service_role`, iar `service_role` ocoleste RLS prin definitie.
 * In consecinta, singurul lucru care separa datele utilizatorului A de cele ale
 * utilizatorului B este prezenta manuala a unui `.eq('user_id', userId)` in
 * fiecare interogare.
 *
 * Aceasta nu este o bariera de securitate. Este o convingere. Un endpoint nou
 * scris grabit, fara acel filtru, expune jurnalul alimentar al tuturor - si nu
 * exista niciun test care sa prinda asta, pentru ca interogarea e perfect valida.
 *
 * ==========================================================================
 * SOLUTIA
 * ==========================================================================
 * Pentru tabelele care AU politici, folosim un client construit din cheia anona
 * plus JWT-ul utilizatorului. Postgres primeste un `auth.uid()` real si aplica
 * politicile. Daca filtrul din cod lipseste, baza de date returneaza zero randuri
 * in loc sa returneze datele altcuiva. Filtrul ramane totusi in cod - aparare in
 * adancime, nu inlocuire.
 *
 * Pentru tabelele care NU au politici de utilizator, clientul admin este singura
 * cale corecta, nu o scurtatura:
 *   - `barcode_cache`      - politica `using (false)`: cache global, backend-only
 *   - `clerk_user_map`     - RLS activ fara nicio politica: deny-all
 *   - `exercitii`          - catalog partajat, read-only pentru utilizatori
 *
 * ==========================================================================
 * LIMITARE IMPORTANTA - UTILIZATORII CLERK
 * ==========================================================================
 * Un utilizator autentificat prin Clerk NU are un JWT Supabase. Pentru el nu se
 * poate construi un client cu `auth.uid()` valid, deci RLS nu poate fi aplicat
 * si se cade inevitabil pe clientul admin cu filtrare manuala.
 *
 * Asta nu este o omisiune a acestui modul, este o consecinta a faptului ca
 * aplicatia are doua sisteme de identitate paralele. Cat timp calea Clerk exista,
 * o parte din trafic ramane fara plasa de siguranta a bazei de date.
 * Rezolvarea corecta pe termen lung este una din doua:
 *   (a) emiterea unui JWT Supabase pentru utilizatorii Clerk (JWT template), sau
 *   (b) renuntarea la una dintre cele doua metode de autentificare.
 * Pana atunci, `modAdmin: true` marcheaza explicit cererile neprotejate de RLS,
 * iar `statisticiContext()` spune CAT trafic este in aceasta situatie. O limitare
 * cunoscuta si nemasurata este doar o vulnerabilitate cu documentatie buna.
 *
 * ==========================================================================
 * C-3 (audit 2026-08-05): degradarea tacuta a fost eliminata
 * ==========================================================================
 * Varianta anterioara prindea orice eroare de construire a clientului cu RLS,
 * scria un `console.warn` si continua pe `service_role`. Adica fix scenariul pe
 * care comentariul de mai sus il declara mai periculos decat esecul. Un
 * `SUPABASE_ANON_KEY` absent dezactiva RLS pe TOT traficul Supabase, in tacere,
 * la runtime, fara ca vreun test sau vreo alerta sa observe.
 *
 * Acum ramura Supabase este fail-closed: arunca `EroareContextDate` (503).
 * Calea Clerk nu este afectata - ea nu intra niciodata pe aceasta ramura.
 */

const { createClient } = require('@supabase/supabase-js');
const { Logger } = require('./logger');

/** Tabele cu politici RLS pe `auth.uid() = user_id`. */
const TABELE_CU_RLS_UTILIZATOR = Object.freeze([
	'mese',
	'profil',
	'antrenamente',
	'produse_camara',
	'gamificare',
	'workout_logs',
	'audit_log',
	'barcode_estimari_utilizator',
]);

/** Tabele accesibile exclusiv backendului. Aici clientul admin este corect. */
const TABELE_DOAR_ADMIN = Object.freeze([
	'barcode_cache',
	'clerk_user_map',
]);

/**
 * Esec la construirea contextului de date. Se traduce in 503, nu in 500:
 * serverul este configurat gresit, cererea nu este vinovata.
 */
class EroareContextDate extends Error {
	constructor(mesaj, cod = 'CONTEXT_DATE_INDISPONIBIL') {
		super(mesaj);
		this.name = 'EroareContextDate';
		this.cod = cod;
		this.status = 503;
	}
}

/**
 * Contoare de proces. Raspund la o singura intrebare, dar cea corecta:
 * cat din traficul autentificat ruleaza fara plasa de siguranta a bazei de date?
 */
const _statistici = { cereriCuRls: 0, cereriModAdmin: 0, esecuriClientRls: 0 };

function statisticiContext() {
	const total = _statistici.cereriCuRls + _statistici.cereriModAdmin;
	return {
		..._statistici,
		procentFaraRls: total === 0 ? 0 : Math.round((_statistici.cereriModAdmin / total) * 100),
	};
}

/**
 * Construieste un client legat de JWT-ul utilizatorului.
 *
 * Nu persista sesiunea si nu reinnoieste tokenul: obiectul trebuie sa traiasca
 * exact cat cererea HTTP. Un client per-cerere refolosit intre cereri ar duce la
 * scurgerea identitatii de la un utilizator la altul - exact defectul pe care
 * incercam sa il eliminam.
 */
function creeazaClientUtilizator({ url, anonKey, token }) {
	if (!url || !anonKey) {
		throw new Error('Lipsesc SUPABASE_URL / SUPABASE_ANON_KEY.');
	}
	if (!token || typeof token !== 'string') {
		throw new Error('Lipseste tokenul utilizatorului.');
	}

	return createClient(url, anonKey, {
		global: {
			headers: { Authorization: 'Bearer ' + token },
		},
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
}

/**
 * Contextul de date al unei cereri.
 *
 * Returneaza:
 *   - `db`       clientul pentru datele utilizatorului (cu RLS daca e posibil)
 *   - `admin`    clientul privilegiat, DOAR pentru tabelele backend-only
 *   - `userId`   identitatea rezolvata
 *   - `modAdmin` true cand RLS NU protejeaza aceasta cerere (cale Clerk)
 *
 * `sursaToken` este 'supabase' cand tokenul primit este un JWT Supabase valid.
 * Pe acea cale, imposibilitatea de a construi clientul restrans este o eroare,
 * nu o degradare acceptabila (C-3).
 *
 * Pentru orice alta sursa (Clerk), `db` cade pe clientul admin: fara `auth.uid()`
 * un client anon nu ar putea citi nimic, iar cererea ar esua in loc sa fie doar
 * mai putin protejata. Cazul este numarat, nu doar comentat.
 */
function creeazaContextDate({
	config,
	supabaseAdmin,
	token,
	userId,
	sursaToken,
}) {
	if (!userId) {
		throw new Error('Contextul de date necesita un userId rezolvat.');
	}

	if (sursaToken === 'supabase' && token) {
		try {
			const db = creeazaClientUtilizator({
				url: config.supabase.url,
				anonKey: config.supabase.anonKey,
				token,
			});
			_statistici.cereriCuRls += 1;
			return { db, admin: supabaseAdmin, userId, modAdmin: false };
		} catch (err) {
			// FAIL-CLOSED. O cerere care se crede protejata de RLS dar nu este
			// e mai periculoasa decat una care esueaza vizibil. Nu logam
			// err.message prin console: Logger aplica lista alba de chei (B-11).
			_statistici.esecuriClientRls += 1;
			Logger.error('Client RLS indisponibil pe cale Supabase; cerere refuzata', {
				userId,
				status: 'CLIENT_RLS_INDISPONIBIL',
			});
			throw new EroareContextDate(
				'Serviciul de date este temporar indisponibil.',
				'CLIENT_RLS_INDISPONIBIL',
			);
		}
	}

	_statistici.cereriModAdmin += 1;
	return { db: supabaseAdmin, admin: supabaseAdmin, userId, modAdmin: true };
}

/**
 * Punct unic de acces la tabelele utilizatorului.
 *
 * Refuza sa construiasca interogarea daca lipseste `userId` sau daca tabela nu
 * este una cu politici de utilizator. Scopul nu este eleganta, este ca omisiunea
 * filtrului sa devina o eroare zgomotoasa in loc de o scurgere silentioasa.
 *
 *     const q = tabelUtilizator(ctx, 'mese').select('*');
 */
function tabelUtilizator(ctx, tabela) {
	if (!ctx || !ctx.db) {
		throw new Error('Context de date lipsa.');
	}
	if (!ctx.userId) {
		throw new Error('Interogare pe date de utilizator fara userId.');
	}
	if (TABELE_DOAR_ADMIN.includes(tabela)) {
		throw new Error(
			'Tabela ' + tabela + ' este backend-only: foloseste ctx.admin explicit.',
		);
	}
	if (!TABELE_CU_RLS_UTILIZATOR.includes(tabela)) {
		throw new Error(
			'Tabela ' +
				tabela +
				' nu este inregistrata in clientUtilizator.js. Adaug-o dupa ce ii verifici politicile RLS.',
		);
	}
	return ctx.db.from(tabela);
}

module.exports = {
	TABELE_CU_RLS_UTILIZATOR,
	TABELE_DOAR_ADMIN,
	EroareContextDate,
	creeazaClientUtilizator,
	creeazaContextDate,
	statisticiContext,
	tabelUtilizator,
};
