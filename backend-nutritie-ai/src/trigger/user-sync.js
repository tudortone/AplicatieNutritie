'use strict';

const { task } = require('@trigger.dev/sdk/v3');

const ACTIUNI_CLERK_DEZACTIVATE = new Set(['user.created', 'user.updated', 'user.deleted']);

async function executa({ action }) {
	if (ACTIUNI_CLERK_DEZACTIVATE.has(action)) {
		const motiv = action === 'user.deleted'
			? 'CLERK_DELETE_NOT_SUPABASE_AUTHORITY'
			: 'CLERK_SYNC_REQUIRES_VERIFIED_ACCOUNT_LINK';
		return { status: 'ignored', action, motiv };
	}
	return { status: 'ignored', action };
}

exports.userSyncTask = task({
	id: 'user-sync',
	queue: {
		name: 'identity-sync',
		concurrencyLimit: 2,
	},
	run: async (payload) => executa(payload || {}),
});

/** Logică pură păstrată pentru testarea joburilor vechi/duplicate fără side effects. */
exports.executaSincronizare = executa;
