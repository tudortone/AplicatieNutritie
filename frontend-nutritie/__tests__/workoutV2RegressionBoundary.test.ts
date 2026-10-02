import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('Workout V2 production boundary', () => {
  it('keeps production anatomy as the fallback and preview free of external persistence', () => {
    const productionBodyMap = readFileSync(resolve(root, 'components/fitness/BodyMap.tsx'), 'utf8');
    const experience = readFileSync(resolve(root, 'components/workout-v2/WorkoutV2Experience.tsx'), 'utf8');
    expect(productionBodyMap).not.toContain('AnatomyV2Map');
    expect(experience).not.toContain('supabase');
    expect(experience).not.toContain('AsyncStorage');
    expect(experience).not.toContain('getflow:workout-v2');
  });

  it('does not import protected monetization or nutrition systems', () => {
    const experience = readFileSync(resolve(root, 'components/workout-v2/WorkoutV2Experience.tsx'), 'utf8');
    expect(experience).not.toMatch(/billing|admob|flowCredits|photoFlow|mealUtils/i);
  });

  it('ships an owner-scoped RLS migration without anonymous grants', () => {
    const migration = readFileSync(resolve(root, '..', 'supabase/migrations/20260926090000_workout_v2_templates.sql'), 'utf8');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('REVOKE ALL ON TABLE public.workout_templates FROM anon');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).not.toMatch(/GRANT\s+.+\s+TO\s+anon/i);
  });
});
