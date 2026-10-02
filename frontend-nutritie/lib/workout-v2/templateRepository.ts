import type { SupabaseClient } from '@supabase/supabase-js';

import type { WorkoutTemplate, WorkoutTemplateBlock } from './templateModel';

export interface WorkoutTemplateRepository {
  list(ownerId: string): Promise<WorkoutTemplate[]>;
  create(ownerId: string, template: WorkoutTemplate): Promise<WorkoutTemplate>;
  update(ownerId: string, template: WorkoutTemplate): Promise<WorkoutTemplate>;
  duplicate(ownerId: string, sourceId: string, newId: string, newName: string, now: string): Promise<WorkoutTemplate>;
  remove(ownerId: string, templateId: string): Promise<void>;
}

interface WorkoutTemplateRow {
  id: string;
  user_id: string;
  schema_version: number;
  name: string;
  source_preset_id: string | null;
  blocks: WorkoutTemplateBlock[];
  created_at: string;
  updated_at: string;
}

function cloneTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return { ...template, blocks: template.blocks.map((block) => ({ ...block })) };
}

function assertOwner(ownerId: string, template: WorkoutTemplate): void {
  if (template.ownerId !== ownerId) throw new Error('OWNER_MISMATCH');
}

function toRow(template: WorkoutTemplate): WorkoutTemplateRow {
  return {
    id: template.id,
    user_id: template.ownerId,
    schema_version: template.schemaVersion,
    name: template.name,
    source_preset_id: template.sourcePresetId ?? null,
    blocks: template.blocks.map((block) => ({ ...block })),
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

function fromRow(row: WorkoutTemplateRow): WorkoutTemplate {
  return {
    id: row.id,
    ownerId: row.user_id,
    schemaVersion: 1,
    name: row.name,
    sourcePresetId: row.source_preset_id ?? undefined,
    blocks: row.blocks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMemoryTemplateRepository(): WorkoutTemplateRepository {
  const store = new Map<string, Map<string, WorkoutTemplate>>();
  const ownerStore = (ownerId: string) => {
    const existing = store.get(ownerId);
    if (existing) return existing;
    const created = new Map<string, WorkoutTemplate>();
    store.set(ownerId, created);
    return created;
  };
  return {
    async list(ownerId) {
      return [...ownerStore(ownerId).values()].map(cloneTemplate);
    },
    async create(ownerId, template) {
      assertOwner(ownerId, template);
      const current = ownerStore(ownerId);
      if (current.has(template.id)) throw new Error('TEMPLATE_ALREADY_EXISTS');
      current.set(template.id, cloneTemplate(template));
      return cloneTemplate(template);
    },
    async update(ownerId, template) {
      assertOwner(ownerId, template);
      const current = ownerStore(ownerId);
      if (!current.has(template.id)) throw new Error('TEMPLATE_NOT_FOUND');
      current.set(template.id, cloneTemplate(template));
      return cloneTemplate(template);
    },
    async duplicate(ownerId, sourceId, newId, newName, now) {
      const source = ownerStore(ownerId).get(sourceId);
      if (!source) throw new Error('TEMPLATE_NOT_FOUND');
      const duplicate: WorkoutTemplate = {
        ...cloneTemplate(source), id: newId, name: newName.trim(), createdAt: now, updatedAt: now,
        blocks: source.blocks.map((block) => ({ ...block, id: `${newId}:${block.id}` })),
      };
      if (!duplicate.name) throw new Error('TEMPLATE_NAME_REQUIRED');
      return this.create(ownerId, duplicate);
    },
    async remove(ownerId, templateId) {
      if (!ownerStore(ownerId).delete(templateId)) throw new Error('TEMPLATE_NOT_FOUND');
    },
  };
}

export function createSupabaseTemplateRepository(client: SupabaseClient): WorkoutTemplateRepository {
  return {
    async list(ownerId) {
      const { data, error } = await client.from('workout_templates').select('*').eq('user_id', ownerId).order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as WorkoutTemplateRow[]).map(fromRow);
    },
    async create(ownerId, template) {
      assertOwner(ownerId, template);
      const { data, error } = await client.from('workout_templates').insert(toRow(template)).select('*').single();
      if (error || !data) throw error ?? new Error('TEMPLATE_PERSISTENCE_FAILED');
      return fromRow(data as WorkoutTemplateRow);
    },
    async update(ownerId, template) {
      assertOwner(ownerId, template);
      const { data, error } = await client.from('workout_templates').update(toRow(template)).eq('id', template.id).eq('user_id', ownerId).select('*').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('TEMPLATE_NOT_FOUND');
      return fromRow(data as WorkoutTemplateRow);
    },
    async duplicate(ownerId, sourceId, newId, newName, now) {
      const source = (await this.list(ownerId)).find((template) => template.id === sourceId);
      if (!source) throw new Error('TEMPLATE_NOT_FOUND');
      const duplicate: WorkoutTemplate = {
        ...source, id: newId, name: newName.trim(), createdAt: now, updatedAt: now,
        blocks: source.blocks.map((block) => ({ ...block, id: `${newId}:${block.id}` })),
      };
      if (!duplicate.name) throw new Error('TEMPLATE_NAME_REQUIRED');
      return this.create(ownerId, duplicate);
    },
    async remove(ownerId, templateId) {
      const { data, error } = await client.from('workout_templates').delete().eq('id', templateId).eq('user_id', ownerId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('TEMPLATE_NOT_FOUND');
    },
  };
}

