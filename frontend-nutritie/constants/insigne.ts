export interface Insigna {
  id: string;
  nume: string;
  descriere: string;
  icon: string;
  conditie: string;
}

export const INSIGNE_LIST: Insigna[] = [
  {
    id: 'prima_transpiratie',
    nume: 'Prima Transpirație',
    descriere: 'Ai finalizat primul tău antrenament în NutriAI.',
    icon: 'Flame',
    conditie: 'Completarea primului antrenament',
  },
  {
    id: 'streak_3',
    nume: 'Consecvență 3 Zile',
    descriere: 'Ai completat obiectivul zilnic 3 zile consecutiv.',
    icon: 'Zap',
    conditie: 'Streak >= 3',
  },
  {
    id: 'streak_7',
    nume: 'Războinic Săptămânal',
    descriere: 'Ai completat obiectivul zilnic 7 zile consecutiv.',
    icon: 'Trophy',
    conditie: 'Streak >= 7',
  },
  {
    id: 'streak_30',
    nume: 'De neoprit',
    descriere: 'Ai menținut seria activă timp de 30 de zile.',
    icon: 'Crown',
    conditie: 'Streak >= 30',
  },
  {
    id: 'forta_bruta',
    nume: 'Forță Brută',
    descriere: 'Ai înregistrat 10 antrenamente de forță.',
    icon: 'Dumbbell',
    conditie: '10 antrenamente finalizate',
  },
  {
    id: 'maratonist',
    nume: 'Maratonist Cardio',
    descriere: 'Ai acumulat peste 100 minute de mișcare cardio.',
    icon: 'Activity',
    conditie: '100+ minute cardio',
  },
  {
    id: 'maestru_proteine',
    nume: 'Maestru al Proteinei',
    descriere: 'Ai atins ținta zilnică de proteine de 5 ori.',
    icon: 'ShieldCheck',
    conditie: '5 zile țintă proteine',
  },
  {
    id: 'nivel_5',
    nume: 'Atlet NutriAI',
    descriere: 'Ai avansat la Nivelul 5.',
    icon: 'Award',
    conditie: 'Nivel >= 5',
  },
  {
    id: 'nivel_10',
    nume: 'Războinic de Elită',
    descriere: 'Ai avansat la Nivelul 10.',
    icon: 'Star',
    conditie: 'Nivel >= 10',
  },
];
