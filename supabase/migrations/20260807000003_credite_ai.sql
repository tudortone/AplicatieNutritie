-- =============================================================================
-- P-13 / P-01b: Monetizare — credite AI + webhook RevenueCat
-- =============================================================================

-- Sold de credite per utilizator
CREATE TABLE IF NOT EXISTS credite_ai (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sold           int NOT NULL DEFAULT 0 CHECK (sold >= 0),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE credite_ai ENABLE ROW LEVEL SECURITY;
-- Utilizatorul poate citi propriul sold (nu îl poate modifica direct)
DROP POLICY IF EXISTS credite_ai_read_own ON credite_ai;
CREATE POLICY credite_ai_read_own ON credite_ai
  FOR SELECT USING (auth.uid() = user_id);
-- Scrierile vin exclusiv de la service_role (webhooks RevenueCat)
DROP POLICY IF EXISTS credite_ai_service_write ON credite_ai;
CREATE POLICY credite_ai_service_write ON credite_ai
  FOR ALL USING (current_setting('role') = 'service_role');

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_credite_ai_updated_at ON credite_ai;
CREATE TRIGGER trg_credite_ai_updated_at
  BEFORE UPDATE ON credite_ai
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ledger append-only al tranzacțiilor de credite
CREATE TABLE IF NOT EXISTS credite_tranzactii (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id       text NOT NULL,   -- ID unic din payload-ul RevenueCat (idempotent)
  event_type     text NOT NULL,   -- INITIAL_PURCHASE, NON_RENEWING_PURCHASE, RENEWAL, etc.
  credite_delta  int NOT NULL,    -- pozitiv = adăugat, negativ = retras
  produs_id      text,
  metadata       jsonb,
  creat_la       timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT credite_tranzactii_event_unique UNIQUE (event_id)
);

ALTER TABLE credite_tranzactii ENABLE ROW LEVEL SECURITY;
-- Utilizatorul poate citi propriul istoric
DROP POLICY IF EXISTS credite_tranzactii_read_own ON credite_tranzactii;
CREATE POLICY credite_tranzactii_read_own ON credite_tranzactii
  FOR SELECT USING (auth.uid() = user_id);
-- Scrierile vin exclusiv de la service_role
DROP POLICY IF EXISTS credite_tranzactii_service_write ON credite_tranzactii;
CREATE POLICY credite_tranzactii_service_write ON credite_tranzactii
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_credite_tranzactii_user ON credite_tranzactii (user_id, creat_la DESC);

-- Funcție atomică: creditează sau debitează și actualizează soldul
-- Returnează soldul nou sau -1 dacă event_id deja procesat (idempotent)
CREATE OR REPLACE FUNCTION aplica_tranzactie_credite(
  p_user_id     uuid,
  p_event_id    text,
  p_event_type  text,
  p_delta       int,
  p_produs_id   text DEFAULT NULL,
  p_metadata    jsonb DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sold_curent int := 0;
  v_sold_nou int;
BEGIN
  -- Idempotent: dacă event_id deja există, returnăm -1 (deja procesat)
  IF EXISTS (SELECT 1 FROM credite_tranzactii WHERE event_id = p_event_id) THEN
    RETURN -1;
  END IF;

  SELECT sold INTO v_sold_curent FROM credite_ai WHERE user_id = p_user_id;
  IF v_sold_curent IS NULL THEN
    v_sold_curent := 0;
  END IF;

  IF p_delta < 0 AND (v_sold_curent + p_delta) < 0 THEN
    RAISE EXCEPTION 'SOLD_INSUFICIENT: sold curent % inapoiat de p_delta %', v_sold_curent, p_delta;
  END IF;

  -- Inserăm tranzacția
  INSERT INTO credite_tranzactii (user_id, event_id, event_type, credite_delta, produs_id, metadata)
  VALUES (p_user_id, p_event_id, p_event_type, p_delta, p_produs_id, p_metadata);

  -- Upsert sold
  INSERT INTO credite_ai (user_id, sold)
  VALUES (p_user_id, p_delta)
  ON CONFLICT (user_id) DO UPDATE
    SET sold = credite_ai.sold + p_delta,
        updated_at = NOW()
  RETURNING sold INTO v_sold_nou;

  RETURN v_sold_nou;
END;
$$;

REVOKE ALL ON FUNCTION aplica_tranzactie_credite(uuid, text, text, int, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aplica_tranzactie_credite(uuid, text, text, int, text, jsonb) TO service_role;

COMMENT ON TABLE credite_ai IS 'P-01b: sold credite AI per utilizator (scris exclusiv de webhook RevenueCat).';
COMMENT ON TABLE credite_tranzactii IS 'P-01b: ledger append-only credite. UNIQUE pe event_id garantează idempotența.';
