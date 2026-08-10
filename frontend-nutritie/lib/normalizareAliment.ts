// Helpers pure pentru normalizarea numelor de alimente, ca lookup-ul în tabelul
// static de nutrienți (lib/nutritieTabel.ts) să fie tolerant la diacritice,
// majuscule, paranteze si caractere neașteptate. Fără dependențe — testabil în jest.
// NOTĂ: literele înlocuite sunt puncte de cod single (nu combinații), deci nu
// avem nevoie de NFD/decompoziție — mai simplu și stabil la encoding.

export function normalizeazaNumeAliment(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  s = s.replace(/[șş]/g, 's');
  s = s.replace(/[țţ]/g, 't');
  s = s.replace(/ă/g, 'a');
  s = s.replace(/[â]/g, 'a'); // pâine→paine, câmp→camp (NU 'i')
  s = s.replace(/[î]/g, 'i'); // în→in, a începe→a incepe
  s = s.replace(/[àáâãäå]/g, 'a');
  s = s.replace(/[èéêë]/g, 'e');
  s = s.replace(/[ìíîï]/g, 'i');
  s = s.replace(/[òóôõö]/g, 'o');
  s = s.replace(/[ùúûü]/g, 'u');
  s = s.replace(/ñ/g, 'n');
  s = s.replace(/ç/g, 'c');
  s = s.replace(/\(.*?\)/g, ' ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}