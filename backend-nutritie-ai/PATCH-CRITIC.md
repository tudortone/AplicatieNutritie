# Remediere probleme critice — jurnal al remedierilor aplicate

> **STATUS: INTEGRAT (2026-08).** Toate remedierile C1–C8 descrise mai jos sunt aplicate
> în `server.js` și în modulele din `utils/`, acum pe `main`. Acest fișier a fost inițial
> un ghid de integrare scris „înainte de aplicare"; îl păstrăm ca documentație a CE și
> DE CE a fost schimbat. Codul curent este sursa de adevăr, iar pașii de mai jos
> documentează modificările deja integrate.

Modulele din `utils/` conțin logica remediată, integrată în `server.js`. Fiecare
corectură este izolată într-un modul dedicat, verificabil la review.

La integrare, ordinea a contat: **migrările SQL s-au rulat înaintea deploy-ului de cod.**

---

## Pasul 0 — Migrări SQL (Supabase SQL Editor)

```sql
-- === C4: maparea Clerk -> Supabase ===
-- Fara ea, un token Clerk scria `user_2abc...` intr-o coloana uuid.
create table if not exists public.clerk_user_map (
  clerk_user_id   text primary key,
  supabase_user_id uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists clerk_user_map_supabase_idx
  on public.clerk_user_map (supabase_user_id);

alter table public.clerk_user_map enable row level security;
-- Intentionat fara politici: accesul se face exclusiv prin service_role.


-- === C2 + C3: igiena cache-ului de coduri de bare ===
alter table public.barcode_cache
  add column if not exists is_system boolean not null default false;

-- Intrarile importate din surse externe devin intangibile.
update public.barcode_cache
   set is_system = true
 where source in ('openfoodfacts', 'off', 'estimare_ai');

-- IMPORTANT: estimarile AI deja salvate sunt valori inventate de model,
-- servite pana acum tuturor utilizatorilor. Nu au ce cauta in cache-ul global.
delete from public.barcode_cache where source = 'estimare_ai';


-- === C2: estimarile AI, de acum inainte, per utilizator ===
create table if not exists public.barcode_estimari_utilizator (
  user_id      uuid not null references auth.users(id) on delete cascade,
  code         text not null,
  name         text,
  brand        text,
  quantity     text,
  kcal_100g    numeric,
  protein_100g numeric,
  carbs_100g   numeric,
  fat_100g     numeric,
  updated_at   timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.barcode_estimari_utilizator enable row level security;

drop policy if exists "estimari_proprii" on public.barcode_estimari_utilizator;
create policy "estimari_proprii"
  on public.barcode_estimari_utilizator
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Pasul 1 — C1: limitarea de trafic

### Șterge din `server.js`

Funcția `jwtSubject` în întregime, plus `ipFallbackKey`, `rateLimitKey`,
`generalLimiter`, `statusLimiter`, `aiRateLimiter` și middleware-ul:

```js
// DE STERS
app.use('/api/', (req, res, next) => {
  if (req.path === '/ai-status') return statusLimiter(req, res, next);
  return generalLimiter(req, res, next);
});
```

Motivul: `jwtSubject` decodează payload-ul JWT **fără a verifica semnătura** și
folosește `sub` drept cheie de limitare, într-un middleware montat înaintea lui
`requireAuth`. `req.user` este acolo mereu `undefined`, deci oricine schimbă `sub`
la fiecare cerere primește o fereastră nouă de 100 de cereri, la infinit.

### Adaugă

```js
const { creeazaLimitatoare } = require('./utils/rateLimit');
const { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter } =
  creeazaLimitatoare();

// 1. Plasa pe IP, inaintea autentificarii.
app.use('/api/', (req, res, next) => {
  if (req.path === '/ai-status') return statusLimiter(req, res, next);
  return preAuthLimiter(req, res, next);
});
```

### Apoi, pe fiecare rută autentificată

`generalLimiter` se montează **după** `requireAuth`, nu înainte:

```js
app.post('/api/mese',                    requireAuth, generalLimiter, handlerMese);
app.put('/api/mese/:id',                 requireAuth, generalLimiter, ...);
app.delete('/api/mese/:id',              requireAuth, generalLimiter, ...);
app.post('/api/salveaza-produs-barcode', requireAuth, generalLimiter, ...);
app.get('/api/produs-barcode/:code',     requireAuth, generalLimiter, ...);
app.get('/api/imagekit-auth',            requireAuth, generalLimiter, ...);
app.post('/api/calculeaza-profil',       requireAuth, generalLimiter, ...);

// Rutele AI: inlocuieste aiRateLimiter cu aiLimiter, tot dupa requireAuth.
app.post('/api/analiza-foto',            requireAuth, aiLimiter, upload.single('imagine'), handleAnalizaFoto);
```

---

## Pasul 2 — C6: cache-ul de token-uri

### Șterge

`const tokenCache = new Map();`, `MAX_TOKEN_CACHE_ENTRIES`, blocul de evacuare din
ramura Supabase și `setInterval` de curățare.

### Adaugă

```js
const { TokenCache } = require('./utils/tokenCache');
const tokenCache = new TokenCache({ maxEntries: 5000, ttlMs: 60 * 1000 });
tokenCache.startSweeper();
```

În `requireAuth`, înlocuiește citirea manuală:

```js
// Înainte
const cached = tokenCache.get(tokenKey);
if (cached && Date.now() < cached.expiresAt) { req.user = cached.user; return next(); }

// După — expirarea e tratată în interiorul cache-ului
const utilizatorCache = tokenCache.get(tokenKey);
if (utilizatorCache) { req.user = utilizatorCache; return next(); }
```

Și scrierea, **pe ambele ramuri** (Supabase și Clerk):

```js
tokenCache.set(tokenKey, utilizator);
```

Plafonul se aplică acum în `set()`, deci ramura Clerk nu îl mai poate ocoli.

---

## Pasul 3 — C4: identitatea

Înlocuiește tot corpul lui `requireAuth` dintre extragerea token-ului și `next()`:

```js
const { rezolvaIdentitate, EroareIdentitate } = require('./utils/identitate');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ eroare: 'Token de autentificare lipsa.' });
  }
  const token = authHeader.slice(7);
  const tokenKey = hashToken(token);

  const utilizatorCache = tokenCache.get(tokenKey);
  if (utilizatorCache) { req.user = utilizatorCache; return next(); }

  try {
    const utilizator = await rezolvaIdentitate({
      token,
      supabase,
      supabaseAdmin,
      clerkSecretKey: process.env.CLERK_SECRET_KEY,
    });
    tokenCache.set(tokenKey, utilizator);
    req.user = utilizator;
    return next();
  } catch (err) {
    if (err instanceof EroareIdentitate) {
      return res.status(err.status).json({ eroare: err.message, cod: err.cod });
    }
    console.error('[Auth] Eroare neasteptata:', err);
    return res.status(503).json({ eroare: 'Serviciul de autentificare este indisponibil.' });
  }
}
```

`req.user.id` este de acum **garantat un UUID Supabase**, indiferent de furnizor.
Un token Clerk fără mapare primește 409 cu codul `CLERK_NEMAPAT` — fail-closed,
în loc să scrie o identitate paralelă în `mese`.

> **Actualizat:** fluxul care populează `clerk_user_map` este acum implementat în
> `utils/identitate.js` (upsert pe mapare la logon Clerk). Un token Clerk nemapat
> răspunde în continuare 409 (fail-closed), iar fără `CLERK_SECRET_KEY` setată
> calea Clerk nici nu se activează.

---

## Pasul 4 — C2, C3, C7: codurile de bare

### C7 — URL-ul OpenFoodFacts

**Verifică întâi în editor** linia din `/api/produs-barcode/:code`. Dacă arată așa:

```js
const fetchPromise = fetch(`{{https://world.openfoodfacts.org/api/v2/product/${code}}}.json`, { ... });
```

…atunci STRAT 2 eșuează la fiecare cerere. Înlocuiește cu:

```js
const { construiesteUrlOpenFoodFacts } = require('./utils/barcode');
const fetchPromise = fetch(construiesteUrlOpenFoodFacts(code), {
  headers: { 'User-Agent': 'NutriAI - React Native App - Contact: tudortone' },
});
```

Dacă linia era deja corectă în fișier, folosește oricum helper-ul: validează codul
înainte de interpolare și nu mai poate fi corupt la copiere.

### C2 — estimarea AI nu mai poluează cache-ul global

În STRAT 3, înlocuiește `upsert` în `barcode_cache` cu:

```js
await salveazaEstimareUtilizator(supabaseAdmin, {
  userId: req.user.id, cod: code, produs,
});
return res.json({ ...produs, sursa: 'estimare_ai', estimat: true });
```

Și în STRAT 1, propagă proveniența reală în loc de `source: 'cache'`:

```js
const dinGlobal = await citesteDinCacheGlobal(supabaseAdmin, code);
if (dinGlobal) return res.json({ ...dinGlobal.produs, sursa: dinGlobal.sursa, estimat: false });

const alUtilizatorului = await citesteEstimareUtilizator(supabaseAdmin, { userId: req.user.id, cod: code });
if (alUtilizatorului) return res.json({ ...alUtilizatorului.produs, sursa: 'estimare_ai', estimat: true });
```

> **Actualizat:** `scanner-barcode.tsx` afișează acum un avertisment vizibil când
> `estimat === true` (sau `sursa === 'estimare_ai'`), marcând valorile generate de
> model ca estimări, nu ca date măsurate.

### C3 — dreptul de scriere

În `/api/salveaza-produs-barcode`, înlocuiește verificarea existentă:

```js
// Înainte — garda se activa DOAR daca `created_by_user` era populat,
// iar intrarile OpenFoodFacts / AI nu il populau niciodata.
if (ext && ext.created_by_user && ext.created_by_user !== req.user.id) { ... 409 }

// După
const drept = await verificaDreptDeScriere(supabaseAdmin, { cod: code, userId: req.user.id });
if (!drept.permis) return res.status(drept.status).json({ eroare: drept.motiv });
await salveazaProdusManual(supabaseAdmin, { cod: code, userId: req.user.id, valori });
```

---

## Verificare după integrare

```bash
cd backend-nutritie-ai && node -e "require('./server.js')" && npm test
cd ../frontend-nutritie && npx tsc --noEmit
```

Teste manuale minime:

1. **C1** — 51 de cereri pe `/api/mese` cu un `Authorization: Bearer aaa.<payload cu sub aleator>.bbb` diferit de fiecare dată. Trebuie să se oprească la 30 (limita pe IP), nu să treacă toate.
2. **C3** — utilizatorul A salvează manual codul X; utilizatorul B încearcă același cod → 409. B încearcă un cod existent din OpenFoodFacts → 409.
3. **C4** — token Clerk nemapat → 409 `CLERK_NEMAPAT`, nu 500 și nicio scriere în `mese`.
4. **C5** — login, kill la aplicație, repornire → sesiunea persistă. Repetă pe un emulator Android fără blocare de ecran (calea de fallback).
