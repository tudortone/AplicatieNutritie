# Reguli Proiect (AplicatieNutritie)

> Instrucțiunile canonice pentru asistenții AI din acest proiect: **`INSTRUCTIUNI_AI.md`** (rădăcina repo-ului). Versiunile vechi (`INSTRUCTIUNI_AI_v5.md`, `INSTRUCTIUNI_GEMINI_v6.md`) au fost contopite acolo și șterse. Acest fișier conține doar regulile operaționale EAS Update.

- **Gestionare versiuni Expo Go & EAS Update (`eas update` & `eas update:delete`)**:
  - **Întotdeauna după modificări majore (`modificari majore`)**, se încarcă noua versiune pe serverele Expo prin EAS Update (`eas update`) pe toate branch-urile active (`preview`, `main`, `production`).
  - După sau în timpul publicării, **toate versiunile/grupurile de update-uri vechi trebuie șterse complet (`eas update:delete <groupId>`)** pentru a asigura un mediu curat în Expo Go și a preveni orice conflict sau cache duplicat de versiuni.
