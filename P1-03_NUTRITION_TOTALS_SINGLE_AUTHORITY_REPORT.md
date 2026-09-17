# P1-03 — Autoritate unică pentru totalurile nutriționale consumate

Stare: HEAD `892ab59` + arborele de lucru curent (dirty, intenționat).
Verificare finală rulată după ULTIMA modificare de cod.

---

## 1. Arhitectura ÎNAINTE

Home și Jurnalul consumau amândouă `useMeseAzi`, deci partajau *sursa de date*.
Problema nu era sursa, ci faptul că **același hook conținea patru calculatoare
independente**, cu reguli diferite:

| # | Locație | Ce calcula | Normalizare | Rotunjire | Plafonare |
|---|---|---|---|---|---|
| 1 | `fetchData` | totalul zilei | `\|\| 0` | da | da |
| 2 | `meseGrupate` | totaluri pe categorie | `\|\| 0` | **nu** | **nu** |
| 3 | `optimisticAddMeal` | deltă peste totalul **rotunjit** | `\|\| 0` | parțial | da |
| 4 | `optimisticDeleteMeal` | deltă sub totalul **rotunjit** | `\|\| 0` | nu | nu |

La acestea se adăuga un al cincilea agregat zilnic, în alt ecran:
`app/(tabs)/statistici.tsx` își însuma propriile totaluri pe zi.

## 2. Cauzele de drift

**D1 — aritmetică pe deltă peste valori rotunjite (neinversabilă).**
Totalul zilei se rotunjea la agregat (`Math.round(totalP * 10) / 10`), apoi
adăugarea/ștergerea optimistă opera pe valoarea *deja rotunjită*. Consecință
directă: „adaugă apoi șterge" **nu** readucea totalul inițial.

**D2 — două politici de rotunjire pe același ecran.** În Jurnal, rezumatul zilei
folosea calculatorul rotunjit (#1), iar rândurile de categorie calculatorul
nerotunjit (#2). Suma categoriilor afișate putea să difere de totalul afișat
deasupra lor.

**D3 — șiruri numerice produceau concatenare, nu adunare.** `let t = 0; t += "120"`
dă `"0120"`; cu două rânduri legacy, `"0" + "120" + "50"` → `Math.round("012050")`
= **12050 kcal**. Rândurile PostgREST normale sunt numerice, dar rândurile legacy
și importurile nu sunt garantate.

**D4 — `Infinity` devenea o valoare plauzibilă.** `Infinity || 0` este `Infinity`;
`Math.min(100000, Infinity)` = `100000`. O intrare invalidă se transforma într-un
număr care pare real. În agregatul pe categorii (#2), `Infinity` ajungea chiar
vizibil, fără plafonare.

**D5 — al cincilea agregat, în `statistici.tsx`**, fără normalizarea de la graniță.

## 3. Autoritatea aleasă

**A — rândurile canonice persistate + UN singur agregator partajat.**

```
rânduri `mese` (canonice)  →  calculeazaTotaluriZi()  →  totaluriPentruAfisare()
```

`lib/nutritionTotals.ts`. Nu s-a introdus niciun tabel/cache agregat nou și nicio
migrare: consumul se derivă mereu din datele deja persistate.

**Autoritatea consumului la nivel de rând:** coloanele `mese.calorii/proteine/...`.
`mese.alimente` (JSONB) descrie compoziția și susține editarea, dar **nu** se
însumează peste totalurile rândului — altfel aceeași masă ar fi numărată de două ori.

**Ținte vs consum:** separate. Țintele vin din profil; „rămas" se derivă
(`țintă − consumat`), nu se ține separat.

## 4. Unități canonice (verificate în `types.ts` + schema `mese`)

`calorii` → kcal · `proteine`, `grasimi`, `carbohidrati`, `fibre` → grame.
Neschimbate.

## 5. Normalizare la graniță

`normalizeazaNutrient` acceptă doar numere finite > 0; `null`, `undefined`, `NaN`,
`±Infinity`, negative, șiruri ne-numerice și obiecte contribuie cu **0**.
`Infinity` este **ignorat**, nu plafonat — o intrare invalidă nu trebuie să devină
date nutriționale care par reale. Șirurile numerice (`"12.5"`) se convertesc corect.

## 6. Politica de rotunjire

**O singură dată, la prezentare.** Valorile canonice rămân fracționare; agregarea se
face pe ele; rotunjirea se aplică la afișare: **calorii → întreg**, **macro → o
zecimală**. Plafoanele (100000 kcal / 5000 g) se aplică după normalizare.

Consecință deliberată: totalurile pe categorie din `meseGrupate` sunt **brute**.
Rotunjirea fiecărei categorii și apoi însumarea lor dă alt rezultat decât rotunjirea
sumei (dublă rotunjire: 95.5 în loc de 95.4 pe fixtura canonică). Invariantul „suma
categoriilor == totalul zilei" se poate garanta doar pe valori brute, deci Jurnalul
rotunjește la randare (`istoric.tsx`), cu aceeași funcție.

## 7. Ziua logică

Neschimbată și deja canonică: `lib/dateUtils` (`startOfLocalDayISO` /
`endOfLocalDayISO` / `localDayKey`) — **ziua LOCALĂ**, nu felierea unui ISO UTC.
Verificată direct pe helpere (graniță 23:59:59 / 00:00:00, 23:50 vs 00:10, ore
diferite din aceeași zi, fereastră de exact 24h−1ms) și, separat, pe hook-ul real,
că interogarea chiar folosește granițele locale.

## 8. Politica de cache

`mese` este singura stare canonică a zilei. Totalurile nu mai sunt stare — sunt
`useMemo` derivate din ea. Mutațiile optimiste ating **doar lista**; totalurile se
recalculează automat. `optimisticAddMeal` ignoră o masă al cărei `id` există deja,
deci reconcilierea cu serverul nu poate dubla contribuția.

## 9. Autorități eliminate / rămase

**Eliminate (4):** agregatul din `fetchData`, agregatul din `meseGrupate`, delta din
`optimisticAddMeal`, delta din `optimisticDeleteMeal`.
**Delegate (2):** `statistici.tsx` (agregat zilnic) și rezumatul de confirmare din
`chat.tsx` folosesc acum aceeași autoritate.

**Rămase, justificate — alt nivel sau altă mărime:**

| Locație | De ce nu este o autoritate concurentă |
|---|---|
| `lib/mealUtils.recalculeazaTotaluri` | ingrediente → **o masă**, nu zi |
| `lib/payloadMese` | ingrediente → rândul persistat, la scriere |
| `lib/parseMealProposal`, `camera.tsx` | **propuneri AI**, neconsumate |
| `useAntrenamente`, `antrenamente.tsx`, `jurnal-antrenamente.tsx` | calorii **ARSE**, altă mărime |

## 10. Propunere AI vs consum

Invariantul de produs este păstrat: o propunere AI trăiește doar în starea
ecranului. Contribuie **zero** până la „Adaugă în jurnal" **și** persistare reușită.
O salvare eșuată nu mută totalul canonic, pentru că totalul se derivă din rândurile
care chiar există.

## 11. Limitări rămase

1. **Backendul nu recalculează totalurile consumate**; autoritatea este pe client,
   peste rânduri protejate de RLS. Nu există deci un test de paritate FE/BE, pentru
   că nu există un al doilea calculator de comparat.
2. **Rânduri duplicate genuine** (aceeași salvare persistată de două ori) sunt
   numărate ambele — corect pentru P1-03, care agregă datasetul canonic.
   Deduplicarea logică a salvărilor este **scopul P1-01**.
3. **Fusuri orare în deplasare** nu sunt modelate: ziua e cea a dispozitivului. O
   masă adăugată într-un fus și citită în altul își poate schimba ziua afișată.
4. **Testele pe hook sunt împărțite în mai multe fișiere**: RNTL v14 pierde
   `result.current` după ~8 montări în același fișier (aceleași teste trec izolat).
   Împărțirea este o constrângere de harness, nu o slăbire a aserțiilor.
5. `mese.alimente` și coloanele rândului pot diverge dacă un scriitor viitor
   actualizează doar una. Consistența se asigură la scriere; P1-03 alege explicit
   rândul ca autoritate, dar nu impune invariantul la nivel de schemă.

---

## 12. Remediere după review — două blocante

Arhitectura a fost confirmată corectă de review (autoritate unică, sursă canonică,
Home/Jurnal/Statistici, rotunjire, ziua locală, izolarea conturilor). Au rămas două
defecte, ambele semnalate parțial chiar de mine la predare și lăsate neverificate.

### Blocant 1 — `CategorieDetailSheet` afișa valori BRUTE

**Cauza.** Contractul P1-03 spune: totalurile pe categorie rămân canonice brute, iar
rotunjirea se face o singură dată, la afișare. `istoric.tsx` respecta asta în antetul
de categorie, dar pasa **aceleași obiecte brute** mai departe prin `categoriiLive`.
Sheet-ul le randa direct (`categorie.totalCalorii`, …), deci utilizatorul vedea
`245.66666666666666` în loc de `246` — iar o valoare invalidă ajungea pe ecran ca
literalmente `NaNg` (dovedit de testul RED).

Am semnalat exact acest fișier la predarea anterioară („primește aceleași obiecte,
merită o a doua privire") și nu l-am verificat. Semnalarea nu înlocuiește verificarea.

**Fixul.** Conversia de prezentare se face **în sheet**, cu aceeași funcție canonică
`totaluriPentruAfisare` — nicio a doua implementare de rotunjire, niciun plafon
duplicat. Se aplică și pe calea de rezervă `instantaneu`, deci componenta rămâne
corectă și pentru apelanți viitori care nu pasează `categoriiLive`.

**Ce NU s-a schimbat:** agregarea canonică, caracterul brut al totalurilor pe
categorie, `useMeseAzi`, `lib/nutritionTotals.ts`.

**Apelanți verificați:** unul singur — `istoric.tsx` — și nu presupune valori
prerotunjite.

### Blocant 2 — lipsea dovada că hook-ul chiar folosește helperele de zi locală

**Cauza.** Testul meu anterior verifica doar ore/minute pe fereastra interogată
(`getHours() === 0`), ceea ce ar fi trecut și cu altă implementare. Mai rău:
variabilele de captură `mockFiltruGte` / `mockFiltruLte` existau, dar nu erau
asertate, iar fișierul care le folosea a fost șters în timpul împărțirii testelor.

**Fixul.** Două aserțiuni în testul existent pe hook-ul REAL, comparând valorile
chiar trimise la `.gte()` / `.lte()` cu rezultatul funcțiilor **reale** din
`lib/dateUtils` (nereimplementate în test), pe două zile diferite.

**Producția nu a fost modificată** — logica de zi era deja corectă.

### Non-vacuitate (ambele blocante)

| Modificare inversată | Rezultat |
|---|---|
| Se scoate conversia de prezentare din sheet | **5 / 6** teste cad |
| Hook-ul revine la felierea UTC în loc de helperele locale | cad **exact** cele 2 aserțiuni noi |

### Notă de verificare — flake sub încărcare

O rulare a suitei P1-12 focalizate a raportat 1 eșec, în timp ce rula concurent cu
suita frontend completă (22.9s față de ~6s obișnuit). Trei reluări consecutive și
rularea în suita backend completă au dat 70/70, respectiv 547/547. Îl raportez ca
flake observat sub încărcare, nu ca rezultat curat — numele testului nu a fost
capturat în acea rulare.
