'use strict';

const { tabelUtilizator } = require('../utils/clientUtilizator');

/**
 * Acces la date pentru tabelele de mese (B-16).
 *
 * Toate interogarile trec prin `tabelUtilizator(ctx, 'mese')`: query-ul este
 * construit pe `ctx.db` (clientul legat de JWT-ul utilizatorului, RLS activ), iar
 * un context fara userId sau o tabela neinregistrata arunca zgomotos, in loc sa
 * scape o interogare nefiltrata.
 */
function createMeseRepo() {
  return {
    async deleteMasa(ctx, id) {
      return tabelUtilizator(ctx, 'mese')
        .delete()
        .eq('id', id)
        .eq('user_id', ctx.userId)
        .select('id');
    },

    async updateMasa(ctx, id, payload) {
      return tabelUtilizator(ctx, 'mese')
        .update(payload)
        .eq('id', id)
        .eq('user_id', ctx.userId)
        .select();
    },

    async createMasa(ctx, insertPayload) {
      return tabelUtilizator(ctx, 'mese').insert([insertPayload]).select();
    },
  };
}

module.exports = createMeseRepo;
