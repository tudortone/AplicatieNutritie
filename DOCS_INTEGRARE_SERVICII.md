# Ghid de Configurare și Integrare Servicii Externe (NutriAI)

> **STATUS: ISTORIC.** Scris înainte de de-monolitizarea backend-ului (B-14…B-18).
> Configurația din `server.js` și variabilele de mediu rămân valide, dar rutele
> `/api/imagekit-auth` și `/api/trigger-analiza-mancare` trăiesc acum în `routes/ai.js`
> și sunt montate sub `/api/v1/` (alias legacy `/api/` până la 2026-09-30).

Acest ghid descrie integrarea celor 4 servicii externe în stack-ul aplicației **NutriAI** (Clerk, Sentry, ImageKit, Trigger.dev) și pașii de activare în medii de Dezvoltare și Producție.

---

## 1. **Clerk (Autentificare & Identity)**

### Frontend (`frontend-nutritie`)
- **Fișier de configurare**: [app/_layout.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/_layout.tsx)
- **Variabilă de mediu**: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...`
- **Comportament de siguranță**: Dacă cheia lipsește sau este invalidă (ex. în dezvoltare locală), aplicația nu blochează randarea ecranului (ocolește `<ClerkLoaded>`) și funcționează normal. Când cheia validă este furnizată, `<ClerkProvider>` devine activ.

### Backend (`backend-nutritie-ai`)
- **Fișier de configurare**: [server.js](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/server.js)
- **Variabilă de mediu**: `CLERK_SECRET_KEY=sk_test_...`
- **Middleware `requireAuth`**: Suportă validarea duală — verifică mai întâi token-ul Supabase JWT, iar dacă eșuează și `CLERK_SECRET_KEY` este configurată, validează token-ul Clerk prin `@clerk/express`.

---

## 2. **Sentry (Monitorizare Erori & Tracing)**

### Frontend (`frontend-nutritie`)
- **Fișier de configurare**: [app/_layout.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/_layout.tsx)
- **Variabilă de mediu**: `EXPO_PUBLIC_SENTRY_DSN=https://...`
- **Comportament**: DSN-ul este verificat înainte de `Sentry.init()`. Fără DSN, SDK-ul rămâne inactiv fără a afecta performanța.

### Backend (`backend-nutritie-ai`)
- **Fișier de configurare**: [server.js](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/server.js)
- **Variabilă de mediu**: `SENTRY_DSN=https://...`
- **Comportament**: Înregistrează automat excepțiile prin middleware-ul `Sentry.setupExpressErrorHandler(app)` și loghează erorile 500 în Sentry.

---

## 3. **ImageKit (Stocare & CDN Imagini Mâncare)**

### Backend (`backend-nutritie-ai`)
- **Variabile de mediu**: `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`
- **Endpoint**: `GET /api/imagekit-auth` — Generează token-uri de încărcare securizate temporare. Dacă variabilele lipsesc, returnează un token mock în modul dezvoltare.

### Frontend (`frontend-nutritie`)
- **Helper**: [lib/imagekit.ts](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/lib/imagekit.ts)
- **Integrare**: În [app/camera.tsx](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/frontend-nutritie/app/camera.tsx), fotografiile realizate cu camera sau selectate din galerie sunt încărcate pe CDN-ul ImageKit pentru optimizare și livrare rapidă WebP.

---

## 4. **Trigger.dev (Task-uri AI în Fundal)**

### Backend (`backend-nutritie-ai`)
- **Fișiere de configurare & task-uri**:
  - Configurare: [trigger.config.js](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/trigger.config.js)
  - Task definire: [src/trigger/analiza-mancare-ai.js](file:///c:/Users/tudor/OneDrive/Desktop/AplicatieNutritie/backend-nutritie-ai/src/trigger/analiza-mancare-ai.js)
- **Variabilă de mediu**: `TRIGGER_SECRET_KEY=tr_dev_...`
- **Endpoint**: `POST /api/trigger-analiza-mancare`
- **Comportament de siguranță**: Dacă `TRIGGER_SECRET_KEY` nu este configurată în `.env`, endpoint-ul răspunde cu `503 Service Unavailable (Trigger.dev neactivat)` în loc să producă erori 500 neasptate.
