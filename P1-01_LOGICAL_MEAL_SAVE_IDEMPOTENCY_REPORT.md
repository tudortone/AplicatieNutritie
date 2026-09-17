# P1-01 — Idempotența logică a salvării unei mese (FAZA 1 — POARTĂ ÎNCHISĂ)

Stare: HEAD `892ab59` + arborele de lucru curent (dirty, intenționat).

> **POARTĂ.** P1-01 cere `P1-03: ACCEPTED`. P1-03 este momentan
> **READY FOR RE-REVIEW** (cele două blocante au fost remediate, 60/60 verde, dar
> nu există acceptare independentă). Conform regulii explicite din task, acest
> document conține **doar** inventar, cauze, design și teste RED.
> **Nu s-a modificat niciun fișier de producție.**

---

## 1. Inventarul scriitorilor de mese

Backendul **nu scrie niciodată** în `mese` (căutare pe `backend-nutritie-ai`:
zero rezultate). Toată crearea de mese se face client → Supabase, sub RLS. Prin
urmare singura autoritate durabilă posibilă este o **constrângere în bază**.

| # | Scriitor | Entrypoint | Identitate rândului | Protejat la reluare? |
|---|---|---|---|---|
| W1 | `chat.tsx:649` prin `construiesteRinduriMasaChat` | Chat → Adaugă în jurnal | UUID determinist din **conținut**: `user\|tip\|zi\|nume\|gramaj` | Da la transport, **dar identitate greșită** |
| W2 | `camera.tsx:646` prin `construiestePayloadMasaCamera` → `insereazaMasaCuPoza` | Foto → Adaugă în jurnal | UUID determinist din **conținut** | idem W1 |
| W3 | `AddMealBottomSheet.tsx:500` → `insereazaMasaCuPoza` | Salvare manuală / produs / barcode | **fără `id`** → `gen_random_uuid()` în DB | **NU** |
| W4 | `offlineQueue.ts:282` | Replay coadă offline | `id` din payload-ul pus în coadă | Parțial (vezi D2) |
| W5 | `mealUtils.ts:319` `actualizeazaMasaCuPoza` | Editare masă | după `id` existent | N/A — editare, nu creare |

**Scriitori de CREARE: 4** (W1–W4). **Protejați corect: 0.**

## 2. Schema actuală

```sql
CREATE TABLE public.mese (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ...
);
```

Nicio coloană de operație, nicio constrângere `UNIQUE` în afara cheii primare.
RLS: `auth.uid() = user_id` pe ALL (USING + WITH CHECK).

**Mecanismul existent:** `lib/idUtils.ts::generareUuidDeterminist` produce un UUID
stabil dintr-o cheie, iar **PK-ul devine constrângerea de unicitate** — o reluare
lovește `23505`, tratat de `esteEroareDuplicate` / `clasificaRezultatInsertMasa`
ca „deja adăugat". Design-ul este corect; **cheia aleasă** este greșită.

Concluzie: **nu este nevoie de tabel nou și, cel mai probabil, nici de migrare.**

## 3. Cauze rădăcină

### D1 — SUPRA-protejare (W1, W2): identitatea derivă din conținut

`id = uuid(user|tip|zi|nume|gramaj)`. Asta oprește corect reluările, dar oprește
și a doua masă pe care utilizatorul **chiar vrea** să o adauge: același iaurt,
aceeași zi, aceeași categorie, același gramaj → aceeași cheie primară → a doua
salvare e raportată „duplicat" și **nu se scrie**.

Taskul o spune explicit: „two intentionally identical meals must be allowed…
hash(calories + name + …) cannot by itself define logical identity".
Dovedit RED: testele 1 și 2 din `p101IdentitateSalvareMasa.test.ts`.

### D2 — SUB-protejare (W3, W4): salvarea manuală nu are deloc identitate

`AddMealBottomSheet.tsx:470` construiește payload-ul **fără `id`**, deci DB-ul
generează un UUID nou la fiecare INSERT. Consecințe:

- dublu tap / retry → două rânduri;
- pe timeout (`salvareMasaCuTimeout(..., 9000)`) cererea intră pe ramura offline
  cu `generareUuid()` — un id **aleator nou**, fără nicio legătură cu rândul pe
  care serverul poate să îl fi scris deja. Timeout-ul este **local**; serverul
  poate reuși. Rezultat: rând scris online + rând scris la replay = **duplicat
  garantat pe rețea lentă**.

Aceasta este calea cea mai folosită din aplicație.

### D3 — impact direct asupra P1-03

P1-03 derivă totalurile din rândurile canonice și, corect, **nu ascunde**
duplicatele. Deci fiecare duplicat din D2 se vede direct în caloriile zilei.

## 4. Designul propus (de implementat DUPĂ acceptarea P1-03)

**Autoritate durabilă:** `mese.id` (PK) — mecanismul existent, refolosit.
**Nu** se adaugă tabel de idempotență și **nu** se adaugă coloană nouă.

**Identitate logică:** un `idOperatie` (UUID v4) generat **o singură dată**, la
începutul acțiunii „Adaugă în jurnal", nu din conținut:

```
mese.id = uuidDeterminist( `${user_id}|${idOperatie}` )
```

- generat la apăsarea butonului, păstrat în starea acțiunii;
- refolosit identic la orice retry de transport;
- salvat **împreună cu** intrarea din coada offline, deci supraviețuiește
  repornirii aplicației;
- scopat pe `user_id`, deci același `idOperatie` la doi utilizatori nu se ciocnește;
- resetat doar când utilizatorul începe deliberat o salvare nouă.

**Amprentă de payload:** aceeași cheie de operație cu payload materialmente
diferit trebuie să dea conflict explicit, nu suprascriere tăcută. Câmpurile
relevante se normalizează cu autoritatea canonică P1-03 (`normalizeazaNutrient`),
fără o a doua transformare nutrițională.

**Compatibilitate cu clienții deja lansați:** aceștia nu trimit `idOperatie`.
Comportamentul de azi (identitate din conținut) rămâne ca mod de compatibilitate
**explicit și documentat**, cu limitarea lui reală scrisă în clar: blochează a
doua masă identică în aceeași zi. Decizia trebuie luată conștient la implementare.

## 5. Teste RED existente

`frontend-nutritie/__tests__/p101IdentitateSalvareMasa.test.ts` — 6 teste, rulate:

| Test | Stare | Ce demonstrează |
|---|---|---|
| 1. chat: două acțiuni identice → identități diferite | **RED** | supra-dedupe real |
| 2. cameră: două scanări identice → identități diferite | **RED** | supra-dedupe real |
| 3. reluarea aceleiași acțiuni păstrează identitatea | trece **vacuu** | funcția ignoră `idOperatie`; devine semnificativ după fix |
| 4. izolare între utilizatori | trece **vacuu** | idem |
| 5. detectarea `23505` | verde | contract existent, nu regresa |
| 6. conținut diferit → identități diferite | verde | contract existent, nu regresa |

Testele 3 și 4 sunt marcate onest ca **încă neconcludente**: trec astăzi din
motivul greșit, pentru că parametrul `idOperatie` este ignorat.

**D2 (salvarea manuală) nu are încă test RED**: defectul trăiește în starea internă
a componentei, iar reproducerea lui cere fie un test de componentă, fie API-ul de
producție care nu există încă — ambele sunt muncă de după poartă.

## 6. Ce NU s-a atins

Zero modificări de producție. Zero migrări. P0-02, P0-03, P0-08, P0-BILLING-01,
P0-07, P1-12 și P1-03 rămân neatinse.

---

# FAZA 2 — IMPLEMENTARE (poartă deschisă: P1-03 ACCEPTAT)

## 7. Arhitectura finală

```
mese.id  =  uuidDeterminist( `op:${user_id}|${idOperatie}` )
```

`mese.id` este cheia primară, deci **ea este constrângerea de unicitate durabilă**.
Backendul nu scrie niciodată în `mese`, deci baza de date rămâne singurul arbitru
posibil — iar coliziunea `23505` este recunoscută drept „aceeași operație, deja
persistată".

**Zero migrări. Zero coloane noi. Zero tabele noi.** Mecanismul exista deja
(`generareUuidDeterminist` + PK); ce s-a schimbat este **cheia**: de la conținutul
mesei la acțiunea de salvare.

Funcții noi în `lib/idUtils.ts`:
- `idMasaDinOperatie(userId, idOperatie)` — identitatea rândului, scopată pe
  utilizator (același `idOperatie` la doi utilizatori → rânduri diferite);
  respinge id gol, ne-șir sau peste `MAX_LUNGIME_ID_OPERATIE` (200);
- `idOperatieNoua()` — id pentru o acțiune nouă, cu rezervă locală dacă
  generatorul criptografic nu e disponibil pe platformă.

## 8. Remediere scriitor cu scriitor

| Scriitor | Înainte | Acum |
|---|---|---|
| W1 CHAT | id din `user\|tip\|zi\|nume\|gramaj` | `idMasaDinOperatie(user, "${idOperatie}#${index}")` — rânduri distincte pentru o propunere cu mai multe alimente, stabile la reluare |
| W2 CAMERĂ | id din conținut | `idMasaDinOperatie(user, idOperatie)` |
| W3 MANUAL | **fără id** → `gen_random_uuid()` la fiecare INSERT | `construiestePayloadMasaManuala(...)` — abstracție de producție nouă, cu identitate din operație |
| W4 COADĂ OFFLINE | `generareUuid()` nou, fără legătură cu rândul online | `payload.id` — exact identitatea încercării online |

Editarea (`actualizeazaMasaCuPoza`) rămâne neatinsă: operează pe `editingMasaId`,
cu contractul ei existent. Payload-ul de editare **nu** trece prin noul builder.

## 9. Ciclul de viață al `idOperatie`

- **se generează** la prima încercare de salvare din acțiunea curentă;
- **se păstrează** peste retry, timeout și trecerea în coada offline — un eșec de
  transport nu îl eliberează, altfel reluarea ar deveni o masă nouă;
- **se eliberează** doar la dovada persistării: succes confirmat **sau** `23505`
  (coliziunea demonstrează că exact această operație există deja);
- **se resetează** la redeschiderea sheet-ului, adică la începerea unei acțiuni noi.

## 10. Cursa timeout ↔ coadă (D2) — rezolvare

Timeout-ul de 9s este local; serverul poate reuși exact atunci. Acum payload-ul
offline moștenește `payload.id`, deci reluarea cozii se ciocnește pe cheia primară
și este tratată ca „deja sincronizat". Un singur rând dintr-o singură acțiune.

## 11. Limitări rămase (declarate explicit)

1. **Același `idOperatie` cu payload diferit nu produce un conflict explicit.**
   Cheia primară oprește a doua scriere, deci prima masă rămâne autoritatea și
   nimic nu se suprascrie — dar baza **nu poate distinge** „payload modificat" de
   „reluare identică". O detecție reală ar cere o coloană de amprentă și o
   migrare. Comportamentul actual este *reject sigur*, **nu** conflict raportat.
   Documentat ca atare; nu îl revendic drept protecție la conflict.
2. **Apelanții fără `idOperatie`** primesc un id nou la fiecare apel (fiecare apel
   = acțiune nouă). Alegerea este deliberată: riscăm un rând în plus la un retry
   nemigrat, niciodată pierderea unei mese adăugate intenționat.
3. **Coada stale după ștergere** nu a fost demonstrată executabil. Structural,
   `processOfflineQueue` elimină intrarea la succes sau la `23505`, deci o intrare
   deja sincronizată nu supraviețuiește ca să reînvie o masă ștearsă ulterior —
   dar nu am un test care să forțeze scenariul.
4. **Concurența este dovedită pe un Postgres simulat** cu semantica cheii primare,
   nu pe o bază reală (fără Docker în acest mediu).
5. **P1-02 rămâne neatins**: `chat.tsx` continuă să ignore rezultatul lui
   `pushOfflineMeal` și să afișeze succes necondiționat. P1-01 nu a agravat asta.

## 12. Test modificat deliberat

`__tests__/payloadMese.test.ts` testul 9 cerea „același conținut → același id".
Contractul este **inversat intenționat** de P1-01: identitatea nu mai vine din
conținut. Testul a fost rescris pe noul contract (reluarea aceleiași operații →
același id; două operații pe același conținut → id-uri diferite), cu motivul
scris în test. Este singura aserțiune existentă a cărei intenție a fost schimbată.

---

# FAZA 3 — REMEDIERE DUPĂ REVIEW (trei blocante confirmate)

## 13. Blocant 1 — `23505` era acceptat orbește ca succes

**Ce am ratat.** Am documentat limitarea ca „reject sigur, prima scriere rămâne
autoritatea" — adevărat pentru bază. Nu am verificat însă **ce i se spune
utilizatorului**: fiecare ramură de duplicat construia confirmarea din payload-ul
LOCAL. Utilizatorul citea „salvat: 650 kcal" în timp ce jurnalul conținea 500.
Asta nu e o limitare documentată, e pierdere silențioasă de date.

**Fix.** `verificaReluareMasa(client, payload)` în `lib/payloadMese.ts`: pe `23505`
se citește rândul persistat și se compară câmpurile canonice (nume, categorie,
cei cinci nutrienți, normalizați cu autoritatea P1-03, deci `"40.0"` nu diferă de
`40`). Trei rezultate distincte:

| Rezultat | Semnificație | Ce vede utilizatorul |
|---|---|---|
| `reluare_confirmata` | rândul chiar corespunde | succes |
| `conflict_continut` | alt conținut sub același id | eroare explicită, **nu** succes |
| `necunoscut` | rândul nu poate fi citit | eroare de verificare, **nu** succes |

Aplicat în toate cele patru locuri: `camera.tsx`, `chat.tsx` (prin helperii
comuni), `AddMealBottomSheet.tsx`, `lib/offlineQueue.ts`. În coadă, un conflict
nu mai marchează intrarea drept sincronizată; `necunoscut` păstrează intrarea
pentru o reluare ulterioară, fără să pretindă succes.

## 14. Blocantele 2 și 3 — identitatea supraviețuia unei acțiuni ABANDONATE

**Ce am ratat.** Am resetat identitatea în `AddMealBottomSheet.open()` *tocmai
pentru că* înțelesesem pericolul — și nu am aplicat același tipar în cameră și în
chat. O inconsecvență introdusă de mine.

- **Cameră:** `anuleazaScanarea()` golea rezultatul, dar nu identitatea. Scanare A
  → salvare eșuată → „Anulează & Scanează din nou" → aliment B refolosea id-ul
  operației lui A. **Fix:** `anuleazaScanarea()` eliberează identitatea.
- **Chat:** `eroare_server` (RLS 42501 / constrângere / validare) returna fără să
  elibereze identitatea, iar propunerea putea fi respinsă și înlocuită. **Fix:**
  identitatea se eliberează pe `eroare_server` (nimic nu s-a persistat) și la
  respingerea/închiderea propunerii.

**Regula, acum într-un singur loc.** `lib/identitateOperatie.ts` definește cele
trei tranziții (`pentruActiuneaCurenta` / `incheiePersistata` / `abandoneaza`) și
este testat ca mașină de stări, ca regula să nu mai poată diverge între ecrane.
Un eșec de TRANSPORT nu eliberează nimic — reluarea rămâne aceeași operație.

## 15. Limitare rămasă, declarată explicit

**Nu există test la nivel de COMPONENTĂ pentru Blocantele 2 și 3.** Exact lipsa
semnalată de review. Am adăugat mașina de stări testată (12 teste) care fixează
contractul, iar resetările sunt implementate și verificate prin typecheck și
citire de cod — dar **niciun test nu montează `camera.tsx` sau `chat.tsx` ca să
execute secvența „abandonează o încercare, apoi salvează alt conținut".**
Montarea lui `camera.tsx` cere ~20 de module simulate (expo-camera, reanimated,
expo-router, trei contexte, ImageKit) plus `useFocusEffect`; nu am scris un astfel
de test în loc să pretind o acoperire pe care nu o am.

Restul limitărilor din §11 rămân valabile, cu o corecție: „same operation +
different payload" **nu mai este** un reject tăcut — este acum detectat și
raportat ca atare, fără migrare, prin citirea rândului persistat.

---

# FAZA 4 — REMEDIERE FINALĂ: verificarea 23505 pe TOATE cele patru căi

## 16. Ce am afirmat greșit

Raportul precedent scria „aplicat în toate cele patru locuri". **Fals.** Verificarea
chiar exista doar în `camera.tsx` și `lib/offlineQueue.ts`. Pentru `chat.tsx` am
presupus că trece prin helperii comuni și moștenește verificarea — nu o moștenea:
`clasificaRezultatInsertMasa` întoarce `{tip:'duplicat'}` doar pe baza codului de
eroare, fără nicio citire. `AddMealBottomSheet.tsx` nu fusese atins deloc pe 23505.

## 17. O singură decizie, pentru toate căile

`decideRezultatInsertMasa(client, payload|payloads, rezultat)` în `lib/payloadMese.ts`:
păstrează clasificarea existentă, dar `duplicat` **nu mai este un verdict** — se
citește rândul persistat prin `verificaReluareMasa` (singura implementare a
comparării, nedublată) și se întoarce unul dintre:

| Rezultat | Ce are voie ecranul să facă |
|---|---|
| `succes` | confirmă |
| `reluare_confirmata` | confirmă (rândul chiar este această salvare) |
| `conflict_continut` | eroare explicită; **fără** succes, **fără** coadă |
| `verificare_esuata` | eroare de verificare; **fără** succes, **fără** coadă |
| `eroare_server` / `offline` | exact ca înainte |

O propunere din chat scrie mai multe rânduri: **un singur** rând neconform face
întreaga operație `conflict_continut`; un rând necitibil o face `verificare_esuata`.

**Blocant A — chat.tsx:** folosește acum decizia verificată; identitatea se
eliberează doar pe `succes`/`reluare_confirmata`.
**Blocant B — AddMealBottomSheet.tsx:** 23505 se rezolvă **înaintea** ramificării
eroare/succes, deci nu mai cade în ramura generică offline. Pe `reluare_confirmata`
execuția continuă pe calea normală de succes, **fără** nicio intrare în coadă.

## 18. Ce a găsit testul de componentă (și n-ar fi găsit cititul codului)

Am montat `AddMealBottomSheet` real. Testul a expus două lucruri pe care
verificarea prin citire le ratase:

1. **Bug real de robustețe:** componentele mințeau identitatea cu `generareUuid()`
   direct. Când platforma nu oferă crypto, întoarce `undefined`, iar
   `idMasaDinOperatie` arunca — salvarea eșua cu eroare generică. Toate trei
   ecranele folosesc acum `idOperatieNoua()`, calea sigură creată exact pentru asta.
2. **Teste vacue:** primele trei teste asertau „coadă goală", ceea ce trecea și
   dacă salvarea nu rula deloc. Am adăugat un contor de INSERT-uri: toate cele
   trei dovedesc acum că salvarea chiar s-a executat. Testul „reluare confirmată"
   trecea de asemenea pe ramura greșită (conflict); acum rândul „persistat" este
   ecoul exact al payload-ului trimis, deci ramura corectă este chiar exercitată.

## 19. Limitare rămasă, declarată explicit

**Nu există test de componentă pentru `chat.tsx`.** Ecranul are 34 de importuri și
`mealProposal` se poate seta doar printr-un schimb AI complet simulat; un astfel de
harness ar fi fragil. Ce este acoperit: decizia însăși, cu 10 teste de integrare pe
**funcția de producție reală** și pe rândurile construite de
`construiesteRinduriMasaChat` real, inclusiv cazul multi-rând. Ce **nu** este
acoperit: cele trei ramuri de UI din `chat.tsx`, verificate prin typecheck și citire.
