-- =============================================================================
-- N-04: persistă ImageKit fileIds pe gdpr_deletions pentru reluare rezilientă
-- =============================================================================
-- Worker-ul GDPR șterge asseturile ImageKit ale utilizatorului. Fără coloană de
-- file_ids, un worker reluat (`retry_count` > 0) pornește cu o listă goală și
-- lasă asseturi orfane în CDN — date reziduale. Coloana e folosită de worker:
-- ruta (routes/gdpr.js) extrage fileIds înainte de ștergere și îi persistă aici,
-- iar reluările îi citesc în loc să re-extragă dintr-o bază de date deja ștearsă.
--
-- Regula proiect: SQL înaintea codului care o folosește. Migrare idempotentă.

ALTER TABLE public.gdpr_deletions
  ADD COLUMN IF NOT EXISTS file_ids jsonb;

COMMENT ON COLUMN public.gdpr_deletions.file_ids IS
  'N-04: lista de FileID-uri ImageKit extrase înainte de ștergerea mesei — reluarea le folosește în loc să re-extragă dintr-o bază de date deja ștearsă.';