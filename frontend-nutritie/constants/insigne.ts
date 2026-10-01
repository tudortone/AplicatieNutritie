export interface Insigna {
  id: string;
  nume: string;
  descriere: string;
  icon: string;
  conditie: string;
  numeI18n: string;
  descriereI18n: string;
  conditieI18n: string;
}

export const INSIGNE_LIST: Insigna[] = [
  {
    id: 'prima_transpiratie',
    nume: 'Prima Transpirație',
    descriere: 'Ai finalizat primul tău antrenament în GetFlow.',
    icon: 'Flame',
    conditie: 'Completarea primului antrenament',
    numeI18n: 'profile.achievements.prima_transpiratie.name',
    descriereI18n: 'profile.achievements.prima_transpiratie.description',
    conditieI18n: 'profile.achievements.prima_transpiratie.requirement',
  },
  {
    id: 'streak_3',
    nume: 'Consecvență 3 Zile',
    descriere: 'Ai completat obiectivul zilnic 3 zile consecutiv.',
    icon: 'Zap',
    conditie: 'Streak >= 3',
    numeI18n: 'profile.achievements.streak_3.name',
    descriereI18n: 'profile.achievements.streak_3.description',
    conditieI18n: 'profile.achievements.streak_3.requirement',
  },
  {
    id: 'streak_7',
    nume: 'Războinic Săptămânal',
    descriere: 'Ai completat obiectivul zilnic 7 zile consecutiv.',
    icon: 'Trophy',
    conditie: 'Streak >= 7',
    numeI18n: 'profile.achievements.streak_7.name',
    descriereI18n: 'profile.achievements.streak_7.description',
    conditieI18n: 'profile.achievements.streak_7.requirement',
  },
  {
    id: 'streak_30',
    nume: 'De neoprit',
    descriere: 'Ai menținut seria activă timp de 30 de zile.',
    icon: 'Crown',
    conditie: 'Streak >= 30',
    numeI18n: 'profile.achievements.streak_30.name',
    descriereI18n: 'profile.achievements.streak_30.description',
    conditieI18n: 'profile.achievements.streak_30.requirement',
  },
  {
    id: 'forta_bruta',
    nume: 'Forță Brută',
    descriere: 'Ai înregistrat 10 antrenamente de forță.',
    icon: 'Dumbbell',
    conditie: '10 antrenamente finalizate',
    numeI18n: 'profile.achievements.forta_bruta.name',
    descriereI18n: 'profile.achievements.forta_bruta.description',
    conditieI18n: 'profile.achievements.forta_bruta.requirement',
  },
  {
    id: 'maratonist',
    nume: 'Maratonist Cardio',
    descriere: 'Ai acumulat peste 100 minute de mișcare cardio.',
    icon: 'Activity',
    conditie: '100+ minute cardio',
    numeI18n: 'profile.achievements.maratonist.name',
    descriereI18n: 'profile.achievements.maratonist.description',
    conditieI18n: 'profile.achievements.maratonist.requirement',
  },
  {
    id: 'maestru_proteine',
    nume: 'Maestru al Proteinei',
    descriere: 'Ai atins ținta zilnică de proteine de 5 ori.',
    icon: 'ShieldCheck',
    conditie: '5 zile țintă proteine',
    numeI18n: 'profile.achievements.maestru_proteine.name',
    descriereI18n: 'profile.achievements.maestru_proteine.description',
    conditieI18n: 'profile.achievements.maestru_proteine.requirement',
  },
  {
    id: 'nivel_5',
    nume: 'Atlet GetFlow',
    descriere: 'Ai avansat la Nivelul 5.',
    icon: 'Award',
    conditie: 'Nivel >= 5',
    numeI18n: 'profile.achievements.nivel_5.name',
    descriereI18n: 'profile.achievements.nivel_5.description',
    conditieI18n: 'profile.achievements.nivel_5.requirement',
  },
  {
    id: 'nivel_10',
    nume: 'Războinic de Elită',
    descriere: 'Ai avansat la Nivelul 10.',
    icon: 'Star',
    conditie: 'Nivel >= 10',
    numeI18n: 'profile.achievements.nivel_10.name',
    descriereI18n: 'profile.achievements.nivel_10.description',
    conditieI18n: 'profile.achievements.nivel_10.requirement',
  },
];
