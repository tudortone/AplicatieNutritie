# Reguli Proiect (AplicatieNutritie)

> Instrucțiunile canonice pentru asistenții AI din acest proiect sunt în **`INSTRUCTIUNI_AI.md`**. Regulile operaționale de mai jos sunt obligatorii pentru orice agent care modifică repository-ul.

## Flux Git obligatoriu: `main` unic

1. **Toate modificările se fac direct pe ramura `main`.** Nu crea branch-uri de lucru, branch-uri `fix/*`, PR-uri intermediare sau copii paralele ale aceleiași logici.
2. **Înainte de fiecare modificare, recitește HEAD-ul curent din `main` și fișierele atinse.** Claude și alți agenți pot lucra simultan; nu porni de la un snapshot vechi.
3. **Păstrează și integrează schimbările deja făcute de ceilalți agenți.** Dacă un fișier s-a schimbat între citire și scriere, reîncarcă versiunea nouă și reaplică doar editarea punctuală.
4. **Folosește commit-uri mici și descriptive direct pe `main`.** Un commit trebuie să conțină o singură schimbare logică verificabilă.
5. **Nu folosi force-push, reset distructiv sau rescrierea istoricului.** O problemă se corectează printr-un commit nou sau `revert` explicit.
6. Ramura `backup` este doar un snapshot de siguranță, read-only; nu se dezvoltă pe ea și nu se face merge din ea fără cererea expresă a proprietarului.
7. După fiecare push pe `main`, verifică CI și raportează explicit ce a trecut, ce a eșuat și ce nu a fost executat.

## EAS Update

- Branch-urile/canalele EAS nu justifică branch-uri Git suplimentare.
- Implicit se publică pe canalul EAS asociat lui `main`; alte canale se folosesc numai la cererea expresă a proprietarului.
- După publicare, grupurile vechi se șterg cu `eas update:delete <groupId>` numai după verificarea că noul update este funcțional.
