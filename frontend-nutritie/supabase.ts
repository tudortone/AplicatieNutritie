import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[NutriAI] Lipsesc EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Creează frontend-nutritie/.env (vezi .env.example).'
  );
}

// Adaptor securizat pentru sesiunea Supabase.
// - tokenurile nu sunt scrise niciodata in AsyncStorage;
// - SecureStore foloseste chunk-uri versionate si un manifest scris ultimul;
// - daca SecureStore lipseste, sesiunea ramane doar in memorie pana la inchiderea
//   aplicatiei, in loc sa fie persistata in text simplu.
const DIMENSIUNE_CHUNK = 1536;
const SUFIX_MANIFEST = '__manifest_v2__';
const SUFIX_NR_CHUNKS_VECHI = '__nr_chunks__';
const PREFIX_MAGAZIN_VECHI = '__nutriai_magazin__:';
const memorieSesiune = new Map<string, string>();

type Manifest = { v: 2; generatie: string; nr: number };

let promisiuneInitializare: Promise<boolean> | null = null;

function codEroare(err: unknown): string {
  if (!err || typeof err !== 'object') return 'NECUNOSCUT';
  const valoare = err as { code?: string; name?: string };
  return valoare.code || valoare.name || 'NECUNOSCUT';
}

function secureStoreDisponibil(): Promise<boolean> {
  if (!promisiuneInitializare) {
    promisiuneInitializare = (async () => {
      try {
        await SecureStore.setItemAsync('__nutriai_test__', '1');
        await SecureStore.deleteItemAsync('__nutriai_test__');
        return true;
      } catch (err) {
        console.warn(
          `[NutriAI] SecureStore indisponibil (${codEroare(err)}). ` +
          'Sesiunea va ramane doar in memorie si nu va fi scrisa in text simplu.',
        );
        return false;
      }
    })();
  }
  return promisiuneInitializare;
}

function imparteInChunks(valoare: string): string[] {
  const bucati: string[] = [];
  for (let i = 0; i < valoare.length; i += DIMENSIUNE_CHUNK) {
    bucati.push(valoare.slice(i, i + DIMENSIUNE_CHUNK));
  }
  return bucati.length > 0 ? bucati : [''];
}

function manifestValid(valoare: unknown): valoare is Manifest {
  if (!valoare || typeof valoare !== 'object') return false;
  const m = valoare as Partial<Manifest>;
  return m.v === 2 && typeof m.generatie === 'string' &&
    /^[a-z0-9_-]{4,64}$/i.test(m.generatie) &&
    Number.isInteger(m.nr) && Number(m.nr) >= 1 && Number(m.nr) <= 100;
}

const cheieChunk = (cheie: string, generatie: string, index: number) =>
  `${cheie}__chunk_${generatie}_${index}`;

async function citesteManifest(cheie: string): Promise<Manifest | null> {
  const brut = await SecureStore.getItemAsync(`${cheie}${SUFIX_MANIFEST}`);
  if (!brut) return null;
  try {
    const parsed: unknown = JSON.parse(brut);
    return manifestValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function citesteDinSecure(cheie: string): Promise<string | null> {
  const manifest = await citesteManifest(cheie);
  if (manifest) {
    const bucati: string[] = [];
    for (let i = 0; i < manifest.nr; i++) {
      const bucata = await SecureStore.getItemAsync(
        cheieChunk(cheie, manifest.generatie, i),
      );
      if (bucata === null) return null;
      bucati.push(bucata);
    }
    return bucati.join('');
  }

  // Compatibilitate cu formatul vechi: marker numeric si chunk-uri fara generatie.
  const nrVechiBrut = await SecureStore.getItemAsync(`${cheie}${SUFIX_NR_CHUNKS_VECHI}`);
  if (nrVechiBrut) {
    const nrVechi = Number(nrVechiBrut);
    if (!Number.isInteger(nrVechi) || nrVechi < 1 || nrVechi > 100) return null;
    const bucati: string[] = [];
    for (let i = 0; i < nrVechi; i++) {
      const bucata = await SecureStore.getItemAsync(`${cheie}__chunk_${i}`);
      if (bucata === null) return null;
      bucati.push(bucata);
    }
    return bucati.join('');
  }

  // Format foarte vechi: o singura valoare.
  return SecureStore.getItemAsync(cheie);
}

async function stergeGeneratie(
  cheie: string,
  manifest: Manifest | null,
): Promise<void> {
  if (!manifest) return;
  for (let i = 0; i < manifest.nr; i++) {
    await SecureStore.deleteItemAsync(cheieChunk(cheie, manifest.generatie, i));
  }
}

async function curataFormateVechi(cheie: string): Promise<void> {
  try {
    const nrBrut = await SecureStore.getItemAsync(`${cheie}${SUFIX_NR_CHUNKS_VECHI}`);
    const nr = Number(nrBrut);
    await SecureStore.deleteItemAsync(`${cheie}${SUFIX_NR_CHUNKS_VECHI}`);
    if (Number.isInteger(nr) && nr > 0 && nr <= 100) {
      for (let i = 0; i < nr; i++) {
        await SecureStore.deleteItemAsync(`${cheie}__chunk_${i}`);
      }
    }
    await SecureStore.deleteItemAsync(cheie);
  } catch {
    // Curatenia nu invalideaza valoarea noua.
  }
}

async function scrieInSecure(cheie: string, valoare: string): Promise<void> {
  const vechi = await citesteManifest(cheie);
  const bucati = imparteInChunks(valoare);
  const generatie = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const nou: Manifest = { v: 2, generatie, nr: bucati.length };

  // Chunk-urile noii generatii nu ating valoarea activa. Manifestul este punctul
  // atomic de commit si se scrie numai dupa ce toate bucatile exista.
  for (let i = 0; i < bucati.length; i++) {
    await SecureStore.setItemAsync(cheieChunk(cheie, generatie, i), bucati[i]);
  }
  await SecureStore.setItemAsync(`${cheie}${SUFIX_MANIFEST}`, JSON.stringify(nou));

  try {
    await stergeGeneratie(cheie, vechi);
    await curataFormateVechi(cheie);
  } catch {
    // Poate ramane gunoi criptat, dar manifestul indica exclusiv valoarea noua.
  }
}

async function stergeDinSecure(cheie: string): Promise<void> {
  try {
    const manifest = await citesteManifest(cheie);
    // Manifestul dispare primul: dupa acest punct niciun chunk nu mai este activ.
    await SecureStore.deleteItemAsync(`${cheie}${SUFIX_MANIFEST}`);
    await stergeGeneratie(cheie, manifest);
    await curataFormateVechi(cheie);
  } catch {
    // removeItem trebuie sa ramana idempotent.
  }
}

async function curataPlaintextVechi(cheie: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cheie);
    await AsyncStorage.removeItem(`${PREFIX_MAGAZIN_VECHI}${cheie}`);
  } catch {
    // AsyncStorage poate lipsi pe unele platforme; tokenul nou nu este scris aici.
  }
}

async function getItem(cheie: string): Promise<string | null> {
  // Memoria deține valoarea cea mai recentă: e populată doar când scrierea în
  // SecureStore a eșuat (vezi setItem), deci are prioritate față de valoarea
  // persistentă, care ar fi una veche (chunk-uri scrise parțial, manifest vechi).
  const dinMemorie = memorieSesiune.get(cheie);
  if (dinMemorie !== undefined) return dinMemorie;

  const disponibil = await secureStoreDisponibil();

  if (!disponibil) {
    await curataPlaintextVechi(cheie);
    return null;
  }

  try {
    const valoare = await citesteDinSecure(cheie);
    await curataPlaintextVechi(cheie);
    return valoare;
  } catch (err) {
    console.warn(`[NutriAI] Citire SecureStore esuata (${codEroare(err)}).`);
  }

  await curataPlaintextVechi(cheie);
  return null;
}

async function setItem(cheie: string, valoare: string): Promise<void> {
  const disponibil = await secureStoreDisponibil();
  await curataPlaintextVechi(cheie);

  if (disponibil) {
    try {
      await scrieInSecure(cheie, valoare);
      memorieSesiune.delete(cheie);
      return;
    } catch (err) {
      console.warn(
        `[NutriAI] Scriere SecureStore esuata (${codEroare(err)}). ` +
        'Sesiunea ramane doar in memorie.',
      );
    }
  }

  memorieSesiune.set(cheie, valoare);
}

async function removeItem(cheie: string): Promise<void> {
  memorieSesiune.delete(cheie);
  if (await secureStoreDisponibil()) await stergeDinSecure(cheie);
  await curataPlaintextVechi(cheie);
}

const adaptorStocareSesiune = { getItem, setItem, removeItem };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: adaptorStocareSesiune,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE: fluxul implicit nu e sigur pe mobil (token in fragment). Pe React Native
    // `signInWithOAuth` nu navigheaza singur — deschidem URL-ul manual via
    // expo-web-browser si schimbam `code` cu `exchangeCodeForSession`.
    flowType: 'pkce',
    detectSessionInUrl: false,
  },
});
