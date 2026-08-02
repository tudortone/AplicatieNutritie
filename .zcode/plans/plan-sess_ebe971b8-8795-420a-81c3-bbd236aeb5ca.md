# Plan: Remedieri Coordonate pentru Aplicația Nutriție

## 1. Verificarea Rezultatului Salvării Antrenamentului

**Problemă critică:** În 5 căi de salvare (4 fișiere), `adaugaAntrenament` nu este verificat. Dacă returnează `null` (eșec total), utilizatorul vede totuși "Antrenament salvat" și sesiunea e ștearsă ireversibil.

### Fișiere afectate:
- `app/(tabs)/antrenamente.tsx` (linia 395-413)
- `components/AddWorkoutBottomSheet.tsx` (3 funcții: `salveazaDinEditor`, `handleQuickAdd`, `duplicaDinEditor`)
- `app/exercitiu/[id].tsx` (linia 405-425)

### Modificări:
1. **`handleSaveWorkout`** – adaugă `try/catch`; verifică rezultatul la `adaugaAntrenament`; arată notificare de succes DOAR dacă `result !== null`; nu șterge sesiunea dacă salvarea eșuează.
2. **`AddWorkoutBottomSheet`** – toate cele 3 funcții primesc verificare pe valoarea returnată; notificarea de recompensă se arată doar la succes.
3. **`exercitiu/[id].tsx`** – `handleQuickAdd` verifică rezultatul; `router.back()` doar la succes.
4. **`adaugaProgres`** – elimină `catch {}` gol; arată eroare dacă XP-ul nu s-a acordat.

---

## 2. Controalele Editorului de Seturi

### Fișiere afectate: 7 fișiere în `components/fitness/` și `lib/`

### Modificări:
1. **`SetInputRow.tsx`** – Refactor complet pentru a folosi `useTheme()`; toate cele ~15 culori hardcodate devin `colors.*`.
2. **`SetLogger.tsx`**:
   - Butoanele de step de 28x28 → mărite la minim 40x40 cu `hitSlop`.
   - RPE permite și decrementare (adaugă `onLongPress` sau gest dublu-tap).
   - Adaugă `useEffect` pentru sincronizare cu prop-ul `initialSets`.
   - Gestionare floating-point: rotunjire la 1 zecimal după fiecare operație de step.
   - Adaugă limită superioară la repetări (ex: 999).
   - Interzice ștergerea ultimului set.
   - `getTypeColor` elimină concatenarea fragilă cu `+ '22'`; folosește utilitar de opacitate.
3. **`SeriesConfigurator.tsx`** – Culori hardcodate pentru `AlertTriangle` și error box → `colors.danger`; curăță `setTimeout` la unmount.
4. **`SetInputForm.tsx`** – Butonul de timer `#FF3B5C` → `colors.danger`; text alb → tematic.
5. **`adaptiveInput.ts` + `measurement.ts`** – Aliniază definițiile duplicat de `InputType`, `SetInput`, `FIELDS_BY_TYPE`; extrage o sursă unică.
6. **`ui/Stepper.tsx`** – Mărește `hitSlop` la 12; gestionează notația științifică la blur.

---

## 3. Butoanele Imbricate din Formularul Meselor

**Problemă critică:** `TouchableOpacity`-ul de ștergere favorit este copil al `TouchableOpacity`-ului care aplică valorile favoritului. La apăsare, ambele `onPress` se execută simultan.

### Fișiere afectate:
- `components/AddMealBottomSheet.tsx` (linia 408-430)
- `app/adauga-manual.tsx` (linia 199-215)

### Modificări:
1. Separă butonul de ștergere din ierarhia părintelui. Pune-l poziționat absolut peste colțul chip-ului, fără a fi copil al `TouchableOpacity`-ului părinte.
2. Alternativ: folosește `event.stopPropagation()` pe `onPress`-ul butonului de ștergere.

---

## 4. Valori Nutriționale Zecimale

**Problemă critică:** Tipurile suportă zecimale (`number`), dar `parseInt` trunchiază totul la salvare.

### Fișiere afectate:
- `components/AddMealBottomSheet.tsx`
- `app/adauga-manual.tsx`
- `components/food/QuantityEditor.tsx`
- `components/food/ProductSearch.tsx`
- `components/food/ManualProductForm.tsx`

### Modificări:
1. **`AddMealBottomSheet.tsx`**:
   - `handleSave` (linia 324-327): înlocuiește `parseInt` cu `parseFloat` + rotunjire la 1 zecimală pentru proteine, carbohidrați, grăsimi, fibre.
   - Caloriile rămân `Math.round` (convenție: kcal sunt întregi).
   - `handleGramajChange` (linia 130-133): înlocuiește `Math.round` cu `Math.round(n * 10) / 10` pentru scalearea live.
2. **`adauga-manual.tsx`** – Aliniază `numar()` cu 1 zecimală pentru toate macro-urile; caloriile `Math.round`.
3. **`QuantityEditor.tsx`** – Uniformizează precizia: toate la 1 zecimală.
4. **`ProductSearch.tsx`** – Valorile per-100g folosesc 1 zecimală, nu `Math.round` (ca să nu se piardă 0.4g proteină → 0g).
5. **`ManualProductForm.tsx`** – Extinde limitele superioare (kcal: 900→1000, proteine: 50→100g/100g).
6. **`foodPresets.ts`** – Rezolvă ID-urile duplicate (4 preseturi) pentru a evita coliziuni de key React.

---

## 5. Autentificarea pe Tabletă și Culorile Hardcodate

### Fișiere afectate:
- `app/auth.tsx` (ecranul principal de autentificare)
- `app/_layout.tsx` (ErrorBoundary)
- `components/LockScreen.tsx`
- `constants/theme.ts`
- `context/ThemeContext.tsx`

### Modificări:
1. **`auth.tsx`**:
   - Integrează `useResponsiveLayout()` pentru `contentMaxWidth`, `horizontalPadding`, `fontScale`, `isTablet`.
   - Constrânge cardul formularului la `maxWidth: contentMaxWidth` (680px tabletă, 520px telefon).
   - Fonturi responsive: `fontSize * fontScale` pentru titlu, subtitlu, input-uri.
   - Logo responsive: dimensiune bazată pe `isTablet`.
   - Glow-uri responsive: width/height scalate.
   - Toate cele 14+ culori hardcodate (`#FF4D4D`, `#4ADE80`, `rgba(255,255,255,...)`) → `colors.danger`, `colors.success`, tokenuri tematice noi.
   - Mărește toggle-ul de parolă: `padding: 14` pentru touch target de 46px.
   - Butonul "Ai uitat parola?": mărește padding-ul.
2. **`_layout.tsx`** – `ErrorBoundary`: extrage într-un component care folosește `useTheme()`; toate cele 5 culori devin tematice.
3. **`LockScreen.tsx`** – `shadowColor: '#000'` → `colors.shadow` (token nou).
4. **`theme.ts`** – Adaugă tokenuri noi: `inputBg`, `inputBorder`, `dangerBg`, `dangerBorder`, `shadow`, `overlayLight`, `overlayStrong`.
5. **`KeyboardAwareScreen.tsx`** – Ajustează `keyboardVerticalOffset` dinamic pe tabletă.

---

## 6. Audit Individual pe Ecrane (6 tab-uri)

### Acasă (`index.tsx`)
- Înlocuiește 18+ culori hardcodate (`#f43f5e`, `#00e5ff`, `rgba(255,255,255,...)`) cu tokenuri tematice.
- Cardul de hidratare primește culori din temă (`colors.accentTertiary` sau echivalent per temă).
- Aplică `contentMaxWidth` pe containerul de scroll.
- Adaugă `accessibilityLabel` pe notificări, butoane apă, dismiss sfat.
- `getSalut()`, `getEmoji()`, `sfatAles` → `useMemo`.
- Tratează starea de eroare pentru hook-uri.

### Sport (`antrenamente.tsx`)
- `CTA_COLOR = '#0EA5E9'` → `colors.accent`.
- Textul pe fundal accent (`#0B0F14`) → `colors.background`.
- `MAP_HEIGHT` și `bodyWidth` responsive la tabletă.
- ScrollView orizontal pentru categorii rămâne; verifică overflow pe ecrane mici.

### Jurnal (`istoric.tsx`)
- RefreshControl: starea `refreshing` dinamică (nu hardcodat `false`).
- Adaugă `accessibilityLabel` pe butoanele Adaugă, Revino la azi, Adaugă masă.
- Aplică `contentMaxWidth`.

### Statistici (`statistici.tsx`)
- Bara de depășire (`#f43f5e`) → `colors.danger`.
- `calculPredicieAI` → `useMemo`.
- Graficul de bare: adaugă `accessibilityLabel` per bară.
- Tab-urile Calorii/Greutate → `accessibilityRole="tab"`.
- `salveazaGreutate` și `salveazaGreutateTinta` → try/catch.
- Fallback la `userMeta.greutate_istoric` dacă e array gol.

### Chat (`chat.tsx`)
- Bulele de chat: aplică `getBubbleMaxWidth()` din `theme.ts` pentru tabletă.
- `trimiteMesaj` previne trimiterea dublă (verifică `loadingChat` și în `onSubmitEditing`).
- Curăță timerul banner-ului "Chat nou" la unmount.
- Adaugă `accessibilityLabel` pe butoane sugestii, send, chat nou.
- Salvare istoric chat: debounce la AsyncStorage.

### Profil (`profil.tsx`)
- Toate cele 10+ `rgba(255,255,255,...)` → tokenuri tematice.
- `Switch`-uri: uniformizează `trackColor` (din `#3f3f3f` → `colors.surfaceElevated`).
- Badge grid: `width: '48%'` → responsive (4 coloane pe tabletă).
- Toate `TextInput`-urile și butoanele → `accessibilityLabel`.
- `initProfile`: folosește `AsyncStorage.multiGet` în loc de 14 apeluri secvențiale.
- `salveaza`: diferențiază eroarea de validare vs. eroare de rețea.

---

## Ordinea de Implementare (prioritate descrescătoare)

1. **Salvarea antrenamentului** (critic – pierdere de date)
2. **Butoanele imbricate** (critic – comportament incorect la interacțiune)
3. **Valori nutriționale zecimale** (critic – pierdere de date)
4. **Autentificarea pe tabletă** (high – layout spart pe iPad)
5. **Culorile hardcodate (toate fișierele)** (high – temele ocean/sunset arată incorect)
6. **Controalele editorului de seturi** (medium – UX și consistență)
7. **Auditul ecranelor** (medium/low – accesibilitate, responsive, performanță)

Total estimat: ~45-55 de modificări în ~20 de fișiere.