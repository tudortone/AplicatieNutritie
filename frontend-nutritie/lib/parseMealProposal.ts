// Parsare curată a răspunsului AI (format MEAL_PROPOSAL) în structura folosită
// de chat. Funcția e PURE: nu inserează, nu atinge rețeaua — doar transformă
// răspunsul serverului. Salvare/adaugare are loc exclusiv în confirmMealProposal
// (cheia de „fără auto-add" pentru rețete, BUG-007).

export interface MealProposalItem {
  name: string;
  qty: number;
  unit: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  kcal: number;
}

export interface MealProposal {
  type: string;
  // REMED-006: NU mai cădem implicit pe 'gustare' — inserarea cere o categorie
  // explicită de la utilizator (picker în chat). 'meal_type' rămâne doar dacă
  // serverul îl trimite și niciun cod nu inserează pe baza lui fără confirmare.
  meal_type?: string;
  items: MealProposalItem[];
  totals: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    kcal: number;
  };
  // REMED-007: câmpuri opționale uzate de cardul de rețetă (imagine/titlu/pas de preparare).
  imageUrl?: string;
  nume?: string;
  preparare?: string;
}

// Număr din valoare liberă ("200", "200 kcal"); NaN/nevalid -> fallback.
function laNumar(val: any, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function parseMealProposal(text: any): MealProposal | null {
  if (!text) return null;

  let targetObj: any = null;
  if (typeof text === 'object') {
    targetObj = text;
  } else {
    try {
      const stringToParse = String(text);
      const startIndex = stringToParse.indexOf('{');
      const endIndex = stringToParse.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        targetObj = JSON.parse(stringToParse.substring(startIndex, endIndex + 1));
      }
    } catch (e) {
      console.warn("Eroare parsare JSON meal proposal:", e);
    }
  }

  if (targetObj && Array.isArray(targetObj.items) && targetObj.items.length > 0) {
    let calcKcal = 0, calcP = 0, calcC = 0, calcF = 0;
    targetObj.items.forEach((it: any) => {
      calcKcal += laNumar(it.kcal || it.calorii);
      calcP += laNumar(it.protein_g || it.proteine);
      calcC += laNumar(it.carbs_g || it.carbohidrati);
      calcF += laNumar(it.fat_g || it.grasimi);
    });

    const totals = (targetObj.totals && Number(targetObj.totals.kcal || 0) > 0)
      ? targetObj.totals
      : { kcal: calcKcal, protein_g: calcP, carbs_g: calcC, fat_g: calcF };

    // REMED-034: modul de preparare poate veni ca string SAU ca array de pași —
    // normalizăm la text pe o singură linie/pas, ca `chat.tsx` să-l afișeze simplu.
    const preparareRaw = targetObj.preparare || targetObj.mod_de_preparare || targetObj.steps || undefined;
    const preparare = Array.isArray(preparareRaw) ? preparareRaw.join('\n') : preparareRaw;

    return {
      type: "MEAL_PROPOSAL",
      // REMED-006: fără default 'gustare' — dacă serverul nu trimite meal_type,
      // rămâne undefined, iar chat-ul cere alegerea explicită înainte de insert.
      meal_type: targetObj.meal_type || undefined,
      imageUrl:
        targetObj.imageUrl || targetObj.imagine_url || targetObj.photo_url ||
        targetObj.items.find((it: any) => it.imageUrl || it.image || it.poza)?.imageUrl ||
        targetObj.items.find((it: any) => it.imageUrl || it.image || it.poza)?.image ||
        targetObj.items.find((it: any) => it.imageUrl || it.image || it.poza)?.poza ||
        undefined,
      // Titlul rețetei, dacă serverul îl trimite explicit (derivăm altfel din primul item).
      nume: targetObj.nume || targetObj.titlu || targetObj.title || undefined,
      // Modul de preparare, dacă serverul îl trimite ca text (preparare/steps/mod_preparare).
      preparare,
      items: targetObj.items.map((it: any) => {
        // qty ne-numeric ("după gust", "un praf") -> 100g fallback, nu NaN.
        const qty = laNumar(it.qty || it.grame, 100);
        return {
          name: it.name || it.nume || "Aliment",
          qty: qty > 0 ? qty : 100,
          unit: it.unit || "g",
          protein_g: laNumar(it.protein_g || it.proteine),
          carbs_g: laNumar(it.carbs_g || it.carbohidrati),
          fat_g: laNumar(it.fat_g || it.grasimi),
          fiber_g: laNumar(it.fiber_g || it.fibre),
          kcal: laNumar(it.kcal || it.calorii)
        };
      }),
      totals
    };
  }
  return null;
}
