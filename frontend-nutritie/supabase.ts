import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Cheile trebuie furnizate prin .env (EXPO_PUBLIC_*). NU folosim fallback
// hardcodat cu valori reale — un APK decompilat ar expune proiectul Supabase.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[NutriAI] Lipsesc EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Creăază frontend-nutritie/.env (vezi .env.example).'
  );
}

// ==========================================
// Adaptor de stocare a sesiunii
//
// Rezolvă C5. Varianta anterioară avea trei căi de eșec care se manifestau
// identic pentru utilizator — delogare fără nicio explicație:
//
//   (a) checkSecureStoreAvailability() era apelată fără await, iar createClient
//       rula imediat, deci Supabase putea cere getItem înainte ca flag-ul să fie
//       stabilit.
//   (b) când chunking-ul eșua, valoarea era scrisă în AsyncStorage, dar
//       secureStoreAvailable rămânea true, deci getItem căuta în continuare doar
//       în SecureStore. Sesiunea era scrisă, dar nu mai putea fi citită niciodată.
//   (c) setItem începea cu removeItem, deschizând o fereastră în care sesiunea nu
//       exista nicăieri; o închidere a aplicației acolo o pierdea definitiv. La
//       fel, markerul cu numărul de chunk-uri era scris înaintea chunk-urilor.
//
// Soluții aplicate:
//   - o singură promisiune de inițializare, așteptată de toate operațiile;
//   - magazinul efectiv folosit e memorat per cheie, deci scrierea și citirea
//     nimeresc întotdeauna același loc;
//   - format uniform pe chunk-uri, cu markerul scris ULTIMUL, ca punct de commit:
//     o întrerupere lasă valoarea veche intactă, nu una parțială;
//   - nu se șterge nimic înainte de a scrie noua valoare.
//
// Audit 2026-08:
//   - curățarea chunk-urilor orfane folosea constanta magică `+8`. O sesiune care
//     scade de la 12 la 2 chunk-uri lăsa 2 chunk-uri orfane în SecureStore, la
//     nesfârșit. Acum se citește numărul ANTERIOR din marker și se șterge exact
//     intervalul rămas.
//   - chunk-urile se citeau secvențial; pornirea aplicației aștepta N drumuri
//     dus-întors către Keystore/Keychain. Acum se citesc în paralel.
// ==========================================

// Limita Android pentru o valoare SecureStore e ~2048 octeți DUPĂ criptare.
// 1536 lasă marjă pentru expansiune și pentru diacritice pe mai mulți octeți.
const DIMENSIUNE_CHUNK = 1536;
const SUFIX_NR_CHUNKS = '__nr_chunks__';
const PREFIX_MAGAZIN = '__nutriai_magazin__:';

type Magazin = 'secure' | 'async';

let promisiuneInitializare: Promise<boolean> | null = null;

/** Verifică o singură dată dacă SecureStore funcționează pe acest dispozitiv. */
function secureStoreDisponibil(): Promise<boolean> {
  if (!promisiuneInitializare) {
    promisiuneInitializare = (async () => {
      try {
        await SecureStore.setItemAsync('__nutriai_test__', '1');
        await SecureStore.deleteItemAsync('__nutriai_test__');
        return true;
      } catch {
        console.warn(
          '[NutriAI] SecureStore indisponibil pe acest dispozitiv. ' +
          'Sesiunea va fi stocată în AsyncStorage (text simplu). ' +
          'Activează criptarea dispozitivului pentru securitate maximă.',
        );
        return false;
      }
    })();
  }
  return promisiuneInitializare;
}

async function citesteMagazin(cheie: string): Promise<Magazin | null> {
  try {
    const valoare = await AsyncStorage.getItem(`${PREFIX_MAGAZIN}${cheie}`);
    return valoare === 'secure' || valoare === 'async' ? valoare : null;
  } catch {
    return null;
  }
}

async function scrieMagazin(cheie: string, magazin: Magazin): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIX_MAGAZIN}${cheie}`, magazin);
  } catch {
    // Marcajul e o optimizare de rutare; absența lui declanșează căutarea în ambele.
  }
}

function imparteInChunks(valoare: string): string[] {
  const bucati: string[] = [];
  for (let i = 0; i < valoare.length; i += DIMENSIUNE_CHUNK) {
    bucati.push(valoare.slice(i, i + DIMENSIUNE_CHUNK));
  }
  // O valoare goală tot trebuie să aibă un chunk, altfel nu se distinge de absență.
  return bucati.length > 0 ? bucati : [''];
}

/** Citește numărul de chunk-uri din marker. `0` înseamnă marker absent sau invalid. */
async function citesteNumarChunks(cheie: string): Promise<number> {
  try {
    const nrBrut = await SecureStore.getItemAsync(`${cheie}${SUFIX_NR_CHUNKS}`);
    if (!nrBrut) return 0;
    const nr = Number(nrBrut);
    return Number.isInteger(nr) && nr > 0 ? nr : 0;
  } catch {
    return 0;
  }
}

async function citesteDinSecure(cheie: string): Promise<string | null> {
  const nrBrut = await SecureStore.getItemAsync(`${cheie}${SUFIX_NR_CHUNKS}`);

  // Format vechi: valoare unică, fără marker. Păstrăm compatibilitatea ca
  // utilizatorii existenți să nu fie delogați de acest update.
  if (!nrBrut) {
    return SecureStore.getItemAsync(cheie);
  }

  const nrChunks = Number(nrBrut);
  if (!Number.isInteger(nrChunks) || nrChunks < 1) return null;

  // Citire în paralel: chunk-urile sunt independente, iar fiecare apel e un drum
  // dus-întors către Keystore/Keychain. Secvențial, o sesiune de 10 chunk-uri
  // întârzia vizibil pornirea aplicației.
  const bucati = await Promise.all(
    Array.from({ length: nrChunks }, (_, i) =>
      SecureStore.getItemAsync(`${cheie}__chunk_${i}`),
    ),
  );

  // Marker prezent dar chunk lipsă înseamnă scriere întreruptă: valoarea e
  // incompletă și nu are voie să fie returnată parțial.
  if (bucati.some((bucata) => bucata === null)) return null;

  return bucati.join('');
}

async function scrieInSecure(cheie: string, valoare: string): Promise<void> {
  const bucati = imparteInChunks(valoare);

  // 0. Reținem câte chunk-uri existau înainte, ca să știm exact ce rămâne orfan
  //    după commit. Varianta anterioară ghicea cu `+8`.
  const nrAnterior = await citesteNumarChunks(cheie);

  // 1. Scriem chunk-urile noi. Vechea valoare rămâne încă validă, pentru că
  //    markerul vechi încă indică numărul vechi de bucăți.
  for (let i = 0; i < bucati.length; i++) {
    await SecureStore.setItemAsync(`${cheie}__chunk_${i}`, bucati[i]);
  }

  // 2. Punctul de commit: din acest moment valoarea nouă e cea activă.
  await SecureStore.setItemAsync(`${cheie}${SUFIX_NR_CHUNKS}`, String(bucati.length));

  // 3. Curățenie, după commit. Un eșec aici lasă gunoi, nu date corupte.
  try {
    await SecureStore.deleteItemAsync(cheie); // reziduu din formatul vechi
    if (nrAnterior > bucati.length) {
      await Promise.all(
        Array.from({ length: nrAnterior - bucati.length }, (_, k) =>
          SecureStore.deleteItemAsync(`${cheie}__chunk_${bucati.length + k}`),
        ),
      );
    }
  } catch {
    // Ignorăm: nu afectează corectitudinea citirii.
  }
}

async function stergeDinSecure(cheie: string): Promise<void> {
  try {
    const nrChunks = await citesteNumarChunks(cheie);
    // Ștergem întâi markerul: fără el, valoarea e deja invalidă.
    await SecureStore.deleteItemAsync(`${cheie}${SUFIX_NR_CHUNKS}`);
    if (nrChunks > 0) {
      await Promise.all(
        Array.from({ length: nrChunks }, (_, i) =>
          SecureStore.deleteItemAsync(`${cheie}__chunk_${i}`),
        ),
      );
    }
    await SecureStore.deleteItemAsync(cheie);
  } catch {
    // Ignorăm.
  }
}

async function getItem(cheie: string): Promise<string | null> {
  const disponibil = await secureStoreDisponibil();
  const magazin = await citesteMagazin(cheie);

  if (magazin === 'async' || !disponibil) {
    try {
      return await AsyncStorage.getItem(cheie);
    } catch {
      return null;
    }
  }

  try {
    const valoare = await citesteDinSecure(cheie);
    if (valoare !== null) return valoare;
  } catch (err) {
    console.warn('[NutriAI] Citire SecureStore eșuată pentru sesiune:', err);
  }

  // Recuperare: o versiune anterioară putea lăsa valoarea în AsyncStorage.
  try {
    return await AsyncStorage.getItem(cheie);
  } catch {
    return null;
  }
}

async function setItem(cheie: string, valoare: string): Promise<void> {
  const disponibil = await secureStoreDisponibil();

  if (disponibil) {
    try {
      await scrieInSecure(cheie, valoare);
      await scrieMagazin(cheie, 'secure');
      // Eliminăm o eventuală copie mai veche din AsyncStorage, ca să nu rămână
      // un token valid în stocare necriptată.
      try { await AsyncStorage.removeItem(cheie); } catch { /* ignorăm */ }
      return;
    } catch (err) {
      console.warn(
        '[NutriAI] Scriere SecureStore eșuată, revin la AsyncStorage:',
        err,
      );
    }
  }

  // Fallback. Marcăm magazinul ÎNAINTE de scriere: dacă procesul moare imediat
  // după, citirea va căuta în AsyncStorage și va găsi fie valoarea nouă, fie nimic
  // — niciodată valoarea veche din SecureStore, care ar fi în urmă.
  await scrieMagazin(cheie, 'async');
  await AsyncStorage.setItem(cheie, valoare);
  await stergeDinSecure(cheie);
}

async function removeItem(cheie: string): Promise<void> {
  await secureStoreDisponibil();
  await stergeDinSecure(cheie);
  try { await AsyncStorage.removeItem(cheie); } catch { /* ignorăm */ }
  try { await AsyncStorage.removeItem(`${PREFIX_MAGAZIN}${cheie}`); } catch { /* ignorăm */ }
}

const adaptorStocareSesiune = { getItem, setItem, removeItem };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: adaptorStocareSesiune,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
