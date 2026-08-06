'use strict';

const { createClient } = require('@supabase/supabase-js');
const { task } = require('@trigger.dev/sdk/v3');

/**
 * Trigger.dev Background Task: user-sync
 * Procesează asincron evenimentele de sincronizare utilizator (user.created, user.updated, user.deleted).
 *
 * Task-ul face scrierea reală în baza de date — nu doar un răspuns decorativ.
 * Webhook-ul Clerk verifică semnătura Svix și lasă persistarea worker-ului asincron,
 * care folosește SUPABASE_SERVICE_ROLE_KEY (același drept ca restul backend-ului).
 *
 * Fail-closed: dacă lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY din mediul
 * Trigger.dev, task-ul răspunde `needs_config` în loc să declare un succes fals.
 * Idempotent (upsert / delete), deci re-rulearea unui payload duplicat nu produce rânduri duble.
 */

function creeazaClientAdmin() {
	const url = process.env.SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceRoleKey) return null;
	return createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

/** Tabelele cu date de utilizator care trebuie golite la ștergerea contului (GDPR). */
const TABELE_PURGE = Object.freeze(['mese', 'antrenamente', 'profil', 'barcode_estimari_utilizator']);

function toNumar(x) {
	const n = Number(x);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function textSauNull(s) {
	const t = typeof s === 'string' ? s.trim() : '';
	return t.length > 0 ? t : null;
}

/** Traduce metadata evenimentului în rândul `profil` cu coloanele reale din migrarea 20260804000001. */
function construiesteRandProfil({ supabaseUserId, nume, meta }) {
	const m = meta || {};
	return {
		user_id: supabaseUserId,
		nume: textSauNull(nume),
		varsta: toNumar(m.varsta ?? m.varstaLaZi),
		greutate: toNumar(m.greutate),
		inaltime: toNumar(m.inaltime),
		sex: textSauNull(m.sex),
		activitate: textSauNull(m.activitate),
		obiectiv: textSauNull(m.obiectiv),
		calorii_tinta: toNumar(m.calorii_tinta) || 2000,
		proteine_tinta: toNumar(m.proteine_tinta) || 150,
		grasimi_tinta: toNumar(m.grasimi_tinta) || 70,
		carbi_tinta: toNumar(m.carbi_tinta) || 250,
	};
}

/** Găsește id-ul Supabase asociat unui utilizator Clerk, prin tabela de mapare. */
async function idSupabaseDupaClerk(admin, clerkUserId) {
	if (!clerkUserId) return null;
	const { data } = await admin
		.from('clerk_user_map')
		.select('supabase_user_id')
		.eq('clerk_user_id', clerkUserId)
		.maybeSingle();
	return data?.supabase_user_id ?? null;
}

async function executa({ admin, action, clerkUserId, supabaseUserId, email, meta }) {
	switch (action) {
		case 'user.created': {
			const id = supabaseUserId || (await idSupabaseDupaClerk(admin, clerkUserId));
			if (!id) return { status: 'ignored', action, motiv: 'supabaseUserId lipsă' };
			const rand = construiesteRandProfil({ supabaseUserId: id, nume: meta?.nume, meta });
			const { error } = await admin.from('profil').upsert(rand, { onConflict: 'user_id' });
			return error
				? { status: 'failed', action, error: error.message }
				: { status: 'completed', action, email };
		}
		case 'user.updated': {
			const id = supabaseUserId || (await idSupabaseDupaClerk(admin, clerkUserId));
			if (!id) return { status: 'ignored', action, motiv: 'supabaseUserId lipsă' };
			const rand = construiesteRandProfil({ supabaseUserId: id, nume: meta?.nume, meta });
			const { error } = await admin.from('profil').update(rand).eq('user_id', id);
			return error
				? { status: 'failed', action, error: error.message }
				: { status: 'completed', action, email };
		}
		case 'user.deleted': {
			const id = supabaseUserId || (await idSupabaseDupaClerk(admin, clerkUserId));
			if (!id) return { status: 'completed', action, alreadyPurged: true, motiv: 'user necunoscut' };
			for (const tabela of TABELE_PURGE) {
				const { error } = await admin.from(tabela).delete().eq('user_id', id);
				if (error) return { status: 'partial', action, tabela, error: error.message };
			}
			if (clerkUserId) {
				await admin.from('clerk_user_map').delete().eq('clerk_user_id', clerkUserId);
			}
			return { status: 'completed', action, purged: true };
		}
		default:
			return { status: 'ignored', action };
	}
}

exports.userSyncTask = task({
	id: 'user-sync',
	run: async (payload) => {
		const { action, clerkUserId, supabaseUserId, email, meta } = payload || {};

		const admin = creeazaClientAdmin();
		if (!admin) {
			return {
				status: 'needs_config',
				action,
				eroare: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY lipsesc din variabilele de mediu ale proiectului Trigger.dev.',
			};
		}

		return exports.executaSincronizare({ admin, action, clerkUserId, supabaseUserId, email, meta });
	},
});

/**
 * Logica pura de sincronizare, separata de task pentru testabilitate.
 * Primeste `admin` injectat; nu citeste env.
 */
exports.executaSincronizare = executa;
