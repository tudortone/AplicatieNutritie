# Backend NutriAI

Server **Node.js (Express 5)** pentru aplicația NutriAI: analiză AI de mâncare (foto/text), chat nutrițional, coduri de bare, jurnal de mese și rute GDPR. Persistență în **Supabase (Postgres + RLS)**, upload imagini prin **ImageKit**, analiză în fundal prin **Trigger.dev**.

Referința completă a API-ului (OpenAPI 3): [`contracts/openapi.yaml`](../contracts/openapi.yaml). Instrucțiunile de proiect: [`INSTRUCTIUNI_AI.md`](../INSTRUCTIUNI_AI.md).

---

## 1. Cerințe

- **Node.js 22.x** (aceeași versiune majoră ca frontend-ul și profilul EAS)
- **npm**
- Un proiect **Supabase** (URL + chei). Fără el serverul nu pornește.

---

## 2. Pornire locală

```bash
# 1. Intră în folder
cd backend-nutritie-ai

# 2. Instalează dependențele
npm install

# 3. Creează fișierul de configurare din șablon
cp .env.example .env

# 4. Completează cel puțin cele 3 variabile OBLIGATORII în .env:
#    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 5. Pornește serverul
npm start
```

Serverul răspunde pe `http://localhost:3000` (sau `PORT`/`HOST` din `.env`). Verifică rapid:

```bash
curl http://localhost:3000/health
# → { "status": "ok", "healthy": true, ... }
```

> **Important:** `config/env.js` validează variabilele la pornire (fail-fast). Cele trei valori Supabase sunt obligatorii în orice runtime. În producție sunt obligatorii și serviciile de securitate/plăți/observabilitate enumerate mai jos; URL-urile locale, wildcard-ul CORS, cheile de test și placeholder-ele sunt respinse.

---

## 3. Variabile de mediu

Șablonul complet și comentat: `.env.example`. Rezumat:

| Variabilă | Obligatorie? | Scop |
|-----------|--------------|------|
| `SUPABASE_URL` | **Da** | URL-ul proiectului Supabase |
| `SUPABASE_ANON_KEY` | **Da** | Cheie publică Supabase (JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Da** | Cheie admin Supabase (doar tabele backend-only) |
| `GEMINI_API_KEY` (+`_2/_3/_4`) | **În producție: cheia principală da** | Analiză vizuală / fallback text Gemini |
| `GROQ_API_KEY` | Nu | Chat rapid (`/api/chat`, `estimeaza-mancare-text`, fallback) |
| `OPENAI_API_KEY` | Nu | Fallback vision |
| `OPENROUTER_API_KEY` | Nu | Fallback vision (mod `auto`) |
| `CORS_ORIGINS` | **În producție: da** | Origini HTTPS explicite, fără wildcard |
| `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SIGNING_SECRET` | **În producție: da** | Cheie `sk_live_` și semnătură webhook `whsec_` |
| `SENTRY_DSN` / `SENTRY_PII_SALT` | **În producție: da** | Monitorizare și pseudonimizare fără PII brut |
| `TRIGGER_SECRET_KEY` | **În producție: da** | Cheie `tr_prod_` pentru analiza în fundal |
| `IMAGEKIT_PUBLIC_KEY` / `PRIVATE_KEY` / `URL_ENDPOINT` | **În producție: da** | Upload imagini (`/api/imagekit-auth`) |
| `REDIS_URL` | **În producție: da** | `rediss://`, rate-limit/cote/idempotency partajate |
| `GOOGLE_PLAY_PACKAGE_NAME` / `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS` | **În producție: da** | Package-ul fix și allowlist-ul produselor Google Play |
| `GOOGLE_APPLICATION_CREDENTIALS` | **În producție: da** | Calea secretă către credentialele ADC folosite de Google Play Developer API |
| `GOOGLE_PLAY_PUBSUB_AUDIENCE` / `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL` | **În producție: da** | Verificarea OIDC strictă pentru notificările RTDN |
| `GDPR_WORKER_ACTIV` | **În producție: `1`** | Reia ștergerile externe incomplete |
| `AI_MAX_CONCURENTA` / `AI_MAX_COADA` | Nu | Plafon de concurență AI (protecție heap) |
| `KEEP_ALIVE_URL` / `KEEP_ALIVE_INTERVAL_MINUTES` | Nu | Anti-sleep pe Render/Railway |

---

## 4. Rularea testelor

```bash
npm test                           # Suita completă Jest
npm run lint                       # ESLint
npm run test:integration           # RLS direct pe Postgres real
npm run test:integration:postgrest # JWT → PostgREST → RLS end-to-end
```

- `tests/server.test.js` este **contractul** comportamentului API (mesaje de eroare, coduri HTTP). Nu schimba textele/codurile răspunsurilor existente fără să actualizezi și testele.
- Pentru RLS local, pornește `npx supabase start`, preia `DB_URL`, `API_URL`, `ANON_KEY` și `JWT_SECRET` din `npx supabase status -o env`, apoi mapează-le pe variabilele `INTEGRATION_*` din `.env.example`. Suitele RLS dedicate eșuează dacă infrastructura lipsește; suita unit implicită le exclude explicit și nu raportează teste sărite drept trecute.

---

## 5. Structura

```
server.js               # Punct de intrare; server Express + toate rutele API
config/env.js           # Config validată fail-fast la pornire
routes/gdpr.js          # Router GDPR (export date / ștergere cont)
prompts/aiPrompts.js    # System prompt-uri pentru modelele AI
src/trigger/            # Task Trigger.dev (analiză în fundal)
utils/                  # Module helper (barcode, metrics, rateLimit, semafor, etc.)
tests/                  # Jest + supertest
```

---

## 6. Probleme frecvente

- **`Serverul nu pornește`** → validatorul afișează exact configurația absentă sau nesigură; în producție nu există fallback pentru servicii critice.
- **Autentificare esuata (401)** → token-ul trimis în header-ul `Authorization: Bearer <token>` nu e valid sau a expirat. Pentru dezvoltare locală, folosește un token real de sesiune Supabase/Clerk.
- **`/api/imagekit-auth` răspunde 503** → `IMAGEKIT_PUBLIC_KEY`/`PRIVATE_KEY`/`URL_ENDPOINT` nu sunt toate setate.
- **`/api/user/premium-status` răspunde 503** → verifică migrarea tabelelor de billing și accesul backend-ului la Supabase; verificarea cumpărărilor noi folosește Google Play Developer API.
- **Frontend pe emulator** → Android folosește `http://10.0.2.2:3000`, iOS `http://localhost:3000`; pe telefon fizic setează `EXPO_PUBLIC_API_URL` cu IP-ul mașinii. Detalii în `frontend-nutritie/constants/config.ts`.
