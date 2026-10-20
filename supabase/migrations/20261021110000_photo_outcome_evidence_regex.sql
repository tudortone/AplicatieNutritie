-- PostgreSQL rejects interval regex bounds above 255. Keep the 1..256 ASCII
-- evidence contract with an explicit length check and an unbounded character class.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.photo_outcome_resolutions'::regclass
      AND conname = 'photo_outcome_resolutions_evidence_reference_v2_check'
  ) THEN
    ALTER TABLE public.photo_outcome_resolutions
      ADD CONSTRAINT photo_outcome_resolutions_evidence_reference_v2_check
      CHECK (
        char_length(evidence_reference) BETWEEN 1 AND 256
        AND evidence_reference ~ '^[A-Za-z0-9._:-]+$'
      ) NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.photo_outcome_resolutions
  VALIDATE CONSTRAINT photo_outcome_resolutions_evidence_reference_v2_check;
ALTER TABLE public.photo_outcome_resolutions
  DROP CONSTRAINT IF EXISTS photo_outcome_resolutions_evidence_reference_check;

CREATE OR REPLACE FUNCTION public.resolve_flow_photo_outcome_unknown(
  p_user_id uuid,
  p_reservation_id uuid,
  p_confirmed_failure boolean,
  p_evidence_reference text,
  p_resolved_by uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_reservation public.flow_credit_reservations%ROWTYPE;
  v_settlement jsonb;
BEGIN
  IF p_confirmed_failure IS DISTINCT FROM true OR p_evidence_reference IS NULL
    OR char_length(p_evidence_reference) NOT BETWEEN 1 AND 256
    OR p_evidence_reference !~ '^[A-Za-z0-9._:-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONFIRMED_FAILURE_EVIDENCE_REQUIRED');
  END IF;
  IF p_resolved_by IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS operator
    WHERE operator.id = p_resolved_by AND operator.raw_app_meta_data->>'rol' = 'admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_REQUIRED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_reservation FROM public.flow_credit_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_reservation.status = 'RELEASED' AND EXISTS (
    SELECT 1 FROM public.photo_outcome_resolutions
    WHERE reservation_id = p_reservation_id AND user_id = p_user_id
      AND resolution = 'CONFIRMED_FAILURE'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'RELEASED', 'replay', true);
  END IF;
  IF v_reservation.status <> 'RESERVED' OR v_reservation.outcome_unknown_at IS NULL
    OR v_reservation.result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_OUTCOME_NOT_RESOLVABLE');
  END IF;

  INSERT INTO public.photo_outcome_resolutions(
    reservation_id, user_id, resolution, evidence_reference, resolved_by
  ) VALUES (
    p_reservation_id, p_user_id, 'CONFIRMED_FAILURE', p_evidence_reference, p_resolved_by
  );
  v_settlement := public.settle_flow_photo_credit(
    p_user_id, p_reservation_id, 'release', 'CONFIRMED_PROVIDER_FAILURE', p_now
  );
  IF COALESCE((v_settlement->>'ok')::boolean, false) IS NOT TRUE THEN
    DELETE FROM public.photo_outcome_resolutions WHERE reservation_id = p_reservation_id;
    RETURN v_settlement;
  END IF;
  UPDATE public.ai_jobs SET status = 'failed', error_code = 'PHOTO_CONFIRMED_FAILURE', completed_at = p_now
  WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
    AND error_code = 'PHOTO_OUTCOME_UNKNOWN';
  RETURN v_settlement || jsonb_build_object('evidenceReference', p_evidence_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, uuid, timestamptz)
  TO service_role;
