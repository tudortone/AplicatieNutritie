'use strict';

const path = require('path');

function construiesteGazdePermise({ imagekitUrlEndpoint, supabaseUrl }) {
  // Map<hostname, basePath>: pe langa gazda retinem si prefixul de cale al
  // endpoint-ului (ex. ImageKit: `/abc123` dintr-un endpoint `https://ik.imagekit.io/abc123`),
  // ca sa putem compara folderPrefix-ul per-utilizator cu pathname-ul relativa
  // fata de endpoint — altfel validatorul refuza URL-urile reale cu 400 (N-01).
  const gazde = new Map();
  for (const valoare of [imagekitUrlEndpoint, supabaseUrl]) {
    if (!valoare) continue;
    try {
      const adresa = new URL(valoare);
      const caleEndpoint = adresa.pathname.replace(/\/+$/, '');
      gazde.set(adresa.hostname.toLowerCase(), caleEndpoint === '/' ? '' : caleEndpoint);
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
  // Primim Map<hostname, basePath> de la construiesteGazdePermise. Un Set simplu
  // (doar gazde, fara basePath) ramane acceptat pentru backward-compat si se
  // trateaza ca prefix de cale vid (toate pathname-urile raman relative).
  const gazde = gazdePermise instanceof Map
    ? gazdePermise
    : new Map([...(gazdePermise instanceof Set ? gazdePermise : [])].map((gazda) => [gazda, '']));

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
    // Endpoint-ul ImageKit contribuie segmentul endpoint-id la pathname
    // (ex. `/abc123/...`); scoatem basePath-ul gazdei si folosim calea relativa
    // pentru verificarea folderului per-utilizator, ca formul reală de productie
    // sa fie acceptata (N-01). Daca gazda nu are basePath, totul ramane relativ.
    const basePathGazda = gazde.get(adresa.hostname.toLowerCase()) || '';
    const caleRelativa = basePathGazda && caleDecodata.startsWith(basePathGazda)
      ? caleDecodata.slice(basePathGazda.length)
      : caleDecodata;
    if (
      folderPrefix &&
      !caleRelativa.toLowerCase().startsWith(folderPrefix.toLowerCase())
    ) {
      return { ok: false, eroare: 'Imaginea nu provine din folderul tau de incarcari.' };
    }

    adresa.hash = '';
    return { ok: true, url: adresa.toString() };
  };
}

module.exports = { construiesteGazdePermise, creeazaValideazaUrlImagine };
