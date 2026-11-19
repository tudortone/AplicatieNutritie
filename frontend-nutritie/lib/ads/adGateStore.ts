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
const pendingSeeds = new Map<string, Promise<AdGateState>>();

function keyFor(scopeKey: string): string {
  const safeScope = (scopeKey || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ads:gate:v1:${safeScope}`;
}

function ensureAsyncSeed(scopeKey: string): Promise<AdGateState> {
  const k = keyFor(scopeKey);
  if (memoryCache[k]) return Promise.resolve({ ...memoryCache[k] });
  const existing = pendingSeeds.get(k);
  if (existing) return existing;
  const promise = AsyncStorage.getItem(k)
    .then((raw) => {
      if (raw) {
        try {
          const parsed = sanitizeAdGateState(JSON.parse(raw));
          if (!memoryCache[k]) {
            memoryCache[k] = parsed;
          } else {
            // P1-06: Dacă un mesaj a fost înregistrat înainte de terminarea hidratării
            // cold-start, combinăm starea din storage cu cea curentă ca să nu pierdem
            // contorul sau cooldown-ul existent.
            memoryCache[k] = sanitizeAdGateState({
              successfulAnalysisCount: Math.max(
                memoryCache[k].successfulAnalysisCount,
                parsed.successfulAnalysisCount,
              ),
              chatMessageCount:
                memoryCache[k].chatMessageCount + parsed.chatMessageCount,
              lastAdShownAtMs:
                memoryCache[k].lastAdShownAtMs != null && parsed.lastAdShownAtMs != null
                  ? Math.max(memoryCache[k].lastAdShownAtMs, parsed.lastAdShownAtMs)
                  : (memoryCache[k].lastAdShownAtMs ?? parsed.lastAdShownAtMs),
              lastAdCounterValue: memoryCache[k].lastAdCounterValue ?? parsed.lastAdCounterValue,
              lastChatAdCounterValue: memoryCache[k].lastChatAdCounterValue ?? parsed.lastChatAdCounterValue,
            });
          }
        } catch {
          // Ignoră conținut corupt
        }
      }
      return memoryCache[k] ? { ...memoryCache[k] } : { ...AD_GATE_INITIAL_STATE };
    })
    .catch(() => (memoryCache[k] ? { ...memoryCache[k] } : { ...AD_GATE_INITIAL_STATE }))
    .finally(() => {
      pendingSeeds.delete(k);
    });
  pendingSeeds.set(k, promise);
  return promise;
}

// Seed imediat pentru utilizatorul anonim la pornirea modulului
void ensureAsyncSeed('anon');

export function loadAdGateState(scopeKey: string): AdGateState {
  const k = keyFor(scopeKey);
  const cached = memoryCache[k];
  if (cached) {
    return { ...cached };
  }
  void ensureAsyncSeed(scopeKey);
  return { ...AD_GATE_INITIAL_STATE };
}

/** P1-06: Hidratare asincronă cold-start pentru ca AdsContext.stateRef să nu suprascrie storage-ul cu 0. */
export async function hydrateAdGateState(scopeKey: string): Promise<AdGateState> {
  return ensureAsyncSeed(scopeKey);
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
