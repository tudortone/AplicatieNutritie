-- Pastreaza integral XP-ul istoric la trecerea pe ledgerul autoritativ.
-- Evenimentele noi au valori fixe din functia SECURITY DEFINER; aceasta exceptie
-- este numai importul unic al datelor create inainte de migrare.
ALTER TABLE public.gamificare_evenimente
  DROP CONSTRAINT IF EXISTS gamificare_evenimente_xp_check;
ALTER TABLE public.gamificare_evenimente
  ADD CONSTRAINT gamificare_evenimente_xp_check CHECK (xp >= 0);

UPDATE public.gamificare_evenimente AS e
   SET xp = GREATEST(COALESCE(g.xp_total, 0), 0)
  FROM public.gamificare AS g
 WHERE e.user_id = g.user_id
   AND e.event_key = 'legacy_import'
   AND e.event_date = DATE '1970-01-01';
