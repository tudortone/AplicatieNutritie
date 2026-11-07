'use strict';

const { tabelUtilizator } = require('../utils/clientUtilizator');

/**
 * Acces la date pentru profilul utilizatorului (B-16).
 *
 * `calculeaza-profil` si `premium-status` sunt non-DB; singurul acces la date este
 * citirea profilului, folosita de exportul GDPR.
 */
function createProfilRepo() {
  return {
    async getProfil(ctx) {
      const { data, error } = await tabelUtilizator(ctx, 'profil')
        .select('*')
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  };
}

module.exports = createProfilRepo;
