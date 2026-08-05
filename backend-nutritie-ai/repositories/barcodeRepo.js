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
 * Alegerea clientului NU se face in ruta: fiecare functie primeste `ctx` si decide
 * singura intre `ctx.admin` (tabele backend-only, `barcode_cache`) si `ctx.db`
 * (date cu RLS, `barcode_estimari_utilizator`). Ruta nu mai vede un `.from(`.
 */
function createBarcodeRepo() {
  return {
    // `barcode_cache` este backend-only prin proiectare (politica `using (false)`):
    // clientul admin este singura cale corecta.
    getProdusBarcode(ctx, code) {
      return citesteDinCacheGlobal(ctx.admin, code);
    },

    // `barcode_estimari_utilizator` ARE politici pe `auth.uid() = user_id`:
    // clientul utilizatorului, NU adminul.
    citesteEstimareUtilizator(ctx, code) {
      return citesteEstimareClient(ctx.db, { userId: ctx.userId, cod: code });
    },

    salveazaProdusOff(ctx, { cod, produs, payload }) {
      return salveazaProdusOff(ctx.admin, { cod, produs, payload });
    },

    salveazaEstimareUtilizator(ctx, { cod, produs }) {
      return salveazaEstimareClient(ctx.db, { userId: ctx.userId, cod, produs });
    },

    // Verificarea proprietatii + scrierea, intr-un singur pas. Pre-verificarea e
    // doar pentru un mesaj de eroare clar, INAINTE de scriere — nu este bariera de
    // securitate, bariera e predicatul din RPC. Daca scrierea e refuzata, arunca
    // EroareProprietateProdus (409), tratata de ruta.
    async salveazaProdusBarcode(ctx, { code, valori }) {
      const drept = await verificaDreptDeScriere(ctx.admin, {
        cod: code,
        userId: ctx.userId,
      });
      if (!drept.permis) {
        return { permis: false, status: drept.status, motiv: drept.motiv };
      }
      await salveazaProdusManual(ctx.admin, {
        cod: code,
        userId: ctx.userId,
        valori,
      });
      return { permis: true };
    },
  };
}

module.exports = createBarcodeRepo;
