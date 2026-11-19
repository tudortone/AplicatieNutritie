-- Lotul 2 — Scalabilitate Postgres:
-- 1) Index parțial pe flow_credit_reservations (user_id, created_at) WHERE status = 'RESERVED'
--    + condiție explicită AND r.outcome_unknown_at IS NULL pe ramura inference_claimed_at IS NULL
--    în reconcile_all_stale_flow_photo_reservations.
-- 2) Fereastră mărginită de 7 zile în reconcilia_credite_consumate()
--    + index parțial pe credite_tranzactii (creat_la) WHERE event_type = 'CONSUM_AI'.
-- 3) Optimizare sincronizeaza_gamificare_sigur:
--    - validare p_timezone prin NOW() AT TIME ZONE p_timezone + EXCEPTION WHEN invalid_parameter_value (fără pg_timezone_names)
--    - predicate SARGable pe created_at și data BETWEEN v_zi - 1 AND v_zi (fără AT TIME ZONE pe coloane)
--    - calcul streak într-un singur CTE gaps-and-islands (elimină bucla N+1).

-- =============================================================================
-- 1. Flow credit reservations: index parțial + reconciliere globală sigură
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_flow_credit_reservations_reserved_user_created
  ON public.flow_credit_reservations (user_id, created_at)
  WHERE status = 'RESERVED';

CREATE OR REPLACE FUNCTION public.reconcile_all_stale_flow_photo_reservations(
  p_limit integer DEFAULT 100,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user_id uuid;
  v_res jsonb;
  v_users integer := 0;
  v_released integer := 0;
  v_marked_unknown integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RECONCILIATION_INPUT');
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT r.user_id FROM public.flow_credit_reservations AS r
    WHERE r.status = 'RESERVED' AND r.result IS NULL
      AND (
        (r.inference_claimed_at IS NULL AND r.outcome_unknown_at IS NULL AND r.created_at <= p_now - interval '15 minutes')
        OR (r.inference_claimed_at < p_now - interval '2 minutes' AND r.outcome_unknown_at IS NULL)
      )
    ORDER BY r.user_id
    LIMIT p_limit
  LOOP
    v_res := public.reconcile_stale_flow_photo_reservations(v_user_id, p_now);
    v_users := v_users + 1;
    v_released := v_released + coalesce((v_res->>'releasedBeforeInference')::integer, 0);
    v_marked_unknown := v_marked_unknown + coalesce((v_res->>'markedUnknown')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'usersChecked', v_users,
    'releasedBeforeInference', v_released,
    'markedUnknown', v_marked_unknown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)
  TO service_role;

-- =============================================================================
-- 2. Reconciliere credite consumate: fereastră 7 zile + index parțial CONSUM_AI
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_credite_tranzactii_consum_ai_creat_la
  ON public.credite_tranzactii (creat_la)
  WHERE event_type = 'CONSUM_AI';

CREATE OR REPLACE FUNCTION public.reconcilia_credite_consumate()
RETURNS TABLE (
  consum_id       uuid,
  user_id         uuid,
  event_id        text,
  refund_event_id text,
  sold_nou        int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rand record;
  v_sold int;
BEGIN
  FOR v_rand IN
    SELECT c.id, c.user_id, c.event_id
      FROM public.credite_tranzactii c
     WHERE c.event_type = 'CONSUM_AI'
       AND c.creat_la >= NOW() - INTERVAL '7 days'
       AND c.creat_la < NOW() - INTERVAL '15 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.credite_tranzactii r
          WHERE r.event_id = 'refund:' || c.event_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.credite_tranzactii o
          WHERE o.event_id = 'ok:' || c.event_id
       )
     ORDER BY c.creat_la
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT public.aplica_tranzactie_credite(
        v_rand.user_id,
        'refund:' || v_rand.event_id,
        'REFUND_AI_RECONCILE',
        1,
        NULL,
        jsonb_build_object(
          'motiv', 'reconcile_consum_orphan',
          'consum_id', v_rand.id,
          'event_id', v_rand.event_id
        )
      ) INTO v_sold;

      RETURN QUERY SELECT
        v_rand.id,
        v_rand.user_id,
        v_rand.event_id,
        'refund:' || v_rand.event_id,
        v_sold;
    EXCEPTION
      WHEN unique_violation THEN
        -- Deja restituit concurent (refund in-request sau alt worker).
        NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcilia_credite_consumate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcilia_credite_consumate() TO service_role;

-- =============================================================================
-- 3. Gamificare: validare TZ O(1), predicate SARGable și CTE gaps-and-islands
-- =============================================================================
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
  v_tz_candidate TEXT;
  v_zi DATE;
  v_window_start TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_eval_zi DATE;
  v_antrenamente_ieri INTEGER := 0;
  v_minute_ieri INTEGER := 0;
  v_proteine_ieri NUMERIC := 0;
  v_antrenamente INTEGER := 0;
  v_minute INTEGER := 0;
  v_proteine NUMERIC := 0;
  v_eval_antrenamente INTEGER := 0;
  v_eval_minute INTEGER := 0;
  v_eval_proteine NUMERIC := 0;
  v_tinta_proteine INTEGER := 120;
  v_xp INTEGER := 0;
  v_nivel INTEGER := 1;
  v_streak INTEGER := 0;
  v_total_antrenamente INTEGER := 0;
  v_total_minute INTEGER := 0;
  v_zile_proteine INTEGER := 0;
  v_questuri JSONB;
  v_insigne JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentificare obligatorie' USING ERRCODE = '42501';
  END IF;

  -- Validare O(1) fără scanarea catalogului pg_timezone_names.
  IF p_timezone IS NOT NULL THEN
    v_tz_candidate := trim(p_timezone);
    IF length(v_tz_candidate) BETWEEN 1 AND 64 THEN
      BEGIN
        PERFORM NOW() AT TIME ZONE v_tz_candidate;
        v_tz := v_tz_candidate;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_tz := 'Europe/Bucharest';
      END;
    END IF;
  END IF;

  v_zi := (NOW() AT TIME ZONE v_tz)::date;
  v_window_start := ((v_zi - 1)::timestamp AT TIME ZONE v_tz);
  v_day_start := (v_zi::timestamp AT TIME ZONE v_tz);
  v_window_end := ((v_zi + 1)::timestamp AT TIME ZONE v_tz);

  SELECT COALESCE(NULLIF(proteine_tinta, 0), 120)
    INTO v_tinta_proteine
    FROM public.profil
   WHERE user_id = v_user_id;
  v_tinta_proteine := COALESCE(v_tinta_proteine, 120);

  -- Interval indexabil pe idx_jurnal_exercitii_user_data (user_id, created_at DESC).
  SELECT COUNT(*) FILTER (WHERE created_at < v_day_start)::integer,
         COALESCE(SUM(GREATEST(COALESCE(durata_min, 0), 0)) FILTER (WHERE created_at < v_day_start), 0)::integer,
         COUNT(*) FILTER (WHERE created_at >= v_day_start)::integer,
         COALESCE(SUM(GREATEST(COALESCE(durata_min, 0), 0)) FILTER (WHERE created_at >= v_day_start), 0)::integer
    INTO v_antrenamente_ieri, v_minute_ieri, v_antrenamente, v_minute
    FROM public.antrenamente
   WHERE user_id = v_user_id
     AND created_at >= v_window_start
     AND created_at < v_window_end;

  -- Intervale indexabile pe idx_mese_user_data (user_id, data DESC) și
  -- idx_mese_user_created (user_id, created_at DESC) pentru rândurile legacy fără data.
  SELECT COALESCE(SUM(proteine_zi) FILTER (WHERE zi = v_zi - 1), 0),
         COALESCE(SUM(proteine_zi) FILTER (WHERE zi = v_zi), 0)
    INTO v_proteine_ieri, v_proteine
    FROM (
      SELECT data AS zi, GREATEST(COALESCE(proteine, 0), 0) AS proteine_zi
        FROM public.mese
       WHERE user_id = v_user_id
         AND data BETWEEN v_zi - 1 AND v_zi
      UNION ALL
      SELECT CASE WHEN created_at < v_day_start THEN v_zi - 1 ELSE v_zi END AS zi,
             GREATEST(COALESCE(proteine, 0), 0) AS proteine_zi
        FROM public.mese
       WHERE user_id = v_user_id
         AND data IS NULL
         AND created_at >= v_window_start
         AND created_at < v_window_end
    ) AS mese_fereastra;

  -- Evaluăm idempotent fereastra retroactivă (v_zi - 1 .. v_zi).
  FOR v_eval_zi IN
    SELECT generate_series(v_zi - 1, v_zi, interval '1 day')::date
  LOOP
    IF v_eval_zi = v_zi THEN
      v_eval_antrenamente := v_antrenamente;
      v_eval_minute := v_minute;
      v_eval_proteine := v_proteine;
    ELSE
      v_eval_antrenamente := v_antrenamente_ieri;
      v_eval_minute := v_minute_ieri;
      v_eval_proteine := v_proteine_ieri;
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

  -- Calcul streak într-un singur CTE gaps-and-islands (elimină bucla N+1).
  WITH bonus_days AS (
    SELECT DISTINCT event_date
      FROM public.gamificare_evenimente
     WHERE user_id = v_user_id
       AND event_key = 'bonus_zilnic'
       AND event_date <= v_zi
  ),
  anchor AS (
    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM bonus_days WHERE event_date = v_zi) THEN v_zi
             ELSE v_zi - 1
           END AS start_day
  ),
  numbered AS (
    SELECT b.event_date,
           (a.start_day - b.event_date) AS diff_days,
           (ROW_NUMBER() OVER (ORDER BY b.event_date DESC) - 1) AS rn
      FROM bonus_days b
      CROSS JOIN anchor a
     WHERE b.event_date <= a.start_day
  )
  SELECT COUNT(*)::integer
    INTO v_streak
    FROM numbered
   WHERE diff_days = rn;

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
