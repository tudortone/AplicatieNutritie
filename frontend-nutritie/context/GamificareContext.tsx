import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useNotificationBanner } from './NotificationBannerContext';
import { useDailyReset } from '../hooks/useDailyReset';

export interface QuestZilnic {
  id: string;
  descriere: string;
  tip: 'minute_miscare' | 'antrenamente' | 'proteine' | 'calorii_arse' | 'pasi';
  tinta: number;
  progres: number;
  completat: boolean;
  xp: number;
  [key: string]: any;
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

export function calculeazaNivel(xpTotal: number) {
  let n = 1;
  while (xpTotal >= xpNecesarPanaLaNivel(n)) n++;
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
  return { nivel: n, xpCurentInNivel, xpNecesarUrmatorulNivel, procentNivel, titlu };
}

const GAMIFICARE_STORAGE_KEY = 'gamificare_v2_server_authoritative';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function questuriDefault(): QuestZilnic[] {
  return [
    { id: 'q_miscare', tip: 'minute_miscare', tinta: 15, progres: 0, completat: false, xp: 50, descriere: 'Fă minim 15 min de mișcare' },
    { id: 'q_antrenament', tip: 'antrenamente', tinta: 1, progres: 0, completat: false, xp: 60, descriere: 'Completează 1 antrenament' },
    { id: 'q_proteine', tip: 'proteine', tinta: 120, progres: 0, completat: false, xp: 40, descriere: 'Atinge ținta de proteine' },
  ];
}

const STARE_INITIALA: StareGamificare = {
  xpTotal: 0,
  nivel: 1,
  streak: 0,
  ultimaZiActiva: today(),
  questuriAzi: questuriDefault(),
  insigne: [],
};

function normalizaStare(valoare: any): StareGamificare | null {
  if (!valoare || typeof valoare !== 'object') return null;
  const questuri = Array.isArray(valoare.questuriAzi) ? valoare.questuriAzi : questuriDefault();
  return {
    xpTotal: Math.max(0, Number(valoare.xpTotal) || 0),
    nivel: Math.max(1, Number(valoare.nivel) || 1),
    streak: Math.max(0, Number(valoare.streak) || 0),
    ultimaZiActiva: typeof valoare.ultimaZiActiva === 'string' ? valoare.ultimaZiActiva : today(),
    questuriAzi: questuri,
    insigne: Array.isArray(valoare.insigne) ? valoare.insigne.map(String) : [],
    totalAntrenamente: Math.max(0, Number(valoare.totalAntrenamente) || 0),
    totalMinuteCardio: Math.max(0, Number(valoare.totalMinuteCardio) || 0),
    zileProteineAtinse: Math.max(0, Number(valoare.zileProteineAtinse) || 0),
  };
}

interface GamificareContextType extends StareGamificare {
  setQuesturiAzi: (updater: React.SetStateAction<QuestZilnic[]>) => void;
  adaugaProgres: (tip: QuestZilnic['tip'], valoare: number) => void;
  revendicaRecompensaZilnica: () => void;
  refreshGamificare: () => Promise<void>;
  toateQuesturileCompletate: boolean;
  detaliiNivel: ReturnType<typeof calculeazaNivel>;
}

const GamificareContext = createContext<GamificareContextType>({
  ...STARE_INITIALA,
  setQuesturiAzi: () => {},
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
  const [stare, setStare] = useState<StareGamificare>(STARE_INITIALA);
  const stareRef = useRef(stare);

  useEffect(() => {
    stareRef.current = stare;
  }, [stare]);

  const aplicaStare = useCallback(async (noua: StareGamificare) => {
    stareRef.current = noua;
    setStare(noua);
    try {
      await AsyncStorage.setItem(GAMIFICARE_STORAGE_KEY, JSON.stringify(noua));
    } catch {
      // Cache-ul local este doar rezerva offline; serverul ramane sursa de adevar.
    }
  }, []);

  const refreshGamificare = useCallback(async () => {
    let locala: StareGamificare | null = null;
    try {
      const salvata = await AsyncStorage.getItem(GAMIFICARE_STORAGE_KEY);
      locala = salvata ? normalizaStare(JSON.parse(salvata)) : null;
      if (locala) {
        if (locala.ultimaZiActiva !== today()) {
          locala = { ...locala, ultimaZiActiva: today(), questuriAzi: questuriDefault() };
        }
        setStare(locala);
        stareRef.current = locala;
      }
    } catch {
      locala = null;
    }

    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session?.user) return;

      // RPC-ul nu accepta XP/progres de la client. Baza de date calculeaza totul
      // din mesele, antrenamentele si profilul utilizatorului autentificat.
      const { data, error } = await supabase.rpc('sincronizeaza_gamificare_sigur');
      if (error) throw error;
      const serverState = normalizaStare(data);
      if (!serverState) throw new Error('Raspuns gamificare invalid.');

      const anterior = stareRef.current;
      await aplicaStare(serverState);

      if (serverState.nivel > anterior.nivel) {
        showNotification({
          type: 'reward',
          title: 'Nivel nou deblocat! 🎉',
          message: `Ai ajuns la Nivelul ${serverState.nivel}.`,
          icon: 'Award',
        });
      } else if (serverState.xpTotal > anterior.xpTotal) {
        showNotification({
          type: 'reward',
          title: 'Progres validat! ⭐',
          message: `+${serverState.xpTotal - anterior.xpTotal} XP calculați din activitatea ta.`,
          icon: 'Trophy',
        });
      }
    } catch (err) {
      if (__DEV__) console.debug('[Gamificare] Sincronizarea server nu este disponibila.', err);
      if (!locala) await aplicaStare(stareRef.current);
    }
  }, [aplicaStare, showNotification]);

  useEffect(() => {
    void refreshGamificare();
  }, [refreshGamificare]);

  const setQuesturiAzi = useCallback((updater: React.SetStateAction<QuestZilnic[]>) => {
    setStare((prev) => {
      const questuri = typeof updater === 'function' ? updater(prev.questuriAzi) : updater;
      const next = { ...prev, questuriAzi: questuri };
      stareRef.current = next;
      AsyncStorage.setItem(GAMIFICARE_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  useDailyReset({ questuriAzi: stare.questuriAzi, setQuesturiAzi });

  const adaugaProgres = useCallback((tip: QuestZilnic['tip'], valoare: number) => {
    // Actualizare optimista doar pentru bara de progres. XP-ul si completarile
    // autoritative sunt suprascrise imediat de RPC-ul securizat.
    if (Number.isFinite(valoare) && valoare > 0) {
      setStare((prev) => ({
        ...prev,
        questuriAzi: prev.questuriAzi.map((quest) =>
          quest.tip === tip
            ? { ...quest, progres: Math.min(quest.tinta, quest.progres + valoare) }
            : quest,
        ),
      }));
    }
    setTimeout(() => { void refreshGamificare(); }, 350);
  }, [refreshGamificare]);

  const revendicaRecompensaZilnica = useCallback(() => {
    // Bonusul este acordat o singura data de functia SQL daca toate cele trei
    // conditii sunt verificate in baza de date.
    void refreshGamificare();
  }, [refreshGamificare]);

  const detaliiNivel = useMemo(() => calculeazaNivel(stare.xpTotal), [stare.xpTotal]);
  const toateQuesturileCompletate = useMemo(
    () => stare.questuriAzi.length > 0 && stare.questuriAzi.every((q) => q.completat),
    [stare.questuriAzi],
  );

  const value = useMemo(() => ({
    ...stare,
    setQuesturiAzi,
    adaugaProgres,
    revendicaRecompensaZilnica,
    refreshGamificare,
    toateQuesturileCompletate,
    detaliiNivel,
  }), [
    stare,
    setQuesturiAzi,
    adaugaProgres,
    revendicaRecompensaZilnica,
    refreshGamificare,
    toateQuesturileCompletate,
    detaliiNivel,
  ]);

  return <GamificareContext.Provider value={value}>{children}</GamificareContext.Provider>;
}
