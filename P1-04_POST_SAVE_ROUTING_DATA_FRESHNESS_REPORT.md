# P1-04 — Rutare post-salvare și prospețimea datelor

Stare: HEAD `892ab59` + arborele de lucru curent (dirty, intenționat).

---

## 1. Ce era deja corect (și nu am refăcut)

Secvența UX cerută exista deja și este corectă:

`MealSaveSuccessModal` pornește **după** rezultatul persistării, dă haptic
(`Success` online / `Warning` pentru offline — deja distincte), rulează o animație
de **~650 ms** (700 ms pe reduced motion) și abia la final apelează `onDismiss`,
care navighează. Durata se încadrează în intervalul cerut de 500–900 ms.

Navigarea folosește `router.replace('/(tabs)')`, deci nu stivuiește Home.
`AddMealBottomSheet` **nu** navighează deloc — doar închide sheet-ul, ceea ce este
comportamentul corect când salvarea pornește de pe Home.

**Nu animația era problema. Prospețimea datelor era.**

## 2. Cauza reală: prospețimea depindea de un cronometru

Fiecare ecran are propria instanță `useMeseAzi`. Un `refresh()` din chat sau din
jurnal împrospătează **doar acea instanță**; Home rămâne cu datele vechi.

Home se baza pe `useFocusRefresh`, care are **throttle de 5 secunde**
(`hooks/useFocusRefresh.ts`). Dacă utilizatorul fusese pe Home cu mai puțin de 5s
în urmă — scanare rapidă de barcode, salvare din chat, revenire imediată din
cameră — refresh-ul la focus era **sărit** și Home afișa totaluri vechi.

| Scriitor | Împrospătare înainte | Home |
|---|---|---|
| `AddMealBottomSheet` pe Home | `onSuccess={refresh}` | ✅ direct |
| `AddMealBottomSheet` în Jurnal | `onSuccess={refresh}` (jurnalul) | ❌ vechi până la focus (throttled) |
| `AddMealBottomSheet` în scanner-barcode | **niciun `onSuccess`** | ❌ nimic nu se împrospăta |
| `camera.tsx` | `router.replace` | ❌ depindea de focus (throttled) |
| `chat.tsx` | `refresh()` pe instanța chat-ului | ❌ Home neatins |

Două defecte: **D1** — corectitudinea datelor depindea de throttle-ul de 5s;
**D2** — calea barcode nu împrospăta nimic, nicăieri.

## 3. Mecanismul ales

`lib/freshnessMese.ts` — un canal minimal de invalidare (≈30 de linii), consumat
**în interiorul** lui `useMeseAzi`, deci toți consumatorii canonici (Home, Jurnal,
statistici) se împrospătează dintr-o singură emisie. Nu ține date, nu este un al
doilea depozit de stare, nu face polling.

```
persistare DOVEDITĂ → marcheazaMeseModificate(userId) → useMeseAzi refetch
```

- **Determinist:** niciun `setTimeout`, niciun interval. Auditul codului atins
  confirmă că toate cronometrele rămase sunt de prezentare (puncte animate,
  scroll, banner) sau de abort al cererii AI — niciunul pe calea de date.
- **Scopat pe proprietar (P0-02):** consumatorul compară `userId` cu sesiunea
  curentă; un semnal al lui A nu împrospătează ecranul lui B. Un semnal fără
  proprietar valid este ignorat.
- **Ziua locală (P1-03):** refetch-ul refolosește exact `fetchData`, deci
  `startOfLocalDayISO`/`endOfLocalDayISO` rămân autoritatea zilei.

## 4. Cine emite semnalul

Emis **exclusiv** după persistare dovedită:

| Cale | Emite? |
|---|---|
| insert online reușit (manual / cameră / chat) | ✅ |
| reluare confirmată P1-01 (23505 verificat) | ✅ |
| sincronizare reușită din coada offline (`procesate > 0`) | ✅ |
| conflict P1-01 | ❌ |
| verificare eșuată P1-01 | ❌ |
| doar pus în coada offline | ❌ — **nu este dată canonică** |
| eșec de persistare offline | ❌ |

Distincția P1-02 este păstrată: o masă doar pusă în coadă primește confirmarea
offline adevărată, dar **nu** invalidează totalurile canonice și nu fabrică nimic
în Home.

**D2 se rezolvă structural:** semnalul pleacă din `AddMealBottomSheet` însuși, deci
și `scanner-barcode.tsx` (care nu pasează `onSuccess`) împrospătează acum corect,
fără să fi fost atins.

## 5. Rutare per scriitor

| Scriitor | Comportament (neschimbat, doar verificat) |
|---|---|
| Manual de pe Home | feedback → închide sheet-ul → Home rămâne → totaluri împrospătate |
| Cameră | feedback ~650 ms → `router.replace('/(tabs)')` |
| Chat | feedback → `router.replace('/(tabs)')` |

`replace` nu stivuiește Home. Ambele ecrane golesc datele modalului **înainte** de
navigare, deci `onDismiss` nu poate rula de două ori; la momentul salvării,
dublu-tap-ul e blocat de `savingRef` / `isSavingDiary`.

## 6. Dacă refresh-ul e mai lent decât animația

Nu se fabrică nimic. `useMeseAzi` are deja gardă anti-cursă pe `reqIdRef`, iar
totalurile se derivă din setul canonic (P1-03). Dacă reîncărcarea durează mai mult
decât animația, Home afișează starea lui legitimă până când datele sosesc —
niciun total inventat, niciun timer care „decide" corectitudinea.

## 7. Dovezi de test

`__tests__/p104FreshnessMese.test.ts` (8) — pe hook-ul REAL `useMeseAzi`:
semnalul pentru utilizatorul curent reîncarcă; **fără** semnal nu se reîncarcă
nimic (non-vacuu); semnalul altui utilizator e ignorat (P0-02); reîmprospătarea e
imediată, fără cronometru; semnale repetate nu strică starea; contractul
modulului (abonare/dezabonare/proprietar invalid).

`__tests__/p104SemnalDupaSalvare.test.tsx` (6) — pe componenta REALĂ de salvare
manuală, abonat la canalul real: succes → exact un semnal; reluare confirmată →
semnal; conflict → niciun semnal; verificare eșuată → niciun semnal; doar coadă
offline → niciun semnal; o salvare logică → o singură invalidare.

**Non-vacuitate:** scoaterea emisiei face să cadă 3 teste; scoaterea abonării face
să cadă 3 teste.

## 8. Limitări rămase

1. **Sincronizarea în fundal** emite o singură invalidare pentru întreaga reluare
   a cozii (`procesate > 0`), nu una pe rând — deliberat, ca să nu declanșăm N
   refetch-uri. Consecința: dacă reluarea procesează mai multe mese, Home se
   împrospătează o dată, la final.
2. **Comutarea de cont** este acoperită prin scoparea pe proprietar, verificată
   la nivel de hook, nu printr-un test de cursă cu două ecrane montate simultan.
3. **Android Back nativ** nu a fost testat pe dispozitiv; `router.replace` și
   golirea datelor modalului sunt verificate doar prin citire și typecheck.
4. Semnalul este **în proces**: dacă aplicația e ucisă între persistare și
   consum, prospețimea revine la refresh-ul la focus (care rămâne ca plasă).
