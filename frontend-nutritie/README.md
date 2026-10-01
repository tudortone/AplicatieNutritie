# NutriAI Mobile

Aplicație Expo SDK 54 / React Native pentru Android, iOS și web. Runtime-ul recomandat este Node.js 22 (vezi `engines` și profilul EAS production).

## Pornire locală

```bash
npm install
copy .env.example .env
npm start
```

Completează `.env` cu valori de dezvoltare. Fișierul este ignorat de git; nu pune secrete backend în variabile `EXPO_PUBLIC_*`, deoarece acestea sunt incluse în aplicația compilată.

## Verificări locale

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run audit:gate
npx expo-doctor
npm run pre-submit
```

`pre-submit` este intenționat fail-closed: pentru Android production cere API-ul public, Supabase public, ImageKit public, Sentry DSN și URL-urile HTTPS reale pentru Termeni și Politica de confidențialitate. Billing-ul direct Google Play nu folosește chei comerciale publicabile în client. `app.config.js` aplică aceeași poartă în profilul EAS production.

## Build Android production

Configurează variabilele din `.env.example` în EAS Environment `production`, apoi:

```bash
npx eas-cli@latest build --platform android --profile production
```

Profilul generează AAB, folosește Node 22 și incrementează automat versiunea remote. `SENTRY_AUTH_TOKEN` este secret de build și trebuie configurat în EAS, nu în `.env` și nu în git; `SENTRY_ORG` și `SENTRY_PROJECT` identifică proiectul pentru upload-ul source maps.

## Configurație publică

- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`

Lista completă și exemplele fără credentiale reale sunt în `.env.example`.
