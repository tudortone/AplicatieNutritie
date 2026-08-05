'use strict';

const { task } = require('@trigger.dev/sdk/v3');

/**
 * Trigger.dev Background Task: user-sync
 * Procesează asincron evenimentele de sincronizare utilizator (user.created, user.updated, user.deleted).
 */
exports.userSyncTask = task({
  id: 'user-sync',
  run: async (payload) => {
    const { action, clerkUserId, supabaseUserId, email, meta } = payload;

    if (action === 'user.created') {
      return {
        status: 'completed',
        action: 'user.created',
        clerkUserId,
        supabaseUserId,
        email,
        syncedMetrics: {
          calorii: meta?.calorii_tinta || 2000,
          proteine: meta?.proteine_tinta || 150,
        },
      };
    }

    if (action === 'user.updated') {
      return {
        status: 'completed',
        action: 'user.updated',
        clerkUserId,
      };
    }

    if (action === 'user.deleted') {
      return {
        status: 'completed',
        action: 'user.deleted',
        clerkUserId,
        supabaseUserId,
        purged: true,
      };
    }

    return { status: 'ignored', action };
  },
});
