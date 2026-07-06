# INSTRUCȚIUNI PENTRU AI — ÎMBUNĂTĂȚIRE & REPARARE Aplicație NutriAI

Proiectul conține:
- `backend-nutritie-ai/` — server Express (Node.js) cu Gemini AI + Supabase
- `frontend-nutritie/` — aplicație Expo (React Native) cu TypeScript

Înainte de a scrie cod, citește docs-ul oficial Expo la https://docs.expo.dev/versions/v54.0.0/ deoarece proiectul folosește Expo SDK 54. Respectă versiunile exacte din `package.json`.

---

## 1. SECURITATE — CRITIC (rezolvă primul)

### 1.1 Token-uri JWT sunt logate în consolă
În `backend-nutritie-ai/server.js` (linia ~49-51), middleware-ul `requireAuth` face:
```js
console.log("Headers:", req.headers);
```
Asta scrie **Bearer token-ul** utilizatorului în loguri. Șterge complet logarea header-urilor. Păstrează doar `console.log("Method:", req.method)` sau nimic.

### 1.2 Chei hardcodate ca fallback în cod
În `backend-nutritie-ai/server.js` (linia ~38-40):
```js
const supabaseUrl = process.env.SUPABASE_URL || 'https://tfqcihbjgmscsseyzifs.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rGNnHj5u-...';
```
Șterge fallback-urile hardcodate. Dacă variabilele de mediu lipsesc, serverul trebuie să **crape la pornire** cu un mesaj clar:
```js
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Lipsesc variabilele de mediu SUPABASE_URL / SUPABASE_ANON_KEY");
  process.exit(1);
}
```
La fel pentru `GEMINI_API_KEY` (linia ~70) — adaugă validare: dacă lipsește, crash la start.

### 1.3 CORS complet deschis
`server.js` linia ~14: `origin: '*'`. Deși există `CORS_ORIGINS=*` în `.env`, variabila e ignorată. Citește din env și aplică:
```js
const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',');
app.use(cors({
  origin: corsOrigins.includes('*') ? true : corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```
Pe producție, setează `CORS_ORIGINS` la URL-urile exacte ale frontend-ului.

### 1.4 Fără rate limiting pe endpoint-urile AI
Adaugă `express-rate-limit` (instalează cu `npm install express-rate-limit`) pe rutele `/api/*` pentru a preveni abuzul și costuri Gemini exagerate:
```js
const rateLimit = require('express-rate-limit');
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30, // max 30 request-uri per fereastră per IP
  message: { eroare: "Prea multe cereri. Încearcă mai târziu." }
});
app.use('/api/', aiLimiter);
```

### 1.5 Verifică RLS pe Supabase
Aplicația presupune că tabela `mese` are Row Level Security activat cu politici care filtrează după `auth.uid() = user_id`. Dacă RLS nu e configurat, orice user autentificat poate citi/modifica mesele altor useri. **Nu poți rezolva asta din cod** — dar include în instrucțiuni: "Verifică în Supabase Dashboard → Authentication → Policies că tabela `mese` are RLS activat cu politici `SELECT/INSERT/UPDATE/DELETE USING (auth.uid() = user_id)`."

---

## 2. BUG-URI FUNCȚIONALE

### 2.1 Nume model Gemini posibil invalid
`server.js` linia ~71: `model: "gemini-flash-latest"`. Acest alias s-ar putea să nu rezolve corect. Verifică în docs Google AI cele mai recente nume valide (ex: `gemini-2.0-flash` sau `gemini-1.5-flash`). Dacă nu ești sigur, folosește un nume explicit și documentat. Testează că endpoint-urile AI funcționează după schimbare.

### 2.2 Componentă definită în interiorul render-ului (anti-pattern)
În `frontend-nutritie/app/calculator-ai.tsx`, componenta `SelectionRow` este definită **în interiorul** componentei `CalculatorAI` (linia ~70). Asta creează o componentă nouă la fiecare render → React remontează elementele → pierdere de performanță și posibil flicker. **Mută `SelectionRow` în afara componentei** (la nivel de modul) și dă-i tipuri TypeScript explicite în loc de `props: any`.

### 2.3 Mutare directă a obiectelor din state (camera.tsx)
În `frontend-nutritie/app/camera.tsx` (linia ~220-224), la editarea numelui:
```js
const nou = [...rezultat];
nou[index].nume = t;        // MUTĂ obiectul original
setRezultat(nou);
```
Shallow copy-ul array-ului nu copiază obiectele. Creează obiecte noi:
```js
const nou = rezultat.map((item, i) => i === index ? { ...item, nume: t } : item);
setRezultat(nou);
```

### 2.4 `profil.tsx` returnează `null` în timp ce session se încarcă
`profil.tsx` linia ~53: `if (!session) return null;` → ecran negru fără feedback. Afișează un `ActivityIndicator` sau un skeleton până când session e verificat.

### 2.5 `istoric.tsx` nu afișează loading inițial
`loading` pornește `true` dar nu există UI pentru asta — ecranul e gol până vine datele. Adaugă un indicator de loading (spinner centrat sau skeleton cards) când `loading === true`.

### 2.6 Erori Supabase ignorate
În `index.tsx` (linia ~33) și `chat.tsx` (linia ~84), răspunsul Supabase destructurat ignoră `error`:
```js
const { data } = await supabase.from('mese').select(...);
```
Capturează și tratează `error`:
```js
const { data, error } = await supabase.from('mese').select(...);
if (error) { console.error(error); return; }
```

### 2.7 `useFocusEffect` cu closure-uri stale
În `index.tsx:48`, `chat.tsx:98`, `istoric.tsx:50`:
```js
useFocusEffect(useCallback(() => { fetchData(); }, []));
```
`fetchData` e redefinit la fiecare render dar callback-ul captează prima instanță. Deși funcționează acum (pentru că `fetchData` nu depinde de state care se schimbă), e fragil. Mută definiția `fetchData` **în interiorul** `useCallback` sau adaugă-l ca dependență:
```js
useFocusEffect(useCallback(() => { /* tot codul fetchData aici */ }, [/* deps */]));
```

### 2.8 `keyboardDidHideListener` / `keyboardDidShowListener` — API depreciat
În `chat.tsx` (linia ~47-63), `Keyboard.addListener` returnează direct subscription. Pentru RN 0.81 e ok, dar păstrează consistență. Verifică că remove se face corect (da).

---

## 3. COD MORT & BOILERPLATE DE ȘTERS

### 3.1 `backend-nutritie-ai/utils/calculator.js` — NEFOLOSIT
Acest fișier NU e importat nicăieri în `server.js` (calculul profilului se face prin Gemini). Conține și valori default hardcodate personale (`greutate = 103, inaltime = 186.5, varsta = 21`). **Șterge fișierul** sau, dacă vrei calcul determinist fallback, integrează-l în `server.js` ca fallback când Gemini e indisponibil (mai bine decât așteptat).

### 3.2 `frontend-nutritie/app/modal.tsx` — boilerplate Expo nefolosit
E modal-ul default din template-ul Expo, în engleză ("This is a modal"), neconectat logic la app. **Șterge fișierul** și elimină `<Stack.Screen name="modal" ...>` din `app/_layout.tsx`.

### 3.3 Componente boilerplate neutilizate
În `frontend-nutritie/components/`: `external-link.tsx`, `haptic-tab.tsx`, `hello-wave.tsx`, `parallax-scroll-view.tsx`, `ui/` — toate din template-ul Expo. Verifică cu search dacă sunt importate; dacă nu, **șterge-le**. Păstrează doar `themed-text.tsx`/`themed-view.tsx` dacă ștergi `modal.tsx` (atunci pot fi șterse și ele).

### 3.4 `cod_complet_proiect.txt` (în root)
Un dump text al proiectului — clutter. **Șterge-l** din repo.

### 3.5 Dependențe neutilizate
- `expo-local-authentication` — în `package.json` dar neimportat. Elimin-o sau folosește-o (ex: biometric lock la app).
- Verifică și `react-native-worklets`, `expo-symbols`, `expo-haptics` dacă sunt folosite.

### 3.6 Variabile de mediu neutilizate
- `EXPO_PUBLIC_IS_EMULATOR=false` în frontend `.env` — nu e citit nicăieri în cod. Șterge-l.
- `HOST=0.0.0.0` în backend `.env` — `app.listen` hardcodează `'0.0.0.0'`, variabila e ignorată. Folosește `process.env.HOST || '0.0.0.0'`.

---

## 4. TYPESCRIPT — type safety

Proiectul are `"strict": true` în `tsconfig.json` dar folosește masiv `any`:
- `session` → `useState<any>(null)` peste tot
- `istoric` → `useState<any[]>([])`
- `rezultat` → `useState<any[] | null>(null)`
- `SelectionRow` → `props: any`

### Instrucțiuni:
1. Definește tipuri pentru sesiunea Supabase: folosește `Session` din `@supabase/supabase-js`:
   ```ts
   import type { Session } from '@supabase/supabase-js';
   const [session, setSession] = useState<Session | null>(null);
   ```
2. Definește un tip pentru `Masa` (meal):
   ```ts
   interface Masa {
     id: string;
     user_id: string;
     nume: string;
     calorii: number;
     proteine: number;
     grasimi: number;
     carbohidrati: number;
     created_at: string;
   }
   ```
3. Definește tip pentru rezultatul AI:
   ```ts
   interface AlimentAI {
     nume: string;
     estimare_grame: number;
     calorii_per_100g: number;
     proteine_per_100g: number;
     grasimi_per_100g: number;
     carbohidrati_per_100g: number;
   }
   ```
4. Dă tipuri explicite pentru props la `SelectionRow` și `BouncingDot`.

---

## 5. IMPORTURI NEUTILIZATE & LINT

Rulează `npx expo lint` și repară toate warning-urile. Probleme cunoscute:

- `index.tsx:11` — `const { width, height } = Dimensions.get('window')` — ambele neutilizate. Șterge linia și importul `Dimensions` dacă nu mai e folosit.
- `chat.tsx:35` — `width, height` neutilizate.
- `istoric.tsx:10` — `width, height` neutilizate.
- `auth.tsx:12` — `width, height` neutilizate.
- `profil.tsx:14` — `width` neutilizat.
- `camera.tsx:4` — `Animated as RNAnimated` importat dar neutilizat. Șterge-l.
- `calculator-ai.tsx:7` — `FadeIn` importat dar neutilizat.
- `calculator-ai.tsx:8` — `User, Ruler, Weight` importați dar neutilizate.

După reparare, rulează `npx expo lint` și `npx tsc --noEmit` ca să confirmi zero erori.

---

## 6. ARHITECTURĂ & CONSISTENȚĂ

### 6.1 Stiluri/ culori hardcodate peste tot
App-ul folosește o paletă consistentă (#090C0E fundal, #CCFF00 accent lime, #A855F7 mov, #00F0FF cyan, #6B7280 gri text) dar culorile sunt repetate ca string-uri în StyleSheet în fiecare fișier. `constants/theme.ts` conține o paletă **diferită** (light/dark default Expo) care nu e folosită.

**Recomandare:** Înlocuiește `constants/theme.ts` cu paleta reală a app-ului:
```ts
export const Colors = {
  background: '#090C0E',
  accent: '#CCFF00',
  accentSecondary: '#A855F7',
  accentTertiary: '#00F0FF',
  textPrimary: '#FFFFFF',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  danger: '#F87171',
  warning: '#FB923C',
};
```
Apoi înlocuiește string-urile hardcodate cu referințe la `Colors.*`.

### 6.2 `app.json` — `userInterfaceStyle: "automatic"`
App-ul e hardcodat dark theme, dar `userInterfaceStyle: "automatic"` permite light mode la nivel de sistem. Asta poate cauza mismatch-uri (ex: fundal alb la system bars pe dispozitive cu light mode). Schimbă în `"dark"`.

### 6.3 `_layout.tsx` folosește `DarkTheme` (react-navigation) cu fundal #151718
Dar app-ul folosește #090C0E. Suprascrie tema:
```ts
import { DarkTheme } from '@react-navigation/native';
const AppDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#090C0E' },
};
```

### 6.4 Stocarea țintelor doar în AsyncStorage (fragil)
`profil.tsx` și `calculator-ai.tsx` salvează `caloriiTinta`/`proteineTinta`/`greutate` DOAR în AsyncStorage. La reinstalare sau schimbare dispozitiv, datele se pierd. **Creează un tabel `profil` în Supabase** (sau folosește `user_metadata`) și sincronizează țintele acolo. La login, citește din Supabase și cache-uiește în AsyncStorage.

### 6.5 Logică duplicată de fetch date ziua-curentă
`index.tsx`, `chat.tsx`, `istoric.tsx` au fiecare câte o funcție `fetchData`/`incarcaIstoric` aproape identică care interoghează Supabase pentru mesele de azi. **Extrage un hook custom** `useMeseAzi()` în `hooks/` care returnează `{ mese, totalCalorii, totalProteine, loading, refresh }` și reutilizează-l în toate cele 3 ecrane.

### 6.6 Fără health check endpoint
Adaugă `app.get('/health', (req, res) => res.json({ status: 'ok' }))` în backend — util pentru monitorizare (mai ales pe Render.com unde e deployed).

---

## 7. ROBUSTEȘTE BACKEND

### 7.1 Validare input pe `/api/calculeaza-profil`
`server.js` verifică doar existența câmpurilor, nu și tipul/valabilitatea. Adaugă validare:
- `varsta`: număr întreg între 10 și 100
- `greutate`: număr între 30 și 300
- `inaltime`: număr între 100 și 250
- `sex`: doar 'Masculin' | 'Feminin'
- `activitate`: doar valorile din setul acceptat
- `obiectiv`: doar valorile din setul acceptat

Respinge cu 400 + mesaj clar dacă validarea pică.

### 7.2 Validare input pe `/api/chat`
Se trunchează la 500 char (bun), dar adaugă și sanitizare de bază (ex: strip caractere de control). Verifică că `mesaj` nu e gol după trim.

### 7.3 Error handling JSON parsing Gemini
Când Gemini returnează text invalid, codul face fallback regex (`text.match(...)`) dar al doilea `JSON.parse` poate arunca și el — nu e prins. Înfășoară într-un try/catch:
```js
try {
  parsed = JSON.parse(jsonMatch[0]);
} catch (e2) {
  return res.status(500).json({ eroare: "AI nu a returnat JSON valid." });
}
```

### 7.4 Timeout pentru cererile Gemini
Adaugă un timeout (ex: 30s) pe cererile Gemini ca să nu se blocheze request-ul indefinit. Folosește `AbortController` sau `Promise.race`.

---

## 8. UX & ACCESIBILITATE

### 8.1 Fără feedback haptic la acțiuni importante
App-ul are `expo-haptics` instalat. Adaugă feedback haptic (light impact) la: scanare mâncare, salvare masă, salvare profil, trimitere mesaj chat.

### 8.2 Fără loading skeleton pe ecranul principal
`index.tsx` afișează 0-uri până se încarcă datele. Arată un skeleton sau shimmer în loc de 0.

### 8.3 Chat-ul nu persistă istoricul
Mesajele din `chat.tsx` se pierd la schimbarea tab-ului (doar mesajul de welcome rămâne). Dacă se dorește persistență, salvează conversația în AsyncStorage sau Supabase. Dacă nu, documentează comportamentul.

### 8.4 Butonul "Anulează & Scanează din nou" nu oprește o cerere în curs
În `camera.tsx`, dacă AI procesează și userul apasă anularea, request-ul continuă. Nu e grav, dar ar putea afișa rezultatul după anulare.

---

## 9. TESTE

Nu există niciun test. Adaugă minim:
- **Backend**: teste unitare pentru `requireAuth` (token lipsă, invalid, valid) și validarea input-urilor. Folosește `jest` + `supertest`.
- **Frontend**: teste pentru hook-ul `useMeseAzi` (mock Supabase) și pentru calculele de macros din `camera.tsx`.

Schimbă în `backend-nutritie-ai/package.json`:
```json
"scripts": { "test": "jest" }
```

---

## 10. LISTĂ DE VERIFICARE FINALĂ

După toate modificările, AI-ul trebuie să confirme că:

- [ ] `npx tsc --noEmit` trece fără erori (frontend)
- [ ] `npx expo lint` trece fără warning-uri (frontend)
- [ ] `node server.js` pornește fără erori (backend)
- [ ] Niciun secret/cheie nu e hardcodat în cod (doar în `.env` gitignored)
- [ ] Nu se loghează header-ul Authorization nicăieri
- [ ] Toate `any`-urile au fost înlocuite cu tipuri explicite
- [ ] Importurile neutilizate au fost șterse
- [ ] Codul mort (calculator.js, modal.tsx, boilerplate components) a fost șters
- [ ] Rate limiting activ pe endpoint-urile AI
- [ ] Validare input pe toate rutele backend
- [ ] RLS confirmat activ pe tabela `mese` în Supabase

---

## CONVENȚII DE COD

- Limbaj: comentariile și textele UI în **română** (consistenț cu restul app-ului).
- NU adăuga comentarii explicative în cod decât dacă sunt absolut necesare.
- Păstrează stilul existent: StyleSheet.create, BlurView + LinearGradient pentru cards, animații `react-native-reanimated`.
- Nu schimba versiunile de dependențe decât dacă e necesar pentru un fix.
- La fiecare modificare, explică ce ai schimbat și de ce.
