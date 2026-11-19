-- P0-06 & P0-09 & P0-12:
-- 1) Add idempotent client_operation_id column + partial unique index on public.mese
--    so both BIGINT (prod) and UUID schemas enforce duplicate-free retries without
--    sending UUID strings into a BIGINT primary key.
-- 2) Ensure public.profil has greutate_tinta and avatar_url columns for RLS-bound
--    pending target synchronization.
-- 3) Update sincronizeaza_gamificare_sigur to accept a validated IANA timezone
--    (default 'Europe/Bucharest') and evaluate a retroactive 2-day window (v_zi - 1..v_zi)
--    idempotently so evening/offline activities never break streaks.

ALTER TABLE public.mese
  ADD COLUMN IF NOT EXISTS client_operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mese_user_client_operation_id
  ON public.mese (user_id, client_operation_id)
  WHERE client_operation_id IS NOT NULL;

ALTER TABLE public.profil
  ADD COLUMN IF NOT EXISTS greutate_tinta NUMERIC,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DROP FUNCTION IF EXISTS public.sincronizeaza_gamificare_sigur();

CREATE OR REPLACE FUNCTION public.sincronizeaza_gamificare_sigur(
  p_timezone TEXT DEFAULT 'Europe/Bucharest'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tz TEXT := 'Europe/Bucharest';
  v_zi DATE;
  v_eval_zi DATE;
  v_eval_antrenamente INTEGER := 0;
  v_eval_minute INTEGER := 0;
  v_eval_proteine NUMERIC := 0;
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

  IF p_timezone IS NOT NULL AND length(trim(p_timezone)) BETWEEN 1 AND 64 THEN
    IF EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = trim(p_timezone)) THEN
      v_tz := trim(p_timezone);
    END IF;
  END IF;

  v_zi := (NOW() AT TIME ZONE v_tz)::date;

  SELECT COALESCE(NULLIF(proteine_tinta, 0), 120)
    INTO v_tinta_proteine
    FROM public.profil
   WHERE user_id = v_user_id;
  v_tinta_proteine := COALESCE(v_tinta_proteine, 120);

  -- Evaluăm idempotent fereastra retroactivă (v_zi - 1 .. v_zi) astfel încât
  -- mesele/antrenamentele sincronizate offline sau târziu seara să nu rupă streak-ul.
  FOR v_eval_zi IN
    SELECT generate_series(v_zi - 1, v_zi, interval '1 day')::date
  LOOP
    SELECT COUNT(*)::integer,
           COALESCE(SUM(GREATEST(COALESCE(durata_min, 0), 0)), 0)::integer
      INTO v_eval_antrenamente, v_eval_minute
      FROM public.antrenamente
     WHERE user_id = v_user_id
       AND (created_at AT TIME ZONE v_tz)::date = v_eval_zi;

    SELECT COALESCE(SUM(GREATEST(COALESCE(proteine, 0), 0)), 0)
      INTO v_eval_proteine
      FROM public.mese
     WHERE user_id = v_user_id
       AND COALESCE(data, (created_at AT TIME ZONE v_tz)::date) = v_eval_zi;

    IF v_eval_zi = v_zi THEN
      v_antrenamente := v_eval_antrenamente;
      v_minute := v_eval_minute;
      v_proteine := v_eval_proteine;
    END IF;

    IF v_eval_minute >= 15 THEN
      INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
      VALUES (v_user_id, 'miscare_15', v_eval_zi, 50)
      ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
    END IF;

    IF v_eval_antrenamente >= 1 THEN
      INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
      VALUES (v_user_id, 'antrenament_1', v_eval_zi, 60)
      ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
    END IF;

    IF v_eval_proteine >= v_tinta_proteine THEN
      INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
      VALUES (v_user_id, 'proteine_tinta', v_eval_zi, 40)
      ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.gamificare_evenimente
       WHERE user_id = v_user_id
         AND event_date = v_eval_zi
         AND event_key IN ('miscare_15', 'antrenament_1', 'proteine_tinta')
       GROUP BY user_id, event_date
      HAVING COUNT(DISTINCT event_key) = 3
    ) THEN
      INSERT INTO public.gamificare_evenimente(user_id, event_key, event_date, xp)
      VALUES (v_user_id, 'bonus_zilnic', v_eval_zi, 100)
      ON CONFLICT (user_id, event_key, event_date) DO NOTHING;
    END IF;
  END LOOP;

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

REVOKE ALL ON FUNCTION public.sincronizeaza_gamificare_sigur(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizeaza_gamificare_sigur(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
