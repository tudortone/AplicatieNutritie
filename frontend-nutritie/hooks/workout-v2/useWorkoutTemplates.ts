import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../../supabase';
import { templateCacheKey } from '../../lib/workout-v2/storageKeys';
import {
  createSupabaseTemplateRepository,
  type WorkoutTemplateRepository,
} from '../../lib/workout-v2/templateRepository';
import type { WorkoutTemplate } from '../../lib/workout-v2/templateModel';

export function useWorkoutTemplates(
  ownerId: string | null,
  injectedRepository?: WorkoutTemplateRepository,
) {
  const repository = useMemo(
    () => injectedRepository ?? createSupabaseTemplateRepository(supabase),
    [injectedRepository],
  );
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(Boolean(ownerId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ownerId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await repository.list(ownerId);
      setTemplates(rows);
      await AsyncStorage.setItem(templateCacheKey(ownerId), JSON.stringify(rows));
    } catch (reason) {
      const cached = await AsyncStorage.getItem(templateCacheKey(ownerId));
      if (cached) setTemplates(JSON.parse(cached) as WorkoutTemplate[]);
      setError(reason instanceof Error ? reason.message : 'TEMPLATE_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [ownerId, repository]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const create = useCallback(async (template: WorkoutTemplate) => {
    if (!ownerId) throw new Error('OWNER_ID_REQUIRED');
    const saved = await repository.create(ownerId, template);
    await refresh();
    return saved;
  }, [ownerId, refresh, repository]);

  const update = useCallback(async (template: WorkoutTemplate) => {
    if (!ownerId) throw new Error('OWNER_ID_REQUIRED');
    const saved = await repository.update(ownerId, template);
    await refresh();
    return saved;
  }, [ownerId, refresh, repository]);

  const remove = useCallback(async (templateId: string) => {
    if (!ownerId) throw new Error('OWNER_ID_REQUIRED');
    await repository.remove(ownerId, templateId);
    await refresh();
  }, [ownerId, refresh, repository]);

  return { templates, loading, error, refresh, create, update, remove };
}

