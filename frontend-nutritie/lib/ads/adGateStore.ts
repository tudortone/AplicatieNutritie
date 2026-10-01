/**
 * adGateStore.ts — persistență locală pentru starea porții de reclame.
 *
 * DECIZIE DE ARHITECTURĂ (vezi docs/monetization.md §"Stocarea contorului"):
 * Contorul de analize e semnal UX/monetizare, NU sursă de adevăr pentru bani
 * sau drepturi de acces (aceea rămâne 100% server-side prin
 * `/user/premium-status`, vezi context/PremiumContext.tsx). O pierdere sau
 * resetare a contorului (dezinstalare, ștergere cache, eroare storage) are impact
 * ZERO asupra securității sau facturării — cel mult utilizatorul vede o
 * reclamă în plus sau în minus. De aceea stocăm pur local pe dispozitiv.
 *
 * SCOPING PE UTILIZATOR: cheia include user id-ul curent (sau 'anon' înainte
 * de autentificare) ca doi utilizatori diferiți pe același dispozitiv să nu
 * își împartă contorul de reclame (ar putea altfel scurtcircuita/prelungi
 * artificial ciclul de reclame al celuilalt cont).
 *
 * REZOLVARE P0 COLD-START CRASH (conform deciziei din hooks/useAppStore.ts):
 * Nu folosim MMKV / NitroModules la boot — apelurile native C++ în timpul
 * randării inițiale a AdsProvider au provocat crash nativ fatal (SIGSEGV/SIGABRT)
 * pe Android cu New Architecture înainte ca primul ecran să fie afișat.
 * Utilizăm un cache sincron în memorie pentru acces instantaneu la boot fără
 * apeluri native C++, dublat de AsyncStorage pentru persistență durabilă.
 * Orice eșec cade fail-safe pe starea inițială, NICIODATĂ nu aruncă mai departe.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AD_GATE_INITIAL_STATE, type AdGateState, sanitizeAdGateState } from './adGate';

const memoryCache: Record<string, AdGateState> = {};
const pendingSeeds = new Set<string>();

function keyFor(scopeKey: string): string {
  const safeScope = (scopeKey || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ads:gate:v1:${safeScope}`;
}

function ensureAsyncSeed(scopeKey: string): void {
  const k = keyFor(scopeKey);
  if (memoryCache[k] || pendingSeeds.has(k)) return;
  pendingSeeds.add(k);
  AsyncStorage.getItem(k)
    .then((raw) => {
      if (raw && !memoryCache[k]) {
        try {
          memoryCache[k] = sanitizeAdGateState(JSON.parse(raw));
        } catch {
          // Ignoră conținut corupt
        }
      }
    })
    .catch(() => {})
    .finally(() => {
      pendingSeeds.delete(k);
    });
}

// Seed imediat pentru utilizatorul anonim la pornirea modulului
ensureAsyncSeed('anon');

export function loadAdGateState(scopeKey: string): AdGateState {
  const k = keyFor(scopeKey);
  const cached = memoryCache[k];
  if (cached) {
    return { ...cached };
  }
  ensureAsyncSeed(scopeKey);
  return { ...AD_GATE_INITIAL_STATE };
}

export function saveAdGateState(scopeKey: string, state: AdGateState): void {
  const k = keyFor(scopeKey);
  const sanitized = sanitizeAdGateState(state);
  memoryCache[k] = sanitized;
  try {
    AsyncStorage.setItem(k, JSON.stringify(sanitized)).catch(() => {});
  } catch {
    // Best-effort: pierderea contorului local nu afectează securitatea sau facturarea.
  }
}

/** Elimină contorul local user-scoped după ștergerea definitivă a contului. */
export function purgeAdGateState(scopeKey: string): void {
  const k = keyFor(scopeKey);
  delete memoryCache[k];
  pendingSeeds.delete(k);
  try {
    AsyncStorage.removeItem(k).catch(() => {});
  } catch {
    // Best-effort: starea nu conține autoritate de billing sau securitate.
  }
}

/** Doar pentru teste: resetează memoria cache pentru teste unitare. */
export function __resetAdGateStoreForTests(): void {
  for (const k of Object.keys(memoryCache)) {
    delete memoryCache[k];
  }
  pendingSeeds.clear();
}
