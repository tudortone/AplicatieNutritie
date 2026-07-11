# NUTRIAI v5 — INSTRUCȚIUNI AI & RAPORT ARHITECTURAL (Lansare Producție & Scalare 3.000 Useri Simultan)

**Data generării:** 11 Iulie 2026  
**Stadiu Proiect:** Maturizare v5 — Chat UI Fin, Mese & Fructe Extinse, Barcode Supermarketuri Locale, Optimizare Multi-Device, Arhitectură 3k CCU.

---

## SECȚIUNEA 0 — REZUMATUL CERINȚELOR (PE ROMÂNEȘTE)

1. **Bara de chat coborâtă natural:**
   - Bara de input nu mai stă ridicată excesiv când tastatura este închisă, dar păstrează un offset sigur deasupra Tab Bar-ului (`Math.max(18, TAB_BAR_HEIGHT - 28 + INPUT_FLOAT_OFFSET)`).
2. **Header de chat curat & branduit:**
   - S-a eliminat iconița generică (`Bot`, `Sparkles`) și butonul de gunoi neintegrat.
   - Header-ul prezintă acum profilul AI clar („NutriAI Coach — nutriție, mese, progres”), avatar gradient cu inițiale („NC”), indicator live de stare online și buton pilulă elegant (`Chat nou`).
3. **Redesign Empty State & Mesaje AI:**
   - Card principal tip Onboarding Glassmorphism cu salut contextual și 3 scurtături rapide pe rând (`Analiza zilei`, `Masă bogată în proteine`, `Generator rețete`).
   - S-a eliminat iconița laterală din fiecare bulă AI pentru a reduce încărcarea vizuală pe ecrane mici, înlocuindu-se cu un etichetaj discret deasupra bulei (`NutriAI Coach`).
4. **Baza de alimente extinsă & flux direct la cantitate:**
   - Catalogul din `foodPresets.ts` include categorii explicite și 30+ fructe comune din România cu porții rapide (`mergeDirectLaGramaj: true`).
   - Selectarea unui fruct sau aliment rapid sare direct în pasul de alegere a cantității / porțiilor.
5. **Scroll real & CTA accesibil în AddMealBottomSheet:**
   - S-a asigurat `paddingBottom: 160px` în conținutul listei pentru a nu ascunde ultimul element sub Tab Bar.
6. **Sistem Barcode pe 3 straturi (Supermarketuri locale — Lidl, Kaufland, Penny, Diana):**
   - **Strat 1:** Cache local în Supabase (`barcode_cache`).
   - **Strat 2:** Interogare OpenFoodFacts API cu salvare automată în cache.
   - **Strat 3:** Fallback inteligent și UX dedicat când produsul nu există (`codNegasit`), oferind opțiuni clare de completare manuală sau estimare AI, salvând ulterior maparea pentru toți utilizatorii.
7. **Principii Responsive Multi-Device:**
   - Suport nativ pentru telefoane mici (`<=360px`), medii, mari și tablete (`>=768px`) prin `Device` și `getBubbleMaxWidth()`.

---

## SECȚIUNEA 10 — LISTA DE SCHIMBĂRI NECESARE CA APLICAȚIA SĂ FIE GATA DE LANSARE

### 10.1 PRODUS / UX
- [x] **Chat Header Refăcut:** Coerent vizual cu restul aplicației, cu status online și buton „Chat nou” tip pilulă.
- [x] **Input Chat Coborât:** Calcul realist al padding-ului inferior și spațiu scroll natural.
- [x] **Empty State Chat Redesign Complet:** Card de bun venit cu recomandări acționabile.
- [x] **Add Meal Flow Rapid pentru Fructe:** Tranziție directă la selecția de grame/porții.
- [x] **Add Meal CTA & Scroll:** `paddingBottom: 160px` și opțiuni vizibile pe orice lățime de ecran.
- [x] **Scanner Barcode cu Fallback Util:** Eliminarea alertelor seci, afișarea cardului interactiv cu ultimul cod scanat.

### 10.2 DATE / CONȚINUT
- [x] **`foodPresets.ts` Extins Masiv:** Peste 30 de fructe, legume, lactate, carne/pește, gustări și porții rapide românești.
- [x] **`barcode_cache` în Supabase:** Tabelă SQL dedicată cu indexare pe `updated_at`.
- [x] **Salvare Produs Completat Manual:** Endpoint `/api/salveaza-produs-barcode` pentru îmbogățirea colaborativă a catalogului.

### 10.3 BACKEND
- [x] **Cache Barcode 3 Straturi:** Căutare locală Supabase -> OpenFoodFacts -> Fallback.
- [x] **Validare Strictă & Securitate:** Verificare parametri EAN, limite payload 1MB, protecție JWT.

---

## SECȚIUNEA 11 — CE PROBLEME POATE AVEA APLICAȚIA LA 3.000 OAMENI SIMULTAN

Afișare directă a riscurilor arhitecturale la 3.000 de utilizatori concurenți (CCU):

1. **Problema 1: Backend Single Instance (Express)**
   - Un singur proces Node.js sub sarcină de 3k cereri concurente pe `/api/chat`, `/api/analizeaza-mancare-structurat` sau `/api/produs-barcode` va suferi blocaje pe Event Loop, creștere de latență și erori 504 / OOM.
2. **Problema 2: Apeluri AI Scumpe și Lente**
   - Rutele care interogează Gemini sau Groq au latență intrinsecă mare (2–10 secunde). La trafic de vârf, limitele externe de rată (429 Too Many Requests) de la furnizorii AI vor genera erori intermitente pentru utilizatori.
3. **Problema 3: Cache In-Memory Nu Scalează pe Mai Multe Instanțe**
   - Cache-ul curent `Map()` pentru token-uri sau rate limiting nu este partajat între instanțe, scăzând eficiența dacă se rulează într-un cluster orizontal.
4. **Problema 4: OpenFoodFacts Latență / Coverage Incomplet**
   - Apelurile simultane către API-ul public OpenFoodFacts pot primi timeout-uri sau limitări de trafic din partea serverelor externe.
5. **Problema 5: Supabase — Gât de Sticlă pe Citiri/Scrieri de Vârf**
   - Interogările neindexate sau citirile frecvente la fiecare deschidere de ecran pot satura conexiunile la baza de date PostgreSQL.
6. **Problema 6: Upload de Imagini (Analiză Foto)**
   - Upload-ul sincron de fișiere (până la 5MB) consumă lățime de bandă și spațiu I/O temporar pe disc (`os.tmpdir()`).
7. **Problema 7: Lipsa Unei Cozi (Queue) pentru Task-uri Grele**
   - Procesările foto grele rulate sincron țin conexiunea HTTP deschisă, blocând thread-uri.

---

## SECȚIUNEA 12 — CE TREBUIE IMPLEMENTAT CA APLICAȚIA SĂ REZISTE LA 3.000 USERI

### 12.1 BACKEND / INFRASTRUCTURĂ
- **Cache Distribuit în Redis:** Migrarea `tokenCache` și a rate limiter-ului dintr-o memorie locală într-un cluster Redis / Upstash.
- **Scalare Orizontală:** Rularea serverului Express în minimum 2–4 instanțe în spatele unui Load Balancer (AWS ALB / Google Cloud Run / Render/Fly.io cu auto-scaling).
- **Circuit Breaker & Retry:** Implementarea de retries exponențiale limitate și fallback determinist pentru AI.
- **Cozi Asincrone (Worker Separat):** Utilizarea BullMQ / AWS SQS pentru procesări foto grele.

### 12.2 BAZĂ DE DATE (SUPABASE / POSTGRESQL)
- **Indexuri Asigurate:**
  - `user_id` și `created_at` pe tabelele `mese`, `antrenamente`, `produse_camara`.
  - Primary key pe `code` și index pe `updated_at DESC` pe `barcode_cache`.
- **Connection Pooling:** Utlizarea Supabase PgBouncer (mod Transaction) pentru a suporta mii de conexiuni simultane fără epuizarea socket-urilor.

### 12.3 CONTROL COSTURI & OPTIMIZARE FRONTEND
- **Debounce & Cooldown:** Prevenirea trimiterilor multiple accidentale pe butoane.
- **Virtualizare:** Utilizarea exclusivă a `FlatList` cu `initialNumToRender` și `windowSize` optimizat pentru listele lungi din Jurnal și Cămară.

---

## SECȚIUNEA 13 — VALIDARE FINALĂ (VERIFICĂRI TEHNICE)

- [x] `npx tsc --noEmit` trece cu 0 erori TypeScript.
- [x] `npx expo lint` trece cu 0 avertismente (curățare importuri neutilizate).
- [x] `npm test` pe backend trece 100% (9/9 teste unitare).
- [x] Header-ul de chat arată modern, coerent cu restul aplicației NutriAI.
- [x] Fluxurile de adăugare masă și scanare barcode oferă experiență fluidă, cu fallback complet funcțional.
