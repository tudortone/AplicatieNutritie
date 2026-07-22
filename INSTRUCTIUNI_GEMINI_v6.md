# INSTRUCTIUNI PENTRU GEMINI AI — PROIECT NUTRIAI v5

**Versiune instructiuni:** 6.0
**Data:** 12 Iulie 2026
**Proiect:** NutriAI — aplicatie React Native (Expo SDK 54) + Backend Node.js Express

---

## 0. CITESTE PRIMA DATA — ARHITECTURA PROIECTULUI

Proiectul NutriAI contine:

```
AplicatieNutritie/
├── backend-nutritie-ai/        # Server Express Node.js
│   ├── server.js               # SINGURUL fisier server — 1034 linii
│   ├── .env                    # Chei API (NU le hardcoda niciodata in cod!)
│   └── package.json
└── frontend-nutritie/          # Aplicatie Expo React Native
    ├── app/                    # Pagini (Expo Router)
    │   ├── (tabs)/             # Tab-uri principale
    │   │   ├── index.tsx       # Ecranul principal (jurnal zilnic)
    │   │   ├── chat.tsx        # Chat AI nutritional
    │   │   ├── statistici.tsx  # Grafice si statistici
    │   │   ├── antrenamente.tsx # Jurnal antrenamente
    │   │   ├── istoric.tsx     # Istoricul meselor
    │   │   └── profil.tsx      # Profil utilizator si setari
    │   ├── auth.tsx            # Login / Register
    │   ├── camera.tsx          # Camera AI + galerie
    │   ├── calculator-ai.tsx   # Calculator nutritional
    │   ├── scanner-barcode.tsx # Scanner cod de bare
    │   └── onboarding.tsx      # Onboarding la prima instalare
    ├── components/             # Componente reutilizabile
    ├── context/                # React Context providers
    │   ├── AuthContext.tsx     # Sesiune Supabase
    │   ├── GamificareContext.tsx # XP, streak, quests
    │   ├── ThemeContext.tsx    # Tema vizuala
    │   └── NotificationBannerContext.tsx # Notificari in-app
    ├── hooks/                  # Hooks custom
    │   ├── useMeseAzi.ts       # Date mese pentru ziua curenta
    │   ├── useAntrenamente.ts  # CRUD antrenamente + offline sync
    │   ├── useBiometrics.ts    # Touch ID / Face ID
    │   └── useHealthSync.ts    # Integrare HealthKit/Health Connect
    ├── constants/
    │   ├── config.ts           # API_URL
    │   ├── theme.ts            # Tema (ThemeName, themes)
    │   └── exercitii.ts        # Catalog exercitii fizice
    ├── lib/
    │   ├── fitnessEngine.ts    # Calcul metrici antrenament
    │   └── calorieState.ts     # Stare calorii (deficit/surplus)
    ├── supabase.ts             # Client Supabase (singleton)
    └── types.ts                # Tipuri globale (Masa, AlimentAI)
```

---

## 1. REGULI ABSOLUTE — NICIODATA SA NU FACI ASTA

1. **NU hardcoda chei API in cod.** Toate cheile vin din `process.env` (backend) si `process.env.EXPO_PUBLIC_*` (frontend).
2. **NU elimina** rate limiting-ul (`generalLimiter`, `aiRateLimiter`) din `server.js`.
3. **NU elimina** middleware-ul `requireAuth` de pe endpoint-uri protejate.
4. **NU instala dependente noi** fara sa verifici ca nu exista deja o solutie in proiect.
5. **NU schimba versiunile din `package.json`** fara motiv explicit (poate sparge compatibilitatea cu Expo SDK 54).
6. **NU crea componente noi in interiorul altor componente** (anti-pattern de performanta).
7. **NU folosi `any` in TypeScript** — foloseste tipurile definite in `types.ts` sau defineste tipuri noi.
8. **NU loga** token-uri JWT sau date sensibile ale utilizatorilor.

---

## 2. SECURITATE — PROBLEME CUNOSCUTE DE REZOLVAT

### SEC-1 (CRITICA): Chei API reale in `.env` — roteste-le imediat!
- Roteste TOATE cheile din Gemini, Groq, OpenAI, Supabase dashboard

### SEC-2: `/api/ai-status` fara autentificare
Adauga `requireAuth`:
```js
app.get('/api/ai-status', requireAuth, (req, res) => {
```

### SEC-3 (URGENTA): `SUPABASE_SERVICE_ROLE_KEY` lipseste
Adauga in `.env`:
```
SUPABASE_SERVICE_ROLE_KEY=cheia_din_supabase_dashboard
```
Si in `server.js` linia 96 — elimina fallback-ul pe anon key:
```js
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) { console.error('EROARE: SUPABASE_SERVICE_ROLE_KEY lipseste!'); process.exit(1); }
```

### SEC-4: Token revoked valid 60s in cache
Reduce `CACHE_TTL_MS` la 15000 (15 secunde).

### SEC-5: barcode_cache fara RLS
Adauga validare bounds pe valorile nutritionale inainte de upsert in `/api/salveaza-produs-barcode`.

### SEC-7: Rate limiter lipsa pe barcode endpoint
```js
app.get('/api/produs-barcode/:code', requireAuth, generalLimiter, async (req, res) => {
```

---

## 3. BUG-URI CUNOSCUTE DE REZOLVAT

### BUG-1: Streak gamificare nu creste
Fisier: `frontend-nutritie/context/GamificareContext.tsx` linia 192
```ts
// INAINTE (bug):
nextState.streak = Math.max(1, loaded.streak || 1);
// DUPA (corect):
nextState.streak = (loaded.streak || 0) + 1;
```

### BUG-2: Stergere antrenament fara user_id
Fisier: `frontend-nutritie/hooks/useAntrenamente.ts` linia 332
```ts
// DUPA:
await supabase.from('antrenamente').delete().eq('id', id).eq('user_id', user.id);
```

### BUG-3: Editare masa fara validare numerelor
Fisier: `backend-nutritie-ai/server.js` linia 954 — adauga validare NaN si bounds pe calorii/proteine/grasimi/carbohidrati.

### BUG-4: `height` neutilizat in camera.tsx
```ts
const { width } = Dimensions.get('window'); // sterge height
```

---

## 4. ADAUGARE INDECSI SQL — RULEAZA IN SUPABASE

```sql
CREATE INDEX IF NOT EXISTS mese_user_id_created_at_idx ON mese(user_id, created_at DESC);
```

---

## 5. GHID DE MODIFICARE FRONTEND

### Template ecran nou
```tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export default function EcranNou() {
  const { colors } = useTheme();
  const { session } = useAuth();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    </View>
  );
}
const styles = StyleSheet.create({ container: { flex: 1 } });
```

### Reguli de stil
- **Culori:** Foloseste INTOTDEAUNA `colors.*` din `useTheme()`, nu string-uri hardcodate
- **Carduri:** `BlurView` + `LinearGradient` cu `colors.cardBg` si `colors.cardBorder`
- **Animatii:** `react-native-reanimated` (FadeInDown, FadeInUp, ZoomIn)
- **Iconite:** `lucide-react-native`

### Acces la date
```ts
const { session, user } = useAuth();
const { totalCalorii, totalProteine, loading, refresh } = useMeseAzi();
const { antrenamente, adaugaAntrenament } = useAntrenamente();
const { xpTotal, nivel, streak, adaugaProgres } = useGamificareContext();
```

### Apeluri API backend
```ts
import { API_URL } from '@/constants/config';
const response = await fetch(`${API_URL}/api/endpoint`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ date }),
});
```

---

## 6. GHID DE MODIFICARE BACKEND

### Template endpoint nou
```js
app.post('/api/endpoint-nou', requireAuth, generalLimiter, async (req, res) => {
  try {
    const { camp } = req.body;
    if (!camp || typeof camp !== 'string') {
      return res.status(400).json({ eroare: 'camp este obligatoriu.' });
    }
    const { data, error } = await supabaseAdmin
      .from('tabela')
      .select('*')
      .eq('user_id', req.user.id);  // INTOTDEAUNA filtreaza dupa user_id!
    if (error) return res.status(500).json({ eroare: error.message });
    res.json({ succes: true, data });
  } catch (error) {
    console.error('Eroare endpoint nou:', error.message);
    res.status(500).json({ eroare: 'Eroare interna a serverului.' });
  }
});
```

---

## 7. STRUCTURA BAZEI DE DATE (SUPABASE)

| Tabela | Scop | Coloane cheie |
|--------|------|---------------|
| `mese` | Jurnal alimente | `user_id`, `nume`, `calorii`, `proteine`, `grasimi`, `carbohidrati`, `created_at` |
| `antrenamente` | Jurnal sport | `user_id`, `nume`, `tip`, `durata_min`, `calorii_arse`, `exercitii` (JSONB), `muscle_load` (JSONB) |
| `profil` | Date profil | `user_id`, `greutate`, `caloriiTinta`, etc. |
| `gamificare` | XP si streak | `user_id`, `xp_total`, `nivel`, `streak`, `questuri_azi` (JSONB), `insigne` (JSONB) |
| `produse_camara` | Catalog personal | `user_id`, `barcode`, `nume`, `calorii_100g`, etc. |
| `barcode_cache` | Cache produse global | `code` (PK), `name`, `kcal_100g`, etc. — FARA RLS (global) |
| `audit_log` | Log actiuni | `user_id`, `action`, `details` (JSONB) |

---

## 8. VARIABILE DE MEDIU

### Backend (`backend-nutritie-ai/.env`)
```
PORT=3000
GEMINI_API_KEY=...           # Cheia principala Gemini
GEMINI_API_KEY_2=...         # Rotatie automata la 429
GEMINI_API_KEY_3=...
GEMINI_API_KEY_4=...
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=...
OPENAI_API_KEY=...
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # OBLIGATORIU - lipseste acum!
CORS_ORIGINS=https://nutritie-backend-ai.onrender.com
KEEP_ALIVE_INTERVAL_MINUTES=10
```

### Frontend (`frontend-nutritie/.env`)
```
EXPO_PUBLIC_API_URL=https://nutritie-backend-ai.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://...supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 9. WORKFLOW DE TESTARE

```bash
# Frontend
cd frontend-nutritie
npx tsc --noEmit           # 0 erori TypeScript
npx expo lint              # 0 warning-uri

# Backend
cd backend-nutritie-ai
node -e "require('./server.js')"
npm test
```

---

## 10. CONVENTII DE COD

| Aspect | Regula |
|--------|--------|
| Limba | Comentarii, mesaje UI, erori in ROMANA |
| Componente | PascalCase |
| Hooks | camelCase cu prefix `use` |
| Tipuri | PascalCase, definite in `types.ts` sau la inceput de fisier |
| Console.log | Doar in development |
| Stiluri | `StyleSheet.create()` — nu inline styles |

---

## 11. LISTA DE VERIFICARE FINALA

- [ ] Cod TypeScript fara `any`
- [ ] Niciun secret hardcodat
- [ ] Validare input pe orice endpoint backend nou
- [ ] Filtrare `user_id` pe toate query-urile Supabase
- [ ] `requireAuth` pe orice ruta protejata
- [ ] `finally` block pentru curatare resurse
- [ ] Niciun `console.log` cu date sensibile
- [ ] Stiluri folosind `colors.*` din ThemeContext
- [ ] `useMeseAzi` reutilizat in loc de fetch-uri duplicate

---

## 12. DOCUMENTATIE REFERINTA

- **Expo SDK 54:** https://docs.expo.dev/versions/v54.0.0/
- **Supabase JS:** https://supabase.com/docs/reference/javascript/
- **React Native Reanimated:** https://docs.swmansion.com/react-native-reanimated/
- **Lucide icons:** https://lucide.dev/icons/
- **Gemini AI SDK:** https://ai.google.dev/api/generate-content
