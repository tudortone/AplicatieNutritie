-- P0-08 — privilegii IMPLICITE sigure pentru obiectele create in viitor.
--
-- ==========================================================================
-- PROBLEMA
-- ==========================================================================
-- Doua comportamente implicite pot expune obiecte noi fara ca autorul migrarii
-- sa observe:
--
--   1. PostgreSQL acorda IMPLICIT `EXECUTE` pe orice functie noua catre `PUBLIC`.
--      O functie `SECURITY DEFINER` viitoare care uita `REVOKE ... FROM PUBLIC`
--      devine apelabila de `anon`/`authenticated` prin Data API — exact calea de
--      escaladare de privilegii pe care migrarea de facturare
--      (20260914091254) o inchide manual, enumerand fiecare REVOKE.
--
--   2. Schema `public` este expusa integral prin Data API
--      (supabase/config.toml: `schemas = ["public"]`), iar setarea istorica de
--      proiect „automatically grant API access" poate acorda privilegii pe
--      tabele noi. Migrarea 20260818000001 a stabilit deja granturi EXPLICITE
--      pentru tabelele existente tocmai ca sa nu depindem de acea setare, dar
--      nu acopera tabelele adaugate ULTERIOR.
--
-- ==========================================================================
-- DECIZIA
-- ==========================================================================
-- Revocam privilegiile IMPLICITE pentru rolurile client. Efectul este exclusiv
-- „secure by default": orice tabela sau functie noua trebuie sa primeasca
-- explicit granturile de care are nevoie, la fel ca tabelele existente.
--
-- Ce NU face aceasta migrare:
--   - nu modifica niciun obiect EXISTENT (granturile explicite raman intacte);
--   - nu atinge `service_role` sau `postgres` (backendul continua sa functioneze);
--   - nu schimba nicio politica RLS;
--   - nu aplica FORCE ROW LEVEL SECURITY (vezi nota de la final).
--
-- `ALTER DEFAULT PRIVILEGES` fara `FOR ROLE` se aplica rolului care executa
-- migrarea, adica exact rolul care va crea obiectele viitoare. Instructiunile
-- sunt idempotente: rularea repetata nu schimba nimic.

-- Tabele si secvente noi: niciun privilegiu implicit pentru rolurile client.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Functii noi: `PUBLIC` este cazul critic (implicitul PostgreSQL pentru EXECUTE).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ==========================================================================
-- NOTA: de ce NU aplicam FORCE ROW LEVEL SECURITY
-- ==========================================================================
-- FORCE afecteaza PROPRIETARUL tabelei. In acest proiect:
--   - rolurile client (`anon`, `authenticated`) sunt deja supuse RLS — FORCE nu
--     schimba nimic pentru ele;
--   - `service_role` are BYPASSRLS la nivel de rol, deci FORCE nu l-ar opri
--     oricum (backendul ramane bariera de autorizare pentru calea lui);
--   - proprietarul schemei nu este accesibil din client (PostgREST se conecteaza
--     ca `anon`/`authenticated`/`service_role`).
-- FORCE ar adauga deci risc operational (migrari si mentenanta rulate de
-- proprietar) fara castig de securitate impotriva atacatorului modelat.
-- Decizie: NU se aplica; se re-evalueaza daca vreodata o cale de client ajunge
-- sa se conecteze ca proprietar al tabelelor.

-- Nota pentru migrarile viitoare: dupa aceasta schimbare, o tabela noua NU este
-- vizibila clientului pana cand nu primeste explicit, de exemplu:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<tabela> TO authenticated;
-- iar o functie noua apelabila din client are nevoie de:
--   GRANT EXECUTE ON FUNCTION public.<functie>(...) TO authenticated;
-- Aceasta este intentia: accesul devine o decizie explicita, verificabila la review.

NOTIFY pgrst, 'reload schema';
