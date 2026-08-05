-- ==============================================================================
-- NUTRIAI — MIGRARE: REVOKE pe functiile de curatare SECURITY DEFINER
--
-- Context (C1 / audit Android+backend):
-- `curata_audit_log_vechi` (20260805000001_gdpr_complete.sql) si
-- `curata_barcode_cache_vechi` (20260805000002_barcode_cache_ttl.sql) au fost
-- create ca SECURITY DEFINER fara `revoke`, deci raman apelabile de orice rol
-- care are cheia anona sau de un user autentificat. Cheia anona este inclusa in
-- APK/JS bundle, deci este publica prin definitie.
--
-- Impact: orice client neautorizat poate sterge randomul/jurnalul de audit sau
-- intregul cache de coduri de bare (inclusiv estimarile folosite de alti
-- utilizatori). Curatarea TTL este programata prin pg_cron si ruleaza ca
-- `postgres`, deci niciun flux legitim nu depinde de executia de catre un client.
--
-- Idempotenta: `revoke`/`grant` pe functii sunt idempotente in Postgres.
-- ==============================================================================

-- Functia de curatare a jurnalului de audit (SECURITY DEFINER, delete global).
revoke all on function public.curata_audit_log_vechi(integer)
  from public, anon, authenticated;

grant execute on function public.curata_audit_log_vechi(integer)
  to service_role;

-- Functia de curatare a cache-ului de coduri de bare (SECURITY DEFINER).
revoke all on function public.curata_barcode_cache_vechi(integer)
  from public, anon, authenticated;

grant execute on function public.curata_barcode_cache_vechi(integer)
  to service_role;
