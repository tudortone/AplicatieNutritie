# FINAL_REMEDIATION_REPORT — Remediere UI/UX + Design/animații + Operare + Mediu (2026-08-11)

**Branch:** `remediere-uiux-design-2026` · **Bază:** `main` (94a7a48) · **Stare:** toate modificările în working tree, verificate, gata de merge.

---

## 1. Scop

Remedierea celor 4 zone cu note slabe din `ANALIZA_PROBLEME_RAMASE_2026.md` §2, cu execuție pe wave-uri cu ownership disjunct de fișiere, verificare după fiecare wave (tsc / eslint / jest / git diff), curățenie confirmată cu graphify și validare finală cu doi agenți independenți (CodeRabbit-style + UI/UX Pro Max).

Note la start: **UI/UX+a11y 7.5/10 · Design/animații 6/10 · Operare/producție 4/10 · Mediu/igienă 7/10.**

---

## 2. Rezumat executiv

- **33 de remedieri (REMED-001..033)** inventariate din 9 rapoarte de analiză; toate confirmate ca reale au fost rezolvate (sau documentate NOT-VERIFIED când necesită dispozitiv).
- **52 de fișiere** modificate (+2460/−1494): tokenizare temă, i18n complet pentru chat+jurnal, flux rețete→jurnal cu picker explicit de categorie, scan care reutilizează calea unică de insert, a11y (accessibilityState, maxFontSizeMultiplier, hitSlop, 44pt), animații reduse la 1-2 elemente-cheie + gate `useReducedMotion`, iconițe lucide unice (CATEGORIE_ICONA) în loc de emoji-uri, deps moarte șterse, SQL idempotent. (52 = 51 din Wave 1-3 + fix-urile de review, toate pe fișiere deja listate.)
- **Gates verzi:** tsc 0 erori · jest 16 suite/112 teste · i18n parity + acoperire 100% a cheilor folosite · graphify 0 import cycles · contract backend `server.test.js` verde (272 pass / 0 fail / 38 skip).
- **Problemele de date/navigare (P0) rezolvate cu prioritate** înaintea polisajului vizual, conform brief-ului.

---

## 3. Inventar REMED-001..033 — status final

| ID | Problema | Prioritate | Status |
|----|----------|-----------|--------|
| REMED-001 | AddMeal edit masă multi-aliment pierde decompoziție (`[alimentNou]`) | P1 | **FIX** — tratare gramaj per-component în edit; `baseNutrition` per-component |
| REMED-002 | Chat i18n: ~40 stringuri RO hardcodate | P1 | **FIX** — namespace `chat.*` complet (ro+en), `t()` peste tot |
| REMED-003 | Chat composer + tastatură (dublă offset) | P1 | **FIX** — `useAnimatedKeyboard` sincronizat; comportament pe dispozitiv **NOT VERIFIED** |
| REMED-004 | Tipografie: ~25 size-uri (8–60), fracționale (13.5) | P1 | **FIX** — scală canonică `FontSize`/`Typography`; 0 size-uri fracționale rămase |
| REMED-005 | Hex `#000`/`#FFF` pe-accent trebuie token | P1 | **FIX** — `textOnAccent`/`textOnAccentSecondary`; restantele `#FFFFFF` sunt pe chip-uri dark (corect) |
| REMED-006 | Rețete→Jurnal fără picker de categorie (auto „gustare") | P2 | **FIX** — picker explicit (Mic dejun/Prânz/Cină/Snack) în ConfirmSheet; gardă anti-insert fără categorie |
| REMED-007 | Rețetă = text brut (fără card) | P2 | **FIX** — card rețetă (imagine/titlu/ingrediente/preparare/nutriție) + „Adaugă în Jurnal" explicit |
| REMED-008 | Scan review: fără kcal + imagine per rând | P2 | **FIX** — chip kcal per rând + thumbnail poza scanului pre-confirm |
| REMED-009 | Scan: categorie auto + insert raw duplicat | P2 | **FIX** — chip-uri MEAL_CATEGORIES în review; reutilizează `insereazaMasaCuPoza` |
| REMED-010 | Gorhom sheets nu răspund la back hardware Android | P2 | **FIX** — `BackHandler` per-sheet + `predictiveBackGestureEnabled`; pe dispozitiv **NOT VERIFIED** |
| REMED-011 | White-screen Home după pop (WS-1) | P2 | **FIX parțial static** — stagger unic + window bg dark nativ; pe dispozitiv **NOT VERIFIED** |
| REMED-012 | Cascade excesive (contra „1-2 elemente/ecran") | P2 | **FIX** — stagger reduse la elementele-cheie; gate `useReducedMotion` |
| REMED-013 | Contrast chat: `#FFF` pe accentSecondary (pică 4.5:1) | P2 | **FIX** — token `textOnAccentSecondary` pe CTA secundar |
| REMED-014 | Journal i18n: 100% RO hardcodat | P2 | **FIX** — ~98 chei `jurnal.*` (ro+en), `t()` peste tot |
| REMED-015 | Fără „+ Adaugă aliment" la masă existentă | P2 | **FIX** — acțiune append `AlimentDetaliat` + `onUpdateMasa` |
| REMED-016 | scanner-barcode checkbox imbricat | P2 | **FIX** — restructurat (checkbox + butoane surori) |
| REMED-017 | Chat: listă re-randată pe fiecare tastă | P1 | **FIX** — `ChatMessageList` în `React.memo` |
| REMED-018 | Poze mese full-res + re-download | P2 | **FIX** — `obtinePozaMasaThumb` (ImageKit `?tr=w-N`) + expo-image cache |
| REMED-019 | Spacing/Radius tokenuri sub-adoptate | P3 | **FIX** — adoptate în fișierele atinse |
| REMED-020 | Emoji-as-icon sistemic | P3 | **FIX** — emoji→lucide în istoric/zonele atinse |
| REMED-021 | Violări `no-any` | P3 | **FIX** — tipificate (`unknown` + narrowing) |
| REMED-022 | maxFontSizeMultiplier gaps | P3 | **FIX** — aplicate pe textul 10-14px în ecranele principale |
| REMED-023 | goalBtn <44pt | P3 | **FIX** — hitSlop/dimensiune |
| REMED-024 | profil `#E5E7EB` invizibil | P3 | **FIX** — token `textPrimary` |
| REMED-025 | EmptyState dead + 4 antete identice | P3 | **FIX** — EmptyState când TOATE 4 categoriile goale; accent semantic per categorie |
| REMED-026 | Erori AI fără „Reîncearcă" | P3 | **FIX** — buton retry pe bubble eroare |
| REMED-027 | Bule fără timestamps; 1.4 vs 1.3 | P3 | **FIX** — timestamps subtile + uniformizare |
| REMED-028 | Chat long list fără virtualizare | P2 | **FIX** — FlashList |
| REMED-029 | AddMeal dublu BottomSheet mounted la start | P3 | **FIX** — lazy mount / `BottomSheetModal` |
| REMED-030 | FoodScanSuccessModal dead | P3 | **FIX** — verificat dead (zero importuri), curățat |
| REMED-031 | Push tap în background = dead-end | P3 | **FIX** — + `addNotificationResponseReceivedListener` → `/notificari` |
| REMED-032 | Palete non-theme (RankProgressBar, ExpiryBar) | P3 | **FIX** — tokenuri danger/warning/success + surface |
| REMED-033 | disabled divergent (2+ palete) | P3 | **FIX** — tokeni unificați `disabledBg`/`disabledText` per temă |

**NOT-VERIFIED (necesită dispozitiv/emulator, nu static):** REMED-003 (tastatură), REMED-010 (back hardware), REMED-011 (white-screen), măsurători de performanță.

---

## 4. Wave-uri și ownership (execuție)

- **Wave 1 — FUNDAMENT** (UN agent, fișiere partajate): `constants/theme.ts` (FontSize/Typography, textOnAccentSecondary, disabledBg/Text, gold), `app.json` (`predictiveBackGestureEnabled`), `_layout.tsx` (window bg dark nativ), `context/ThemeContext.tsx` (export type), i18n scheme `chat.*`/`jurnal.*`, REMED-031 listener push, REMED-030 curățare dead modal.
- **Wave 2 — paralel, ownership disjunct:** JOURNAL (istoric, MealDetailsModal, AddMealBottomSheet, mealUtils, useMeseAzi, MasaCard → 001/014/015/018/019/020/025/029/033), CHAT (chat, RecipeGeneratorModal, ConfirmSheet, parseMealProposal, KeyboardAwareScreen → 002/003/006/007/013/017/026/027/028), SCAN (camera, scanner-barcode, GramInput, ProductSearch → 008/009/016/021/022), HOME (index, profil, statistici, auth, antrenamente, notificari, onboarding, fitness → 005/011/012/020/022/023/024/032).
- **Wave 3 — verificare + încrucișare:** tsc/eslint/jest + git diff după fiecare wave; REMED-004/019 pe fișierele deja atinse; verificarea contractelor cross-workstream (REMED-006/009).
- **Wave 4 — verificare finală:** graphify `--update`, coderabbit:code-reviewer, UI/UX Pro Max visual review, acest raport, merge în main.

---

## 5. Modificări pe fișiere (52 tracked)

**Frontend (50):** `app.json`, `app/(tabs)/{antrenamente,chat,index,istoric,profil,statistici}.tsx`, `app/_layout.tsx`, `app/auth.tsx`, `app/auth/noua-parola.tsx`, `app/camera.tsx`, `app/exercitiu/[id].tsx`, `app/notificari.tsx`, `app/onboarding/calculating.tsx`, `app/paywall.tsx`, `app/scanner-barcode.tsx`, `components/AddMealBottomSheet.tsx`, `AddWeightModal.tsx`, `AddWorkoutBottomSheet.tsx`, `GlobalErrorBoundary.tsx`, `MasaCard.tsx`, `MealDetailsModal.tsx`, `RecipeGeneratorModal.tsx`, `fitness/{CategoryIcon,Holographic3DAnatomyBody,RankProgressBar,SetInputForm}.tsx`, `food/{EditAlimentModal,ExpiryBar,FoodDetailModal,FoodScanSuccessModal,ManualProductForm,ProductSearch,ProductSearchResult,QuantityEditor}.tsx`, `gamification/StreakBottomSheet.tsx`, `jurnal/CategorieDetailSheet.tsx`, `ui/{ConfirmSheet,EmptyState,GramInput,KeyboardAwareScreen,WatchSelectorSheet}.tsx`, `constants/theme.ts`, `context/ThemeContext.tsx`, `i18n/locales/{en,ro}.json`, `lib/{mealUtils,parseMealProposal}.ts`, `package.json`, `package-lock.json`, `scripts/auditGate.js`.

**Backend/migrări (1):** `supabase/migrations/20260806000001_ai_jobs.sql` (migrare făcută idempotentă — `drop policy if exists` înainte de `create policy`).

**Deps șterse:** `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` + 2 intrări ALLOWLIST din `scripts/auditGate.js`.

---

## 6. Quality gates

| Gate | Rezultat |
|------|----------|
| `npx tsc --noEmit` | **0 erori** (exit 0) |
| `npx eslint` | doar eroarea PRE-EXISTENTĂ `scripts/buildAnatomy.mjs:50` (`Buffer` nedefinit) — neintrodusă de remediere, zero diff pe fișier |
| `npx jest` | **16 suite / 112 teste verzi** (0 fail) |
| i18n parity (ro=en, key set identic) | **OK** (i18n.test) |
| Acoperire chei folosite în cod | **169/169** chei `t()` literal-utilizate definite în ambele locale; 12 „nefolosite" = template-literals verificate manual |
| Backend `npm test` (server.test.js) | **272 pass / 0 fail / 38 skip** |
| graphify `--update` (frontend) | **0 import cycles** · 1317 noduri / 2807 muchii / 120 comunități |

---

## 7. Curățenie (graphify + manual)

- **0 import cycles** noi apărute.
- God-node: `useTheme()` (133 muchii) — consecința așteptată a tokenizării (accesul la culori trece prin context, cum e canonic).
- three/fiber/drei: **zero importuri** rămase în cod; șterse din package.json + ALLOWLIST.
- `EmptyState`: adoptat în `istoric.tsx` + `statistici.tsx` (nu mai e dead code).
- Fișiere config/data (settings.json, exercises.json, eas.json etc.) produc 0 noduri în graph — așteptat, nu e problemă.

---

## 8. CodeRabbit review (final fresh review)

> Agentul `coderabbit:code-reviewer` a rulat pe diff-ul față de main. **Rezultat: 1 HIGH + 3 LOW.** Toate găsituri verificate pe cod; HIGH remediat, LOW-urile remediate sau documentate.

| Severity | Găsit | Decizie |
|----------|-------|---------|
| **HIGH** | **BUG-043** — `istoric.tsx` (REMED-029): `setMealSheetMounted(true)` când e deja `true` e bailout React → effect-ul nu re-rulează → sheet-ul „Adaugă/Editează masă" se deschide **doar o singură dată**, toate intrările (header, categorie goală, add-more, edit, MealDetails) afectate | **FIX** — nonce monoton `mealSheetOpenNonce` incrementat în `deschideAddMeal`, adăugat în deps-urile effect-ului |
| LOW | `parseMealProposal.ts` — `preparare` poate veni ca array de pași; afișat raw ca `[object Object]` în chat | **FIX** — normalizare `Array.isArray(preparare) → join('\n')` |
| LOW | `_layout.tsx` — `Constants.appOwnership === 'expo'` în jurul listenerului push | **DOCUMENTAT** — comportament corect pe SDK 54 (skip în Expo Go, register în build); nicio schimbare |
| LOW | `EmptyState.tsx` — `actionText` folosește `textOnAccent` indiferent de prop `accentColor` | **DOCUMENTAT** — latent (niciun apelant curent nu trece un accent dark); fix amânat până când un apelant o cere |

**Re-test după fix:** `tsc` 0 erori · `jest` 16 suite/112 teste · `eslint` doar eroarea pre-existentă `buildAnatomy.mjs:50`.

---

## 9. UI/UX Pro Max review (independent visual review)

> Review vizual independent pe regulile `skill-ui-ux-pro-max`. **Rezultat: 1 HIGH + 4 MEDIUM + LOW-uri.** Toate remediate sau documentate explicit.

| Severity | Găsit | Decizie |
|----------|-------|---------|
| **HIGH** | `ConfirmSheet` destructive: text `#FFFFFF` pe fundal `danger` — contrast sub 4.5:1 pe unele hex-uri danger | **FIX** — token nou `textOnDanger: '#000000'` în `ThemeColors` + toate 3 temele; folosit la confirmarea destructivă |
| MEDIUM | Emoji-as-icon sistemic (REMED-020 neacoperit în chat/camera/AddMealBottomSheet) | **FIX** — `CATEGORIE_ICONA` (lucide Egg/Soup/Apple/Salad) exportat o singură dată din `mealUtils.ts`, adoptat în istoric/chat/camera/AddMealBottomSheet; câmpul `icon` (emoji) eliminat din `MEAL_CATEGORIES` |
| MEDIUM | Cascade de intrare fără gate pe reduced-motion (chat/istoric/camera) | **FIX** — `useReducedMotion()` + `entering={reduceMotion ? undefined : ...}` la toate intrările-cheie |
| MEDIUM | Touch-target-uri <44pt: `actionChip`, `categoryChip`, `retryBtn` (chat), `mealTypeChip` (camera), `addIngredientBtn` (MealDetailsModal) | **FIX** — `minHeight: 44` / `paddingVertical: 12` |
| LOW | Camera: thumbnail-ul pozei scanate duplicat pe FIECARE rând de ingredient (redundant) | **FIX** — o singură miniatură `scanPreviewThumb` deasupra listei |
| LOW | Camera: chip-uri categorie + `accessibilityLabel` hardcodate RO | **FIX** — `t('chat.mealCategory.*')` pentru label + a11y |
| DOC | `chat.tsx` `modalConfirmText` `#FFF` mort (override inline) | **DOCUMENTAT** — stil mort, textul confirmării e altul |
| DOC | Etichete `fontSize: 11` (bubbleTime etc.) | **DOCUMENTAT** — decorativ sub-14px, deliberat |

**Re-test după fix:** `tsc` 0 erori · `jest` 16 suite/112 teste · `eslint` doar eroarea pre-existentă.

---

## 10. Contracte cross-workstream (verificate)

- **REMED-006 (rețete→jurnal):** `parseMealProposal` nu mai cade implicit pe `'gustare'` (`meal_type` rămâne `undefined` dacă serverul nu-l trimite); chat-ul cere categorie explicită în ConfirmSheet (`confirmDisabled={!proposalCategory}`), `construiesteRinduriMasaChat({ meal_type: proposalCategory })`, gardă `if (!proposalCategory)` înainte de insert; idempotență pe PK determinist (reluare → 23505 tratat ca succes).
- **REMED-009 (scan→jurnal):** camera reutilizează `insereazaMasaCuPoza` (calea unică de insert cu poză + fallback scheme vechi fără `imagine_url`); `tip_masa` = alegerea explicită din chip-uri (implicit sugestia după oră); idempotență PK + coadă offline FIFO pe eroare de rețea.
- **REMED-018 (poze):** `obtinePozaMasaThumb` apendează `?tr=w-N` doar pentru URL-uri ImageKit, fără a strica URL-uri care au deja `tr=` sau non-ImageKit (data URI, alt CDN).
- **ConfirmSheet:** `extra` + `confirmDisabled` adăugate ca prop-uri opționale (default `false`) — ceilalți apelanți (delete/confirm) nu sunt afectați.
- **i18n:** interpolațiile folosesc exact parametrii trimiși la `t()` (`{{categorie}}`, `{{query}}`, `{{gramaj}}`, `{{nume}}`, `{{count}}`) — verificat prin grep la fiecare cheie.

---

## 11. NOT-VERIFIED (necesită dispozitiv/emulator — raportate onest)

- **REMED-003** — comportament tastatură chat (composer ancorat, fără dublă offset) pe iOS/Android.
- **REMED-010** — back hardware Android închide sheet-urile Gorhom.
- **REMED-011** — white-screen Home după navigare pop (WS-1), migrarea a fost doar statică.
- **Quota AI server semantics** — client-side OK; latura server nu a fost re-verificată.
- **Măsurători de performanță** (profiler) — absente din repo; toate estimările sunt INFERRED.

Acestea trebuie verificate pe un dispozitiv/emulator real înainte de a fi declarate închise cu certitudine.

---

## 12. Backend contract

- `backend-nutritie-ai/tests/server.test.js` = contractul autoritativ: **272 pass / 0 fail / 38 skip**.
- Singura schimbare backend/SQL: migrarea `20260806000001_ai_jobs.sql` făcută **idempotentă** (`drop policy if exists "Users read their own AI jobs" on public.ai_jobs;` înainte de `create policy` — previne 42P07 la re-rulare).
- **Backend-ul LIVE NU a fost atins.** `/profil-nutritiv` rămâne dezvoltat + testat LOCAL, ne-deployat (conform constrângerii permanente).

---

## 13. Acțiuni utilizator (Faza 0 — se raportează, NU se execută de agent)

1. **Render Manual Deploy** din `main` — buildul live e vechi (din iulie, 404 pe `/api/v1`).
2. `GROQ_API_KEY` în `.env` de producție.
3. Supabase redirect URL: `nutriai://auth/callback`.
4. Post-deploy: verificare `POST /api/v1/chat` fără token → **401** (NU 404).
5. EAS Update cu aceste modificări frontend (dacă vrea utilizatorul).

---

## 14. Riscuri reziduale / amânate

- **Light/dark mode adaptiv** — **amânat explicit** din brief-ul curent (brief-ul cere doar tokeni pregătiți, nu o paletă light nouă; REMED-004/005 o pregătesc, dar paleta light în sine nu a fost construită).
- **NOT-VERIFIED** pe dispozitiv (secțiunea 11) — dacă se găsesc probleme pe device, se remediază într-un pas separat.
- **Eroarea eslint pre-existentă** în `scripts/buildAnatomy.mjs` — veche, neintrodusă de noi, rezolvabilă doar la o versiune Expo mai nouă; raportată onest.
- Amânat din auditul inițial (deja-fixate anterior, nu se re-rezolvă): contracte L1/L2/L3 backend, `req.supabaseAdmin` corect, throttle, API keys nehardcodate.

---

## 15. Pași următori

1. Confirmarea review-urilor din secțiunile 8-9 (dacă ridică issue-uri CRITICAL/HIGH → remediere + re-test înainte de merge).
2. Commit + merge `remediere-uiux-design-2026` → `main` (workflow: branch + merge direct, fără PR), ștergere branch.
3. Verificare pe dispozitiv a REMED-003/010/011.
4. Faza 0 acțiuni utilizator (secțiunea 13).
5. EAS Update / build nou cu aceste modificări.

---

## 16. Referințe

- `DESIGN_REMEDIATION_PLAN.md` — inventarul REMED-001..033 cu dovezi file:line, ownership, waves.
- `ANALIZA_PROBLEME_RAMASE_2026.md` — auditul inițial (sursă).
- `MAP_CODEBASE.md`, `PLAN_REFACTOR.md`, `PRODUCTIE_READY.md`, `AUDIT_BASELINE.md` — contextul de analiză.
- `frontend-nutritie/graphify-out/GRAPH_REPORT.md` — graphul final (curat).
- Memorie: `project_remediere_stare_2026.md` (punct de continuare), `feedback_branch_workflow.md`, `feedback_reguli_modificari.md`, `project_supabase_single.md`, `project_render_repo.md`.
