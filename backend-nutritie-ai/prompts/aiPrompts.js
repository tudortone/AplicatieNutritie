'use strict';

/**
 * Modul centralizat pentru prompt-urile furnizorilor AI.
 */

const getEstimeazaMancareTextPrompt = (textCuratat) => {
  return `Estimează valorile nutriționale pentru 1 porție standard din: "${textCuratat}". RETURNEAZĂ STRICT UN OBIECT JSON în formatul: {"nume": "${textCuratat}", "calorii": 300, "proteine": 15, "carbohidrati": 30, "grasimi": 10, "gramajDefault": 150}. Fără text adițional.`;
};

const getVisionFallbackPrompt = (currentIngredients, userPrompt) => {
  return `Ești un asistent nutrițional expert și precis. 
Ai o listă de ingrediente detectate inițial sau curent: ${JSON.stringify(currentIngredients)}
Și o instrucțiune/explicație de la utilizator: "${userPrompt}"

IMPORTANT - SMART MERGE SAU REPLACE LOGIC:
1. Analizează intenția utilizatorului:
   - DACĂ utilizatorul spune că un aliment identificat este COMPLET ALTCEVA (sau că nu este acel aliment deloc, ex: "Nu e sos roșu, sunt cârnăciori", "That's not tomato sauce, it's sausage", "Șterge orezul, am mâncat doar carne"), atunci ȘTERGE complet elementul/elementele vechi invalidate și returnează DOAR noile alimente corecte. Setează "action_taken": "replaced".
   - DACĂ utilizatorul adaugă un aliment nou sau corectează/modifică gramajul unui aliment existent (ex: "Am mai adăugat 50g brânză", "Cartofii au 200g, nu 100g", "I also added 50g of cheddar cheese and the potatoes are actually 200g"), combină/actualizează lista păstrând elementele valide și adăugându-le/corectându-le pe cele cerute. Setează "action_taken": "appended".

2. Calculează macronutrienții reali și rezonabili per 100g și estimează cantitatea în grame ("estimare_grame") pentru fiecare ingredient din lista finală.

Returnează DOAR JSON valid exact în formatul:
{
  "action_taken": "replaced" sau "appended",
  "ingredients": [
    {
      "nume": "string (numele alimentului în română)",
      "calorii_per_100g": number,
      "proteine_per_100g": number,
      "carbohidrati_per_100g": number,
      "grasimi_per_100g": number,
      "estimare_grame": number
    }
  ]
}`;
};

const getBarcodeFallbackPrompt = (code) => {
  return `Utilizatorul din România a scanat codul de bare EAN/UPC "${code}" dar nu a fost găsit în baza internațională.
Dacă cunoști cu certitudine acest cod de bare și produsul asociat (ex. un brand românesc recunoscut, apă, iaurt, mezeluri, dulciuri), returnează detaliile reale.
Dacă nu știi cu exactitate produsul corespunzător codului "${code}", generează un profil generic plauzibil pentru un produs alimentar ambalat (ex. Nume: "Produs alimentar ambalat (${code})", calorii ~250, proteine ~10, carbohidrați ~30, grăsimi ~10).
RETURNEAZĂ STRICT EXCLUSIV UN OBIECT JSON valid în acest format:
{
  "codBare": "${code}",
  "nume": "Numele produsului (sau Produs alimentar ambalat)",
  "brand": "Brand recunoscut sau Estimat",
  "cantitate": "100g",
  "calorii": 250,
  "proteine": 10,
  "carbohidrati": 30,
  "grasimi": 10
}`;
};

module.exports = {
  getEstimeazaMancareTextPrompt,
  getVisionFallbackPrompt,
  getBarcodeFallbackPrompt
};
