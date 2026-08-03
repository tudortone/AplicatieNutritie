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
  // piept
  chest: { id: 'chest', label: 'Pectorali', views: ['front'], paired: true, grup: 'piept' },

  // umeri
  delts: { id: 'delts', label: 'Deltoizi', views: ['front', 'back'], paired: true, grup: 'umeri' },

  // spate
  traps: { id: 'traps', label: 'Trapez', views: ['back'], paired: true, grup: 'spate' },
  lats: { id: 'lats', label: 'Dorsali', views: ['back'], paired: true, grup: 'spate' },
  infraspinatus: { id: 'infraspinatus', label: 'Infraspinos', views: ['back'], paired: true, grup: 'spate' },
  lower_back: { id: 'lower_back', label: 'Lombari', views: ['back'], paired: true, grup: 'spate' },
  neck: { id: 'neck', label: 'Gât', views: ['front'], paired: true, grup: 'spate' },

  // brate
  biceps: { id: 'biceps', label: 'Biceps', views: ['front', 'back'], paired: true, grup: 'brate' },
  triceps: { id: 'triceps', label: 'Triceps', views: ['front', 'back'], paired: true, grup: 'brate' },
  forearms: { id: 'forearms', label: 'Antebrațe', views: ['front', 'back'], paired: true, grup: 'brate' },

  // trunchi
  abs: { id: 'abs', label: 'Abdomen', views: ['front'], paired: true, grup: 'trunchi' },
  obliques: { id: 'obliques', label: 'Oblici', views: ['front', 'back'], paired: true, grup: 'trunchi' },
  serratus: { id: 'serratus', label: 'Seratus anterior', views: ['front'], paired: true, grup: 'trunchi' },

  // picioare
  glutes: { id: 'glutes', label: 'Fesieri', views: ['back'], paired: true, grup: 'picioare' },
  quads: { id: 'quads', label: 'Cvadriceps', views: ['front', 'back'], paired: true, grup: 'picioare' },
  hamstrings: { id: 'hamstrings', label: 'Ischiogambieri', views: ['back'], paired: true, grup: 'picioare' },
  calves: { id: 'calves', label: 'Gambe', views: ['front', 'back'], paired: true, grup: 'picioare' },
  adductors: { id: 'adductors', label: 'Adductori', views: ['front', 'back'], paired: true, grup: 'picioare' },
  hip_flexors: { id: 'hip_flexors', label: 'Flexori de șold', views: ['front'], paired: true, grup: 'picioare' },
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
