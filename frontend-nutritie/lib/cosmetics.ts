import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_REWARD_STATE,
  REWARD_STATE_KEY,
  loadRewardState,
  saveRewardState,
  type Rarity,
  type RewardItem,
  type RewardState,
} from './questsEngine';

export type CosmeticType = 'avatar' | 'frame' | 'effect';
export type FrameStyle = 'solid' | 'double' | 'dashed' | 'glow' | 'crown';
export type EffectStyle = 'none' | 'pulse' | 'sparkle' | 'orbit' | 'flame' | 'electric';

export type CosmeticItem = RewardItem & {
  catalogId: string;
  cosmeticType: CosmeticType;
  frameStyle?: FrameStyle;
  effectStyle?: EffectStyle;
  description: string;
};

export type EquippedCosmetics = {
  avatarId: string | null;
  frameId: string | null;
  effectId: string | null;
};

export const EQUIPPED_COSMETICS_KEY = 'nutriai_equipped_cosmetics_v1';
export const EMPTY_EQUIPPED: EquippedCosmetics = { avatarId: null, frameId: null, effectId: null };

const cosmetic = (
  catalogId: string,
  name: string,
  cosmeticType: CosmeticType,
  rarity: Rarity,
  icon: string,
  colors: [string, string],
  description: string,
  frameStyle?: FrameStyle,
  effectStyle?: EffectStyle,
): CosmeticItem => ({
  id: catalogId,
  catalogId,
  name,
  theme: cosmeticType === 'avatar' ? 'Avatar' : cosmeticType === 'frame' ? 'Ramă' : 'Efect',
  cosmeticType,
  rarity,
  icon,
  colors,
  description,
  frameStyle,
  effectStyle,
});

/** 10 avatare + 12 rame + 8 efecte = 30 recompense. */
export const COSMETIC_CATALOG: CosmeticItem[] = [
  cosmetic('avatar_rookie', 'Rookie Lime', 'avatar', 'comun', '🙂', ['#CCFF00', '#65A30D'], 'Avatar energic pentru început.'),
  cosmetic('avatar_runner', 'Neon Runner', 'avatar', 'comun', '🏃', ['#22D3EE', '#0284C7'], 'Alergătorul neon.'),
  cosmetic('avatar_lifter', 'Iron Lifter', 'avatar', 'comun', '🏋️', ['#94A3B8', '#475569'], 'Forță și disciplină.'),
  cosmetic('avatar_ninja', 'Gym Ninja', 'avatar', 'rar', '🥷', ['#A855F7', '#312E81'], 'Antrenamente silențioase, rezultate mari.'),
  cosmetic('avatar_wolf', 'Arctic Wolf', 'avatar', 'rar', '🐺', ['#A5F3FC', '#2563EB'], 'Spirit de haită și rezistență.'),
  cosmetic('avatar_tiger', 'Power Tiger', 'avatar', 'rar', '🐯', ['#FB923C', '#DC2626'], 'Explozie de putere.'),
  cosmetic('avatar_cyborg', 'Cyber Athlete', 'avatar', 'epic', '🤖', ['#22D3EE', '#A855F7'], 'Atlet augmentat din viitor.'),
  cosmetic('avatar_dragon', 'Magma Dragon', 'avatar', 'epic', '🐉', ['#FF7B00', '#EF4444'], 'Puterea dragonului de magmă.'),
  cosmetic('avatar_king', 'Fitness King', 'avatar', 'legendar', '🤴', ['#FACC15', '#B45309'], 'Coroana campionului absolut.'),
  cosmetic('avatar_titan', 'Void Titan', 'avatar', 'legendar', '👾', ['#8B5CF6', '#111827'], 'Titan născut în vid.'),

  cosmetic('frame_steel', 'Steel Ring', 'frame', 'comun', '⚙️', ['#CBD5E1', '#64748B'], 'Ramă metalică simplă.', 'solid'),
  cosmetic('frame_lime', 'Lime Circuit', 'frame', 'comun', '🟢', ['#CCFF00', '#4D7C0F'], 'Circuit verde energic.', 'dashed'),
  cosmetic('frame_ocean', 'Ocean Loop', 'frame', 'comun', '🌊', ['#38BDF8', '#0369A1'], 'Valuri albastre în jurul profilului.', 'double'),
  cosmetic('frame_sunset', 'Sunset Loop', 'frame', 'comun', '🌅', ['#FB923C', '#EC4899'], 'Apus cald în două tonuri.', 'solid'),
  cosmetic('frame_forest', 'Forest Pulse', 'frame', 'rar', '🌿', ['#4ADE80', '#166534'], 'Ramă vie de junglă.', 'glow'),
  cosmetic('frame_frost', 'Frost Guard', 'frame', 'rar', '❄️', ['#CFFAFE', '#4F46E5'], 'Protecție înghețată.', 'double'),
  cosmetic('frame_cyber', 'Cyber Grid', 'frame', 'rar', '🧩', ['#C084FC', '#06B6D4'], 'Grilă digitală animată.', 'dashed'),
  cosmetic('frame_crimson', 'Crimson Power', 'frame', 'rar', '🔴', ['#FB7185', '#991B1B'], 'Ramă pentru seturi grele.', 'glow'),
  cosmetic('frame_magma', 'Magma Core', 'frame', 'epic', '🌋', ['#FF7B00', '#FF003C'], 'Miez incandescent.', 'glow'),
  cosmetic('frame_plasma', 'Plasma Rift', 'frame', 'epic', '🔮', ['#D946EF', '#4F46E5'], 'Portal de plasmă.', 'double'),
  cosmetic('frame_gold', 'Golden Champion', 'frame', 'epic', '🏅', ['#FDE047', '#A16207'], 'Aurul campionilor.', 'crown'),
  cosmetic('frame_celestial', 'Celestial Crown', 'frame', 'legendar', '👑', ['#FACC15', '#7C3AED'], 'Coroană cosmică legendară.', 'crown'),

  cosmetic('effect_pulse', 'Energy Pulse', 'effect', 'comun', '💚', ['#CCFF00', '#22C55E'], 'Puls discret în jurul avatarului.', undefined, 'pulse'),
  cosmetic('effect_bubbles', 'Aqua Bubbles', 'effect', 'comun', '🫧', ['#67E8F9', '#0284C7'], 'Particule de apă orbitale.', undefined, 'orbit'),
  cosmetic('effect_spark', 'Blue Spark', 'effect', 'rar', '✨', ['#7DD3FC', '#2563EB'], 'Scântei albastre periodice.', undefined, 'sparkle'),
  cosmetic('effect_leaf', 'Jungle Orbit', 'effect', 'rar', '🍃', ['#86EFAC', '#15803D'], 'Frunze care orbitează avatarul.', undefined, 'orbit'),
  cosmetic('effect_flame', 'Inferno Aura', 'effect', 'epic', '🔥', ['#FB923C', '#DC2626'], 'Aură de foc pentru streak-uri mari.', undefined, 'flame'),
  cosmetic('effect_lightning', 'Volt Storm', 'effect', 'epic', '⚡', ['#FDE047', '#06B6D4'], 'Descărcări electrice rapide.', undefined, 'electric'),
  cosmetic('effect_stardust', 'Royal Stardust', 'effect', 'epic', '🌟', ['#FDE68A', '#A855F7'], 'Praf de stele regal.', undefined, 'sparkle'),
  cosmetic('effect_void', 'Void Singularity', 'effect', 'legendar', '🌌', ['#A78BFA', '#020617'], 'O singularitate orbitează profilul.', undefined, 'orbit'),
];

export const COSMETIC_RARITY_CHANCE: Record<Rarity, number> = {
  comun: 55,
  rar: 28,
  epic: 13,
  legendar: 4,
};

export function cosmeticRarityColor(rarity: Rarity): string {
  if (rarity === 'legendar') return '#FACC15';
  if (rarity === 'epic') return '#C084FC';
  if (rarity === 'rar') return '#38BDF8';
  return '#94A3B8';
}

function pickRarity(random: () => number): Rarity {
  let roll = random() * 100;
  for (const rarity of ['legendar', 'epic', 'rar', 'comun'] as Rarity[]) {
    const chance = COSMETIC_RARITY_CHANCE[rarity];
    if (roll < chance) return rarity;
    roll -= chance;
  }
  return 'comun';
}

export function rollCosmetic(ownedIds: Set<string>, random: () => number = Math.random): CosmeticItem {
  const rarity = pickRarity(random);
  const sameRarity = COSMETIC_CATALOG.filter((item) => item.rarity === rarity);
  const unowned = sameRarity.filter((item) => !ownedIds.has(item.catalogId));
  const pool = unowned.length ? unowned : sameRarity;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

export async function openCosmeticLootBox(random: () => number = Math.random): Promise<{
  item: CosmeticItem | null;
  reward: RewardState;
  duplicate: boolean;
}> {
  const state = await loadRewardState();
  if (state.pendingBoxes <= 0) return { item: null, reward: state, duplicate: false };

  const ownedIds = new Set(
    state.inventory.map((entry) => (entry as CosmeticItem).catalogId || entry.id.split('@')[0]),
  );
  const template = rollCosmetic(ownedIds, random);
  const duplicate = ownedIds.has(template.catalogId);
  const item: CosmeticItem = { ...template, id: `${template.catalogId}@${Date.now()}` };
  const inventory = duplicate ? state.inventory : [item as RewardItem, ...state.inventory];
  const next: RewardState = {
    ...state,
    pendingBoxes: state.pendingBoxes - 1,
    inventory: inventory.slice(0, 100),
    totalXp: state.totalXp + (duplicate ? 25 : 0),
  };
  await saveRewardState(next);
  return { item, reward: next, duplicate };
}

export async function loadEquippedCosmetics(): Promise<EquippedCosmetics> {
  try {
    const raw = await AsyncStorage.getItem(EQUIPPED_COSMETICS_KEY);
    return raw ? { ...EMPTY_EQUIPPED, ...JSON.parse(raw) } : EMPTY_EQUIPPED;
  } catch {
    return EMPTY_EQUIPPED;
  }
}

export async function equipCosmetic(item: CosmeticItem | null): Promise<EquippedCosmetics> {
  const current = await loadEquippedCosmetics();
  if (!item) return current;
  const next = {
    ...current,
    avatarId: item.cosmeticType === 'avatar' ? item.catalogId : current.avatarId,
    frameId: item.cosmeticType === 'frame' ? item.catalogId : current.frameId,
    effectId: item.cosmeticType === 'effect' ? item.catalogId : current.effectId,
  };
  await AsyncStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(next));
  return next;
}

export function getCatalogCosmetic(id: string | null | undefined): CosmeticItem | null {
  return id ? COSMETIC_CATALOG.find((item) => item.catalogId === id) || null : null;
}

export function asCosmetic(item: RewardItem): CosmeticItem | null {
  const raw = item as CosmeticItem;
  if (raw.catalogId && raw.cosmeticType) return raw;
  return null;
}

export async function resetCosmeticsForDevelopment(): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(REWARD_STATE_KEY, JSON.stringify(EMPTY_REWARD_STATE)),
    AsyncStorage.removeItem(EQUIPPED_COSMETICS_KEY),
  ]);
}
