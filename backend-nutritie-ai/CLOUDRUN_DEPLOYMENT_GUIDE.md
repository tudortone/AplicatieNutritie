# Ghid Migrare și Deployment Google Cloud Run: `backend-nutritie-ai`

Acest ghid permite înlocuirea completă a instanței Render cu Google Cloud Run pentru backend-ul GetFlow (`nutritie-backend-ai`).

---

## 1. De ce Google Cloud Run este net superior față de Render (Free Tier)

| Criteriu | Render (Free Tier) | Google Cloud Run (Free Tier) |
|---|---|---|
| **Limită lunară ore** | 750 ore/lună (se consumă dacă ai mai multe servicii) | **2.000.000 cereri/lună GRATIS**, pentru totdeauna |
| **Memorie alocată** | 512 MB fix | 512 MB sau 1 GB configurabil (360.000 GB-secunde gratis/lună) |
| **CPU alocat** | Partajat lent | 1 vCPU dedicat per instanță (180.000 vCPU-secunde gratis) |
| **Cold Starts** | 50–90 secunde pe Render | Sub 2-4 secunde pe Cloud Run (sau 0 dacă min-instances=1) |
| **Locație / Latency** | Frankfurt / Oregon | `europe-west3` (Frankfurt), lângă baza de date Supabase |
| **Compatibilitate** | Necesită buildpacks | Container Docker direct pe `node:22-slim` |

---

## 2. Pregătire Proiect Google Cloud

Proiectul Google Cloud deja existent:
- **Project ID:** `nutriai-504921`
- **Project Number:** `435128681048`
- **Regiune recomandată:** `europe-west3` (Frankfurt, Germania)

Dacă ai `gcloud` CLI instalat local:
```bash
gcloud auth login
gcloud config set project nutriai-504921
```

Sau direct prin **Google Cloud Console** (interfața web https://console.cloud.google.com/run):
1. Mergi la **Cloud Run** -> **Create Service**.
2. Alege **Continuously deploy from a repository** (conectează GitHub repo-ul `AplicatieNutritie`, calea `/backend-nutritie-ai`) SAU încarcă din sursă / container.
3. Service name: `nutritie-backend-ai`.
4. Region: `europe-west3` (Frankfurt).
5. Authentication: Bifează **Allow unauthenticated invocations** (este API public accesat de aplicația mobilă).
6. Port: `8080`.
7. Concurrency: `80`.
8. CPU: `1`, Memory: `512 MiB`.

---

## 3. Deployment printr-o singură comandă (CLI)

Din folderul `backend-nutritie-ai`:
```bash
gcloud run deploy nutritie-backend-ai \
  --source . \
  --region europe-west3 \
  --project nutriai-504921 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5
```

---

## 4. Variabile de Mediu Necesare în Cloud Run

Copiază variabilele de mediu din `Render` (sau `.env.production`) în Cloud Run la **Edit & Deploy New Revision** -> **Variables & Secrets**:
- `NODE_ENV`: `production`
- `HOST`: `0.0.0.0`
- `PORT`: `8080`
- `SUPABASE_URL`: URL-ul proiectului Supabase
- `SUPABASE_ANON_KEY`: cheia anon Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: cheia service role Supabase
- `GROQ_API_KEY`: cheia principală Groq
- `GROQ_API_KEY_2`: cheia secundară Groq
- `GEMINI_API_KEY`: cheia Gemini
- `TRIGGER_SECRET_KEY`: cheia Trigger.dev
- `PLAY_INTEGRITY_MODE`: `off` (sau `observe`)
- `PLAY_INTEGRITY_PROJECT_NUMBER`: `435128681048`
- `ADMOB_REWARDED_AMOUNT`: `1`
- `ADMOB_REWARDED_ITEM`: `FlowCredit`

---

## 5. Comutarea Clientului Mobil către Cloud Run

După ce serviciul Cloud Run este activat, Google Cloud îți oferă un URL de forma:
`https://nutritie-backend-ai-xxxxx-ey.a.run.app`

Pentru a comuta aplicația mobilă:
1. În `frontend-nutritie/.env`:
   ```env
   EXPO_PUBLIC_API_URL=https://nutritie-backend-ai-xxxxx-ey.a.run.app
   ```
2. Publici un update OTA prin EAS:
   ```bash
   npx eas-cli update --branch production --message "switch api endpoint to cloud run"
   ```
3. Toate telefoanele instalate (inclusiv Samsung S24 Ultra) vor începe imediat să trimită cererile către Cloud Run, fără să mai consume niciun minut din cota Render!
