# INSTRUCȚIUNI PENTRU AI — NutriAI

**Acesta este documentul canonic unic de instrucțiuni pentru asistenții AI care lucrează în acest repo.**
Versiunile anterioare (`INSTRUCTIUNI_AI_v5.md`, `INSTRUCTIUNI_GEMINI_v6.md`) au fost contopite aici și șterse — nu există altă sursă de instrucțiuni. Dacă o informație din trecut contrazice acest document, acest document are prioritate.

Proiectul are două aplicații:
- `frontend-nutritie/` — aplicație **Expo (React Native + TypeScript, SDK 54)** cu Expo Router (file-based routing).
- `backend-nutritie-ai/` — server **Node.js Express 5** cu Gemini / Groq / OpenAI + Supabase.

> **Expo SDK 54 a schimbat mai multe API-uri.** Înainte de a scrie cod React Native, citește documentația versionată la https://docs.expo.dev/versions/v54.0.0/. Respectă versiunile exacte din `package.json`; nu le schimba fără motiv explicit (poate sparge compatibilitatea cu SDK 54).

---

## 1. REGULI ABSOLUTE — NU FACEA ASTA

1. **NU hardcoda chei API sau date sensibile în cod.** Backendul citește din `process.env`; frontendul din `process.env.EXPO_PUBLIC_*`. Secretul real NU apare niciodată în cod sau în loguri.
2. **NU elimina** `requireAuth`, `generalLimiter`/`aiLimiter` sau `checkAiUsageQuota` de pe rutele protejate din `server.js`.
3. **NU folosi clientul admin Supabase** (`supabaseAdmin`) pentru a citi/scrie datele unui utilizator obișnuit. Folosește `ctx.db` (clientul per-cerere legat de JWT, cu RLS pe `auth.uid() = user_id`). Vezi [Secțiunea 5](#5-securitate).
4. **NU schimba mesajele de eroare, codurile HTTP sau formulele de calcul existente.** `tests/server.test.js` le tratează ca un contract.
5. **NU crea componente React în interiorul altor componente** (anti-pattern de performanță — remontare la fiecare render).
6. **NU folosi `any` în TypeScript.** Folosește tipurile din `frontend-nutritie/types.ts` sau definește tipuri noi.
7. **NU loga** token-uri JWT, header-e de autorizare sau date personale. `console.log` doar în development, fără date sensibile.
8. **NU instala dependențe noi** fără să verifici că nu există deja o soluție în proiect.
9. **NU rescrie integral un fișier mare** și NU șterge comentariile care explică de ce ceva e făcut aparent greșit (sunt garduri intenționate). Modifică punctual.
10. **Orice text vizibil utilizatorului** (alerte, butoane, etichete) trece prin i18n (`useTranslation` + `i18n/locales/ro.json` + `en.json`), nu e hardcodat.

---

## 2. ARHITECTURA PROIECTULUI (verificată)

### Backend — `backend-nutritie-ai/`
```
backend-nutritie-ai/
├── server.js               # Punct de intrare; server Express monolitic + toate rutele API
├── config/env.js           # Configurare centralizată, validată fail-fast la pornire
├── routes/gdpr.js          # Router modular: export date & ștergere cont (B-12)
├── prompts/aiPrompts.js    # System prompt-urile pentru modelele AI
├── src/trigger/analiza-mancare-ai.js  # Task Trigger.dev (analiză AI în fundal)
├── utils/                  # Module helper (vezi mai jos)
├── tests/                  # Jest + supertest
└── .env                    # Chei API (gitignored); .env.example = șablon
```

Module `utils/` (toate CommonJS):
- `barcode.js` — cache OpenFoodFacts pe 3 straturi (Supabase → OpenFoodFacts → fallback)
- `metrics.js` — contorizare tokeni/cost AI (B-23)
- `clientUtilizator.js` — client Supabase per-cerere, legat de JWT (RLS)
- `identitate.js` — mapare identități (Supabase / Clerk)
- `idempotency.js` — idempotență pe scrieri (A-9)
- `tokenCache.js` + `storePartajat.js` — cache tokeni și store partajat Redis (B-10)
- `rateLimit.js` — configurare limiter-e (`generalLimiter`, `aiLimiter`)
- `aiUsageQuota.js` — plafonare zilnică AI (S-10)
- ~~`imageHashCache.js`~~ — cache pe hash imagine (P-3), ȘTERS (D4): nu avea niciun require
- `semafor.js` — limită concurență AI pe heap (P-15/B-20)
- `llmJson.js`, `promptSafety.js`, `sanitize.js`, `validareMese.js`, `httpTimeout.js` (~~`logger.js`~~ ȘTERS D4)

### Frontend — `frontend-nutritie/`
```
frontend-nutritie/
├── app/                    # Ecrane (Expo Router)
│   ├── (tabs)/             # index (jurnal), chat, statistici, antrenamente, istoric, profil
│   ├── auth.tsx, camera.tsx, calculator-ai.tsx, scanner-barcode.tsx, adauga-manual.tsx
│   ├── onboarding/         # flux onboarding pe pași
│   └── legal.tsx, paywall.tsx, notificari.tsx, jurnal-antrenamente.tsx, exercitiu/[id].tsx
├── components/             # Componente reutilizabile (AddMealBottomSheet, MasaCard, food/*, fitness/*, ui/*)
├── context/                # AuthContext, ThemeContext, GamificareContext, PremiumContext, OnboardingContext, NotificationBannerContext
├── hooks/                  # useMeseAzi, useZileCuMese, useFocusRefresh, useAntrenamente, useCamara, useApa, useHealthSync, useBiometrics, useResponsiveLayout, etc.
├── constants/              # config.ts (API_URL), theme.ts, foodPresets.ts, exercitii.ts, insigne.ts, muscles.ts
├── lib/                    # fitnessEngine.ts, offlineSync.ts, calorieState.ts, imageOptimizer.ts, imagekit.ts, openfoodfacts.ts, etc.
├── i18n/                   # index.ts (i18next) + locales/ro.json + locales/en.json
├── supabase.ts             # client Supabase (singleton) cu fail-fast pe EXPO_PUBLIC_*
├── types.ts                # tipuri globale (Masa, AlimentDetaliat, TipMasa, Antrenament…)
└── app.json / eas.json     # configurare Expo / EAS Update
```

---

## 3. CONVENȚII FRONTEND

- **Culori:** folosește `colors.*` din `useTheme()` (vezi `context/ThemeContext.tsx`), NU string-uri hex hardcodate în fiecare ecran.
- **Stiluri:** `StyleSheet.create()` la finalul fișierului. Evită stilurile inline.
- **Animații:** `react-native-reanimated` (FadeInDown, FadeInUp, ZoomIn). **Iconițe:** `lucide-react-native`.
- **Accesibilitate:** pe fiecare element interactiv pune `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; pe elementele testabile, `testID` stabil.
- **Text utilizator:** toate etichetele, alertele și butoanele trec prin `t()` din `useTranslation()`; cheile în `i18n/locales/ro.json` (implicit) și `en.json` (fallback). Interpolări i18next: `{{variabila}}`.
- **Acces la date:** `useAuth()` → `{ session, user }`; `useMeseAzi()` → `{ mese, totalCalorii, totalProteine, loading, refresh }`; `useZileCuMese()`, `useAntrenamente()`, `useCamara()`.
- **Apeluri backend:** `import { API_URL } from '@/constants/config';` — trimite `Authorization: Bearer ${session.access_token}` pe fiecare cerere.
- **Tipuri:** PascalCase, definite în `types.ts` sau la început de fișier. `tsconfig.json` e pe `"strict": true`.

---

## 4. CONVENȚII BACKEND

- Server Express 5 monolitic în `server.js`; pentru funcționalități noi autoconținute se poate folosi un `express.Router()` modular (ca `routes/gdpr.js`).
- Configurarea se citește O SINGURĂ dată în `config/env.js` și se validează fail-fast: un deploy cu variabile obligatorii lipsă **moare la pornire**, nu în producție.
- Middleware standard pe rutele API: `requireAuth` (JWT), `generalLimiter` (rată generală), `aiLimiter` (rată AI), `checkAiUsageQuota` (plafon zilnic AI).
- **Izolare date:** în fiecare handler, `ctx.db` (clientul per-cerere, RLS) filtrează pe `user_id`. Nu folosi `supabaseAdmin` pentru datele de utilizator.
- **Răspunsuri:** obiecte JSON cu `eroare` la eșec, coduri HTTP corecte. NU schimba textele/codurile existente — sunt contract de test.

### Rutele API (18, plus `/` și `/health`)
| Metodă | Rută | Auth | Scop |
|--------|------|------|------|
| GET | `/health` | — | health check |
| GET | `/api/ai-status` | — | status modele AI |
| GET | `/api/imagekit-auth` | JWT | token upload ImageKit |
| POST | `/api/trigger-analiza-mancare` | JWT | analiză AI în fundal (Trigger.dev) |
| POST | `/api/analiza-foto` | JWT | analiză fotografie AI |
| POST | `/api/analizeaza-mancare-structurat` | JWT | analiză structurată alimente |
| POST | `/api/chat` | JWT | chat nutrițional AI |
| POST | `/api/log-food-from-chat` | JWT | salvare masă din chat |
| POST | `/api/estimeaza-mancare-text` | JWT | estimare valori din text |
| POST | `/api/vision-fallback` | JWT | fallback/corecție vision |
| POST | `/api/corecteaza-mancare-vizual-text` | JWT | corecție vizual→text |
| GET | `/api/produs-barcode/:code` | JWT | produs după cod de bare |
| POST | `/api/salveaza-produs-barcode` | JWT | salvare produs manual în cache |
| POST | `/api/calculeaza-profil` | JWT | calcul profil nutrițional |
| POST | `/api/mese` | JWT | adăugare masă |
| PUT | `/api/mese/:id` | JWT | editare masă |
| DELETE | `/api/mese/:id` | JWT | ștergere masă |
| GET | `/api/user/premium-status` | JWT | validare premium server-side |
| GET | `/api/user/export-data` | JWT | export GDPR |
| DELETE | `/api/user/delete-account` | JWT | ștergere cont GDPR |

Referința completă OpenAPI: `contracts/openapi.yaml`.

---

## 5. SECURITATE

- **Config fail-fast:** `config/env.js` cere obligatoriu `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; în producție `CORS_ORIGINS` trebuie să fie o listă explicită (wildcard-ul e respins la pornire).
- **Rate limiting:** `generalLimiter` pe toate rutele; `aiLimiter` + `checkAiUsageQuota` pe rutele AI (protecție cost și abuz). Store partajat Redis dacă `REDIS_URL` e setat (B-10).
- **RLS Supabase:** tabelele cu date de utilizator au Row Level Security pe `auth.uid() = user_id`. Clientul per-cerere (`ctx.db`) aplică izolarea în baza de date, nu doar în cod. Never use the admin client for user data.
- **Plafon AI:** `AI_MAX_CONCURENTA` + `AI_MAX_COADA` + semafor protejează heap-ul la cereri AI paralele (imagini base64 mari nu se acumulează).
- **Secrete:** rotește periodic toate cheile (ghid: vezi auditul S-8). Zero hardcodare.

---

## 6. BAZA DE DATE (SUPABASE)

| Tabelă | Scop | Coloane cheie |
|--------|------|---------------|
| `mese` | Jurnal alimente | `user_id`, `nume`, `calorii`, `proteine`, `grasimi`, `carbohidrati`, `fibre`, `data`, `ora`, `tip_masa`, `alimente` (JSONB) |
| `antrenamente` | Jurnal sport | `user_id`, `nume`, `tip`, `durata_min`, `calorii_arse`, `exercitii` (JSONB), `muscle_load` (JSONB) |
| `profil` | Date profil | `user_id`, `greutate`, `greutateTinta`, `caloriiTinta`, macro-uri țintă |
| `gamificare` | XP și streak | `user_id`, `xp_total`, `nivel`, `streak`, `questuri_azi` (JSONB), `insigne` (JSONB) |
| `produse_camara` | Cămară personală | `user_id`, `barcode`, `nume`, `calorii_100g`, etc. |
| `barcode_cache` | Cache produse global | `code` (PK), `name`, `kcal_100g`, etc. — cache global |
| `barcode_estimari_utilizator` | Estimări per utilizator | `user_id`, `barcode`, valori |
| `audit_log` | Log acțiuni | `user_id`, `action`, `details` (JSONB) |

Toate tabelele cu date personale au RLS pe `auth.uid() = user_id` și FK `ON DELETE CASCADE` spre `auth.users(id)` (migrările SQL sunt idempotente — `IF NOT EXISTS`).

---

## 7. VARIABILE DE MEDIU

Șablonul complet și comentat: `backend-nutritie-ai/.env.example`. Obligatorii: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Opționale importante: `GEMINI_API_KEY` (+ `_2/_3/_4` rotație), `GEMINI_MODEL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_VISION_MODELS`, `CORS_ORIGINS`, `CLERK_SECRET_KEY`, `SENTRY_DSN`, `TRIGGER_SECRET_KEY`, `IMAGEKIT_*`, `REDIS_URL`, `REVENUECAT_SECRET_API_KEY`, `AI_MAX_CONCURENTA`, `AI_MAX_COADA`, `KEEP_ALIVE_URL`, `KEEP_ALIVE_INTERVAL_MINUTES`.

Frontend: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (verificate fail-fast în `supabase.ts`).

---

## 8. TESTE & VERIFICARE

```bash
# Backend (din backend-nutritie-ai/)
npm test                 # Jest — suita de 6+ fișiere; tests/server.test.js = CONTRACT
npm run test:integration # RLS pe Postgres real

# Frontend (din frontend-nutritie/)
npx tsc --noEmit         # 0 erori TypeScript
npx expo lint            # 0 warning-uri
```

Reguli de testare:
- Dacă NU poți rula testele, spune-o explicit — nu declara „reparat” ce n-ai executat.
- Migrarea/scripturile SQL se rulează ÎNAINTEA codului care le folosește.
- La final, raportezi explicit: ce ai modificat, ce NU ai reușit, și ce ar trebui testat manual.

---

## 9. LANSARE & DEPLOY

- **EAS Update (frontend):** după modificări majore, încarcă noua versiune cu `eas update` pe TOATE branch-urile active (`preview`, `main`, `production`) și șterge grupurile de update vechi cu `eas update:delete <groupId>` — pentru a menține un mediu curat în Expo Go.
- **Backend:** keep-alive anti-sleep pe `KEEP_ALIVE_URL` (primește automat sufixul `/health`); monitorizare Sentry dacă `SENTRY_DSN` e setat; validare premium prin RevenueCat dacă `REVENUECAT_SECRET_API_KEY` e setat.
- **Git:** modificări făcute doar pe fișierele indicate de cerință; commit-uri mici, descriptive, în română; nu force-push pe `main`.

---

## 10. REFERINȚE

- Expo SDK 54: https://docs.expo.dev/versions/v54.0.0/
- Supabase JS: https://supabase.com/docs/reference/javascript/
- React Native Reanimated: https://docs.swmansion.com/react-native-reanimated/
- Lucide icons: https://lucide.dev/icons/
- Gemini API: https://ai.google.dev/api/generate-content
- Documentația API backend (OpenAPI): `contracts/openapi.yaml`
- README rulare locală backend: `backend-nutritie-ai/README.md`
