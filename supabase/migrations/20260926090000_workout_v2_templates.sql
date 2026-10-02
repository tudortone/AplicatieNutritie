-- GetFlow Workout V2 templates.
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  source_preset_id TEXT,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocks) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_user_updated
  ON public.workout_templates (user_id, updated_at DESC);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workout_templates_owner_all" ON public.workout_templates;
CREATE POLICY "workout_templates_owner_all"
  ON public.workout_templates
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Do not inherit the project's historical broad Data API defaults. RLS limits
-- rows, while these grants limit the operations exposed to each role.
REVOKE ALL ON TABLE public.workout_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_templates TO authenticated;
GRANT ALL ON TABLE public.workout_templates TO service_role;
