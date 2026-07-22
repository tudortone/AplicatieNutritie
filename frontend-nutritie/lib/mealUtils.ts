import { TipMasa } from '../types';

export interface CategorieMasaMeta {
  id: TipMasa;
  label: string;
  icon: string;
}

export const MEAL_CATEGORIES: CategorieMasaMeta[] = [
  { id: 'mic_dejun', label: 'Mic Dejun', icon: '🍳' },
  { id: 'pranz', label: 'Prânz', icon: '🍲' },
  { id: 'gustare', label: 'Gustări', icon: '🍎' },
  { id: 'cina', label: 'Cină', icon: '🥗' },
];

export function getTipMasaDupaOra(date: Date = new Date()): TipMasa {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // 05:00 - 11:00 = Mic Dejun (300 min - <660 min)
  if (timeInMinutes >= 5 * 60 && timeInMinutes < 11 * 60) {
    return 'mic_dejun';
  }
  // 11:00 - 15:30 = Prânz (660 min - <930 min)
  if (timeInMinutes >= 11 * 60 && timeInMinutes < 15 * 60 + 30) {
    return 'pranz';
  }
  // 15:30 - 18:30 = Gustare (930 min - <1110 min)
  if (timeInMinutes >= 15 * 60 + 30 && timeInMinutes < 18 * 60 + 30) {
    return 'gustare';
  }
  // 18:30 - 23:59 sau 00:00 - 05:00 = Cină
  if (timeInMinutes >= 18 * 60 + 30 || timeInMinutes < 5 * 60) {
    return 'cina';
  }
  return 'gustare';
}

export function getMealCategoryLabel(tip?: TipMasa): string {
  switch (tip) {
    case 'mic_dejun':
      return 'Mic Dejun';
    case 'pranz':
      return 'Prânz';
    case 'cina':
      return 'Cină';
    case 'gustare':
      return 'Gustări';
    default:
      return 'Alte Mese';
  }
}

export function getMealCategoryIcon(tip?: TipMasa): string {
  switch (tip) {
    case 'mic_dejun':
      return '🍳';
    case 'pranz':
      return '🍲';
    case 'cina':
      return '🥗';
    case 'gustare':
      return '🍎';
    default:
      return '🍽️';
  }
}
