'use strict';

const { creeazaClientRedis, codEroare } = require('./storePartajat');

const PLAFON_INTRARI = 5000;
const SALT_LOG_MS = 30 * 1000;

let ultimulAvertisment = 0;

function avertizeaza(mesaj) {
  const acum = Date.now();
  if (acum - ultimulAvertisment < SALT_LOG_MS) return;
  ultimulAvertisment = acum;
  console.warn(mesaj);
}

class ContorLocalCuTtl {
  constructor({ plafon = PLAFON_INTRARI } = {}) {
    this.plafon = plafon;
    this.intrari = new Map();
  }

  increment(cheie, ttlMs) {
    const acum = Date.now();
    let intrare = this.intrari.get(cheie);

    if (!intrare || (intrare.expiraLa && intrare.expiraLa <= acum)) {
      this.intrari.delete(cheie);
      if (this.intrari.size >= this.plafon) {
        for (const [k, valoare] of this.intrari) {
          if (valoare.expiraLa && valoare.expiraLa <= acum) this.intrari.delete(k);
        }
      }
      if (this.intrari.size >= this.plafon) {
        const ceaMaiVeche = this.intrari.keys().next().value;
        if (ceaMaiVeche !== undefined) this.intrari.delete(ceaMaiVeche);
      }
      intrare = {
        valoare: 0,
        expiraLa: ttlMs > 0 ? acum + ttlMs : 0,
      };
      this.intrari.set(cheie, intrare);
    }

    intrare.valoare += 1;
    return intrare.valoare;
  }

  ttl(cheie) {
    const intrare = this.intrari.get(cheie);
    if (!intrare) return -2;
    if (!intrare.expiraLa) return -1;
    const secunde = Math.ceil((intrare.expiraLa - Date.now()) / 1000);
    if (secunde <= 0) {
      this.intrari.delete(cheie);
      return -2;
    }
    return secunde;
  }
}

/**
 * Contor atomic cu TTL. Redis este sursa partajata intre instante, iar contorul
 * local este actualizat in paralel si preia traficul daca Redis cade. Nicio
 * eroare Redis nu expune URL-ul sau parola in loguri.
 */
function creeazaContorPartajat({ url, prefix = 'nutri:contor', plafon } = {}) {
  const local = new ContorLocalCuTtl({ plafon });
  const client = url ? creeazaClientRedis({ url }) : null;
  const cheieFinala = (cheie) => `${prefix}:${String(cheie)}`;

  return {
    async increment(cheie, ttlMs) {
      const finala = cheieFinala(cheie);
      const localCount = local.increment(finala, ttlMs);
      if (!client?.isReady) return localCount;

      try {
        const count = await client.incr(finala);
        if (count === 1 && ttlMs > 0) await client.pExpire(finala, ttlMs);
        return count;
      } catch (err) {
        avertizeaza(`[Contor] Redis indisponibil (${codEroare(err)}); folosesc rezerva locala.`);
        return localCount;
      }
    },

    async ttl(cheie) {
      const finala = cheieFinala(cheie);
      if (client?.isReady) {
        try {
          return await client.ttl(finala);
        } catch (err) {
          avertizeaza(`[Contor] TTL Redis indisponibil (${codEroare(err)}); folosesc rezerva locala.`);
        }
      }
      return local.ttl(finala);
    },
  };
}

module.exports = { creeazaContorPartajat, ContorLocalCuTtl };
