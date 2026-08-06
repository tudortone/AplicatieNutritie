-- =============================================================================
-- S1 P-08: Tabela de dead-lettering pentru webhook-urile Clerk care esueaza
-- =============================================================================

CREATE TABLE IF NOT EXISTS clerk_webhook_esuate (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  text NOT NULL,
  event_type     text NOT NULL,
  motiv          text NOT NULL,
  payload        jsonb,
  incercari      integer NOT NULL DEFAULT 1,
  rezolvat       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clerk_webhook_esuate_unic UNIQUE (clerk_user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_clerk_webhook_esuate_nerezolvate
  ON clerk_webhook_esuate (created_at) WHERE rezolvat = false;

ALTER TABLE clerk_webhook_esuate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clerk_webhook_esuate_deny_all ON clerk_webhook_esuate;
CREATE POLICY clerk_webhook_esuate_deny_all ON clerk_webhook_esuate
  FOR ALL USING (false);
