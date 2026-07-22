/**
 * pantryUtils.ts — Arhitectură corectă și logică de calcul dinamic pentru modulul 'Cămară' (Pantry).
 * Calculul de valabilitate se face on-the-fly în funcție de coloana `expiration_date` (timestamp)
 * și momentul curent (`Date.now()`), eliminând complet necesitatea unui cron job de noapte
 * care să scadă mecanic `-1 zi` din baza de date.
 */
import { API_URL } from '@/constants/config';

export interface AlimentCamara {
  id: string;
  user_id: string;
  nume: string;
  barcode?: string;
  brand?: string;
  cantitate: number;
  unitate?: string; // ex: 'buc', 'g', 'ml'
  expiration_date: string; // Timestamp ISO format (ex: '2026-07-20T00:00:00.000Z' sau '2026-07-20')
  created_at?: string;
  is_congelat?: boolean;
}

export interface AlimentCamaraProcesat extends AlimentCamara {
  daysRemaining: number;
  isExpired: boolean;
  isUrgent: boolean; // Expiră în mai puțin de 2 zile
  statusColor: string; // Cod de culoare UI (verde/galben/portocaliu/roșu)
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Calculează dinamic `daysRemaining`, marchează produsele expirate (`isExpired`) și
 * returnează o listă sortată automat:
 * - Produsele care expiră cel mai curând sau sunt deja expirate sunt primele.
 * - Produsele fără dată de expirare sunt plasate la final.
 * 
 * NOTĂ DE PERFORMANȚĂ (Scalabilitate):
 * În componentele React, această funcție trebuie apelată în interiorul unui `useMemo(() => sortAndProcessPantryItems(items), [items])`
 * pentru a garanta că rularea O(N log N) are loc DOAR la modificarea listei din state sau din cache, nu la fiecare render.
 */
export function sortAndProcessPantryItems(items: AlimentCamara[]): AlimentCamaraProcesat[] {
  if (!items || items.length === 0) return [];

  // Punctul de referință este începutul zilei curente (ora 00:00:00)
  // pentru calcul consecvent în număr de zile întregi (indiferent de ora curentă din zi)
  const todayStartMs = new Date().setHours(0, 0, 0, 0);

  const processed = items.map((item) => {
    let daysRemaining = Number.MAX_SAFE_INTEGER;
    let isExpired = false;
    let isUrgent = false;
    let statusColor = '#4ADE80'; // verde implicit (proaspăt)

    if (item.expiration_date) {
      const expDate = new Date(item.expiration_date);
      const expTimeMs = expDate.getTime();

      if (!isNaN(expTimeMs)) {
        // Calculăm diferența de timp în milisecunde și convertim în zile
        const diffMs = expTimeMs - todayStartMs;
        daysRemaining = Math.ceil(diffMs / DAY_IN_MS);

        if (daysRemaining < 0) {
          isExpired = true;
          statusColor = '#F87171'; // Roșu - expirat
        } else if (daysRemaining === 0) {
          isUrgent = true;
          statusColor = '#FB923C'; // Portocaliu - expiră astăzi
        } else if (daysRemaining <= 2) {
          isUrgent = true;
          statusColor = '#FACC15'; // Galben - expiră curând (1-2 zile)
        } else {
          statusColor = '#4ADE80'; // Verde - în termen
        }
      }
    }

    return {
      ...item,
      daysRemaining: daysRemaining === Number.MAX_SAFE_INTEGER ? 999 : daysRemaining,
      isExpired,
      isUrgent,
      statusColor,
    };
  });

  // Sortăm crescător după daysRemaining (mai întâi cele expirate și cele urgente, la final cele cu valabilitate lungă sau 999)
  return processed.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Constriește un prompt cu ingredientele selectate disponibile din cămară și îl trimite către /api/chat.
 */
export async function genereazaRetetaDinCamara(
  ingredienteSelectate: string[],
  optiuni?: {
    tipMasa?: string;
    timp?: string;
    caloriiRamase?: number;
    proteineRamase?: number;
    token?: string;
  }
): Promise<string> {
  if (!ingredienteSelectate || ingredienteSelectate.length === 0) {
    throw new Error('Nu au fost selectate ingrediente.');
  }

  const tipMasa = optiuni?.tipMasa || 'Orice';
  const timp = optiuni?.timp || 'Rapid (< 15 min)';
  const caloriiRamase = optiuni?.caloriiRamase || 500;
  const proteineRamase = optiuni?.proteineRamase || 25;

  const prompt = `Am în casă următoarele ingrediente: ${ingredienteSelectate.join(', ')}. Te rog să îmi generezi o rețetă delicioasă și sănătoasă potrivită pentru ${tipMasa === 'Orice' ? 'orice masă a zilei' : tipMasa.toLowerCase()}, cu timp de preparare ${timp.toLowerCase()}. Țintele mele nutriționale rămase pentru astăzi sunt de aproximativ ${Math.max(caloriiRamase, 300)} kcal și ${Math.max(proteineRamase, 15)}g proteine. Include: 1) Numele rețetei, 2) Ingredientele exacte și cantități, 3) Modul de preparare pas cu pas pe scurt, 4) Valorile nutriționale estimate (Calorii, Proteine, Carbohidrați, Grăsimi).`;

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(optiuni?.token ? { Authorization: `Bearer ${optiuni.token}` } : {}),
    },
    body: JSON.stringify({ mesaj: prompt }),
  });

  if (!response.ok) {
    throw new Error('Eroare conexiune server AI.');
  }

  const data = await response.json();
  return data.raspuns || JSON.stringify(data);
}
