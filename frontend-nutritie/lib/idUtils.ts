import * as Crypto from 'expo-crypto';

// ID-urile aleatoare pentru operații noi folosesc sursa nativă criptografică.
// Retry-urile care trebuie să păstreze același ID folosesc funcția deterministă
// separată de mai jos.

export function generareUuid(): string {
  return Crypto.randomUUID();
}

// Hash FNV-1a 32-bit -> hex stabil (aceeași intrare -> același hash).
function hashDeterminist(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// UUID determinist din cheie: reluarea aceleiași salvări (retry după eroare de
// rețea, dublu-tap pe „Adaugă") produce același `id`, iar PK-ul UUID al
// tabelului mese transformă duplicatul în eroare 23505 detectabilă (niciun rând
// duplicat), fără a necesita coloane noi sau migrare.
/**
 * P1-01 — lungimea maximă acceptată pentru un id de operație. Mărginește cheia
 * derivată și respinge intrări absurde înainte să ajungă în identitatea unui rând.
 */
export const MAX_LUNGIME_ID_OPERATIE = 200;

/**
 * P1-01 — id pentru o ACȚIUNE NOUĂ de salvare.
 *
 * Sursa preferată este generatorul criptografic. Dacă platforma nu îl oferă
 * (ex. medii de test fără implementarea nativă), compunem unul local: e vorba de
 * o acțiune NOUĂ, deci nu avem nevoie de stabilitate între apeluri — doar de
 * unicitate. Stabilitatea între RELUĂRI vine din faptul că apelantul păstrează
 * valoarea, nu din regenerarea ei aici.
 */
export function idOperatieNoua(): string {
  const dinCrypto = generareUuid();
  if (typeof dinCrypto === 'string' && dinCrypto.trim() !== '') return dinCrypto;
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * P1-01 — IDENTITATEA LOGICĂ a unei salvări de masă.
 *
 * `mese.id` este cheia primară, deci ea este constrângerea de unicitate durabilă:
 * două scrieri cu același id se ciocnesc pe `23505`, iar backendul nu scrie
 * niciodată în `mese` (toată persistarea e client → Supabase sub RLS).
 *
 * Identitatea derivă din UTILIZATOR + ACȚIUNEA de salvare, niciodată din
 * conținutul mesei:
 *   - aceeași acțiune reluată (timeout, retry, replay din coada offline) →
 *     același id → un singur rând;
 *   - două acțiuni deliberate cu conținut identic → id-uri diferite → două
 *     rânduri, exact cum se așteaptă utilizatorul care mănâncă același iaurt de
 *     două ori.
 *
 * `user_id` intră în cheie ca să păstreze izolarea între conturi: același
 * `idOperatie` la doi utilizatori nu poate produce același rând.
 */
export function idMasaDinOperatie(userId: string, idOperatie: string): string {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('idMasaDinOperatie: user_id lipsă.');
  }
  if (typeof idOperatie !== 'string' || idOperatie.trim() === '') {
    throw new TypeError('idMasaDinOperatie: idOperatie lipsă.');
  }
  if (idOperatie.length > MAX_LUNGIME_ID_OPERATIE) {
    throw new TypeError('idMasaDinOperatie: idOperatie prea lung.');
  }
  return generareUuidDeterminist(`op:${userId}|${idOperatie}`);
}

export function generareUuidDeterminist(cheie: string): string {
  const hex = (hashDeterminist(`a:${cheie}`) + hashDeterminist(`b:${cheie}`)).padEnd(32, '0').slice(0, 32);
  const cuVersiune = `${hex.slice(0, 12)}5${hex.slice(13, 16)}a${hex.slice(17)}`;
  return `${cuVersiune.slice(0, 8)}-${cuVersiune.slice(8, 12)}-${cuVersiune.slice(12, 16)}-${cuVersiune.slice(16, 20)}-${cuVersiune.slice(20)}`;
}
