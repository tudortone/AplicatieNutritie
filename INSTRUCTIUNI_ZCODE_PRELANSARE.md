# Instructiuni pentru agentul de cod (Z Code / DeepSeek)

> Document generat in urma auditului de pregatire pentru productie (august 2026).
> Contine **doar ce a mai ramas de facut**. Ce a fost deja rezolvat este listat la final,
> ca sa nu se refaca aceeasi munca.

---

## 0. Reguli generale (citeste inainte de orice task)

1. **Un task = un commit = un PR.** Nu amesteca taskuri diferite in acelasi PR.
2. **Nu rescrie fisiere intregi** decat daca taskul o cere explicit. Foloseste modificari punctuale.
3. **Nu sterge functionalitate existenta** ca sa "simplifici". Daca ceva pare mort, marcheaza-l in PR si intreaba.
4. **Nu introduce dependinte noi** fara sa scrii in PR de ce sunt necesare si cat adauga la bundle.
5. **Limba**: comentarii si mesaje catre utilizator in romana; nume de variabile/functii in romana doar unde codul deja face asta (consistenta cu fisierul curent).
6. **Fara `console.*` in cod nou.** Foloseste `import log from '../lib/logger'` (deja exista).
7. **Fara `fetch` direct catre backend in cod nou.** Foloseste `apiFetch` / `apiFetchJson` din `lib/apiFetch.ts` (deja exista).
8. Dupa fiecare task ruleaza:
   ```bash
   cd frontend-nutritie && npx tsc --noEmit && npx eslint .
   cd ../backend-nutritie-ai && npm test
   ```
   PR-ul nu se deschide daca vreuna din comenzi esueaza.
9. In descrierea PR-ului scrie: **ce fisiere ai atins**, **ce ai testat manual**, **ce ar putea sa se strice**.

---

## TASK 1 — [CRITIC] Integreaza `utils/security.js` in `server.js`

**Fisier:** `backend-nutritie-ai/server.js`
**Referinta:** `backend-nutritie-ai/SECURITATE-PRELANSARE.md`, sectiunea 2

Modulul `utils/security.js` exista deja, dar **nu este folosit nicaieri**. Trebuie montat.

### De facut
1. Inlocuieste configurarea actuala de `helmet` si `cors` cu:
   ```js
   const {
     buildCorsOptions, helmetOptions, limiters,
     assertOwnership, serviceRoleGuard, errorHandler,
   } = require('./utils/security');

   app.use(helmet(helmetOptions));
   app.use(cors(buildCorsOptions()));
   app.use(express.json({ limit: '1mb' }));
   app.use(sanitizeRequest);
   ```
2. Monteaza limitatoarele **dupa** middleware-ul de autentificare (au nevoie de `req.user.id`):
   ```js
   app.use('/api/', limiters.general);
   app.use('/api/chat', limiters.ai);
   app.use('/api/calculeaza-profil', limiters.ai);
   app.use('/api/analizeaza-mancare-structurat', limiters.upload);
   ```
3. Adauga `app.use(errorHandler);` ca **ultim** middleware, dupa toate rutele.
4. Adauga limita de fisier la `multer`: `limits: { fileSize: 8 * 1024 * 1024 }` si mesaj clar la depasire.

### Criterii de acceptare
- [ ] `npm test` trece (toate testele existente raman verzi)
- [ ] Cu `NODE_ENV=production` si `CORS_ORIGINS=*` serverul **refuza sa porneasca** cu mesaj clar
- [ ] Cu `NODE_ENV=development` serverul porneste normal si accepta cereri din Expo Go
- [ ] O eroare 500 nu mai returneaza stack trace cand `NODE_ENV=production`

---

## TASK 2 — [CRITIC] Audit rute care folosesc `SUPABASE_SERVICE_ROLE_KEY`

**Fisier:** `backend-nutritie-ai/server.js`

Clientul service-role **ocoleste complet RLS**. Orice ruta care il foloseste si accepta un `user_id` din request este o vulnerabilitate de tip IDOR (un utilizator poate citi/sterge datele altuia).

### De facut
1. Cauta toate locurile unde se creeaza sau se foloseste clientul cu `SUPABASE_SERVICE_ROLE_KEY`.
2. Pentru **fiecare** astfel de ruta:
   - monteaza `serviceRoleGuard` dupa `requireAuth`;
   - inlocuieste orice `user_id` primit din `req.body` / `req.params` / `req.query` cu `req.user.id`;
   - adauga `.eq('user_id', req.user.id)` la fiecare `select` / `update` / `delete`;
   - inainte de `update`/`delete` pe o resursa individuala, citeste resursa si apeleaza `assertOwnership(req, resursa.user_id)`.
3. Scrie in PR un tabel: `ruta | foloseste service-role? | filtreaza dupa req.user.id? | are assertOwnership?`

### Criterii de acceptare
- [ ] Niciun `user_id` nu mai este citit din request — doar din token
- [ ] Test nou in `tests/server.test.js`: userul A primeste **403** cand incearca sa stearga o resursa a userului B
- [ ] Toate testele existente raman verzi

---

## TASK 3 — [CRITIC] Verifica si activeaza RLS in Supabase

**Fisiere:** `supabase_rls_policies.sql`, `supabase_migration_fix.sql`

### De facut
1. Ruleaza query-ul de diagnostic:
   ```sql
   select schemaname, tablename, rowsecurity
   from pg_tables where schemaname = 'public'
   order by rowsecurity, tablename;
   ```
2. Pentru fiecare tabel cu `rowsecurity = false`, adauga in `supabase_rls_policies.sql`:
   ```sql
   alter table public.<tabel> enable row level security;

   create policy "<tabel>_select_own" on public.<tabel>
     for select using (auth.uid() = user_id);
   create policy "<tabel>_insert_own" on public.<tabel>
     for insert with check (auth.uid() = user_id);
   create policy "<tabel>_update_own" on public.<tabel>
     for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "<tabel>_delete_own" on public.<tabel>
     for delete using (auth.uid() = user_id);
   ```
3. Verifica si bucket-urile de Storage (avatare, poze mese): politici per user, **nu publice**.
4. Scriptul trebuie sa fie **idempotent** (`drop policy if exists` inainte de `create policy`).

### Criterii de acceptare
- [ ] Toate tabelele din `public` au `rowsecurity = true`
- [ ] Scriptul poate fi rulat de doua ori la rand fara erori
- [ ] Documentat in PR ce tabele au fost gasite fara RLS

---

## TASK 4 — [CRITIC] Sentry (crash reporting)

**Fisiere:** `frontend-nutritie/app/_layout.tsx`, `frontend-nutritie/lib/logger.ts`, `package.json`, `app.json`

Infrastructura exista deja: `logger.ts` are `setCrashReporter()`. Lipseste doar conectarea.

### De facut
1. `npx expo install @sentry/react-native`
2. In `app/_layout.tsx`, **inainte** de orice alt import de aplicatie:
   ```ts
   import * as Sentry from '@sentry/react-native';
   import { setCrashReporter } from '../lib/logger';

   Sentry.init({
     dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
     enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
     tracesSampleRate: 0.2,
     sendDefaultPii: false, // NU trimite email / IP / date de sanatate
   });

   setCrashReporter({
     captureException: (e, ctx) => Sentry.captureException(e, { extra: ctx }),
     captureMessage: (m, ctx) => Sentry.captureMessage(m, { extra: ctx }),
   });
   ```
3. Adauga `EXPO_PUBLIC_SENTRY_DSN=` in `frontend-nutritie/.env.example`.
4. **Important:** aplicatia trebuie sa functioneze normal si **fara** DSN setat (dezvoltare).

### Criterii de acceptare
- [ ] Fara DSN, aplicatia porneste si nu arunca erori
- [ ] Cu DSN, o eroare aruncata intentionat apare in Sentry
- [ ] Niciun email, token sau continut de mesaj nu ajunge in payload-ul Sentry

---

## TASK 5 — [CRITIC] Migreaza toate apelurile de retea pe `apiFetch`

**Fisiere tinta:** `app/(tabs)/chat.tsx`, `app/(tabs)/index.tsx`, `app/calculator-ai.tsx`, `app/camera.tsx`, `app/scanner-barcode.tsx`, `lib/openfoodfacts.ts`, orice alt loc cu `fetch(`

### De facut
1. Cauta in `frontend-nutritie/` toate aparitiile de `fetch(` si `API_URL`.
2. Inlocuieste cu `apiFetch` / `apiFetchJson` din `lib/apiFetch.ts`. Nu mai construi manual header-ul `Authorization` — se face automat.
3. Trateaza erorile prin `ApiError`:
   ```ts
   try {
     const date = await apiFetchJson<Raspuns>('/api/chat', {
       method: 'POST',
       body: JSON.stringify({ mesaj }),
     });
   } catch (e) {
     const err = e as ApiError;
     afiseazaBanner(err.message); // mesaj deja prietenos, in romana
   } finally {
     setLoading(false);
   }
   ```
4. **Fiecare** apel trebuie sa aiba `finally { setLoading(false) }` — altfel spinnerul ramane blocat la eroare.
5. Pentru OpenFoodFacts (API extern, nu backend-ul nostru) foloseste `apiFetch` cu `auth: false`.

### Criterii de acceptare
- [ ] Zero `fetch(` direct catre `API_URL` in `frontend-nutritie/`
- [ ] Cu backend-ul oprit, fiecare ecran afiseaza un mesaj de eroare clar si iese din loading
- [ ] Cu modul avion activ, apare bannerul offline si niciun ecran nu ramane blocat

---

## TASK 6 — [CRITIC] Elimina `console.*` din tot codul

**Fisiere:** tot `frontend-nutritie/` (fara `lib/logger.ts`)

### De facut
1. Inlocuieste `console.log` → `log.debug`, `console.warn` → `log.warn`, `console.error` → `log.error`.
2. Sterge complet log-urile de debug evidente (`console.log('aici')`, `console.log(raspuns)` cu date de utilizator).
3. Adauga regula de lint in `eslint.config.js`:
   ```js
   rules: { 'no-console': ['error', { allow: [] }] }
   ```
   cu exceptie pentru `lib/logger.ts`.

### Criterii de acceptare
- [ ] `npx eslint .` trece fara erori `no-console`
- [ ] Niciun log nu contine email, token, parola sau continut de chat

---

## TASK 7 — [CRITIC] Validari inline in formulare

**Fisiere:** `app/(tabs)/profil.tsx`, `app/onboarding.tsx`, `app/auth.tsx`, `app/adauga-manual.tsx`, `components/AddWeightModal.tsx`

Modulul `lib/validation.ts` exista deja. Trebuie folosit.

### De facut
1. Pentru fiecare formular, tine o stare `erori: Record<string, string>`.
2. Valideaza **la `onBlur`** si **inainte de submit** (nu la fiecare tasta — e agresiv).
3. Sub fiecare input cu eroare afiseaza mesajul cu `colors.danger`, iar bordura inputului devine `colors.danger`.
4. Butonul de salvare este `disabled` cat timp exista erori.
5. In `profil.tsx` foloseste `valideazaFormular` pentru cele 6 campuri numerice si `verificaCoerentaMacro` ca **avertisment** (galben, nu blocheaza salvarea).
6. In `auth.tsx` foloseste `valideazaEmail` si `valideazaParola`.
7. Corecteaza mesajul inselator "Salvat local" — se afiseaza doar cand chiar a fost o eroare de retea, nu la o eroare de validare de la server.

### Criterii de acceptare
- [ ] Nu se poate salva greutate `0`, `-5` sau `99999`
- [ ] Mesajul de eroare apare **sub campul vinovat**, nu doar ca banner global
- [ ] Se accepta si `72,5` (virgula), nu doar `72.5`

---

## TASK 8 — [CRITIC] Avertizare cand sesiunea nu poate fi criptata

**Fisiere:** `frontend-nutritie/app/_layout.tsx`, `frontend-nutritie/supabase.ts` (deja pregatit)

### De facut
In `RootNavigator`, la montare:
```ts
useEffect(() => {
  onInsecureStorageFallback(() => {
    afiseazaBanner({
      tip: 'avertisment',
      mesaj: 'Dispozitivul nu suporta stocare criptata. Recomandam sa activezi blocarea ecranului.',
    });
  });
}, []);
```
Foloseste `NotificationBannerContext`-ul existent. Banner-ul se afiseaza o singura data pe sesiune.

### Criterii de acceptare
- [ ] Pe un device normal nu apare niciun banner
- [ ] Simuland esecul SecureStore, bannerul apare o singura data

---

## TASK 9 — [IMPORTANT] Elimina `three` / `@react-three/*` daca nu sunt folosite

**Fisier:** `frontend-nutritie/package.json`

### De facut
1. Cauta in tot `frontend-nutritie/` importuri de `three`, `@react-three/fiber`, `@react-three/drei`, `expo-gl`.
2. **Daca nu exista niciun import**: dezinstaleaza-le si sterge din `package.json`.
3. **Daca exista** un singur ecran care le foloseste: incarca-l cu `React.lazy` + `Suspense`, ca sa nu intre in bundle-ul initial.
4. Raporteaza in PR dimensiunea bundle-ului inainte si dupa (`npx expo export` + marimea folderului `dist`).

### Criterii de acceptare
- [ ] Aplicatia porneste si toate ecranele functioneaza
- [ ] Reducere de dimensiune documentata in PR

---

## TASK 10 — [IMPORTANT] `ScreenErrorBoundary` pe fiecare tab

**Fisiere:** toate ecranele din `app/(tabs)/`

Infaseoara continutul fiecarui ecran:
```tsx
<ScreenErrorBoundary screenName="Jurnal">
  {/* continutul existent */}
</ScreenErrorBoundary>
```
Nu modifica logica din interior — doar adauga wrapper-ul.

### Criterii de acceptare
- [ ] O eroare aruncata intentionat intr-un tab lasa restul aplicatiei functional
- [ ] Tab bar-ul ramane vizibil si navigabil

---

## TASK 11 — [IMPORTANT] Lazy-load pentru constantele mari

**Fisiere:** `constants/foodPresets.ts` (49 KB), `constants/new_exercises_v3.ts` (48 KB), `constants/exercitii.ts` (32 KB), `constants/exercises.json`

### De facut
1. Identifica ce este folosit efectiv. Sterge duplicatele moarte (`new_exercises.ts`, `_v2`, `exercises.json` daca sunt inlocuite de `_v3`).
2. Transforma importurile statice in `await import(...)` apelat la primul acces, cu rezultat memoizat.
3. Nu incarca aceste liste in `_layout.tsx` sau in vreun context global.

### Criterii de acceptare
- [ ] Timpul pana la primul ecran scade masurabil (raporteaza inainte/dupa)
- [ ] Cautarea de alimente si lista de exercitii functioneaza identic

---

## TASK 12 — [IMPORTANT] Performanta ecranelor mari

**Fisiere:** `app/(tabs)/index.tsx` (42 KB), `antrenamente.tsx` (39 KB), `profil.tsx` (40 KB), `components/AddMealBottomSheet.tsx` (45 KB)

### De facut
1. Extrage sub-componentele in fisiere separate (`components/home/...` etc.).
2. `React.memo` pe componentele de lista; `useCallback` pe handlerele pasate ca props; `useMemo` pe calculele grele.
3. Inlocuieste `.map()` peste liste lungi cu `FlashList` (`@shopify/flash-list`), cu `keyExtractor` stabil.
4. **Nu schimba nimic vizual.** Refactorizare pura.

### Criterii de acceptare
- [ ] Zero diferente vizuale (comparatie cu screenshot inainte/dupa)
- [ ] Niciun fisier nou peste 400 de linii

---

## TASK 13 — [IMPORTANT] Empty states si skeletons

**Fisiere:** `app/(tabs)/istoric.tsx`, `statistici.tsx`, `jurnal-antrenamente.tsx`, `cosmetice.tsx`

### De facut
1. Creeaza `components/ui/EmptyState.tsx` reutilizabil (icon + titlu + descriere + buton optional de actiune).
2. Foloseste-l pe fiecare ecran care poate fi gol pentru un utilizator nou. Mesaje incurajatoare, nu "Nicio inregistrare".
3. Foloseste `SkeletonLoader` existent pe durata **fiecarui** apel async (analiza poza, barcode, chat AI, statistici).
4. Foloseste `ThemeBackdrop` pentru consistenta vizuala (vezi PR-ul de teme).

### Criterii de acceptare
- [ ] Un cont nou nu vede niciun ecran alb sau gol fara explicatie
- [ ] Fiecare apel de retea are un skeleton sau spinner vizibil

---

## TASK 14 — [IMPORTANT] Stergere cont + politica de confidentialitate

**Fisiere:** `app/(tabs)/profil.tsx`, `lib/userDataCleanup.ts`, `backend-nutritie-ai/server.js`

Obligatoriu pentru App Store si Google Play, cu atat mai mult pentru date de sanatate.

### De facut
1. Ruta backend `DELETE /api/cont` care sterge toate datele userului (mese, antrenamente, greutati, avatar din Storage) si apoi contul de auth.
2. In profil: sectiune "Zona periculoasa" cu buton de stergere cont, confirmare in doi pasi (dialog + tastarea cuvantului `STERGE`).
3. Dupa stergere: curata AsyncStorage + SecureStore si redirectioneaza la `/auth`.
4. Link catre politica de confidentialitate in profil si in onboarding.

### Criterii de acceptare
- [ ] Dupa stergere nu mai exista niciun rand cu `user_id`-ul respectiv in baza de date
- [ ] Nu se poate sterge accidental (dublu pas de confirmare)

---

## TASK 15 — [SECUNDAR] Restul

- **Logger backend**: `pino` + `request-id` in `server.js`; loguri fara token-uri/email-uri.
- **`Dimensions.get` la import** in `constants/theme.ts` → `useWindowDimensions` (fix layout la rotire/tableta).
- **`expo-image`** in loc de `Image` din RN pentru avatar si poze de mese, cu `cachePolicy="memory-disk"`.
- **Refactorizare `server.js`** (74 KB) in module pe rute: `routes/chat.js`, `routes/mese.js`, `routes/profil.js`.
- **Accesibilitate**: `accessibilityLabel` + `accessibilityRole` pe toate butoanele icon-only.
- **Teste E2E** (Maestro): login → onboarding → adaugare masa → vizualizare statistici.

---

## Ordinea recomandata de executie

```
TASK 1 → 2 → 3      (securitate backend, blocheaza lansarea)
TASK 4 → 6          (observabilitate: fara ele lansezi orb)
TASK 5 → 8 → 7       (stabilitate retea + UX formulare)
TASK 10 → 9         (izolare erori + dimensiune bundle)
TASK 14             (obligatoriu pentru store-uri)
TASK 11 → 12 → 13    (performanta si polish)
TASK 15             (dupa lansare)
```

---

## Ce a fost DEJA rezolvat (nu reface)

| PR | Continut |
|---|---|
| #5 | `lib/logger.ts`, `lib/apiFetch.ts` (timeout + retry + `ApiError`), fix race condition SecureStore, `isSecureStorageAvailable()` / `onInsecureStorageFallback()` |
| #6 | `components/ScreenErrorBoundary.tsx`, `GlobalErrorBoundary` pe `log.error`, `lib/validation.ts` (limite, parsare virgula, coerenta macro) |
| #7 | `utils/security.js` (CORS strict, `serviceRoleGuard`, `assertOwnership`, rate limiting pe niveluri, `errorHandler`), `sanitizeRequest` extins pe `req.params`, `SECURITATE-PRELANSARE.md` |
| #4 | Teme aplicate global cu figuri desenate custom, efecte vizuale mai subtile, avatar editabil din profil |

**Atentie:** modulele din PR #5, #6 si #7 sunt create dar **inca nu sunt folosite peste tot**. De asta exista TASK 1, 5, 6, 7, 8 si 10 — ele conecteaza infrastructura deja scrisa la ecrane si rute.
