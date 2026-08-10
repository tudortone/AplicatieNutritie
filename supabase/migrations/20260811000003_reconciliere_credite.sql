-- =============================================================================
-- H3: Job de reconciliere credite AI — închide crash-window-ul dintre
-- `consuma_credit` (debit) și răspuns.
--
-- PROBLEMA: aiUsageQuota.js debitează soldul prin `consuma_credit` înainte de a
-- rula operația AI. Un crash hard între debit și răspuns nu rulează niciodată
-- refund-ul (handler-ul de `finish`/`close` moare odată cu procesul), deci
-- creditul e ars fără urmă. Nu există nicio înregistrare a debitului pe care
-- să o poată verifica un proces de recuperare.
--
-- FIX: ledger-first.
--   1. `consuma_credit` primește `p_event_id` (generat în Node la debitare) și,
--      când e prezent, înregistrează ATOMIC debitul ca rând `CONSUM_AI`
--      (credite_delta = -p_cost) în `credite_tranzactii` — ledger append-only
--      existent, cu UNIQUE pe event_id.
--   2. La succes (2xx), Node marchează consumul cu un rând `CONSUM_AI_CONFIRM`
--      (event_id `ok:<event_id>`, delta 0).
--   3. La eșec (5xx/429/close), refund-ul existent folosește un event_id
--      distinct `refund:<event_id>` ca să NU colizeze cu rândul CONSUM_AI.
--   4. `reconcilia_credite_consumate()` (job periodic) găsește rândurile
--      CONSUM_AI mai vechi de 15 min fără marcaj `ok:`/`refund:` — adică debit
--      fără rezultat — și restituie creditul atomic + idempotent.
-- =============================================================================

-- Funcția consuma_credit își schimbă semnătura (se adaugă p_event_id).
-- Ștergem vechiul overload cu 2 argumente ca să rămână o singură definiție.
DROP FUNCTION IF EXISTS consuma_credit(uuid, integer);

CREATE OR REPLACE FUNCTION consuma_credit(
  p_user_id    uuid,
  p_cost       integer DEFAULT 1,
  p_event_id   text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sold integer;
BEGIN
  UPDATE credite_ai
     SET sold = sold - p_cost,
         updated_at = now()
   WHERE user_id = p_user_id AND sold >= p_cost
   RETURNING sold INTO v_sold;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- H3: înregistrăm debitul în ledger ATOMIC cu scăderea soldului. Un crash
  -- după acest commit lasă un rând CONSUM_AI fără marcaj ok/refund, pe care
  -- reconcilia_credite_consumate() îl restituie. UNIQUE pe event_id face
  -- re-executarea aceleiași operații imposibilă (dublu debit = rollback).
  IF p_event_id IS NOT NULL THEN
    INSERT INTO credite_tranzactii (user_id, event_id, event_type, credite_delta, metadata)
    VALUES (p_user_id, p_event_id, 'CONSUM_AI', -p_cost,
            jsonb_build_object('cost', p_cost));
  END IF;

  RETURN v_sold;
END;
$$;

REVOKE ALL ON FUNCTION consuma_credit(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consuma_credit(uuid, integer, text) TO service_role;

-- Index pentru scanarea jobului de reconciliere (event_type + vechime).
CREATE INDEX IF NOT EXISTS idx_credite_tranzactii_consum
  ON credite_tranzactii (event_type, creat_la);

-- =============================================================================
-- Funcția de reconciliere (apelată periodic de runner-ul din backend).
-- Găsește debitele CONSUM_AI orfane (fără confirmare `ok:` și fără refund
-- `refund:`, mai vechi de 15 min — peste orice durată legitimă de request,
-- server.timeout = 5 min) și restituie creditul atomic + idempotent.
-- Returnează rândurile procesate pentru audit/log.
-- =============================================================================
CREATE OR REPLACE FUNCTION reconcilia_credite_consumate()
RETURNS TABLE (
  consum_id      uuid,
  user_id        uuid,
  event_id       text,
  refund_event_id text,
  sold_nou       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rand record;
  v_sold int;
BEGIN
  FOR v_rand IN
    SELECT c.id, c.user_id, c.event_id
      FROM credite_tranzactii c
     WHERE c.event_type = 'CONSUM_AI'
       AND c.creat_la < NOW() - INTERVAL '15 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM credite_tranzactii r
          WHERE r.event_id = 'refund:' || c.event_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM credite_tranzactii o
          WHERE o.event_id = 'ok:' || c.event_id
       )
     ORDER BY c.creat_la
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT aplica_tranzactie_credite(
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

REVOKE ALL ON FUNCTION reconcilia_credite_consumate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reconcilia_credite_consumate() TO service_role;

COMMENT ON FUNCTION reconcilia_credite_consumate() IS
  'H3: restituie debitele CONSUM_AI orfane (crash-window) — atomic + idempotent pe event_id.';
