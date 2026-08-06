'use strict';

const { sanitizeName } = require('./sanitize');

/**
 * Validarea unei mese. Sursa unica de adevar pentru POST si PUT /api/mese.
 * Valorile zecimale sunt pastrate controlat; macronutrientii precum 12.5 g nu
 * mai sunt trunchiati la intreg inainte de persistare.
 */

const LIMITE = Object.freeze({
  calorii: { min: 0, max: 10000, eticheta: 'Caloriile', zecimale: 1 },
  proteine: { min: 0, max: 1000, eticheta: 'Proteinele', zecimale: 2 },
  grasimi: { min: 0, max: 1000, eticheta: 'Grasimile', zecimale: 2 },
  carbohidrati: { min: 0, max: 2000, eticheta: 'Carbohidratii', zecimale: 2 },
  fibre: { min: 0, max: 1000, eticheta: 'Fibrele', zecimale: 2 },
});

const LIMITE_ALIMENT = Object.freeze({
  grame: { min: 0, max: 5000, zecimale: 2 },
  estimare_grame: { min: 0, max: 5000, zecimale: 2 },
  calorii: { min: 0, max: 10000, zecimale: 1 },
  proteine: { min: 0, max: 1000, zecimale: 2 },
  grasimi: { min: 0, max: 1000, zecimale: 2 },
  carbohidrati: { min: 0, max: 2000, zecimale: 2 },
  fibre: { min: 0, max: 1000, zecimale: 2 },
  calorii_per_100g: { min: 0, max: 1000, zecimale: 2 },
  proteine_per_100g: { min: 0, max: 100, zecimale: 2 },
  grasimi_per_100g: { min: 0, max: 100, zecimale: 2 },
  carbohidrati_per_100g: { min: 0, max: 100, zecimale: 2 },
});

const TIPURI_MASA = Object.freeze(['mic_dejun', 'pranz', 'cina', 'gustare']);
const MAX_ALIMENTE = 100;
const MAX_OCTETI_ALIMENTE = 64 * 1024;

function rotunjesteControlat(numar, zecimale) {
  const factor = 10 ** zecimale;
  return Math.round((numar + Number.EPSILON) * factor) / factor;
}

function valideazaNumar(valoare, cheie, { obligatoriu }) {
  const limita = LIMITE[cheie];

  if (valoare === undefined || valoare === null || valoare === '') {
    if (obligatoriu) {
      return { ok: false, eroare: `${limita.eticheta} sunt obligatorii.` };
    }
    return { ok: true, prezent: false };
  }

  if (typeof valoare === 'boolean' || Array.isArray(valoare)) {
    return { ok: false, eroare: `${limita.eticheta} trebuie sa fie un numar valid.` };
  }

  const numar = Number(valoare);
  if (!Number.isFinite(numar)) {
    return { ok: false, eroare: `${limita.eticheta} trebuie sa fie un numar valid.` };
  }
  if (numar < limita.min || numar > limita.max) {
    return {
      ok: false,
      eroare: `${limita.eticheta} trebuie sa fie intre ${limita.min} si ${limita.max}.`,
    };
  }

  return {
    ok: true,
    prezent: true,
    valoare: rotunjesteControlat(numar, limita.zecimale),
  };
}

function valideazaCampNumericAliment(valoare, cheie, index) {
  if (valoare === undefined || valoare === null || valoare === '') {
    return { ok: true, prezent: false };
  }
  if (typeof valoare === 'boolean' || Array.isArray(valoare)) {
    return { ok: false, eroare: `Valoare numerica invalida pentru alimentul ${index + 1} (${cheie}).` };
  }
  const limita = LIMITE_ALIMENT[cheie];
  const numar = Number(valoare);
  if (!Number.isFinite(numar) || numar < limita.min || numar > limita.max) {
    return { ok: false, eroare: `Valoare numerica invalida pentru alimentul ${index + 1} (${cheie}).` };
  }
  return {
    ok: true,
    prezent: true,
    valoare: rotunjesteControlat(numar, limita.zecimale),
  };
}

function valideazaAlimente(alimente) {
  if (alimente === undefined || alimente === null) {
    return { ok: true, prezent: false };
  }
  if (!Array.isArray(alimente)) {
    return { ok: false, eroare: 'Campul "alimente" trebuie sa fie o lista.' };
  }
  if (alimente.length > MAX_ALIMENTE) {
    return { ok: false, eroare: `Maxim ${MAX_ALIMENTE} alimente pe masa.` };
  }

  const normalizate = [];
  for (let index = 0; index < alimente.length; index += 1) {
    const aliment = alimente[index];
    if (!aliment || typeof aliment !== 'object' || Array.isArray(aliment)) {
      return { ok: false, eroare: `Alimentul ${index + 1} trebuie sa fie un obiect.` };
    }

    const nume = sanitizeName(aliment.nume, 150);
    if (!nume) {
      return { ok: false, eroare: `Alimentul ${index + 1} trebuie sa aiba un nume valid.` };
    }
    if (aliment.calorii === undefined || aliment.calorii === null || aliment.calorii === '') {
      return { ok: false, eroare: `Alimentul ${index + 1} trebuie sa contina caloriile.` };
    }

    const curat = { ...aliment, nume };
    for (const cheie of Object.keys(LIMITE_ALIMENT)) {
      const rezultat = valideazaCampNumericAliment(aliment[cheie], cheie, index);
      if (!rezultat.ok) return rezultat;
      if (rezultat.prezent) curat[cheie] = rezultat.valoare;
    }
    normalizate.push(curat);
  }

  const serializat = JSON.stringify(normalizate);
  if (Buffer.byteLength(serializat, 'utf8') > MAX_OCTETI_ALIMENTE) {
    return { ok: false, eroare: 'Lista de alimente este prea mare.' };
  }

  return { ok: true, prezent: true, valoare: normalizate };
}

/**
 * @param {object} corp req.body
 * @param {{ pentruActualizare?: boolean }} [optiuni]
 * @returns {{ ok: boolean, eroare?: string, payload?: object }}
 */
function valideazaMasa(corp, { pentruActualizare = false } = {}) {
  if (!corp || typeof corp !== 'object' || Array.isArray(corp)) {
    return { ok: false, eroare: 'Corp de cerere invalid.' };
  }

  const payload = {};

  const numeBrut = corp.nume ?? corp.nume_masa;
  if (numeBrut !== undefined && numeBrut !== null) {
    const nume = sanitizeName(numeBrut, 150);
    if (!nume) {
      return { ok: false, eroare: 'Numele mesei este obligatoriu.' };
    }
    payload.nume = nume;
  } else if (!pentruActualizare) {
    return { ok: false, eroare: 'Numele mesei este obligatoriu.' };
  }

  for (const cheie of Object.keys(LIMITE)) {
    const obligatoriu = !pentruActualizare && cheie === 'calorii';
    const rezultat = valideazaNumar(corp[cheie], cheie, { obligatoriu });
    if (!rezultat.ok) return rezultat;
    if (rezultat.prezent) payload[cheie] = rezultat.valoare;
    else if (!pentruActualizare) payload[cheie] = 0;
  }

  if (corp.tip_masa !== undefined && corp.tip_masa !== null) {
    const tip = String(corp.tip_masa).trim();
    if (!TIPURI_MASA.includes(tip)) {
      return {
        ok: false,
        eroare: `Tipul mesei este invalid. Valori acceptate: ${TIPURI_MASA.join(', ')}.`,
      };
    }
    payload.tip_masa = tip;
  } else if (!pentruActualizare) {
    payload.tip_masa = 'gustare';
  }

  const alimente = valideazaAlimente(corp.alimente);
  if (!alimente.ok) return alimente;
  if (alimente.prezent) payload.alimente = alimente.valoare;
  else if (!pentruActualizare) payload.alimente = [];

  if (pentruActualizare && Object.keys(payload).length === 0) {
    return { ok: false, eroare: 'Nu ai trimis niciun camp de actualizat.' };
  }

  return { ok: true, payload };
}

module.exports = {
  valideazaMasa,
  valideazaAlimente,
  LIMITE,
  TIPURI_MASA,
  MAX_ALIMENTE,
  MAX_OCTETI_ALIMENTE,
};
