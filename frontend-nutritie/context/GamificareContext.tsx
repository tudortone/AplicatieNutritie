import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useNotificationBanner } from './NotificationBannerContext';

export interface QuestZilnic {
  id: string;
  descriere: string;
  tip: 'minute_miscare' | 'antrenamente' | 'proteine' | 'calorii_arse' | 'pasi';
  tinta: number;
  progres: number;
  completat: boolean;
  xp: number;
}

export interface StareGamificare {
  xpTotal: number;
  nivel: number;
  streak: number;
  ultimaZiActiva: string;
  questuriAzi: QuestZilnic[];
  insigne: string[];
  totalAntrenamente?: number;
  totalMinuteCardio?: number;
  zileProteineAtinse?: number;
}

export function xpNecesarPanaLaNivel(n: number): number {
  return Math.floor((100 * n * (n + 1)) / 2);
}

export function calculeazaNivel(xpTotal: number): {
  nivel: number;
  xpCurentInNivel: number;
  xpNecesarUrmatorulNivel: number;
  procentNivel: number;
  titlu: string;
} {
  let n = 1;
  while (xpTotal >= xpNecesarPanaLaNivel(n)) {
    n++;
  }

  const prevXP = n > 1 ? xpNecesarPanaLaNivel(n - 1) : 0;
  const nextXP = xpNecesarPanaLaNivel(n);
  const xpCurentInNivel = Math.max(0, xpTotal - prevXP);
  const xpNecesarUrmatorulNivel = Math.max(1, nextXP - prevXP);
  const procentNivel = Math.min(100, Math.max(0, (xpCurentInNivel / xpNecesarUrmatorulNivel) * 100));

  let titlu = 'Începător';
  if (n >= 20) titlu = 'Legendă';
  else if (n >= 15) titlu = 'Elită';
  else if (n >= 10) titlu = 'Războinic';
  else if (n >= 5) titlu = 'Atlet';

  return {
    nivel: n,
    xpCurentInNivel,
    xpNecesarUrmatorulNivel,
    procentNivel,
    titlu,
  };
}

const GAMIFICARE_STORAGE_KEY = 'gamificare_v1';

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getQuesturiDefault(): QuestZilnic[] {
  return [
    {
      id: 'q_miscare',
      tip: 'minute_miscare',
      tinta: 15,
      progres: 0,
      completat: false,
      xp: 50,
      descriere: 'Fă minim 15 min de mișcare',
    },
    {
      id: 'q_antrenament',
      tip: 'antrenamente',
      tinta: 1,
      progres: 0,
      completat: false,
      xp: 60,
      descriere: 'Completează 1 antrenament',
    },
    {
      id: 'q_proteine',
      tip: 'proteine',
      tinta: 120,
      progres: 0,
      completat: false,
      xp: 40,
      descriere: 'Atinge ținta de proteine',
    },
  ];
}

interface GamificareContextType extends StareGamificare {
  adaugaProgres: (tip: QuestZilnic['tip'], valoare: number) => void;
  revendicaRecompensaZilnica: () => void;
  refreshGamificare: () => Promise<void>;
  toateQuesturileCompletate: boolean;
  detaliiNivel: {
    nivel: number;
    xpCurentInNivel: number;
    xpNecesarUrmatorulNivel: number;
    procentNivel: number;
    titlu: string;
  };
}

const GamificareContext = createContext<GamificareContextType>({
  xpTotal: 0,
  nivel: 1,
  streak: 0,
  ultimaZiActiva: getTodayString(),
  questuriAzi: getQuesturiDefault(),
  insigne: [],
  adaugaProgres: () => {},
  revendicaRecompensaZilnica: () => {},
  refreshGamificare: async () => {},
  toateQuesturileCompletate: false,
  detaliiNivel: calculeazaNivel(0),
});

export function useGamificareContext() {
  return useContext(GamificareContext);
}

export function GamificareProvider({ children }: { children: React.ReactNode }) {
  const { showNotification } = useNotificationBanner();
  const [stare, setStare] = useState<StareGamificare>({
    xpTotal: 0,
    nivel: 1,
    streak: 0,
    ultimaZiActiva: getTodayString(),
    questuriAzi: getQuesturiDefault(),
    insigne: [],
  });

  const saveStare = useCallback(async (newState: StareGamificare) => {
    setStare(newState);
    try {
      await AsyncStorage.setItem(GAMIFICARE_STORAGE_KEY, JSON.stringify(newState));

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('gamificare').upsert({
          user_id: session.user.id,
          xp_total: newState.xpTotal,
          nivel: newState.nivel,
          streak: newState.streak,
          ultima_zi_activa: newState.ultimaZiActiva,
          questuri_azi: newState.questuriAzi,
          insigne: newState.insigne,
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      // Fail silent
    }
  }, []);

  const initSauCheckZiNoua = useCallback(
    async (loaded: StareGamificare) => {
      const today = getTodayString();
      const yesterday = getYesterdayString();

      let updateNeeded = false;
      let nextState = { ...loaded };

      if (loaded.ultimaZiActiva !== today) {
        updateNeeded = true;
        // Verifică dacă ieri a avut toate quest-urile completate
        const toateIeri =
          loaded.questuriAzi.length > 0 && loaded.questuriAzi.every((q) => q.completat);

        if (loaded.ultimaZiActiva === yesterday && toateIeri) {
          nextState.streak = Math.max(1, loaded.streak || 1);
        } else {
          nextState.streak = 0;
        }

        nextState.ultimaZiActiva = today;
        nextState.questuriAzi = getQuesturiDefault();
      }

      const calc = calculeazaNivel(nextState.xpTotal);
      if (nextState.nivel !== calc.nivel) {
        nextState.nivel = calc.nivel;
        updateNeeded = true;
      }

      if (updateNeeded) {
        await saveStare(nextState);
      } else {
        setStare(nextState);
      }
    },
    [saveStare]
  );

  const refreshGamificare = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(GAMIFICARE_STORAGE_KEY);
      let localState: StareGamificare | null = stored ? JSON.parse(stored) : null;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data, error } = await supabase
          .from('gamificare')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (!error && data) {
          localState = {
            xpTotal: data.xp_total || 0,
            nivel: data.nivel || 1,
            streak: data.streak || 0,
            ultimaZiActiva: data.ultima_zi_activa || getTodayString(),
            questuriAzi: Array.isArray(data.questuri_azi) ? data.questuri_azi : getQuesturiDefault(),
            insigne: Array.isArray(data.insigne) ? data.insigne : [],
          };
        }
      }

      if (localState) {
        await initSauCheckZiNoua(localState);
      } else {
        await initSauCheckZiNoua(stare);
      }
    } catch {
      await initSauCheckZiNoua(stare);
    }
  }, [initSauCheckZiNoua, stare]);

  useEffect(() => {
    refreshGamificare();
  }, []);

  const adaugaProgres = useCallback(
    (tip: QuestZilnic['tip'], valoare: number) => {
      setStare((prev) => {
        let nouXp = prev.xpTotal;
        const noiInsigne = [...prev.insigne];
        let questCompletatAcum = false;

        const questuriNoi = prev.questuriAzi.map((quest) => {
          if (quest.tip !== tip) return quest;

          const noulProgres = Math.min(quest.tinta, quest.progres + valoare);
          const devineCompletat = !quest.completat && noulProgres >= quest.tinta;

          if (devineCompletat) {
            nouXp += quest.xp;
            questCompletatAcum = true;
          }

          return {
            ...quest,
            progres: noulProgres,
            completat: quest.completat || devineCompletat,
          };
        });

        const totalAntr = (prev.totalAntrenamente || 0) + (tip === 'antrenamente' ? valoare : 0);
        const totalCardio = (prev.totalMinuteCardio || 0) + (tip === 'minute_miscare' ? valoare : 0);
        const zileProt = (prev.zileProteineAtinse || 0) + (tip === 'proteine' && questCompletatAcum ? 1 : 0);

        const verificaInsigna = (id: string, titlu: string, msg: string) => {
          if (!noiInsigne.includes(id)) {
            noiInsigne.push(id);
            showNotification({
              type: 'reward',
              title: titlu,
              message: msg,
              icon: 'Trophy',
            });
          }
        };

        if (tip === 'antrenamente' && valoare > 0) {
          verificaInsigna('prima_transpiratie', 'Insignă deblocată! 🔥', 'Prima Transpirație — Ai finalizat primul antrenament');
        }
        if (totalAntr >= 10) {
          verificaInsigna('forta_bruta', 'Insignă deblocată! 🏋️', 'Forță Brută — Ai finalizat 10 antrenamente');
        }
        if (totalCardio >= 100) {
          verificaInsigna('maratonist', 'Insignă deblocată! 🏃', 'Maratonist Cardio — Ai acumulat 100 minute cardio');
        }
        if (zileProt >= 5) {
          verificaInsigna('maestru_proteine', 'Insignă deblocată! 🥩', 'Maestru al Proteinei — Ai atins ținta de proteine 5 zile');
        }

        const toateCompletate = questuriNoi.every((q) => q.completat);
        let noulStreak = prev.streak;
        if (toateCompletate && prev.questuriAzi.some((q) => !q.completat)) {
          noulStreak += 1;
          showNotification({
            type: 'reward',
            title: 'Misiunea zilei completată! 🏆',
            message: `Seria ta a crescut la ${noulStreak} zile consecutiv!`,
            icon: 'Flame',
            duration: 5000,
          });

          if (noulStreak >= 3) verificaInsigna('streak_3', 'Insignă deblocată! ⚡', 'Consecvență 3 Zile');
          if (noulStreak >= 7) verificaInsigna('streak_7', 'Insignă deblocată! 🏆', 'Războinic Săptămânal — 7 zile consecutiv');
          if (noulStreak >= 30) verificaInsigna('streak_30', 'Insignă deblocată! 👑', 'De neoprit — 30 de zile consecutiv');
        }

        const calc = calculeazaNivel(nouXp);
        if (calc.nivel > prev.nivel) {
          showNotification({
            type: 'reward',
            title: 'Nivel Nou Deblocat! 🎉',
            message: `Ai ajuns la Nivelul ${calc.nivel} — ${calc.titlu}!`,
            icon: 'Award',
            duration: 5000,
          });
          if (calc.nivel >= 5) verificaInsigna('nivel_5', 'Insignă deblocată! 🏅', 'Atlet NutriAI — Ai atins Nivelul 5');
          if (calc.nivel >= 10) verificaInsigna('nivel_10', 'Insignă deblocată! ⭐', 'Războinic de Elită — Ai atins Nivelul 10');
        } else if (questCompletatAcum) {
          showNotification({
            type: 'reward',
            title: 'Quest completat! ⭐',
            message: `Ai câștigat +XP pentru obiectivul zilei!`,
            icon: 'Trophy',
          });
        }

        const nextState: StareGamificare = {
          ...prev,
          xpTotal: nouXp,
          nivel: calc.nivel,
          streak: noulStreak,
          questuriAzi: questuriNoi,
          insigne: noiInsigne,
          totalAntrenamente: totalAntr,
          totalMinuteCardio: totalCardio,
          zileProteineAtinse: zileProt,
        };

        saveStare(nextState);
        return nextState;
      });
    },
    [saveStare, showNotification]
  );

  const revendicaRecompensaZilnica = useCallback(() => {
    setStare((prev) => {
      if (!prev.questuriAzi.every((q) => q.completat)) return prev;
      const bonusXP = 100;
      const calc = calculeazaNivel(prev.xpTotal + bonusXP);

      showNotification({
        type: 'reward',
        title: 'Bonus Zilnic Revendicat! 🎁',
        message: `+${bonusXP} XP suplimentari pentru completarea tuturor quest-urilor!`,
        icon: 'Trophy',
      });

      const nextState: StareGamificare = {
        ...prev,
        xpTotal: prev.xpTotal + bonusXP,
        nivel: calc.nivel,
      };

      saveStare(nextState);
      return nextState;
    });
  }, [saveStare, showNotification]);

  const detaliiNivel = calculeazaNivel(stare.xpTotal);
  const toateQuesturileCompletate = stare.questuriAzi.every((q) => q.completat);

  return (
    <GamificareContext.Provider
      value={{
        ...stare,
        adaugaProgres,
        revendicaRecompensaZilnica,
        refreshGamificare,
        toateQuesturileCompletate,
        detaliiNivel,
      }}
    >
      {children}
    </GamificareContext.Provider>
  );
}
