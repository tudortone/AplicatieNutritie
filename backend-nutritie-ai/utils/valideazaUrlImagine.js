'use strict';

/**
 * Validare partajata a URL-urilor catre imaginile analizate (SSRF).
 *
 * Folosita de server.js (la acceptarea unui upload trimis catre task-ul din
 * fundal) SI de task-ul Trigger.dev (la descarcarea efectiva a imaginii).
 * Daca validarea ar exista doar in server, task-ul din fundal ar ramane o
 * poarta SSRF: un payload cu `imageUrl` craftat ar fi descarcat orice adresa
 * din reteaua serverului. De aceea regula sta intr-un modul comun.
 *
 * Fail-closed: o lista de gazde goala (env lipsa/malformat) inseamna ca niciun
 * URL nu trece, nu ca toate trec.
 */

function construiesteGazdePermise({ imagekitUrlEndpoint, supabaseUrl }) {
  const gazde = new Set();
  for (const valoare of [imagekitUrlEndpoint, supabaseUrl]) {
    if (!valoare) continue;
    try {
      gazde.add(new URL(valoare).hostname.toLowerCase());
    } catch {
      // valoare malformata: gazda nu se adauga, regula ramane fail-closed
    }
  }
  return gazde;
}

/**
 * `folderPrefix` este optional si permite verificarea ca imaginea sta sub un
 * folder anume (ex. `/mancare/<userId>/`), ca proprietatea sa fie evidenta din
 * cale, nu doar din cine a trimis cererea.
 */
function creeazaValideazaUrlImagine({ gazdePermise, folderPrefix }) {
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
    if (adresa.protocol !== 'https:') {
      return { ok: false, eroare: 'URL-ul imaginii trebuie sa foloseasca https.' };
    }
    if (!gazdePermise.has(adresa.hostname.toLowerCase())) {
      return {
        ok: false,
        eroare: 'Imaginea trebuie incarcata pe stocarea aplicatiei inainte de analiza.',
      };
    }
    if (folderPrefix && !adresa.pathname.toLowerCase().startsWith(folderPrefix.toLowerCase())) {
      return {
        ok: false,
        eroare: 'Imaginea nu provine din folderul tau de incarcari.',
      };
    }
    return { ok: true, url: adresa.toString() };
  };
}

module.exports = {
  construiesteGazdePermise,
  creeazaValideazaUrlImagine,
};
