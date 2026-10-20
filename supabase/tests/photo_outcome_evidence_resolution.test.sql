-- Real PostgreSQL regression: an admin can release an uncertain Photo credit
-- with a 256-character evidence reference, without changing source balances twice.
BEGIN;

DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_reservation jsonb;
  v_reservation_id uuid;
  v_claim jsonb;
  v_reconcile jsonb;
  v_resolution jsonb;
  v_invalid jsonb;
BEGIN
  INSERT INTO auth.users(id, email, aud, role)
  VALUES (v_user, 'dbval-' || v_user || '@test.local', 'authenticated', 'authenticated');
  INSERT INTO auth.users(id, email, aud, role, raw_app_meta_data)
  VALUES (v_admin, 'dbval-' || v_admin || '@test.local', 'authenticated',
    'authenticated', '{"rol":"admin"}'::jsonb);

  v_reservation := public.reserve_flow_photo_credit_v2(
    v_user, 'photo-evidence-regression', repeat('a', 64), 'free', now(), 3, 50
  );
  IF v_reservation->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Could not reserve synthetic Photo credit: %', v_reservation;
  END IF;
  v_reservation_id := (v_reservation->>'reservationId')::uuid;

  v_claim := public.claim_flow_photo_inference(
    v_user, v_reservation_id, repeat('a', 64), NULL, NULL, NULL, NULL,
    now() - interval '20 minutes'
  );
  IF v_claim->>'acquired' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Synthetic inference claim failed: %', v_claim;
  END IF;
  v_reconcile := public.reconcile_stale_flow_photo_reservations(v_user, now());
  IF (v_reconcile->>'markedUnknown')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Synthetic unknown outcome was not marked: %', v_reconcile;
  END IF;

  v_invalid := public.resolve_flow_photo_outcome_unknown(
    v_user, v_reservation_id, true, repeat('a', 257), v_admin, now()
  );
  IF v_invalid->>'code' IS DISTINCT FROM 'CONFIRMED_FAILURE_EVIDENCE_REQUIRED' THEN
    RAISE EXCEPTION 'Oversized evidence was accepted: %', v_invalid;
  END IF;

  v_resolution := public.resolve_flow_photo_outcome_unknown(
    v_user, v_reservation_id, true, repeat('a', 256), v_admin, now()
  );
  IF v_resolution->>'status' IS DISTINCT FROM 'RELEASED' THEN
    RAISE EXCEPTION 'Confirmed failure did not release credit: %', v_resolution;
  END IF;
  IF (SELECT count(*) FROM public.photo_outcome_resolutions
      WHERE reservation_id = v_reservation_id AND resolved_by = v_admin) <> 1 THEN
    RAISE EXCEPTION 'Resolution audit row missing or duplicated';
  END IF;
  IF (SELECT daily_used FROM public.credite_ai WHERE user_id = v_user) <> 0 THEN
    RAISE EXCEPTION 'Confirmed failure did not restore the reserved daily credit';
  END IF;
  v_resolution := public.resolve_flow_photo_outcome_unknown(
    v_user, v_reservation_id, true, repeat('a', 256), v_admin, now()
  );
  IF v_resolution->>'replay' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Repeated operator resolution was not idempotent: %', v_resolution;
  END IF;
END;
$test$;

ROLLBACK;
