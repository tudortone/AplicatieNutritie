# Ghid de Audit Git & Rotație a Secretelor (`S-8`)

## 1. Verificare Istoric Git pentru Chei Scurse

Utilizați următoarea comandă în terminal pentru a scana istoricul Git împotriva scurgerilor de chei în fișiere `.env` vechi sau commit-uri:

```bash
git log -p -S "SUPABASE_SERVICE_ROLE_KEY"
git log -p -S "GROQ_API_KEY"
git log -p -S "GEMINI_API_KEY"
git log -p -S "CLERK_SECRET_KEY"
```

Dacă o cheie a existat într-un commit anterior (chiar dacă fișierul a fost șters ulterior), cheia respectivă trebuie considerată **compromisă permanent** și rotită din dashboard-ul furnizorului.

---

## 2. Ghid de Rotație Pas-cu-Pas

### A. Rotație Supabase Service Role Key
1. Deschideți [Supabase Dashboard](https://supabase.com/dashboard) -> Proiect -> **Settings -> API**.
2. Faceți clic pe **Roll Key** în dreptul `service_role` key.
3. Copiați noua cheie și actualizați-o în variabila de mediu `SUPABASE_SERVICE_ROLE_KEY` pe platforma de hosting (Render / Vercel).
4. Reporniți serviciul backend.

### B. Rotație Groq API Key
1. Deschideți [Groq Console](https://console.groq.com/keys).
2. Deactivați cheia veche.
3. Generează o cheie nouă (`gsk_...`) și actualizează `GROQ_API_KEY` în mediul de producție.

### C. Rotație Gemini API Key
1. Deschideți [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Revocați cheia veche și generați o cheie nouă API.
3. Actualizați `GEMINI_API_KEY` în variabila de mediu a backend-ului.

### D. Rotație Clerk Secret Key
1. Deschideți [Clerk Dashboard](https://dashboard.clerk.com) -> API Keys.
2. Generați o cheie secretă nouă (`sk_live_...` / `sk_test_...`).
3. Actualizați `CLERK_SECRET_KEY` în producție.
