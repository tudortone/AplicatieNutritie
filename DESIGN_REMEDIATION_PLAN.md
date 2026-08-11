# DESIGN REMEDIATION PLAN — 2026-08-11

Sinteză a 9 rapoarte de analiză read-only (A design system, B Journal, C AI/chat, D Food scan, E Android, F Accessibility, G Animation, H Performance, J Regression) pe `frontend-nutritie`. Baseline la data analizei: **tsc 0 erori · jest 16 suite / 112 teste verzi** · backend contract verde (310 teste) · dif-urile din working tree sunt pur prezentative (verificat de J, nicio logică rescrisă).

Reguli care ghidează implementarea: tokenuri (nu hex), `t()` cu ro+en.json, 1-2 elemente animate/ecran, reduce motion, 44px touch, fără `any`, ownership strict pe fișiere.
Reanimated 4.1.7 NU exporta SharedTransition. Nu se introduc framework-uri noi.

---

## 1. Confirmed issues (real, de rezolvat)

| ID | Screen/component | Sev | Evidence | Root cause | Proposed fix | Files | Test |
|---|---|---|---|---|---|---|---|
| REMED-001 | AddMealBottomSheet edit masă | **P1** | `:368-372`, `:260` | Editarea unei mese cu >1 aliment + tastare gramaj => `[alimentNou]` (pierdere decompoziție); `baseNutrition=null` în edit | tratare gramaj ca edit per-component SAU block redefine când `original.length>1`; goal `baseNutrition` în edit | AddMealBottomSheet.tsx, mealUtils.ts | unit meallUtils; manual edit 3-alimente |
| REMED-002 | Chat i18n | **P1** | chat.tsx ~40 stringuri RO; `chat.*` absent din locales | namespace chat.* lipsă | extrage toate în `t()` cu chei `chat.*` | chat.tsx, RecipeGeneratorModal.tsx, ConfirmSheet.tsx, ro/en.json | i18n.test + grep |
| REMED-003 | Chat composer + tastatură | **P1**(iOS)/P2(Android) | `chat.tsx:309-326,554` + KeyboardAwareScreen:43-45 | padding manual 80↔10 comutat pe `keyboardDidShow/Hide` pe lângă KAV resizze => snap dublu la deschidere/închidere | `useAnimatedKeyboard` + `useAnimatedStyle` sincronizate (sau `keyboardWillShow/WillHide` + LayoutAnimation); fără dublă offset | chat.tsx, KeyboardAwareScreen.tsx | dispozitiv (NOT VERIFIED static) |
| REMED-004 | Tipografie | **P1** | ~25 size-uri (8–60), `13.5` scanner:573/966, hero 56/60/48 | niciun scal tipografic | tokeni Display/H1/H2/H3/Body/Caption/Label/Button; elimină fracționale; unifică hero | theme.ts + fișierele atinse | grep fontSize post/prev |
| REMED-005 | Hex `#000`/`#FFF` pe-accent trebuie token | **P1** | ~20 locuri: index:438/666, antrenamente:873, chat:848/921, AddWeight:119/162/163, ManualProductForm:365/432, QuantityEditor:104/165, exercitiu/[id]:357/358/644, Holographic:107/113, SetInput:132/278, MealDetails:701 | `textOnAccent` există dar nefolosit | înlocuiește cu `colors.textOnAccent` | fișierele listate | tsc + contrast |
| REMED-006 | Rețete → Journal fără category picker | **P2** | parseMealProposal.ts:70, payloadMese.ts:163 | `meal_type` auto-derivat „gustare" | pas explicit categorie (Mic dejun/Prânz/Cină/Snack) înainte de insert, fără auto-insert | ConfirmSheet.tsx, parseMealProposal.ts, chat.tsx | manual |
| REMED-007 | Rețetă = text brut (fără card) | **P2** | chat.tsx, RecipeGeneratorModal.tsx:78 | lipsește card rețetă | card: imagine (dacă există), titlu, ingrediente, cantități, preparare, nutriție estimată; „Adaugă în Jurnal" ca acțiune explicită post-revizie | chat.tsx, RecipeGeneratorModal.tsx | manual |
| REMED-008 | Scan review: fără kcal + imagine per rând | **P2** | camera.tsx:753-776, :804-824 | review rând = nume+grame doar; foto scan nu apare | chip kcal per rând + thumbnail al fotografiei (imageKitUrlRef există pre-confirm) | camera.tsx, FoodScanSuccessModal.tsx | screenshot review |
| REMED-009 | Scan: categorie masă auto fără selector + insert raw | **P2** | camera.tsx:494-574, payloadMese.ts:91 | categorie auto după oră; `supabase.from('mese').insert()` duplică logica journal | chips MEAL_CATEGORIES în review; reutilizează `insereazaMasaCuPoza` (mealUtils:129) | camera.tsx, payloadMese.ts, mealUtils.ts | scan la 17:00, verifică tip_masa |
| REMED-010 | Gorhom sheets nu răspund la back hardware Android | **P2** | AddMealBottomSheet:477, AddWorkout:448, MealDetails:195, FoodDetail:135, EditAliment:78, CategorieDetail:65, WatchSelector:51; `BottomSheetModal` = JS portal | niciun `BackHandler`; hardware back nu închide sheet-ul | per-sheet `BackHandler` (close sau block); `predictiveBackGestureEnabled` (app.json:38) | 7 sheet-uri + app.json | dispozitiv |
| REMED-011 | White-screen Home după pop (WS-1) | **P2** | index.tsx:394/461/564/588/611/634/694/813/861 — 9 stagger `entering` re-attach pe native-pop | mecanism WS-1 încă viu (anim. întârziate pe ecranul Home) | un singur FadeIn pe container + window background dark nativ | index.tsx, app.json, _layout.tsx | dispozitiv — **NOT VERIFIED** |
| REMED-012 | Cascade excesive (contra „1-2 elemente/ecran") | **P2** | profil:13 stagger (387-985), index:9 (700+delay), auth:6 (ZoomIn700+FadeInUp×3+FadeInDown), statistici: replay + per-bar stagger (500:index×60/40/10) | mai multe `entering` pe secțiuni; se re-joacă la focus | păstrează header+câmp central; restul static; fără per-bar stagger; gate `useReducedMotion` | profil, index, auth, statistici, onboarding/calculating | dispozitiv |
| REMED-013 | Contrast chat: `#FFF` pe accentSecondary | **P2** | chat.tsx:848-850 | ~3.96:1 (roz), ~2.98:1 (ocean) la 14px/900 — pică 4.5:1 | token `textOnAccent`-style pe buton P hasillary sau închide bg-ul | chat.tsx, theme.ts | checklist contrast |
| REMED-014 | Journal i18n | **P2** | istoric.tsx, AddMealBottomSheet, MasaCard.tsx:191 (amestec „carbs"+RO) | 100% RO hardcodat; doar `jurnal.empty.*` localizat | toate stringurile prin `t()` cu chei `jurnal.*` | istoric, AddMealBottomSheet, MasaCard, ro/en.json | i18n.test |
| REMED-015 | Fără „+ Adaugă aliment" la o masă existentă | **P2** | MealDetailsModal.tsx:298-341 | rândurile au doar edit/info/delete; AddMealBottomSheet creează masă NOUĂ | acțiune în sheet care face append `AlimentDetaliat` + `onUpdateMasa` | MealDetailsModal.tsx | manual (masă multi-aliment) |
| REMED-016 | scanner-barcode checkbox imbricat | **P2** | scanner-barcode.tsx:216-318 | Pressable role=checkbox exterior îndoieste checkbox intern + 4 butoane | restructurează rândul: checkbox + butoane surori | scanner-barcode.tsx | screen reader |
| REMED-017 | Chat: listă re-randată pe fiecare tastă | **P1** | chat.tsx:688-709, :788 | `.map()` inline în componenta cu `onChangeText` | extrage lista în copil `React.memo` (mesaje ref-stabil); sau memoize per bubble | chat.tsx | profiler, tastare 20 caractere |
| REMED-018 | Poze mese full-res + re-download | **P2** | MasaCard:236-258, lib/mealUtils.ts:164-171, MealDetailsModal:246 (Image RN) | fără `?tr=` transform; modal re-downloadă la fiecare deschidere | helper thumbnail `?tr=w-480,h-*` + expo-image `cachePolicy="memory-disk"` | MasaCard, MealDetailsModal, mealUtils | Flipper/network bytes |
| REMED-019 | Spacing/Radius tokenuri sub-adoptate | P3 | folosite în 5/50 fișiere; AddMealBottomSheet ~60 int-uri | tokenurile există, nu se folosesc | adoptă `Spacing`/`Radius` în fișierele deja modificate | fișierele atinse | visual |
| REMED-020 | Emoji-as-icon sistemic | P3 | ~20 locuri (AddMealBottomSheet:624/690/734/782, istoric:235/262, CategorieDetail:85, Streak, WatchSelector:107, DailyQuests:169, profil:591, onboarding, rank stars) | mix emoji Text vs lucide | înlocuiește emoji cu iconuri lucide de la dimensiunea potrivită | fișierele listate | visual + grep emoji |
| REMED-021 | Violări `no-any` | P3 | camera:232 (`stareAI?: any`), camera:553 (`catch (e: any)`), scanner:72 (`as any`), FoodDetailModal:84 (`icon: any`) | — | tipifică (unknown + narrowing) | 4 fișiere | tsc + eslint |
| REMED-022 | maxFontSizeMultiplier gaps | P3 | scanner-barcode: 0; noua-parola: 0; index: 1; chat: 2 (bubble 1.4); camera: parțial (lipsă scanHint:738, macroValue/Label:806-823, ingredientName:756, addExtraText:789, savingText:864, aiDropdown:666/696, errorText/retryText:854-856, galleryBtnText:909, shutterLabel:935) | acoperire parțială | aplică 1.3 (aliniat; chat 1.4 poate rămâne intenționat) pe textul 10-14px | fișierele listate | Bold-text test |
| REMED-023 | goalBtn <44 | P3 | index.tsx:1023/:738 | 38px, fără hitSlop | hitSlop=6 sau height 44 | index.tsx | măsurare touch |
| REMED-024 | profil `#E5E7EB` invizibil în light | P3 | profil.tsx:1080 | hardcodat | `colors.textPrimary` | profil.tsx | light smoke test |
| REMED-025 | EmptyState dead + 4 antete identice | P3 | istoric:453-461 (useMeseAzi mereu 4 rânduri), istoric:220-254 | EmptyState nu se randează niciodată; categorii separate doar prin emoji | EmptyState când TOATE 4 goale; accent semantic per categorie (accent/accentSecondary/accentTertiary/success) | istoric.tsx, useMeseAzi.ts | visual |
| REMED-026 | Erori AI fără „Reîncearcă" | P3 | chat.tsx:711-724 | idempotenty reutilizează răspuns, dar user trebuie să retasteze | buton „Reîncearcă" pe bubble eroare | chat.tsx | manual |
| REMED-027 | Bule fără timestamps; 1.4 vs 1.3 | P3 | chat.tsx:688-709 | — | timestamps subtile; uniformizează multiplier | chat.tsx | visual |
| REMED-028 | Chat long list fără virtualizare | P2 | chat.tsx:676 | ScrollView render all | FlashList (chei `msg.id` stabile există) | chat.tsx | scroll 100 de mesaje |
| REMED-029 | AddMeal dublu `BottomSheet` non-modal merely | P3 | index.tsx:885, istoric:468 | mounted la start | `BottomSheetModal` lazy | index, istoric | memorie cold-start |
| REMED-030 | FoodScanSuccessModal dead + fără `exiting` | P3 | nu e renderat nicăieri; :31-64 | legacy modal înlocuit | șterge componenta deasupra / dacă păstrată, adaugă `exiting` FadeOut | FoodScanSuccessModal.tsx | grep import |
| REMED-031 | Push tap în background = dead-end | P3 | context/NotificationBannerContext.tsx:210-227 | doar `addNotificationReceivedListener` | + `addNotificationResponseReceivedListener` → `/notificari` | context, _layout | background push |
| REMED-032 | Palete non-theme | P3 | RankProgressBar:21-86, ExpiryBar:42-46 | fixed palette | tokenuri (danger/warning/success + surface) | 2 componente | light/dark |
| REMED-033 | disabled divergent | P3 | AddMealBottomSheet:1080 (`#2A323D/#1A2129`) vs calculator-ai:248, camera:923 (`#333/#222`); text `#64748B` (AddMealBottomSheet:1089) | 2+ palete disabled | tokenuri `disabled*` unificate în theme | theme.ts + fișiere | visual |

## 2. Already fixed issues (NU se re-rezolvă)

- Touch targets water/header 44 + hitSlop (index:978/980 care dă 50/46; _layout:120 → 48) — VERIFIED DONE (agent F).
- EmptyState adoptat în istoric (:453) + statistici (:530/:645) — DONE (doar problematica REMED-025 rămâne: când nu se randează).
- Reduced-motion gate pe toate buclele infinite: BouncingDot:25, SkeletonLoader:32, LockScreen:44, statistici:47 — VERIFIED OK (G-08).
- Notificare delete animație deja simplă (fade+translate, listă stabilă), fără re-adaugat (G-06).
- Gorhom sheets consistente (defaults, snapPoints memoizate) — doar back-hardware lipsește (REMED-010).
- Chat: reply AI atomic (fără churn per-chunk); FlashList în istoric; ProductSearch debounced 280ms + slice(0,25).
- Delete meal cu confirm + optimistic + rollback; day-switch (MonthCalendar); photo infra unică `obtinePozaMasa`.
- Auth/paywall back guarded; edge-to-edge + insets OK (E4); keyboardShouldPersistTaps BUG-042 prezent.
- Regression J: toate cele 7 comportamente VERIFIED-OK; 16 suite verzi.
- Tokenizare Faza A (19 fișiere) + theme gold/textOnAccent + ThemeContext export — VERIFIED (tsc 0).

## 3. Stale audit issues (auditul vechi greșit / depășit)

- MasaCard/header/bell/apă „sub-44" → deja hitSlop≥48+role+label (WCAG 2.5.8 OK).
- Reanimated SharedTransition → NU există în 4.1.7 (folosim layout transitions/entering).
- three/fiber/drei „folosite" → 100% dead, șterse + ALLOWLIST curățat (zero importuri).
- SQL 02/03 CREATE POLICY neguardat → deja idempotente; 20260806000001_ai_jobs.sql completat.
- BUG-013 white-screen „FIXED" → E: mitigare parțială statică, **niciodată verificat pe dispozitiv**; vezi REMED-011 (NOT VERIFIED).

## 4. Ownership / ordine de implementare

**Fișiere partajate rezervate UNUI deținător (FUNDAMENT):** `constants/theme.ts`, `i18n/locales/ro.json`+`en.json`, `app.json`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`?, componente globale (`components/ui/*`). Toți ceilalți implementeri oferă recomandări pentru acestea, nu editează.

- **Wave 1 — FUNDAMENT (un agent):** adaugă tokenii necesari (disabled unite, eventual contrastAccent/pt REMED-013), schemele de chei `chat.*`+`jurnal.*` (strings din plan), `predictiveBackGestureEnabled` (REMED-010 partea app.json), window background dark + lipsă stagger pentru REMED-011 partea native, REMED-031 (listener push în context/_layout), REMED-030 (curăță FoodScanSuccessModal dacă dead), extragere `PressableScale`/helper reducere cascade dacă e nevoie. Rulează PRIMUL.
- **Wave 2 — J / C / S / H în paralel (ownership disjunct):**
  - **JOURNAL:** istoric.tsx, MealDetailsModal.tsx, AddMealBottomSheet.tsx, mealUtils.ts, useMeseAzi.ts, MasaCard.tsx → REMED-001, 015, 014(utilizează chei), 018, 025, 029(istoric), 033(AddMealBottomSheet), 019/020 în zona lui.
  - **CHAT/AI:** chat.tsx, RecipeGeneratorModal.tsx, ConfirmSheet.tsx, parseMealProposal.ts, KeyboardAwareScreen.tsx → REMED-003, 006, 007, 013(utilizează token), 017, 028, 026, 027(utilizează chei chat.*), 002(utilizează chei).
  - **SCAN:** camera.tsx, scanner-barcode.tsx, (FoodScanSuccessModal dacă rămâne), GramInput.tsx, ProductSearch.tsx → REMED-008, 009, 016, 021(camera/scanner), 022(camera/scanner), 030(exiting dacă viu).
  - **HOME/ANIM/DESIGN:** index.tsx, profil.tsx, statistici.tsx, auth.tsx, antrenamente.tsx, onboarding/calculating.tsx, notificari.tsx, componente fitness → REMED-011(utilizează), 012, 005(în fișierele lui), 023, 024, 020(în zona lui), 022(index/auth/antrenamente), 032.
- **Wave 3 — Verificare + încrucișare:** după fiecare wave run tsc/eslint/jest + `git diff` review; rezolvă REMED-004 (tipografia) și REMED-019 (adoptă tokeni) pe fișierele deja atinse, prin FUNDAMENT sau main agent pentru fișiere partajate.
- **Wave 4 — Verificare finală:** graphify `--update`, coderabbit:code-reviewer pe diff, vizual review, raport FINAL.

**Ordinea priorității:** P0 (funcționalitate/datelor — REMED-001) → P1 (chat i18n/keyboard, tipografie, token-uri on-accent, memo liste) → P2 → P3. NU ne apucăm de iconițe/emoji înainte de problemele de date/navigare.

## 5. NOT-VERIFIED (necesită dispozitiv/emulator)

- REMED-003, 010, 011 (comportament tastatură / back hardware / white-screen).
- Quota AI server semantics (client-side OK).
- Toate măsurătorile de performanță (INFERRED, fără profiler în repo).