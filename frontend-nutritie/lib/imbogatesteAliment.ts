// Imbogățește alimentele manuale din jurnal cu profil nutrițional detaliat
// (fibre, aminoacizi esențiali, vitamine/minerale) când ele lipsesc din JSONB.
//
// Ordinea surselor (best-effort, nu blochează niciodată salvarea mesei):
//   1. alimentul are deja aminoacizi/micronutrienți -> nemodificat;
//   2. tabel static per-100g (lib/nutritieTabel.ts), cheie = nume normalizat;
//   3. cache AsyncStorage (rezultat AI per aliment normalizat);
//   4. backend POST /profil-nutritiv (per 100g), dacă suntem online;
//   5. altfel -> nemodificat.
// Macro-urile mesei rămân întotdeauna autoritare; sursa aduce doar ce lipsește.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { buildApiUrl } from './api';
import type { AlimentDetaliat } from '../types';
import { normalizeazaNumeAliment } from './normalizareAliment';
import { TABEL_NUTRITIV } from './nutritieTabel';

export const CHEIE_CACHE_PREFIX = 'nutritie_profil:';
export const TTL_CACHE_MS = 60 * 24 * 60 * 60 * 1000; // 60 de zile
const TIMEOUT_AI_MS = 10000;

function rotunjeste1(val: number | undefined): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return Math.round(val * 10) / 10;
}

function rotunjesteSubobiect(src: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!src) return undefined;
  const out: Record<string, number> = {};
  let has = false;
  for (const [k, v] of Object.entries(src)) {
    if (Number.isFinite(v)) {
      out[k] = Math.round(v * 10) / 10;
      has = true;
    }
  }
  return has ? out : undefined;
}

/**
 * Caută în tabelul static o intrare per-100g pe baza numelui normalizat.
 * Tabelul e injectabil pentru teste; implicit e TABEL_NUTRITIV global.
 */
export function cautaInTabel(
  nume: string,
  tabel: Record<string, AlimentDetaliat> = TABEL_NUTRITIV,
): AlimentDetaliat | null {
  const cheie = normalizeazaNumeAliment(nume);
  if (!cheie) return null;
  const intrare = tabel[cheie];
  return intrare ?? null;
}

/**
 * Scalează un profil per-100g la porția dată. Fără `grame` (sau nevalid) tratează
 * profilul ca deja la nivel de porție (factor 1) — sigur, nu dublează macro-urile.
 */
export function escaladeazaPer100g(profil: AlimentDetaliat, grame: number | undefined): AlimentDetaliat {
  const g = Number(grame);
  const factor = Number.isFinite(g) && g > 0 ? g / 100 : 1;
  return {
    ...profil,
    grame: g > 0 ? g : profil.grame,
    calorii: rotunjeste1(profil.calorii * factor) ?? profil.calorii,
    proteine: rotunjeste1(profil.proteine * factor) ?? profil.proteine,
    carbohidrati: rotunjeste1(profil.carbohidrati * factor) ?? profil.carbohidrati,
    grasimi: rotunjeste1(profil.grasimi * factor) ?? profil.grasimi,
    fibre: rotunjeste1(profil.fibre !== undefined ? profil.fibre * factor : profil.fibre),
    aminoacizi: rotunjesteSubobiect(profil.aminoacizi as Record<string, number>),
    micronutrienti: rotunjesteSubobiect(profil.micronutrienti as Record<string, number>),
  };
}

/**
 * Îmbină alimentul mesei (macro-uri autoritare, poza, gramaj) cu un profil per-100g
 * din sursă. Completează doar fibre + aminoacizi + micronutrienți; niciodată macro-uri.
 */
export function combinaProfil(aliment: AlimentDetaliat, profilPer100g: AlimentDetaliat): AlimentDetaliat {
  const scalat = escaladeazaPer100g(profilPer100g, aliment.grame);
  return {
    ...aliment,
    fibre: Number(aliment.fibre) ? aliment.fibre : scalat.fibre,
    aminoacizi: aliment.aminoacizi ?? scalat.aminoacizi,
    micronutrienti: aliment.micronutrienti ?? scalat.micronutrienti,
  };
}

/** Un aliment e „îmbogățit” dacă are deja detalii dincolo de macro-uri. */
export function esteDejaImbogatit(aliment: AlimentDetaliat): boolean {
  return !!(aliment.aminoacizi || aliment.micronutrienti);
}

export interface OptiuniImbogatire {
  /** false = offline cert; la true/omis încercăm și sursa AI. */
  online?: boolean;
  /** Pe răspuns non-2xx nu aruncăm niciodată — returnăm alimentul nemodificat. */
}

async function citesteCache(cheie: string): Promise<AlimentDetaliat | null> {
  try {
    const raw = await AsyncStorage.getItem(CHEIE_CACHE_PREFIX + cheie);
    if (!raw) return null;
    const { salvatLa, per100g } = JSON.parse(raw) as { salvatLa: number; per100g: AlimentDetaliat };
    if (!per100g || Date.now() - salvatLa > TTL_CACHE_MS) return null;
    return per100g;
  } catch {
    return null;
  }
}

async function scrieCache(cheie: string, per100g: AlimentDetaliat): Promise<void> {
  try {
    await AsyncStorage.setItem(CHEIE_CACHE_PREFIX + cheie, JSON.stringify({ salvatLa: Date.now(), per100g }));
  } catch {
    // cache best-effort — ignorăm erorile de scriere
  }
}

async function cereProfilAI(aliment: AlimentDetaliat): Promise<AlimentDetaliat | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_AI_MS);
    try {
      const raspuns = await fetch(buildApiUrl('/profil-nutritiv'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({ aliment: aliment.nume }),
      });
      if (!raspuns.ok) return null;
      const corp = (await raspuns.json()) as AlimentDetaliat;
      if (!corp || typeof corp !== 'object') return null;
      return { grame: 100, ...corp };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Îmbogățește un aliment (best-effort). Nu aruncă niciodată: la orice eșec
 * (offline, 404, timeout, model indisponibil) returnează alimentul nemodificat.
 */
export async function imbogatesteAliment(
  aliment: AlimentDetaliat,
  optiuni: OptiuniImbogatire = {},
): Promise<AlimentDetaliat> {
  if (!aliment || esteDejaImbogatit(aliment)) return aliment;

  const nume = String(aliment.nume || '').trim();
  if (!nume) return aliment;

  const dinTabel = cautaInTabel(nume);
  if (dinTabel) {
    return combinaProfil(aliment, dinTabel);
  }

  const cheie = normalizeazaNumeAliment(nume);
  const dinCache = await citesteCache(cheie);
  if (dinCache) {
    return combinaProfil(aliment, dinCache);
  }

  if (optiuni.online === false) return aliment;

  const dinAI = await cereProfilAI(aliment);
  if (dinAI) {
    await scrieCache(cheie, dinAI);
    return combinaProfil(aliment, dinAI);
  }

  return aliment;
}
