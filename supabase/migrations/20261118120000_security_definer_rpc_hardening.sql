-- Hardening idempotent pentru funcțiile RPC SECURITY DEFINER critice (billing, Flow Credits, Play Integrity).
-- Garantează că niciun rol client (`PUBLIC`, `anon`, `authenticated`) nu poate executa direct funcțiile de reconciliere/debitare.

DO $$
DECLARE
  fn_record record;
  target_names text[] := ARRAY[
    'claim_flow_photo_inference',
    'claim_play_integrity_token',
    'settle_flow_photo_credit',
    'settle_flow_photo_credit_v2'
  ];
BEGIN
  FOR fn_record IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS arg_list
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_names)
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated;',
      fn_record.schema_name,
      fn_record.func_name,
      fn_record.arg_list
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role;',
      fn_record.schema_name,
      fn_record.func_name,
      fn_record.arg_list
    );
  END LOOP;
END
$$;
