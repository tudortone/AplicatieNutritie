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
 * scris grabit, fara acel filtru, expune jurnalul alimentar al tuturor — si nu
 * exista niciun test care sa prinda asta, pentru ca interogarea e perfect valida.
 *
 * ==========================================================================
 * SOLUTIA
 * ==========================================================================
 * Pentru tabelele care AU politici, folosim un client construit din cheia anona
 * plus JWT-ul utilizatorului. Postgres primeste un `auth.uid()` real si aplica
 * politicile. Daca filtrul din cod lipseste, baza de date returneaza zero randuri
 * in loc sa returneze datele altcuiva. Filtrul ramane totusi in cod — aparare in
 * adancime, nu inlocuire.
 *
 * Pentru tabelele care NU au politici de utilizator, clientul admin este singura
 * cale corecta, nu o scurtatura:
 *   - `barcode_cache`      — politica `using (false)`: cache global, backend-only
 *   - `clerk_user_map`     — RLS activ fara nicio politica: deny-all
 *   - `exercitii`          — catalog partajat, read-only pentru utilizatori
 *
 * Clerk este WEBHOOK ONLY: sincronizarea semnata poate folosi serviciile admin,
 * dar un bearer Clerk nu intra in acest context. Orice identitate fara un JWT
 * Supabase verificat este refuzata, nu degradata pe service_role.
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Tabele cu politici RLS pe `auth.uid() = user_id`.
 *
 * F6: `workout_logs` și `audit_log` sunt păstrate INTENȚIONAT, deși nu au scriitori
 * în codul aplicației: `audit_log` e placeholder-ul de audit GDPR (cu funcție de
 * retenție + cron de curățare), iar lista GDPR tratează orice tabel utilizator ca
 * scop-cascade. Nu le prunăm (decizie 2026-08-09): tabele goale, cost 0, iar DROP
 * ar atinge cascadele + fixture-urile RLS fără beneficiu.
 */
const TABELE_CU_RLS_UTILIZATOR = Object.freeze([
	'mese',
	'profil',
	'antrenamente',
	'produse_camara',
	'gamificare',
	'gamificare_evenimente',
	'workout_logs',
	'audit_log',
	'barcode_estimari_utilizator',
	// C1-S2: `ai_jobs` (20260806000001 + 20260807000001) și `credite_ai`
	// (20260807000003) au politici `auth.uid()=user_id` pentru select-own;
	// le înregistrăm ca atare, ca `tabelUtilizator()` să poate servidate
	// utilizatorului doar prin clientul cu RLS, nu prin service_role.
	'ai_jobs',
	'credite_ai',
	'credite_tranzactii',
	'flow_credit_reservations',
	'flow_reward_intents',
]);

/**
 * Toate tabelele care trebuie golite explicit inainte de stergerea identitatii.
 * Billing ramane backend-only (nu intra in registrul accesibil clientului RLS),
 * dar contine material sensibil legat de user_id si participa obligatoriu la GDPR.
 */
const TABELE_STERGERE_GDPR_UTILIZATOR = Object.freeze([
	...TABELE_CU_RLS_UTILIZATOR,
	'google_play_subscriptions',
]);

/** Tabele accesibile exclusiv backendului. Aici clientul admin este corect. */
const TABELE_DOAR_ADMIN = Object.freeze([
	'barcode_cache',
	'clerk_user_map',
]);

/** Contoare interne (A-3): fallback-ul admin ramane vizibil ca zero invariabil. */
let cereriCuRls = 0;
const cereriModAdmin = 0;
let esecuriClientRls = 0;
// C1-S4: contor pentru accesele de tip admin (service_role) pe tabele de
// utilizator care NU trec prin creeazaContextDate (suprafețe care folosesc
// supabaseAdmin direct, fara context per-cerere). Fara el, acele scrieri/ștergeri
// raman invizibile in metrica — un contor orb.
let accesModAdmin = 0;

/**
 * Eroare aruncata cand clientul legat de JWT nu poate fi construit pe calea
 * Supabase (A-3). Fail-closed: o cerere care se crede protejata de RLS dar nu
 * este, e mai periculoasa decat una care stie ca nu este. Handler-ul global de
 * erori din server.js o traduce in 503 cu mesaj neutru.
 */
class EroareContextDate extends Error {
	constructor() {
		super('Client de date indisponibil.');
		this.name = 'EroareContextDate';
		this.cod = 'CLIENT_RLS_INDISPONIBIL';
		this.status = 503;
	}
}

/** Expune contoarele interne pentru observabilitate (A-3). */
function getStatisticiClientDate() {
	return { cereriCuRls, cereriModAdmin, esecuriClientRls, accesModAdmin };
}

/**
 * C1-S4: contorizeaza un acces de tip admin (service_role) pe tabele de
 * utilizator care NU trec prin creeazaContextDate — suprafețele care folosesc
 * supabaseAdmin direct (webhook Clerk, GDPR, AI/cota). Apelat o data per acces.
 */
function inregistreazaUtilizareAdmin() {
	accesModAdmin++;
}

/**
 * Construieste un client legat de JWT-ul utilizatorului.
 *
 * Nu persista sesiunea si nu reinnoieste tokenul: obiectul trebuie sa traiasca
 * exact cat cererea HTTP. Un client per-cerere refolosit intre cereri ar duce la
 * scurgerea identitatii de la un utilizator la altul — exact defectul pe care
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
 *   - `db`       clientul pentru datele utilizatorului (cu RLS obligatoriu)
 *   - `userId`   identitatea rezolvata
 *   - `modAdmin` false (pastrat in contractul metricilor; nu exista fallback)
 *
 * `sursaToken` trebuie sa fie 'supabase'. Pentru orice alta sursa, cererea
 * esueaza inchis: baza de date ramane limita de autorizare.
 */
function creeazaContextDate({
	config,
	token,
	userId,
	sursaToken,
}) {
	if (!userId) {
		throw new Error('Contextul de date necesita un userId rezolvat.');
	}

	const eroareContext = new EroareContextDate();
	if (sursaToken !== 'supabase' || !token) {
		esecuriClientRls++;
		throw eroareContext;
	}

	try {
		const db = creeazaClientUtilizator({
			url: config.supabase.url,
			anonKey: config.supabase.anonKey,
			token,
		});
		cereriCuRls++;
		return { db, userId, modAdmin: false };
	} catch {
		// Daca nu putem construi clientul restrans, NU tacem: o cerere care se
		// crede protejata de RLS dar nu este, e mai periculoasa decat una care
		// stie ca nu este.
		// A-3: fail-closed — in loc sa degradam silențios pe clientul admin
		// (care ocoleste RLS prin definitie), aruncam si cererea e refuzata cu 503.
		esecuriClientRls++;
		console.error(
			'[securitate] Client RLS indisponibil, cerere refuzata:',
			eroareContext.cod,
		);
		throw eroareContext;
	}
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
			'Tabela ' + tabela + ' este backend-only: foloseste un serviciu admin explicit.',
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
	TABELE_STERGERE_GDPR_UTILIZATOR,
	TABELE_DOAR_ADMIN,
	creeazaClientUtilizator,
	creeazaContextDate,
	tabelUtilizator,
	EroareContextDate,
	getStatisticiClientDate,
	inregistreazaUtilizareAdmin,
};
