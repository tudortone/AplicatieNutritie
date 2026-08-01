# Raport UI — erori găsite și reparate

Audit pe 18 ecrane (`frontend-nutritie/app/**/*.tsx`) + 4 contexte.

---

## A. Reparat în acest pachet

### A1. Butonul „Salvează" nu răspundea la primul tap (BLOCANT)
`adauga-manual.tsx`, `calculator-ai.tsx`, `(tabs)/profil.tsx`

`ScrollView` fără `keyboardShouldPersistTaps`. Valoarea implicită în React Native este
`"never"`: cu tastatura deschisă, primul tap doar închide tastatura și **este consumat**.
Utilizatorul completa formularul, apăsa Salvează și nu se întâmpla nimic.

→ `keyboardShouldPersistTaps="handled"` pe toate cele trei.

### A2. Tastatura acoperea câmpurile (BLOCANT)
`(tabs)/profil.tsx` (7 input-uri), `calculator-ai.tsx`

Rădăcina era un `<View>` simplu. Proiectul are deja componenta corectă,
`components/ui/KeyboardAwareScreen.tsx` (KeyboardAvoidingView + `keyboardVerticalOffset`
calculat din înălțimea reală a tab bar-ului).

→ Rădăcina ambelor ecrane înlocuită cu `<KeyboardAwareScreen>`.

**Corecție la raportul anterior:** `auth.tsx` și `(tabs)/antrenamente.tsx` foloseau deja
`KeyboardAwareScreen`. Prima verificare a căutat doar `KeyboardAvoidingView` direct și le-a
raportat greșit ca defecte. Nu erau.

### A3. Autentificarea sabotată de autocorect (BLOCANT)
`auth.tsx` — câmpul de email nu avea `autoCorrect={false}`, `autoComplete`,
`textContentType`. Pe iOS autocorectul modifică adresa introdusă → login eșuat cu
„parolă greșită", fără vina utilizatorului. Managerul de parole nu oferea completare
automată, iar fără `returnKeyType` nu se putea trece din tastatură de la email la parolă.

→ Ambele câmpuri au acum `autoComplete` / `textContentType` / `autoCorrect={false}` /
`returnKeyType`.

### A4. Input-uri numerice fără limită
`adauga-manual.tsx` — `maxLength` lipsea complet. Se putea introduce `999999999` kcal,
iar constrângerea `CHECK (calorii <= 15000)` din Postgres returna o eroare brută de bază
de date în loc de validare în interfață.

→ `maxLength={5}` calorii / `{4}` macro, `keyboardType="decimal-pad"` (permite separatorul
zecimal acceptat de helper-ul `numar()`), `returnKeyType="done"`.

### A5. `key={index}` în lista de mesaje
`(tabs)/chat.tsx:504`

`key={index}` + `entering={FadeIn}` + `layout={Layout.springify()}`: la inserarea unui
mesaj React reutiliza componenta greșită → animații care sar și bule care clipesc
afișând textul altui mesaj.

→ `ChatMessage` are acum `id?: string`, generat de `newMsgId()` în toate cele 7 locuri de
creare; `key={msg.id ?? \`msg-${index}\`}`. Câmpul e opțional și are fallback, deci
mesajele salvate anterior în AsyncStorage (fără `id`) continuă să funcționeze.

### A6. Zone sigure hardcodate
`adauga-manual.tsx` (`paddingTop: iOS ? 56 : 36`), `calculator-ai.tsx` (`60`),
`jurnal-antrenamente.tsx` (`50`)

Valori fixe → header suprapus pe Dynamic Island și spațiu gol pe telefoane fără notch.
`SafeAreaProvider` exista deja în `_layout.tsx`, deci reparația a fost ieftină.

→ `useSafeAreaInsets()` + `paddingTop: insets.top + 12`.

### A7. `Dimensions.get('window')` la nivel de modul
`(tabs)/antrenamente.tsx`, `onboarding.tsx`

Citit o singură dată la încărcarea modulului → lățime greșită după rotire, în split-screen
sau pe telefoane pliabile. În `onboarding.tsx` era mai grav: `width` determină pasul de
scroll între slide-uri, deci carusel dezaliniat.

→ `useWindowDimensions()`.

### A8. Avatarul deformat
`(tabs)/profil.tsx` — `<Image>` cu `100%/100%` fără `resizeMode`.
→ `resizeMode="cover"` + `accessibilityLabel`.

### A9. Erori tehnice afișate utilizatorului
`(tabs)/istoric.tsx` afișa `error.message` de la Postgres într-un `Alert`.
→ Mesaj prietenos în interfață, detaliul tehnic în `console.error`.

### A10. Butoanele de Înapoi, inaccesibile
8 butoane în 7 ecrane: iconiță de 24px, fără etichetă și fără `hitSlop`
(sub minimul de 44px recomandat de Apple și Google).
→ `accessibilityRole` + `accessibilityLabel="Înapoi"` + `hitSlop={12}`.

---

## B. Rămas de făcut (nu sunt defecte punctuale, ci lucrări extinse)

1. **Etichete de accesibilitate pe restul butoanelor** — ~225 elemente interactive fără
   etichetă (`chat.tsx` 23, `camera.tsx` 22, `statistici.tsx` 15). Majoritatea sunt
   butoane-iconiță, deci VoiceOver/TalkBack anunță doar „buton". Necesită o decizie de
   text pentru fiecare, nu se poate automatiza corect.
2. **`testID`: 0 apariții** în tot proiectul → niciun test de interfață nu poate ținti nimic.
3. **32 `Alert.alert` cu text hardcodat în română**, deși `i18n/` există și e importat în
   `_layout.tsx`. Schimbarea limbii nu afectează nicio alertă.
4. **149 obiecte de stil inline** (`scanner-barcode` 38, `(tabs)/index` 23, `profil` 21) —
   recreate la fiecare render, anulează memoizarea.
5. **`numberOfLines` lipsește** pe majoritatea textelor lungi → numele lungi de alimente
   ies din card.
6. **Pull-to-refresh** doar pe 3 din 18 ecrane.
7. **`heatColor.ts`**: intensitatea 0 returnează `COLOR_REST` (albastru), deci un mușchi
   niciodată antrenat arată identic cu unul odihnit. Recomandare (2 linii):
   `export const COLOR_INACTIVE = '#3F3F46';` + `if (x <= 0.001) return COLOR_INACTIVE;`
   la începutul lui `heatColor()`. Nu am inclus-o în patch pentru că fișierul nu există în
   exportul local și un context greșit ar face `git apply` să eșueze pe tot patch-ul.

---

## C. Verificat și confirmat corect (nu raporta ca defecte)

- Toate cele 4 `FlatList` au `keyExtractor`.
- Toate cele 5 `<Modal>` au `onRequestClose` (butonul Back funcționează pe Android).
- Nicio listă virtualizată imbricată într-un `ScrollView`.
- `ErrorBoundary` la rădăcină, cu buton de reîncercare.
- Protecția la dublu-tap (`disabled={loading}` + `ActivityIndicator`) există pe toate
  ecranele care salvează.
- Ștergerea are confirmare destructivă.
- `(tabs)/_layout.tsx` și `(tabs)/chat.tsx` tratează corect `insets` și tastatura.
