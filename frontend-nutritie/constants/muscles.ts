/**
 * muscles.ts — SURSA UNICA DE ADEVAR pentru harta musculara.
 *
 * Context (audit harta musculara):
 * Existau 4 tabele care se suprapuneau (`muscleRegions.ts`, `muscleZones.ts`,
 * `muscleMeshMap.ts`, `muscleColorUtils.ts`) si 5 renderere paralele. Cel mai
 * grav bug structural: acelasi `id` de muschi (trapez, gambe, deltoid) exista
 * si pe fata si pe spate, iar cautarea se facea DOAR dupa `id` -> vederea din
 * spate primea geometria de pe fata. "Fix-ul" din `muscleRegions.ts` depindea de
 * ordinea elementelor din array, cu un comentariu care avertiza sa nu fie mutate.
 *
 * Solutia: cheia unei suprafete desenabile nu mai este `MuscleId`, ci un
 * `MuscleSlot` = `${MuscleId}:${BodyView}`. Un slot este unic prin constructie,
 * deci bug-ul nu mai poate reaparea indiferent de ordinea din fisiere.
 *
 * Maparea denumirilor brute (romana/engleza/catalog) catre `MuscleId` ramane in
 * `lib/muscleMapping.ts`, care este deja corecta — acest modul o completeaza,
 * nu o dubleaza.
 */

import { ALL_MUSCLE_IDS, type MuscleId } from '../components/fitness/heatColor';

export type { MuscleId };
export { ALL_MUSCLE_IDS };

/** Vederea corpului. Inlocuieste perechile inconsistente front/anterior si back/posterior. */
export type BodyView = 'front' | 'back';

export const BODY_VIEWS: BodyView[] = ['front', 'back'];

/** Partea corpului pentru muschii pereche. `center` = suprafata unica (abdomen, lombari). */
export type BodyLateral = 'left' | 'right' | 'center';

/**
 * Cheia unica a unei suprafete desenabile.
 * Format: `${MuscleId}:${BodyView}` — ex. `gambe:front`, `gambe:back`.
 */
export type MuscleSlot = `${MuscleId}:${BodyView}`;

export function slot(id: MuscleId, view: BodyView): MuscleSlot {
  return `${id}:${view}`;
}

export function parseSlot(value: MuscleSlot): { id: MuscleId; view: BodyView } {
  const [id, view] = value.split(':') as [MuscleId, BodyView];
  return { id, view };
}

/** Metadate per muschi: unde este vizibil si cum se numeste in interfata. */
export interface MuscleMeta {
  id: MuscleId;
  /** Eticheta afisata utilizatorului (romana). */
  label: string;
  /** Vederile in care muschiul este vizibil. */
  views: BodyView[];
  /** Muschi pereche (stanga/dreapta) sau suprafata unica pe linia mediana. */
  paired: boolean;
  /** Grupa mare, pentru filtre si statistici. */
  grup: 'piept' | 'spate' | 'umeri' | 'brate' | 'trunchi' | 'picioare';
}

export const MUSCLES: Record<MuscleId, MuscleMeta> = {
  pectorali: { id: 'pectorali', label: 'Pectorali', views: ['front'], paired: true, grup: 'piept' },

  deltoid_anterior: { id: 'deltoid_anterior', label: 'Deltoid anterior', views: ['front'], paired: true, grup: 'umeri' },
  deltoid_lateral: { id: 'deltoid_lateral', label: 'Deltoid lateral', views: ['front', 'back'], paired: true, grup: 'umeri' },
  deltoid_posterior: { id: 'deltoid_posterior', label: 'Deltoid posterior', views: ['back'], paired: true, grup: 'umeri' },

  biceps: { id: 'biceps', label: 'Biceps', views: ['front'], paired: true, grup: 'brate' },
  triceps: { id: 'triceps', label: 'Triceps', views: ['back'], paired: true, grup: 'brate' },
  antebrate: { id: 'antebrate', label: 'Antebra\u021be', views: ['front', 'back'], paired: true, grup: 'brate' },

  abdomen: { id: 'abdomen', label: 'Abdomen', views: ['front'], paired: false, grup: 'trunchi' },
  oblici: { id: 'oblici', label: 'Oblici', views: ['front'], paired: true, grup: 'trunchi' },

  trapez: { id: 'trapez', label: 'Trapez', views: ['front', 'back'], paired: false, grup: 'spate' },
  dorsali: { id: 'dorsali', label: 'Dorsali', views: ['back'], paired: true, grup: 'spate' },
  romboizi: { id: 'romboizi', label: 'Romboizi', views: ['back'], paired: false, grup: 'spate' },
  lombari: { id: 'lombari', label: 'Lombari', views: ['back'], paired: false, grup: 'spate' },

  fesieri: { id: 'fesieri', label: 'Fesieri', views: ['back'], paired: true, grup: 'picioare' },
  cvadriceps: { id: 'cvadriceps', label: 'Cvadriceps', views: ['front'], paired: true, grup: 'picioare' },
  ischiogambieri: { id: 'ischiogambieri', label: 'Ischiogambieri', views: ['back'], paired: true, grup: 'picioare' },
  gambe: { id: 'gambe', label: 'Gambe', views: ['front', 'back'], paired: true, grup: 'picioare' },
  adductori: { id: 'adductori', label: 'Adductori', views: ['front'], paired: true, grup: 'picioare' },
  abductori: { id: 'abductori', label: 'Abductori', views: ['front', 'back'], paired: true, grup: 'picioare' },
};

/** Toate slot-urile desenabile, derivate automat din `MUSCLES`. */
export const ALL_SLOTS: MuscleSlot[] = (ALL_MUSCLE_IDS as MuscleId[]).flatMap((id) =>
  MUSCLES[id].views.map((view) => slot(id, view)),
);

/** Slot-urile vizibile intr-o anumita vedere. */
export function slotsForView(view: BodyView): MuscleSlot[] {
  return ALL_SLOTS.filter((s) => parseSlot(s).view === view);
}

/** Eticheta afisabila pentru un muschi. */
export function muscleLabel(id: MuscleId): string {
  return MUSCLES[id]?.label ?? id;
}

/**
 * Normalizeaza denumirile vechi de vedere.
 * Codul mostenit foloseste amestecat `anterior`/`front` si `posterior`/`back`.
 */
export function normalizeView(value: string): BodyView {
  const v = String(value ?? '').toLowerCase();
  if (v === 'back' || v === 'posterior' || v === 'spate') return 'back';
  return 'front';
}
