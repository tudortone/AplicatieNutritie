# Backend NutriAI

Server **Node.js (Express 5)** pentru aplicația NutriAI: analiză AI de mâncare (foto/text), chat nutrițional, coduri de bare, jurnal de mese și rute GDPR. Persistență în **Supabase (Postgres + RLS)**, upload imagini prin **ImageKit**, analiză în fundal prin **Trigger.dev**.

Referința completă a API-ului (OpenAPI 3): [`contracts/openapi.yaml`](../contracts/openapi.yaml). Instrucțiunile de proiect: [`INSTRUCTIUNI_AI.md`](../INSTRUCTIUNI_AI.md).

---

## 1. Cerințe

- **Node.js 18+** (Express 5, multer 2 și dotenv 17 cer Node modern)
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

> **Important:** `config/env.js` validează variabilele la pornire (fail-fast). Dacă lipsesc cele 3 obligatorii, serverul **se oprește imediat** cu un mesaj clar — nu pornește pe jumătate. În producție, `CORS_ORIGINS` trebuie să fie o listă explicită (wildcard-ul e respins).

---

## 3. Variabile de mediu

Șablonul complet și comentat: `.env.example`. Rezumat:

| Variabilă | Obligatorie? | Scop |
|-----------|--------------|------|
| `SUPABASE_URL` | **Da** | URL-ul proiectului Supabase |
| `SUPABASE_ANON_KEY` | **Da** | Cheie publică Supabase (JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Da** | Cheie admin Supabase (doar tabele backend-only) |
| `GEMINI_API_KEY` (+`_2/_3/_4`) | Nu | Analiză vizuală / fallback text Gemini |
| `GROQ_API_KEY` | Nu | Chat rapid (`/api/chat`, `estimeaza-mancare-text`, fallback) |
| `OPENAI_API_KEY` | Nu | Fallback vision |
| `OPENROUTER_API_KEY` | Nu | Fallback vision (mod `auto`) |
| `CORS_ORIGINS` | Nu (producție da) | Domenii permise CORS |
| `CLERK_SECRET_KEY` | Nu | Autentificare Clerk (opțională) |
| `SENTRY_DSN` | Nu | Monitorizare erori |
| `TRIGGER_SECRET_KEY` | Nu | Analiză în fundal Trigger.dev |
| `IMAGEKIT_PUBLIC_KEY` / `PRIVATE_KEY` / `URL_ENDPOINT` | Nu | Upload imagini (`/api/imagekit-auth`) |
| `REDIS_URL` | Nu | Store partajat rate-limit / cooldown AI (multi-instance) |
| `REVENUECAT_SECRET_API_KEY` | Nu | Validare premium server-side |
| `AI_MAX_CONCURENTA` / `AI_MAX_COADA` | Nu | Plafon de concurență AI (protecție heap) |
| `KEEP_ALIVE_URL` / `KEEP_ALIVE_INTERVAL_MINUTES` | Nu | Anti-sleep pe Render/Railway |

---

## 4. Rularea testelor

```bash
npm test                # Suita completă Jest (--forceExit)
npm run test:integration  # Teste RLS pe un Postgres real (necesită SUPABASE_URL + chei)
npm run lint            # ESLint
```

- `tests/server.test.js` este **contractul** comportamentului API (mesaje de eroare, coduri HTTP). Nu schimba textele/codurile răspunsurilor existente fără să actualizezi și testele.
- Testele de integrare (RLS) se rulează doar dacă ai un proiect Supabase configurat.

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

- **`Serverul nu pornește`** → lipsește una din cele 3 variabile obligatorii Supabase; mesajul de eroare îți spune exact care.
- **Autentificare esuata (401)** → token-ul trimis în header-ul `Authorization: Bearer <token>` nu e valid sau a expirat. Pentru dezvoltare locală, folosește un token real de sesiune Supabase/Clerk.
- **`/api/imagekit-auth` răspunde 503** → `IMAGEKIT_PUBLIC_KEY`/`PRIVATE_KEY`/`URL_ENDPOINT` nu sunt toate setate.
- **`/api/user/premium-status` răspunde 503** → `REVENUECAT_SECRET_API_KEY` nu e setată.
- **Frontend pe emulator** → Android folosește `http://10.0.2.2:3000`, iOS `http://localhost:3000`; pe telefon fizic setează `EXPO_PUBLIC_API_URL` cu IP-ul mașinii. Detalii în `frontend-nutritie/constants/config.ts`.
