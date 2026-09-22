# GetFlow — obiectiv de apă calculat din greutatea reală

## Stare

Design aprobat în conversație pentru TASK 1 din campania GetFlow UX / Profile / Water / Iconography / Food Database. Specificația acoperă exclusiv calculul obiectivului de apă și prezentarea asociată în Home. Etapele Profile, Security/Reminders, Iconography, Open Food Facts și regresia finală rămân proiecte separate.

## Context observat

- `frontend-nutritie/hooks/useApa.ts` persistă consumul ca număr de pahare pentru ziua locală în cheia `apa_${localDayKey()}`. Obiectivul este fixat la 8 pahare.
- `frontend-nutritie/app/(tabs)/index.tsx` afișează consumul în pahare și ml, cu increment/decrement de câte 250 ml.
- `frontend-nutritie/hooks/useMeseAzi.ts` întoarce `greutate`, dar folosește 75 kg ca fallback. Valoarea efectivă din profil nu trebuie confundată cu acel fallback.
- Salvarea greutății din Home scrie `greutate` în AsyncStorage și metadata utilizatorului, apoi reîncarcă datele prin `refresh(true)`. Scrierile offline sunt păstrate în payload-ul pending scoped pe utilizator din `frontend-nutritie/lib/sincronizeazaTargeturi.ts`.
- Onboarding-ul scrie greutatea în tabela `profil` și în AsyncStorage; restaurarea profilului poate repopula AsyncStorage. `useMeseAzi` momentan nu expune dacă valoarea numerică `greutate` provine dintr-o intrare reală sau din fallback.
- `frontend-nutritie/components/AddWeightModal.tsx` primește o greutate numerică și precompletează câmpul. Pentru scenariul fără greutate, precompletarea implicită nu trebuie prezentată drept date introduse de utilizator.
- Nu există teste dedicate pentru calculul sau hook-ul de apă. Home și traducerile au teste de regresie generale, care trebuie păstrate.

## Obiectiv și non-obiective

Obiectivul zilnic se derivă determinist din greutatea curentă validă, normalizată în kg:

`targetMl = round(bodyWeightKg × 35 ml/kg)`

Coeficientul `35 ml/kg` va exista într-o singură constantă de domeniu. Formula este o estimare pentru hidratare, nu o regulă medicală și nu trebuie prezentată ca prescripție medicală.

Nu se schimbă țintele calorice/proteice, datele profilului, contractele backend, autentificarea, jurnalul meselor, regulile de notificări sau altă logică din afara apei. Nu se adaugă o coloană de profil și nu se persistă o copie derivată a obiectivului.

## Arhitectură propusă

```text
useMeseAzi / profilul autentificat
  └─ greutate reală opțională în kg (pending → metadata → profil local restaurat)
       └─ lib/profileWeight.ts → greutate validă nullable
            └─ lib/hydration.ts (coeficient unic + calcul pur)
            └─ Home
                 ├─ useApa (consum zilnic existent; pahare × 250 ml)
                 └─ WaterIntakeCard (afișare, progres și acțiuni)
```

### Autoritatea greutății

- Se adaugă `lib/profileWeight.ts` cu funcția pură `resolveProfileWeightKg({ pendingKg, metadataKg, storedKg })`. Ea întoarce `number | null` și nu inventează fallback. Contractul numeric existent `greutate` din `useMeseAzi` rămâne neschimbat pentru ceilalți consumatori; hook-ul expune separat rezultatul nullable.
- Rezoluția folosește numai datele utilizatorului autentificat: valoarea pending scoped utilizatorului are prioritate față de metadata; metadata validă are prioritate față de valoarea locală `greutate` restaurată din profil. Valoarea locală este fallback doar dacă sursele mai autoritare nu conțin o greutate validă.
- Nu se adaugă o nouă cheie de storage și nu se scrie greutatea în alt loc. Actualizarea existentă din Home declanșează refresh, iar cardul derivă din nou ținta din greutatea opțională rezultată.
- Dacă nu există nicio sursă reală validă, rezultatul rămâne `null`; 75 kg nu este folosit la hidratare.
- Datele aplicației sunt deja exprimate în kg; nu există selector de unitate kg/lb. În această etapă nu se adaugă selector și nu se face conversie inutilă. Contractul de calcul primește exclusiv kg.

### Calcul pur

- Se adaugă `frontend-nutritie/lib/hydration.ts`, fără dependențe React sau storage.
- Modulul exportă constanta `WATER_ML_PER_KG = 35`, validatorul greutății în kg și `calculateDailyWaterTargetMl(weightKg)` care întoarce ml întregi sau `null` pentru intrare absentă/nevalidă.
- Validarea acceptă numai numere finite din intervalul deja folosit pentru introducerea greutății curente, 30–250 kg. Nu se acceptă șiruri, zero, valori negative, `NaN` ori infinit.
- Nu se rotunjește în pahare: obiectivul exact în ml rămâne autoritar.

### Jurnalizarea apei și prezentarea

- `useApa` rămâne responsabil doar de consumul zilnic și persistența existentă în pahare. Cheile zilnice și datele stocate nu se migrează.
- Home derivă consumul afișat ca `pahare × 250 ml`; progresul compară volumul consumat cu obiectivul calculat și se plafonează vizual la 100%, fără a limita consumul jurnalizat.
- Se separă afișarea într-un `WaterIntakeCard` prezentational, cu props explicite pentru consum, țintă nullable, loading și acțiunile existente. Cardul nu citește greutatea și nu persistă date.
- Cu țintă disponibilă se afișează ținta exactă în ml, consumul în ml și progresul.
- Fără țintă: jurnalul de consum rămâne utilizabil; nu se afișează țintă sau procent calculat. Se arată un CTA localizat pentru completarea greutății reale.
- Dacă CTA-ul deschide `AddWeightModal` într-un profil fără greutate, inputul începe gol, nu cu 75 kg. Modalul acceptă această stare nullable numai pentru valoarea curentă; obiectivul de greutate existent nu se schimbă. Controalele de ajustare numerică nu trebuie să introducă implicit o valoare inventată.
- Toate etichetele noi/ajustate trec prin i18n pentru RO, EN, FR și DE. Copy-ul descrie ținta ca estimare de hidratare bazată pe greutate și nu folosește afirmații medicale.

## Suprafața estimată de implementare

- `frontend-nutritie/lib/profileWeight.ts` — rezolvă greutatea reală nullable din sursele existente.
- `frontend-nutritie/lib/hydration.ts` — definește `WATER_ML_PER_KG = 35`, `WATER_GLASS_ML = 250` și calculele pure țintă/consum.
- `frontend-nutritie/hooks/useMeseAzi.ts` — expune separat greutatea reală opțională, fără a modifica fallback-ul public existent.
- `frontend-nutritie/hooks/useApa.ts` — rămâne neschimbat; persistă numai paharele zilnice.
- `frontend-nutritie/components/home/WaterIntakeCard.tsx` — UI izolată, cu props: `consumedMl`, `targetMl`, `loading`, `onAddGlass`, `onRemoveGlass`, `onAddWeight`.
- `frontend-nutritie/app/(tabs)/index.tsx` — compunerea greutății, hook-ului de consum, cardului și modalului.
- `frontend-nutritie/components/AddWeightModal.tsx` — valoare inițială nullable, fără precompletare inventată.
- `frontend-nutritie/i18n/locales/{ro,en,fr,de}.json` — copy-ul cardului și al stării fără greutate.
- teste noi strict pentru calcul, rezoluția greutății, persistența neschimbată și montarea cardului real.

Fișierele sunt doar estimare până la citirea diff-urilor existente imediat înainte de implementare. Orice modificări dirty preexistente în aceste fișiere trebuie păstrate punctual.

## Teste și criterii de acceptare

1. Teste unitare pentru 50, 70, 80 și 100 kg, cu rezultate 1750, 2450, 2800 și 3500 ml.
2. Intrare absentă, șir, zero, negativă, `NaN`, infinit și valori în afara intervalului 30–250 kg fac validatorul să întoarcă `false`, iar calculatorul țintei să întoarcă `null`; nicio valoare nu produce `NaN`/`Infinity`.
3. Sursa pending scoped utilizatorului câștigă față de metadata; metadata câștigă față de valoarea locală restaurată; alt utilizator nu poate furniza greutatea curentă.
4. Lipsa greutății nu expune ținta calculată din fallback-ul 75 kg; CTA-ul rămâne funcțional și modalul nu precompletează o greutate.
5. Schimbarea greutății și refresh-ul existent actualizează ținta fără rescriere separată a unei valori derivate.
6. Persistența actuală a consumului zilnic în pahare și increment/decrement de 250 ml rămân compatibile.
7. Componenta Home pentru apă se montează în test cu țintă și fără țintă; starea fără țintă nu afișează țintă/procent, dar păstrează comenzile jurnalului.
8. Traducerile RO/EN/FR/DE au aceleași chei semantice.
9. Se rulează testele focalizate, apoi typecheck și lint frontend; se rulează regresiile Home deja existente afectate. Nu se construiește V7.

## Decizii explicite

- Coeficient: 35 ml/kg, conform brief-ului; documentat ca estimare, nu ca recomandare clinică.
- Unitatea internă și afișată pentru greutate: kg; nu există flux lb de normalizat în aplicația curentă.
- Stocare: se păstrează logul zilnic existent în pahare; obiectivul se derivează și nu se salvează separat.
- Profil fără greutate reală: consumul continuă fără obiectiv numeric; CTA către introducerea greutății, modalul începe gol.
- Domeniu: numai TASK 1. Nicio schimbare la Profile redesign, Security/Reminders, iconografie, Open Food Facts sau final release gate în acest ciclu.
