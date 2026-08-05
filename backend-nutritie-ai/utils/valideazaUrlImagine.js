'use strict';

const path = require('path');

function construiesteGazdePermise({ imagekitUrlEndpoint, supabaseUrl }) {
  const gazde = new Set();
  for (const valoare of [imagekitUrlEndpoint, supabaseUrl]) {
    if (!valoare) continue;
    try {
      gazde.add(new URL(valoare).hostname.toLowerCase());
    } catch {
      // Configuratie malformata: gazda nu este adaugata; regula ramane fail-closed.
    }
  }
  return gazde;
}

/**
 * Valideaza URL-urile imaginilor inainte de orice fetch facut de backend sau de
 * un task Trigger.dev. Lista vida refuza totul. Nu sunt permise credentiale in
 * URL, porturi custom ori traversari de cale.
 */
function creeazaValideazaUrlImagine({ gazdePermise, folderPrefix = null }) {
  const gazde = gazdePermise instanceof Set ? gazdePermise : new Set();

  return function valideazaUrlImagine(valoare) {
    if (typeof valoare !== 'string' || !valoare.trim()) {
      return { ok: false, eroare: 'URL-ul imaginii este obligatoriu.' };
    }

    let adresa;
    try {
      adresa = new URL(valoare.trim());
    } catch {
      return { ok: false, eroare: 'URL-ul imaginii este invalid.' };
    }

    if (adresa.protocol !== 'https:' || (adresa.port && adresa.port !== '443')) {
      return { ok: false, eroare: 'URL-ul imaginii trebuie sa foloseasca HTTPS standard.' };
    }
    if (adresa.username || adresa.password) {
      return { ok: false, eroare: 'URL-ul imaginii nu poate contine credentiale.' };
    }
    if (!gazde.has(adresa.hostname.toLowerCase())) {
      return {
        ok: false,
        eroare: 'Imaginea trebuie incarcata pe stocarea aplicatiei inainte de analiza.',
      };
    }

    let caleDecodata;
    try {
      caleDecodata = decodeURIComponent(adresa.pathname);
    } catch {
      return { ok: false, eroare: 'Calea imaginii este invalida.' };
    }
    const caleNormalizata = path.posix.normalize(caleDecodata);
    if (caleNormalizata !== caleDecodata || caleDecodata.split('/').includes('..')) {
      return { ok: false, eroare: 'Calea imaginii este invalida.' };
    }
    if (
      folderPrefix &&
      !caleDecodata.toLowerCase().startsWith(folderPrefix.toLowerCase())
    ) {
      return { ok: false, eroare: 'Imaginea nu provine din folderul tau de incarcari.' };
    }

    adresa.hash = '';
    return { ok: true, url: adresa.toString() };
  };
}

module.exports = { construiesteGazdePermise, creeazaValideazaUrlImagine };
