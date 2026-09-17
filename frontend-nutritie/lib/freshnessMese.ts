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

const ascultatori = new Set<AscultatorMese>();

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
