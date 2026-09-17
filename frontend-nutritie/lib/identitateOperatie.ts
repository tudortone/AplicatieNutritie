import { idOperatieNoua } from './idUtils';

/**
 * P1-01 — ciclul de viață al IDENTITĂȚII unei acțiuni de salvare.
 *
 * ==========================================================================
 * DE CE EXISTĂ
 * ==========================================================================
 * Identitatea era ținută ca `useRef` în fiecare ecran, cu reguli de eliberare
 * scrise separat. `AddMealBottomSheet` o reseta corect la deschiderea sheet-ului;
 * camera și chat-ul nu aveau echivalentul, deci identitatea supraviețuia unei
 * încercări ABANDONATE (scan anulat, propunere respinsă de server și înlocuită)
 * și o masă complet diferită o refolosea. Rezultatul: două mese distincte
 * ajungeau pe aceeași cheie primară.
 *
 * Aici există o singură definiție a celor trei tranziții, folosită de toate
 * ecranele, deci regula nu mai poate diverge între ele.
 *
 * ==========================================================================
 * TRANZIȚII
 * ==========================================================================
 *   pentruActiuneaCurenta()  — mintește la prima cerere, apoi returnează aceeași
 *                              valoare: o reluare de transport este ACEEAȘI operație.
 *   incheiePersistata()      — persistarea e dovedită (succes sau 23505 verificat).
 *                              Acțiunea s-a terminat; următoarea va fi una nouă.
 *   abandoneaza()            — utilizatorul a renunțat la această acțiune și începe
 *                              alta (scan nou, altă propunere, sheet redeschis).
 *
 * Un eșec de TRANSPORT nu apelează niciuna dintre ultimele două: reluarea trebuie
 * să rămână aceeași operație, altfel ar deveni o masă nouă.
 */
export interface IdentitateOperatie {
  /** Id-ul acțiunii curente; îl generează la prima cerere și îl păstrează. */
  pentruActiuneaCurenta(): string;
  /** Persistare dovedită — acțiunea s-a încheiat. */
  incheiePersistata(): void;
  /** Utilizatorul a abandonat această acțiune și începe alta. */
  abandoneaza(): void;
  /** Id-ul curent fără a-l genera (diagnostic/teste). */
  idCurent(): string | null;
}

export function creeazaIdentitateOperatie(): IdentitateOperatie {
  let id: string | null = null;
  return {
    pentruActiuneaCurenta() {
      if (!id) id = idOperatieNoua();
      return id;
    },
    incheiePersistata() {
      id = null;
    },
    abandoneaza() {
      id = null;
    },
    idCurent() {
      return id;
    },
  };
}
