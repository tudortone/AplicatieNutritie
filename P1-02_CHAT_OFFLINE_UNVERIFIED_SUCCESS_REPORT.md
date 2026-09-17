# P1-02 — Succes neverificat în chat / offline (FAZA A — POARTĂ ÎNCHISĂ)

Stare: HEAD `892ab59` + arborele de lucru curent (dirty, intenționat).

> **POARTĂ.** P1-02 cere `P1-01: ACCEPTED`. P1-01 nici nu a putut începe
> implementarea (poarta lui cere P1-03 acceptat). Conform regulii explicite,
> acest document se oprește la **P1-02 PHASE A READY**: inspecție, inventar,
> defecte identificate, plan. **Nicio modificare de producție.**

---

## 1. Autoritatea de succes — inventar

| Cale | Ce confirmă succesul azi | Verdict |
|---|---|---|
| Salvare manuală online (`AddMealBottomSheet`) | `{ data, error }` de la Supabase + `data[0]` | are dovadă |
| Salvare manuală offline | `pushOfflineMealVerificat().persistat` | are dovadă (F-11) |
| Salvare foto offline (`camera.tsx`) | `pushOfflineMealVerificat().persistat` | are dovadă (F-11) |
| **Salvare din chat, offline (`chat.tsx:683`)** | **nimic — valoarea returnată e ignorată** | **FALS SUCCES** |
| Răspuns AI chat | răspuns HTTP parsat | are dovadă |

## 2. Defectul confirmat — D1

`app/(tabs)/chat.tsx:683`

```ts
await pushOfflineMeal(payloadOffline);   // valoarea returnată e aruncată
...
// 4. Finalizare cu succes sau offline-queued
setSuccessModalData({ ... });            // succes necondiționat
```

Proiectul își definește singur standardul, în chiar docul funcției surori
(`lib/offlineQueue.ts`):

> „Ecranele care confirmă utilizatorului «Salvat offline» trebuie însă să
> folosească `persistat`: dacă e `false`, masa există DOAR în memorie și dispare
> la închiderea aplicației, deci mesajul corect este unul de eroare, nu de succes."

`camera.tsx` și `AddMealBottomSheet.tsx` au fost migrate la
`pushOfflineMealVerificat` (F-11). **Chat-ul a rămas pe varianta neverificată.**
Dacă `saveOfflineQueue` eșuează (AsyncStorage plin/eroare), utilizatorul vede
modalul de succes cu totalurile mesei, iar masa dispare la repornire.

**Clasificare:** fals succes real, cu dovadă în sursă, într-una din trei ecrane —
deci o regresie de acoperire a unui fix deja acceptat, nu un defect de design nou.

## 3. Zone de verificat în Faza B (după poartă)

Neinvestigate încă în profunzime, enumerate ca plan, nu ca rezultate:

1. **Timeout la salvarea din chat** — `chat.tsx` nu are echivalentul lui
   `salvareMasaCuTimeout` din `AddMealBottomSheet`; de stabilit dacă un hang
   lasă UI-ul blocat sau produce succes.
2. **Răspuns pierdut după scriere reușită** — starea corectă este
   `NECUNOSCUT/VERIFICARE`, nu succes și nici eșec; reconcilierea trebuie să
   folosească identitatea logică P1-01.
3. **Cadența reclamelor** — de confirmat că un tur AI eșuat/offline nu avansează
   contorul de 15 mesaje.
4. **Comutare de cont cu operații în așteptare** — garda P0-02 există pe coadă
   (`offlineQueue.ts:273`); de verificat că starea „în așteptare" din chat nu
   se afișează sub contul B.
5. **Istoricul chat-ului** — de stabilit autoritatea (local vs server) înainte de
   a numi un mesaj „persistat".

## 4. Model de stare propus

Fără redesign: doar separarea explicită a stării `QUEUED_OFFLINE` (persistat pe
disc, neconfirmat de server) de `SUCCEEDED` (confirmat de autoritate), plus o
stare `UNKNOWN` pentru cazul timeout/răspuns pierdut. Chat-ul este singurul ecran
care azi le colapsează pe toate în „succes".

## 5. Ce NU s-a atins

Zero modificări de producție. P1-12, P1-03, P1-01, P0-* neatinse.

---

# FAZA B — IMPLEMENTARE (poartă deschisă: P1-01 ACCEPTAT)

## 6. Defectul confirmat, remediat

`app/(tabs)/chat.tsx` chema `pushOfflineMeal(...)`, **ignora rezultatul**, apoi
afișa necondiționat confirmarea (`isOffline: true`) și mesajul „masa a fost
salvată offline". Dacă scrierea pe disc eșua, masa exista doar în memorie și
dispărea la închiderea aplicației — dar utilizatorul fusese anunțat că e salvată.

**Fix:** `pushOfflineMealVerificat(...)` pe fiecare rând; dacă **oricare** rând nu
s-a persistat durabil, nu se afișează nicio confirmare și se raportează eroare.
Identitatea operației P1-01 **se păstrează**, ca o reluare să rămână aceeași
salvare logică, nu una nouă.

Camera și salvarea manuală foloseau deja varianta verificată (F-11); chat-ul era
singurul rămas pe cea neverificată.

## 7. Al doilea defect, găsit în auditul adiacent

Un răspuns **200 OK cu corp malformat** (fără `raspuns` și fără propunere
interpretabilă) era afișat ca bulă **normală** de asistent — nu ca eroare — și
avansa evaluarea reclamei. Adică un eșec arăta exact ca un tur finalizat.

**Fix:** dacă nu există nici text, nici propunere, se afișează bulă de eroare și
se iese înainte de `maybeShowInterstitial`.

## 8. Autoritatea succesului, după fix

Chat-ul are **o singură** tranziție de succes (`setSuccessModalData`). Toate
căile neverificate ies înainte de ea:

| Cale | Evidență | Rezultat |
|---|---|---|
| insert reușit | server | succes |
| `reluare_confirmata` | P1-01: rând citit și comparat | succes |
| `conflict_continut` | P1-01 | eroare, fără succes |
| `verificare_esuata` | P1-01 | eroare, fără succes |
| `eroare_server` | cod Postgres/HTTP | eroare, fără succes |
| offline, toate rândurile persistate | `persistat === true` | confirmare offline adevărată |
| offline, persistare eșuată | `persistat === false` | eroare, **fără** confirmare |

**Tranziții de succes neexplicate: 0.**

## 9. Cadența reclamelor

`maybeShowInterstitial('chat')` este în interiorul `try`, după finalizarea
răspunsului; eșecurile (non-2xx, rețea, abort) ies mai devreme sau cad în `catch`.
Cu fixul de la §7, și răspunsul malformat iese înainte. `recordChatUserMessage()`
numără mesajele UTILIZATORULUI la trimitere — regula de produs existentă, nu un
semnal de finalizare. Verificat executabil în teste (4 cazuri).

## 10. Teste

`__tests__/p102ChatOfflineFalseSuccess.test.tsx` — **montează ecranul REAL** și
parcurge fluxul de producție (mesaj → propunere → categorie → „Adaugă în jurnal"):

1. persistare offline eșuată → nicio confirmare *(RED înainte de fix)*
2. persistare offline reușită → confirmare offline adevărată
3. răspuns 200 malformat → fără tur finalizat, fără reclamă *(RED înainte de fix)*
4. eroare 500 → fără tur finalizat
5. eșec de rețea → fără tur finalizat
6. răspuns valid → tur finalizat, reclama poate fi evaluată

**Non-vacuitate:** scoaterea ambelor gărzi face să cadă exact testele 1 și 3.

## 11. Limitări rămase

1. **Comutarea de cont** este tratată structural (istoricul e cheiat pe
   `session.user.id`, iar scrierea în jurnal e legată de `user_id` sub RLS), nu
   printr-un test executabil de cursă.
2. **Streaming: N/A** — chat-ul nu folosește streaming; răspunsul vine într-un
   singur `json()`.
3. **Răspuns pierdut**: reluarea folosește identitățile P1-12 (AI) și P1-01
   (jurnal); P1-02 nu a schimbat nimic acolo.
