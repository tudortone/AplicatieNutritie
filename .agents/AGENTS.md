# Reguli Proiect (AplicatieNutritie)

- **Gestionare versiuni Expo Go & EAS Update (`eas update` & `eas update:delete`)**:
  - **Întotdeauna după modificări majore (`modificari majore`)**, se încarcă noua versiune pe serverele Expo prin EAS Update (`eas update`) pe toate branch-urile active (`preview`, `main`, `production`).
  - După sau în timpul publicării, **toate versiunile/grupurile de update-uri vechi trebuie șterse complet (`eas update:delete <groupId>`)** pentru a asigura un mediu curat în Expo Go și a preveni orice conflict sau cache duplicat de versiuni.
