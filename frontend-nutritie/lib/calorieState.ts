import i18n from '../i18n';

export type CalorieStateKey = 'start' | 'on_track' | 'aproape' | 'atins' | 'depasit';

export interface CalorieStateConfig {
  key: CalorieStateKey;
  ringColor: string;
  glowColor: string;
  mesaj: string;
  iconName: string;
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
  defaultSecondary: string,
  t?: (key: string, options?: any) => string
): CalorieStateConfig {
  const translator = t || (i18n && i18n.t ? i18n.t.bind(i18n) : null);
  const tFn = (key: string, opts?: any, fallback?: string): string => {
    if (translator) {
      const res = translator(key, opts);
      if (res && res !== key) return res;
    }
    return fallback || key;
  };

  const target = Math.max(tinta, 1);
  const consumed = Math.max(consumat, 0);
  const procent = (consumed / target) * 100;

  if (procent > 100) {
    const surplus = consumed - target;
    return {
      key: 'depasit',
      ringColor: '#f43f5e', // Roșu de depășire vizibil clar
      glowColor: '#f43f5e',
      mesaj: tFn('home.calorieState.depasit', { surplus }, `Ai depășit ținta cu ${surplus} kcal`),
      iconName: 'circle',
      isOver: true,
      surplusKcal: surplus,
    };
  }

  if (procent >= 90) {
    return {
      key: 'atins',
      ringColor: '#10B981', // Teal / Verde smarald de succes
      glowColor: '#10B981',
      mesaj: tFn('home.calorieState.atins', {}, 'Țintă atinsă perfect azi'),
      iconName: 'target',
      isOver: false,
      surplusKcal: 0,
    };
  }

  if (procent >= 70) {
    return {
      key: 'aproape',
      ringColor: '#F59E0B', // Galben energetic
      glowColor: '#F59E0B',
      mesaj: tFn('home.calorieState.aproape', {}, 'Aproape de țintă'),
      iconName: 'zap',
      isOver: false,
      surplusKcal: 0,
    };
  }

  if (procent >= 15) {
    return {
      key: 'on_track',
      ringColor: defaultAccent,
      glowColor: defaultAccent,
      mesaj: tFn('home.calorieState.on_track', {}, 'Ești pe drumul bun'),
      iconName: 'check',
      isOver: false,
      surplusKcal: 0,
    };
  }

  return {
    key: 'start',
    ringColor: defaultAccent,
    glowColor: defaultSecondary,
    mesaj: tFn('home.calorieState.start', {}, 'Hai să începem dimineața cu energie!'),
    iconName: 'sun',
    isOver: false,
    surplusKcal: 0,
  };
}
