'use strict';

const {
  citesteDinCacheGlobal,
  citesteEstimareUtilizator: citesteEstimareClient,
  salveazaProdusOff,
  salveazaEstimareUtilizator: salveazaEstimareClient,
  verificaDreptDeScriere,
  salveazaProdusManual,
} = require('../utils/barcode');

/**
 * Acces la date pentru rutele de cod de bare (B-16).
 *
 * Clientul service-role ramane privat in acest repository backend-only; nu este
 * atasat contextului cererii. Datele utilizatorului folosesc exclusiv `ctx.db`,
 * clientul legat de JWT pe care Postgres aplica RLS.
 */
function createBarcodeRepo({ supabaseAdmin }) {
  if (!supabaseAdmin) {
    throw new Error('BarcodeRepo necesita clientul backend service-role.');
  }

  return {
    // `barcode_cache` este backend-only prin proiectare (politica `using (false)`):
    // clientul admin este singura cale corecta.
    getProdusBarcode(_ctx, code) {
      return citesteDinCacheGlobal(supabaseAdmin, code);
    },

    // `barcode_estimari_utilizator` ARE politici pe `auth.uid() = user_id`:
    // clientul utilizatorului, NU adminul.
    citesteEstimareUtilizator(ctx, code) {
      return citesteEstimareClient(ctx.db, { userId: ctx.userId, cod: code });
    },

    salveazaProdusOff(_ctx, { cod, produs, payload }) {
      return salveazaProdusOff(supabaseAdmin, { cod, produs, payload });
    },

    salveazaEstimareUtilizator(ctx, { cod, produs }) {
      return salveazaEstimareClient(ctx.db, { userId: ctx.userId, cod, produs });
    },

    // Verificarea proprietatii + scrierea, intr-un singur pas. Pre-verificarea e
    // doar pentru un mesaj de eroare clar, INAINTE de scriere — nu este bariera de
    // securitate, bariera e predicatul din RPC. Daca scrierea e refuzata, arunca
    // EroareProprietateProdus (409), tratata de ruta.
    async salveazaProdusBarcode(ctx, { code, valori }) {
      const drept = await verificaDreptDeScriere(supabaseAdmin, {
        cod: code,
        userId: ctx.userId,
      });
      if (!drept.permis) {
        return { permis: false, status: drept.status, motiv: drept.motiv };
      }
      await salveazaProdusManual(supabaseAdmin, {
        cod: code,
        userId: ctx.userId,
        valori,
      });
      return { permis: true };
    },
  };
}

module.exports = createBarcodeRepo;
