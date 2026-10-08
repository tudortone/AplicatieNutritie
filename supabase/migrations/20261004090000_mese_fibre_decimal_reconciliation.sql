-- Launch reconciliation: some early environments created `mese.fibre` as
-- INTEGER even though the canonical schema defines every nutrition value as
-- NUMERIC. Coach proposals legitimately contain values such as 0.3 g fibre.
-- This change preserves those values; it does not fabricate or round data.
DO $migration$
DECLARE
  current_type text;
BEGIN
  SELECT data_type
    INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'mese'
    AND column_name = 'fibre';

  IF current_type IN ('smallint', 'integer', 'bigint') THEN
    ALTER TABLE public.mese
      ALTER COLUMN fibre TYPE NUMERIC USING fibre::NUMERIC;
  ELSIF current_type <> 'numeric' THEN
    RAISE EXCEPTION 'Unexpected public.mese.fibre type: %', current_type;
  END IF;
END
$migration$;
