export type CalorieStateKey = 'start' | 'on_track' | 'aproape' | 'atins' | 'depasit';

export interface CalorieStateConfig {
  key: CalorieStateKey;
  ringColor: string;
  glowColor: string;
  mesaj: string;
  emoji: string;
  isOver: boolean;
  surplusKcal: number;
}

/**
 * Returnează starea vizuală adaptivă pe baza consumului și țintei calorice.
 */
export function getCalorieState(
  consumat: number,
  tinta: number,
  defaultAccent: string,
  defaultSecondary: string
): CalorieStateConfig {
  const t = Math.max(tinta, 1);
  const c = Math.max(consumat, 0);
  const procent = (c / t) * 100;

  if (procent > 100) {
    const surplus = c - t;
    return {
      key: 'depasit',
      ringColor: '#f43f5e', // Roșu de depășire vizibil clar
      glowColor: '#f43f5e',
      mesaj: `Ai depășit ținta cu ${surplus} kcal`,
      emoji: '🔴',
      isOver: true,
      surplusKcal: surplus,
    };
  }

  if (procent >= 90) {
    return {
      key: 'atins',
      ringColor: '#10B981', // Teal / Verde smarald de succes
      glowColor: '#10B981',
      mesaj: 'Țintă atinsă perfect azi',
      emoji: '🎯',
      isOver: false,
      surplusKcal: 0,
    };
  }

  if (procent >= 70) {
    return {
      key: 'aproape',
      ringColor: '#F59E0B', // Galben energetic
      glowColor: '#F59E0B',
      mesaj: 'Aproape de țintă',
      emoji: '⚡',
      isOver: false,
      surplusKcal: 0,
    };
  }

  if (procent >= 15) {
    return {
      key: 'on_track',
      ringColor: defaultAccent,
      glowColor: defaultAccent,
      mesaj: 'Ești pe drumul bun',
      emoji: '✅',
      isOver: false,
      surplusKcal: 0,
    };
  }

  const ora = new Date().getHours();
  let mesajStart = 'Hai să începem dimineața cu energie!';
  let emojiStart = '🌅';
  if (ora >= 12 && ora < 18) {
    mesajStart = 'Timp perfect pentru un prânz nutritiv!';
    emojiStart = '🌤️';
  } else if (ora >= 18 && ora < 23) {
    mesajStart = 'Pregătește o seară echilibrată!';
    emojiStart = '🌙';
  } else if (ora < 5 || ora >= 23) {
    mesajStart = 'Odihnă plăcută și refacere!';
    emojiStart = '✨';
  }

  return {
    key: 'start',
    ringColor: defaultAccent,
    glowColor: defaultSecondary,
    mesaj: mesajStart,
    emoji: emojiStart,
    isOver: false,
    surplusKcal: 0,
  };
}
