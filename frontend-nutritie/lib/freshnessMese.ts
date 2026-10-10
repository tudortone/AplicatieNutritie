/**
 * P1-04 — semnal DETERMINIST de prospețime pentru datele canonice de mese.
 *
 * ==========================================================================
 * PROBLEMA
 * ==========================================================================
 * Fiecare ecran are propria instanță `useMeseAzi`. Un `refresh()` din chat sau
 * din jurnal împrospătează doar instanța acelui ecran; Home rămâne cu date vechi.
 * Home se baza pe `useFocusRefresh`, care are un **throttle de 5 secunde** — o
 * salvare urmată de revenirea rapidă pe Home sărea refresh-ul și afișa totaluri
 * vechi. Adică prospețimea datelor depindea de un cronometru.
 *
 * ==========================================================================
 * SOLUȚIA
 * ==========================================================================
 * Un canal minimal de invalidare, consumat ÎN INTERIORUL lui `useMeseAzi`, deci
 * toți consumatorii canonici (Home, Jurnal, statistici) se împrospătează dintr-o
 * singură emisie. Nu este un al doilea depozit de stare și nu ține date: doar
 * anunță „setul canonic s-a schimbat pentru acest utilizator".
 *
 * REGULI:
 *   - se emite DOAR după persistare VERIFICATĂ (succes server sau reluare
 *     confirmată P1-01). Niciodată pe conflict, pe verificare eșuată sau pe
 *     simpla punere în coada offline — acelea nu sunt date canonice;
 *   - este scopat pe PROPRIETAR (P0-02): un consumator ignoră semnalele altui
 *     utilizator, deci datele lui A nu pot împrospăta ecranul lui B;
 *   - este determinist: nicio temporizare, niciun interval de polling.
 */

type AscultatorMese = (userId: string) => void;
export interface VerifiedMealSaveEvent {
  userId: string;
  mealIds: readonly string[];
  dayKeys: readonly string[];
  revision: number;
}
type AscultatorSalvare = (event: VerifiedMealSaveEvent) => void;

const ascultatori = new Set<AscultatorMese>();
const ascultatoriSalvare = new Set<AscultatorSalvare>();
const salvateEmise = new Set<string>();
let revisionSalvare = 0;

/**
 * Anunță că setul canonic de mese al utilizatorului s-a schimbat.
 * Se apelează EXCLUSIV după o persistare dovedită.
 */
export function marcheazaMeseModificate(userId: string): void {
  // Fără proprietar valid nu putem scopa semnalul, deci nu emitem nimic:
  // un semnal anonim ar împrospăta sesiunea greșită.
  if (typeof userId !== 'string' || userId.trim() === '') return;
  for (const ascultator of [...ascultatori]) {
    try {
      ascultator(userId);
    } catch {
      // Un consumator defect nu trebuie să blocheze ceilalți consumatori.
    }
  }
}

/** Abonare la invalidare. Întoarce funcția de dezabonare. */
export function aboneazaLaModificariMese(ascultator: AscultatorMese): () => void {
  ascultatori.add(ascultator);
  return () => { ascultatori.delete(ascultator); };
}

/**
 * Emits an animation-only signal after a new meal is verified on the server.
 * It intentionally carries no nutrition values: consumers must refresh from
 * the canonical meals store before presenting updated totals.
 */
export function anuntaMasaSalvataVerificat(
  userId: string,
  mealIds: readonly string[],
  dayKeys: readonly string[],
): void {
  if (!userId.trim()) return;
  const ids = [...new Set(mealIds.filter((id) => typeof id === 'string' && id.trim() && id !== 'undefined' && id !== 'null'))];
  if (ids.length === 0) return;
  const freshIds = ids.filter((id) => {
    const key = `${userId}:${id}`;
    if (salvateEmise.has(key)) return false;
    salvateEmise.add(key);
    return true;
  });
  if (freshIds.length === 0) return;
  while (salvateEmise.size > 500) {
    const oldest = salvateEmise.values().next().value;
    if (oldest === undefined) break;
    salvateEmise.delete(oldest);
  }
  const event: VerifiedMealSaveEvent = {
    userId,
    mealIds: freshIds,
    dayKeys: [...new Set(dayKeys.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))],
    revision: ++revisionSalvare,
  };
  for (const listener of [...ascultatoriSalvare]) {
    try { listener(event); } catch { /* A visual subscriber cannot block persistence. */ }
  }
}

export function aboneazaLaMeseSalvateVerificat(listener: AscultatorSalvare): () => void {
  ascultatoriSalvare.add(listener);
  return () => { ascultatoriSalvare.delete(listener); };
}
