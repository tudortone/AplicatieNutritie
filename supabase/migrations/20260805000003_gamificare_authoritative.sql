-- =============================================================================
-- NUTRIAI — GAMIFICARE AUTORITATIVA
-- XP-ul, nivelul, streak-ul si insignele sunt derivate exclusiv din mese,
-- antrenamente si profil. Clientul poate solicita sincronizarea, dar nu poate
-- trimite XP sau progres autoritativ.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.gamificare_evenimente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_date DATE NOT NULL,
  xp INTEGER NOT NULL CHECK (xp BETWEEN 0 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_key, event_date)
);

CREATE INDEX IF NOT EXISTS gamificare_evenimente_user_date_idx
  ON public.gamificare_evenimente(user_id, event_date DESC);

ALTER TABLE public.gamificare_evenimente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own gamification events" ON public.gamificare_evenimente;
CREATE POLICY "Users can read own gamification events"
  ON public.gamificare_evenimente
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.gamificare_evenimente FROM authenticated, anon;
GRANT SELECT ON public.gamificare_evenimente TO authenticated;

-- Pastreaza progresul existent o singura data, cu provenienta explicita. Dupa
-- aceasta migrare toate modificarile noi sunt derivate din date verificabile.
INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
SELECT user_id, 'legacy_import', DATE '1970-01-01', LEAST(GREATEST(COALESCE(xp_total, 0), 0), 1000)
  FROM public.gamificare
 WHERE user_id IS NOT NULL AND COALESCE(xp_total, 0) > 0
ON CONFLICT (user_id, event_key, event_date) DO NOTHING;

-- Utilizatorii pot citi progresul, dar nu il mai pot rescrie direct.
DROP POLICY IF EXISTS "Users can manage their own gamification" ON public.gamificare;
DROP POLICY IF EXISTS "Users can read their own gamification" ON public.gamificare;
CREATE POLICY "Users can read their own gamification"
  ON public.gamificare
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.gamificare FROM authenticated, anon;
GRANT SELECT ON public.gamificare TO authenticated;

CREATE OR REPLACE FUNCTION public.sincronizeaza_gamificare_sigur()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_zi DATE := (NOW() AT TIME ZONE 'Europe/Bucharest')::date;
  v_antrenamente INTEGER := 0;
  v_minute INTEGER := 0;
  v_proteine NUMERIC := 0;
  v_tinta_proteine INTEGER := 120;
  v_xp INTEGER := 0;
  v_nivel INTEGER := 1;
  v_streak INTEGER := 0;
  v_cursor DATE;
  v_total_antrenamente INTEGER := 0;
  v_total_minute INTEGER := 0;
  v_zile_proteine INTEGER := 0;
  v_questuri JSONB;
  v_insigne JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentificare obligatorie' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::integer,
         COALESCE(SUM(GREATEST(COALESCE(durata_min, 0), 0)), 0)::integer
    INTO v_antrenamente, v_minute
    FROM public.antrenamente
   WHERE user_id = v_user_id
     AND (created_at AT TIME ZONE 'Europe/Bucharest')::date = v_zi;

  SELECT COALESCE(SUM(GREATEST(COALESCE(proteine, 0), 0)), 0)
    INTO v_proteine
    FROM public.mese
   WHERE user_id = v_user_id
     AND COALESCE(data, (created_at AT TIME ZONE 'Europe/Bucharest')::date) = v_zi;

  SELECT COALESCE(NULLIF(proteine_tinta, 0), 120)
    INTO v_tinta_proteine
    FROM public.profil
   WHERE user_id = v_user_id;
  v_tinta_proteine := COALESCE(v_tinta_proteine, 120);

  IF v_minute >= 15 THEN
    INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
    VALUES (v_user_id, 'miscare_15', v_zi, 50)
    ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
  END IF;

  IF v_antrenamente >= 1 THEN
    INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
    VALUES (v_user_id, 'antrenament_1', v_zi, 60)
    ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
  END IF;

  IF v_proteine >= v_tinta_proteine THEN
    INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
    VALUES (v_user_id, 'proteine_tinta', v_zi, 40)
    ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.gamificare_evenimente
     WHERE user_id = v_user_id
       AND event_date = v_zi
       AND event_key IN ('miscare_15', 'antrenament_1', 'proteine_tinta')
     GROUP BY user_id, event_date
    HAVING COUNT(DISTINCT event_key) = 3
  ) THEN
    INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
    VALUES (v_user_id, 'bonus_zilnic', v_zi, 100)
    ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
  END IF;

  SELECT COALESCE(SUM(xp), 0)::integer
    INTO v_xp
    FROM public.gamificare_evenimente
   WHERE user_id = v_user_id;

  WHILE v_xp >= FLOOR((100::numeric * v_nivel * (v_nivel + 1)) / 2) LOOP
    v_nivel := v_nivel + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.gamificare_evenimente
     WHERE user_id = v_user_id AND event_key = 'bonus_zilnic' AND event_date = v_zi
  ) THEN
    v_cursor := v_zi;
  ELSE
    v_cursor := v_zi - 1;
  END IF;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.gamificare_evenimente
       WHERE user_id = v_user_id AND event_key = 'bonus_zilnic' AND event_date = v_cursor
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  SELECT COUNT(*)::integer,
         COALESCE(SUM(GREATEST(COALESCE(durata_min, 0), 0)), 0)::integer
    INTO v_total_antrenamente, v_total_minute
    FROM public.antrenamente
   WHERE user_id = v_user_id;

  SELECT COUNT(*)::integer
    INTO v_zile_proteine
    FROM public.gamificare_evenimente
   WHERE user_id = v_user_id AND event_key = 'proteine_tinta';

  v_questuri := jsonb_build_array(
    jsonb_build_object(
      'id', 'q_miscare', 'tip', 'minute_miscare', 'tinta', 15,
      'progres', LEAST(v_minute, 15), 'completat', v_minute >= 15,
      'xp', 50, 'descriere', 'Fă minim 15 min de mișcare'
    ),
    jsonb_build_object(
      'id', 'q_antrenament', 'tip', 'antrenamente', 'tinta', 1,
      'progres', LEAST(v_antrenamente, 1), 'completat', v_antrenamente >= 1,
      'xp', 60, 'descriere', 'Completează 1 antrenament'
    ),
    jsonb_build_object(
      'id', 'q_proteine', 'tip', 'proteine', 'tinta', v_tinta_proteine,
      'progres', LEAST(ROUND(v_proteine)::integer, v_tinta_proteine),
      'completat', v_proteine >= v_tinta_proteine,
      'xp', 40, 'descriere', 'Atinge ținta de proteine'
    )
  );

  SELECT COALESCE(to_jsonb(array_agg(badge ORDER BY ord)), '[]'::jsonb)
    INTO v_insigne
    FROM (
      VALUES
        (1, CASE WHEN v_total_antrenamente >= 1 THEN 'prima_transpiratie' END),
        (2, CASE WHEN v_total_antrenamente >= 10 THEN 'forta_bruta' END),
        (3, CASE WHEN v_total_minute >= 100 THEN 'maratonist' END),
        (4, CASE WHEN v_zile_proteine >= 5 THEN 'maestru_proteine' END),
        (5, CASE WHEN v_streak >= 3 THEN 'streak_3' END),
        (6, CASE WHEN v_streak >= 7 THEN 'streak_7' END),
        (7, CASE WHEN v_streak >= 30 THEN 'streak_30' END),
        (8, CASE WHEN v_nivel >= 5 THEN 'nivel_5' END),
        (9, CASE WHEN v_nivel >= 10 THEN 'nivel_10' END)
    ) AS insigne(ord, badge)
   WHERE badge IS NOT NULL;

  INSERT INTO public.gamificare(
    user_id, xp_total, nivel, streak, ultima_zi_activa,
    questuri_azi, insigne, updated_at
  ) VALUES (
    v_user_id, v_xp, v_nivel, v_streak, v_zi::text,
    v_questuri, v_insigne, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    xp_total = EXCLUDED.xp_total,
    nivel = EXCLUDED.nivel,
    streak = EXCLUDED.streak,
    ultima_zi_activa = EXCLUDED.ultima_zi_activa,
    questuri_azi = EXCLUDED.questuri_azi,
    insigne = EXCLUDED.insigne,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'xpTotal', v_xp,
    'nivel', v_nivel,
    'streak', v_streak,
    'ultimaZiActiva', v_zi::text,
    'questuriAzi', v_questuri,
    'insigne', v_insigne,
    'totalAntrenamente', v_total_antrenamente,
    'totalMinuteCardio', v_total_minute,
    'zileProteineAtinse', v_zile_proteine
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizeaza_gamificare_sigur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizeaza_gamificare_sigur() TO authenticated;

NOTIFY pgrst, 'reload schema';
