import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { localDayKey } from '../lib/dateUtils';

/**
 * Hook dedicat pentru zilele cu mese (calendar) — ultimele 90 zile.
 * Separat din useMeseAzi deoarece Home/Statistici nu au nevoie de acest
 * query costisitor (scanează 90 zile × toate mesele), doar ecranul Istoric.
 */
export function useZileCuMese() {
  const [zileCuMese, setZileCuMese] = useState<string[]>([]);
  const isMountedRef = useRef(true);
  const reqIdRef = useRef(0);

  const fetchZileCuMese = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    const isStale = () => !isMountedRef.current || reqIdRef.current !== myReqId;

    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (isStale() || !currentUser) return;

      const startDeVerificat = new Date();
      startDeVerificat.setDate(startDeVerificat.getDate() - 90);
      const { data: toateMesele } = await supabase
        .from('mese')
        .select('created_at')
        .eq('user_id', currentUser.id)
        .gte('created_at', startDeVerificat.toISOString());

      if (isStale()) return;

      if (toateMesele) {
        const setZile = new Set<string>();
        toateMesele.forEach((m) => {
          // FIT-005: cheia zilei trebuie să fie în timezone-ul LOCAL (MonthCalendar
          // marchează zilele local), nu UTC — altfel mesele adăugate seara cădeau în
          // ziua greșită din calendar. Nu modificăm created_at, doar cheia derivată.
          if (m.created_at) setZile.add(localDayKey(new Date(m.created_at)));
        });
        setZileCuMese(Array.from(setZile));
      }
    } catch (e) {
      console.warn('[useZileCuMese] Eroare fetch zile marcate:', e);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchZileCuMese();
    return () => {
      isMountedRef.current = false;
      reqIdRef.current++;
    };
  }, [fetchZileCuMese]);

  return { zileCuMese, refreshZileCuMese: fetchZileCuMese };
}
