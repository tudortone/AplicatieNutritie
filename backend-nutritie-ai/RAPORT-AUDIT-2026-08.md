# Raport audit tehnic - august 2026

Scor initial: **38/100** (Securitate 5/10, Arhitectura 3/10, Performanta 4/10, Mentenabilitate 3/10).

Acest document consemneaza ce a fost reparat pe ramura `fix/audit-critic-2026-08`, ce a ramas
deliberat nereparat si de ce. Este scris ca sa fie citit peste sase luni de cineva care nu a
participat la audit.

---

## 1. Ce a fost reparat

### Securitate

| Problema | Stare inainte | Reparatie |
|---|---|---|
| Deadline-uri false pe apelurile AI | `Promise.race` cu un `setTimeout`; `signal` era construit dar **nu ajungea niciodata la `fetch`**. Cererea HTTP continua in fundal, socketul ramanea deschis, tokenii continuau sa fie facturati. | `utils/httpTimeout.js` - `callWithTimeout(factory, ms)` construieste `AbortSignal.timeout(ms)` si il paseaza apelului. Anularea este reala. |
| Apeluri AI complet fara timeout | Apelurile vision catre OpenAI, Groq si OpenRouter nu aveau **niciun** timeout. Un furnizor lent tinea cererea utilizatorului deschisa la nesfarsit. | Toate au acum deadline de 30s. |
| Prompt injection verificata partial | In `/api/chat` se verifica doar **ultimul** mesaj. Un mesaj otravit plasat mai devreme in istoric intra nefiltrat in prompt. In `/api/log-food-from-chat` istoricul era concatenat brut. | `utils/promptSafety.js` - `construiesteIstoricSigur()` valideaza fiecare mesaj, normalizeaza rolurile (clientul nu mai poate injecta `system`) si plafoneaza numarul de mesaje. |
| Ingrediente necontrolate in prompt | `current_ingredients` din `/api/vision-fallback` era `JSON.stringify`-uit direct in prompt, fara nicio validare de forma sau continut. | `valideazaIngrediente()` - tip, numar, lungime si verificare de injectie pe fiecare nume. |
| Interpolare bruta de text | Textul utilizatorului era pus intre ghilimele in prompt; putea inchide sirul si continua cu instructiuni proprii. | Textul intra ca literal `JSON.stringify(...)`, intre delimitatori marcati explicit ca DATE. |
| Fereastra de revocare a sesiunii | Cache-ul de token-uri folosea TTL fix de 60s, ignorand `exp`-ul real al JWT-ului. Un token expirat sau revocat ramanea valid pana la un minut. | `tokenCache.set(cheie, utilizator, { expiraLaMs })` - durata = `min(TTL, exp)`. Un token deja expirat nu mai este memorat deloc. |
| SSRF prin `imageUrl` | `/api/trigger-analiza-mancare` accepta orice sir ca URL de imagine. | Se accepta doar `https` si doar gazdele stocarii aplicatiei (ImageKit / Supabase). |
| CORS permisiv | Reflectare `origin: true` posibila si in productie. | `config/env.js` impune lista explicita in productie. |

### Arhitectura si mentenabilitate

- **Configurare centralizata** (`config/env.js`): validarea variabilelor de mediu era imprastiata
  prin fisier si partial absenta. Acum un deploy incomplet moare la boot, nu la prima cerere reala.
- **Parsare JSON de la LLM unificata** (`utils/llmJson.js`): existau cinci variante divergente de
  "curata markdown-ul si incearca `JSON.parse`", fiecare cu bug-uri proprii. Acum una singura.
- **Validare partajata a meselor** (`utils/validareMese.js`): `POST /api/mese` si `PUT /api/mese/:id`
  aveau ~55 de linii duplicate, cu reguli usor diferite intre ele. Acum o singura sursa de adevar.
- **Cod mort eliminat**: `validateImageMagicBytes` (nefolosit), variabila `lastError` care se scria
  dar nu se citea, ramuri `isNaN(x) ? 0 : x` imposibil de atins dupa validarile anterioare.
- **`parseInt` fara radix** - reparat.
- **Contract unic pe `/api/produs-barcode/:code`**: aceeasi ruta returna trei forme diferite, cu
  cheia sursei alternand intre `sursa` si `source`. Acum: `{ produs, sursa, source, estimat, dinCache }`.
  `source` este pastrat doar ca alias de compatibilitate, de eliminat dupa migrarea clientului.
- **Coercitie tacuta eliminata**: `Number(x) || 0` transforma `NaN` in 0, iar `estimare_grame || 100`
  transforma 0 in 100. Intr-un jurnal caloric asta inseamna date fabricate. Inlocuit cu `numarModel()`,
  care valideaza interval si foloseste o valoare implicita explicita.

### Performanta si stabilitate

- **Semafor de concurenta** (`utils/semafor.js`): imaginile base64 stateau in heap pe toata durata
  cascadei de furnizori, fara nicio limita de cereri simultane. Acum exista plafon si coada marginita,
  cu raspuns `503` explicit in loc de moarte prin OOM.
- **Trimming istoric chat O(n)** in loc de O(n^2): suma de tokeni se recalcula complet la fiecare taiere.
- **`unhandledRejection` / `uncaughtException`**: nu exista niciun handler; o promisiune respinsa in
  afara unui `try/catch` lasa procesul intr-o stare nedefinita, fara urma in Sentry.
- **Keep-alive**: cand nu exista adresa externa configurata, procesul se pinguia pe `127.0.0.1`.
  Zero efect asupra adormirii instantei, doar zgomot in log-uri. Acum se dezactiveaza explicit.
- **Sentry `tracesSampleRate`**: 1.0 in productie -> 0.1.

### Testare

- `tests/utils.test.js`: acoperire de unitate pentru toate modulele noi (parsare JSON, validare mese,
  sanitizare, cache de token-uri, prompt safety, semafor, timeout-uri).
- `.github/workflows/ci.yml`: repo-ul nu avea **nicio** verificare automata. PR-urile ar trebui sa
  ruleze testele backend, verificarea de tipuri pe frontend si `npm audit`.

---

## 2. Ce NU a fost reparat (si de ce)

Acestea sunt schimbari care depasesc perimetrul unui patch si necesita decizii de produs sau migrari
de date. Sunt listate in ordinea riscului.

### 2.1. Toate scrierile trec prin `service_role` (RLS ocolit)

`supabaseAdmin` foloseste cheia de serviciu, deci **singura** bariera intre datele a doi utilizatori
este prezenta manuala a lui `.eq('user_id', req.user.id)` in fiecare interogare. O singura omisiune
intr-un PR viitor = scurgere de date intre conturi, fara niciun mecanism care sa o prinda.

**Solutia corecta:** client Supabase per-cerere, initializat cu JWT-ul utilizatorului, cu politici RLS
active pe `mese`, `barcode_estimari_utilizator` si `clerk_user_map`. `service_role` ramane doar pentru
operatiuni cu adevarat administrative.

### 2.2. Rate limiting si cooldown-urile AI sunt in memoria procesului

Pe mai multe instante, fiecare proces are propriul contor: limita efectiva se inmulteste cu numarul de
instante, iar un furnizor pus in cooldown pe o instanta ramane apelat de celelalte.

**Solutia corecta:** store partajat (Redis). Interfata este deja pregatita -
`creeazaLimitatoare({ store })` accepta un store extern.

### 2.3. TOCTOU la salvarea produselor scanate

`verificaDreptDeScriere()` si scrierea efectiva nu sunt atomice. Doua cereri simultane pe acelasi cod
de bare pot trece amandoua verificarea.

**Solutia corecta:** constrangere unica la nivel de baza de date plus `upsert` conditionat. O verificare
in cod nu poate rezolva o cursa - doar baza de date poate.

### 2.4. `server.js` este in continuare un monolit

Patch-ul a extras logica reutilizabila in module, dar rutele au ramas intr-un singur fisier de peste
60 KB. Structura tinta: `routes/` (HTTP), `services/` (logica AI si de business), `repositories/`
(acces la date). Nu am facut mutarea acum pentru ca ar fi transformat un patch verificabil intr-o
rescriere imposibil de revizuit.

### 2.5. Frontend-ul nu a fost atins

`app/scanner-barcode.tsx` (~42 KB), `app/camera.tsx` (~38 KB) si `app/adauga-manual.tsx` (~22 KB) sunt
componente-monolit care amesteca UI, apeluri de retea, cache si logica de business. Necesita extragere
de hook-uri si un strat de client API, nu corecturi punctuale.

---

## 3. Corectie la raportul initial

Raportul initial afirma ca `callWithTimeout` provoca `unhandledRejection` si putea omori procesul.
**Afirmatia este gresita**: `Promise.race` ataseaza handlere pe toate promisiunile primite, deci
rejectia intarziata era absorbita, nu neraportata.

Defectele reale ale acelei functii raman doua, si sunt suficient de grave:
1. `signal` nu ajungea niciodata la `fetch` - anularea era pur decorativa;
2. apelurile vision nu aveau deloc timeout.

Ambele sunt reparate. Corectia este consemnata aici pentru ca un raport de audit care nu isi corecteaza
propriile erori nu merita citit.

---

## 4. Variabile de mediu noi

| Variabila | Implicit | Rol |
|---|---|---|
| `AI_MAX_CONCURENTA` | 4 | Cereri AI simultane pe instanta |
| `AI_MAX_COADA` | 12 | Cereri in asteptare inainte de `503` |

Obligatorii la boot raman doar `SUPABASE_URL`, `SUPABASE_ANON_KEY` si `SUPABASE_SERVICE_ROLE_KEY`.

---

## 5. Verificare inainte de merge

Testele **nu au putut fi rulate** in mediul in care s-a facut acest patch (nu exista executie de cod,
doar acces la repository). Inainte de merge:

```bash
cd backend-nutritie-ai
npm ci
npm test
```

Suita existenta `tests/server.test.js` a fost tratata ca un contract: mesajele de eroare, codurile de
status si valorile deterministe ale calculului de profil au fost pastrate identic.
