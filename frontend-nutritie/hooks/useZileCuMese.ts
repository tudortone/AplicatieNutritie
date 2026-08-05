import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

const ZILE_CACHE_TTL_MS = 60_000;
// Cache la nivel de modul: Istoricul + useFocusRefresh (5s) declanșau un scan de
// 90 de zile pe tabelul `mese` la fiecare focus/interval. Markerii din calendar
// se reîmprospătează la maxim 60s sau la pull-to-refresh (force=true).
const zileCache = new Map<string, { fetchedAt: number; zile: string[] }>();

/**
 * Hook dedicat pentru zilele cu mese (calendar) — ultimele 90 zile.
 * Separat din useMeseAzi deoarece Home/Statistici nu au nevoie de acest
 * query costisitor (scanează 90 zile × toate mesele), doar ecranul Istoric.
 */
export function useZileCuMese() {
  const [zileCuMese, setZileCuMese] = useState<string[]>([]);
  const isMountedRef = useRef(true);
  const reqIdRef = useRef(0);

  const fetchZileCuMese = useCallback(async (force = false) => {
    const myReqId = ++reqIdRef.current;
    const isStale = () => !isMountedRef.current || reqIdRef.current !== myReqId;

    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (isStale() || !currentUser) return;

      const cacheKey = currentUser.id;
      const cached = zileCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.fetchedAt < ZILE_CACHE_TTL_MS) {
        setZileCuMese(cached.zile);
        return;
      }

      const startDeVerificat = new Date();
      startDeVerificat.setDate(startDeVerificat.getDate() - 90);
      // Plafon de siguranta: calendarul arata maxim 90 de zile distincte, iar
      // `mese` poate acumula mii de randuri pe 90 de zile. Un cap la 2000 acopera
      // chiar si ~20 de mese/zi fara sa lase payload-ul sa creasca nelimitat.
      const { data: toateMesele } = await supabase
        .from('mese')
        .select('created_at')
        .eq('user_id', currentUser.id)
        .gte('created_at', startDeVerificat.toISOString())
        .limit(2000);

      if (isStale()) return;

      if (toateMesele) {
        const setZile = new Set<string>();
        toateMesele.forEach((m) => {
          if (m.created_at) setZile.add(m.created_at.split('T')[0]);
        });
        const zile = Array.from(setZile);
        zileCache.set(cacheKey, { fetchedAt: Date.now(), zile });
        setZileCuMese(zile);
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
