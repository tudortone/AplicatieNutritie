# Checklist de securitate inainte de lansare — backend NutriAI

Document generat in urma auditului de pregatire pentru productie.
Bifeaza fiecare punct inainte de a publica aplicatia.

## 1. Variabile de mediu (productie)

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` = lista explicita de domenii, **fara `*`**
      (serverul refuza acum sa porneasca daca e `*` in productie)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` setat doar pe server, **niciodata** in aplicatie
- [ ] Cheile AI (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`,
      `OPENROUTER_API_KEY`) rotite inainte de lansare, daca au circulat in chat/email
- [ ] `.env` real nu este comis in git (verificat: este in `.gitignore`)

## 2. Integrarea modulului `utils/security.js` in `server.js`

```js
const {
  buildCorsOptions, helmetOptions, limiters,
  assertOwnership, serviceRoleGuard, errorHandler,
} = require('./utils/security');
const { sanitizeRequest } = require('./utils/sanitize');

app.use(helmet(helmetOptions));
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeRequest);

app.use('/api/', limiters.general);
app.use('/api/chat', limiters.ai);
app.use('/api/calculeaza-profil', limiters.ai);
app.use('/api/analizeaza-mancare-structurat', limiters.upload);

// ... rute ...

app.use(errorHandler); // ultimul, dupa toate rutele
```

- [ ] `helmet` + `cors` inlocuite cu variantele de mai sus
- [ ] `sanitizeRequest` montat global (acopera acum si `req.params`)
- [ ] `errorHandler` montat ultimul — fara stack trace catre client in productie
- [ ] Limita de body (`express.json({ limit: '1mb' })`) setata
- [ ] Limita de dimensiune pe upload-uri (`multer` `limits.fileSize`, max ~8 MB)

## 3. Rute care folosesc service-role (ocolesc RLS) — MUST-FIX #4

Pentru fiecare ruta care citeste/scrie cu clientul service-role:

- [ ] este protejata de `requireAuth`
- [ ] are `serviceRoleGuard` montat
- [ ] filtreaza **intotdeauna** dupa `req.user.id` in interogare
      (`.eq('user_id', req.user.id)`), nu dupa un id primit din body/params
- [ ] apeleaza `assertOwnership(req, resursa.user_id)` inainte de update/delete

> Regula de aur: niciun `user_id` nu se accepta din request. Se ia doar din token.

## 4. Row Level Security in Supabase — MUST-FIX #2

- [ ] `supabase_rls_policies.sql` rulat pe proiectul de **productie**
- [ ] Verificare ca RLS e activ pe toate tabelele:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by rowsecurity, tablename;
```

- [ ] Orice tabel cu `rowsecurity = false` primeste
      `alter table public.<tabel> enable row level security;`
- [ ] Politici de tip `auth.uid() = user_id` pentru select/insert/update/delete
- [ ] Testat cu cheia `anon`: un user nu poate citi randurile altui user
- [ ] Bucket-urile de Storage (avatare, poze mese) au politici per user, nu publice

## 5. Verificari finale

- [ ] `npm test` trece (autentificare, validari, tip fisier)
- [ ] `npm audit --production` fara vulnerabilitati critice
- [ ] `/health` nu expune versiuni, chei sau variabile de mediu
- [ ] Logurile nu contin token-uri, email-uri sau continut de mesaje
- [ ] Politica de confidentialitate publicata + flux de stergere cont in aplicatie
      (obligatoriu App Store / Google Play pentru date de sanatate)
