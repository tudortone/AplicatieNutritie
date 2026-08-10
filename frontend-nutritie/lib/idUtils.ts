// Iduri client pentru idempotență la insert. Math.random e suficient: scopul e
// stabilitate pe același conținut (același scan / aceeași propunere -> același
// id), nu imprevizibilitate criptografică.

export function generareUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
export function generareUuidDeterminist(cheie: string): string {
  const hex = (hashDeterminist(`a:${cheie}`) + hashDeterminist(`b:${cheie}`)).padEnd(32, '0').slice(0, 32);
  const cuVersiune = `${hex.slice(0, 12)}5${hex.slice(13, 16)}a${hex.slice(17)}`;
  return `${cuVersiune.slice(0, 8)}-${cuVersiune.slice(8, 12)}-${cuVersiune.slice(12, 16)}-${cuVersiune.slice(16, 20)}-${cuVersiune.slice(20)}`;
}
