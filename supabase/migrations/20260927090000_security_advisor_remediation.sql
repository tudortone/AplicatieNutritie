-- GetFlow — Supabase Security Advisor remediation (2026-09-27)
--
-- This migration is intentionally narrow:
--   * pin every listed function to an empty search_path;
--   * schema-qualify relations used by SECURITY DEFINER functions;
--   * keep privileged identity/GDPR/credit RPCs backend-only;
--   * preserve authenticated access to the zero-argument, auth.uid()-scoped
--     gamification synchronization RPC;
--   * re-assert secure default privileges for future functions.

-- Trigger/check helpers are SECURITY INVOKER. Their bodies use only trigger
-- records, pg_catalog built-ins, or already-qualified information_schema data.
ALTER FUNCTION public.mese_set_local_day() SET search_path = '';
ALTER FUNCTION public.alimente_valid_shape(jsonb) SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- Flow Credits authority: called only by the trusted backend/service_role.
CREATE OR REPLACE FUNCTION public.aplica_tranzactie_credite(
  p_user_id uuid,
  p_event_id text,
  p_event_type text,
  p_delta integer,
  p_produs_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sold_curent integer := 0;
  v_sold_nou integer;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.credite_tranzactii
     WHERE event_id = p_event_id
  ) THEN
    RETURN -1;
  END IF;

  SELECT sold
    INTO v_sold_curent
    FROM public.credite_ai
   WHERE user_id = p_user_id;

  IF v_sold_curent IS NULL THEN
    v_sold_curent := 0;
  END IF;

  IF p_delta < 0 AND (v_sold_curent + p_delta) < 0 THEN
    RAISE EXCEPTION 'SOLD_INSUFICIENT: sold curent % inapoiat de p_delta %',
      v_sold_curent, p_delta;
  END IF;

  INSERT INTO public.credite_tranzactii(
    user_id, event_id, event_type, credite_delta, produs_id, metadata
  ) VALUES (
    p_user_id, p_event_id, p_event_type, p_delta, p_produs_id, p_metadata
  );

  INSERT INTO public.credite_ai AS solduri(user_id, sold)
  VALUES (p_user_id, p_delta)
  ON CONFLICT (user_id) DO UPDATE
    SET sold = solduri.sold + p_delta,
        updated_at = pg_catalog.now()
  RETURNING sold INTO v_sold_nou;

  RETURN v_sold_nou;
END;
$$;

REVOKE ALL ON FUNCTION public.aplica_tranzactie_credite(uuid, text, text, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplica_tranzactie_credite(uuid, text, text, integer, text, jsonb)
  TO service_role;

-- Privileged auth.users lookup: trusted backend/service_role only.
CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT users.id, users.email::text
    FROM auth.users AS users
   WHERE pg_catalog.lower(users.email) = pg_catalog.lower(p_email)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text)
  TO service_role;

-- GDPR deletion is initiated by the authenticated backend route, which derives
-- the user id from server-verified identity. The client cannot supply an
-- arbitrary target directly to this definer RPC.
CREATE OR REPLACE FUNCTION public.initiate_gdpr_deletion(
  p_user_id uuid,
  p_clerk_user_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT deletion.id
    INTO v_id
    FROM public.gdpr_deletions AS deletion
   WHERE deletion.user_id = p_user_id
     AND deletion.status NOT IN ('completed', 'failed')
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.gdpr_deletions(user_id, clerk_user_id, status)
  VALUES (p_user_id, p_clerk_user_id, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_gdpr_deletion(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_gdpr_deletion(uuid, text)
  TO service_role;

-- This RPC is intentionally callable by signed-in users. It has no identity
-- argument, derives the subject from auth.uid(), and qualifies every relation.
ALTER FUNCTION public.sincronizeaza_gamificare_sigur() SET search_path = '';
REVOKE ALL ON FUNCTION public.sincronizeaza_gamificare_sigur()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizeaza_gamificare_sigur()
  TO authenticated, service_role;

-- Future functions must be explicitly exposed. Repeating these statements is
-- idempotent and does not change grants on existing functions.
-- Application migrations create public functions as `postgres`. Scope the
-- change to that owner; Supabase-managed `supabase_admin` defaults are left
-- untouched because they belong to platform-managed objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
