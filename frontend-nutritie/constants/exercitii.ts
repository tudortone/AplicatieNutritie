export interface ExercitiuPreset {
  id: string;
  nume: string;
  tip: string;
  icon: string;
  met: number; // Metabolic Equivalent of Task
}

export const exercitiiPresets: ExercitiuPreset[] = [
  { id: 'alergat', nume: 'Alergat (ușor/mediu)', tip: 'cardio', icon: '🏃', met: 9.8 },
  { id: 'ciclism', nume: 'Ciclism / Bicicletă', tip: 'cardio', icon: '🚴', met: 7.5 },
  { id: 'forta', nume: 'Antrenament cu greutăți / Forță', tip: 'strength', icon: '🏋️', met: 6.0 },
  { id: 'inot', nume: 'Înot', tip: 'cardio', icon: '🏊', met: 8.3 },
  { id: 'mers', nume: 'Mers alert', tip: 'cardio', icon: '🚶', met: 3.5 },
  { id: 'hiit', nume: 'HIIT / Circuit cardio intens', tip: 'cardio', icon: '⚡', met: 10.0 },
  { id: 'yoga', nume: 'Yoga / Stretching / Pilates', tip: 'flexibility', icon: '🧘', met: 2.5 },
  { id: 'fotbal', nume: 'Fotbal / Baschet / Sport de echipă', tip: 'sport', icon: '⚽', met: 7.0 },
  { id: 'box', nume: 'Box / Sac de box', tip: 'cardio', icon: '🥊', met: 9.0 },
  { id: 'banda', nume: 'Bandă de alergat / Înclinație', tip: 'cardio', icon: '🏔️', met: 6.5 },
];

/**
 * Calculează caloriile arse folosind formula MET standard:
 * kcal = MET * greutate_kg * ore
 */
export function calculeazaCaloriiArse(met: number, greutateKg: number, durataMin: number): number {
  if (!met || !greutateKg || !durataMin) return 0;
  const ore = durataMin / 60;
  return Math.round(met * greutateKg * ore);
}
