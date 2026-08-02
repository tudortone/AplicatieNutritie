import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_REWARD_STATE, REWARD_STATE_KEY, loadRewardState, saveRewardState,
  type Rarity, type RewardItem, type RewardState,
} from './questsEngine';

export type CosmeticType = 'avatar' | 'frame' | 'effect';
export type CosmeticCollection = 'Medieval' | 'Dragon' | 'Shinobi' | 'Samurai' | 'Mecha' | 'Cyberpunk';
export type FrameStyle = 'solid' | 'double' | 'dashed' | 'glow' | 'crown';
export type EffectStyle = 'none' | 'pulse' | 'sparkle' | 'orbit' | 'flame' | 'electric';

export type CosmeticItem = RewardItem & {
  catalogId: string;
  cosmeticType: CosmeticType;
  collection: CosmeticCollection;
  frameStyle?: FrameStyle;
  effectStyle?: EffectStyle;
  description: string;
};

export type EquippedCosmetics = { avatarId: string | null; frameId: string | null; effectId: string | null };
export const EQUIPPED_COSMETICS_KEY = 'nutriai_equipped_cosmetics_v1';
export const EMPTY_EQUIPPED: EquippedCosmetics = { avatarId: null, frameId: null, effectId: null };

const item = (
  catalogId: string, name: string, cosmeticType: CosmeticType, collection: CosmeticCollection,
  rarity: Rarity, icon: string, colors: [string, string], description: string,
  frameStyle?: FrameStyle, effectStyle?: EffectStyle,
): CosmeticItem => ({
  id: catalogId, catalogId, name, cosmeticType, collection, rarity, icon, colors,
  description, frameStyle, effectStyle,
  theme: cosmeticType === 'avatar' ? `Avatar · ${collection}` : cosmeticType === 'frame' ? `Ramă · ${collection}` : `Efect · ${collection}`,
});

/** ID-urile vechi sunt păstrate pentru compatibilitate cu inventarele existente. */
export const COSMETIC_CATALOG: CosmeticItem[] = [
  item('avatar_rookie', 'Scutierul de Smarald', 'avatar', 'Medieval', 'comun', '🛡️', ['#8DBF3F', '#243B21'], 'Tânăr apărător al cetății de smarald.'),
  item('avatar_runner', 'Cavalerul Fulger', 'avatar', 'Medieval', 'comun', '⚔️', ['#F2C94C', '#6B3F18'], 'Cavaler rapid cu armură gravată.'),
  item('avatar_lifter', 'Golem de Fier', 'avatar', 'Mecha', 'comun', '⛓️', ['#B7C1CC', '#323A46'], 'Gardian mecanic construit pentru forță.'),
  item('avatar_ninja', 'Ninja Umbrei', 'avatar', 'Shinobi', 'rar', '🥷', ['#7C5CFC', '#171329'], 'Asasin tăcut învăluit în fum violet.'),
  item('avatar_wolf', 'Roninul Lup', 'avatar', 'Samurai', 'rar', '🐺', ['#D9E7F2', '#284A66'], 'Războinic rătăcitor cu spirit de lup.'),
  item('avatar_tiger', 'Samuraiul Tigrului', 'avatar', 'Samurai', 'rar', '🐯', ['#FF9D3D', '#771F1F'], 'Armură kabuto inspirată de tigrul imperial.'),
  item('avatar_cyborg', 'Shogun Mecha', 'avatar', 'Mecha', 'epic', '🤖', ['#18D8E8', '#6938EF'], 'Samurai robotic alimentat de un nucleu neon.'),
  item('avatar_dragon', 'Dragonul Crimson', 'avatar', 'Dragon', 'epic', '🐉', ['#FF6B1A', '#9A102A'], 'Dragon ancestral trezit din lava muntelui.'),
  item('avatar_king', 'Regele Dragonilor', 'avatar', 'Medieval', 'legendar', '♛', ['#FFD45A', '#713B12'], 'Suveranul cavalerilor și al dragonilor.'),
  item('avatar_titan', 'Împăratul Neon', 'avatar', 'Cyberpunk', 'legendar', '◈', ['#B65CFF', '#07111F'], 'Conducător augmentat al orașului viitorului.'),

  item('frame_steel', 'Zidul Cavalerului', 'frame', 'Medieval', 'comun', '⬡', ['#C5CED8', '#56616E'], 'Oțel medieval nituit.', 'solid'),
  item('frame_lime', 'Sigiliul Alchimistului', 'frame', 'Medieval', 'comun', '✥', ['#B8E34A', '#34552A'], 'Rune verzi gravate în metal.', 'dashed'),
  item('frame_ocean', 'Cercul Roninului', 'frame', 'Samurai', 'comun', '◉', ['#66C7E8', '#164B70'], 'Cerc inspirat de valurile japoneze.', 'double'),
  item('frame_sunset', 'Poarta Torii', 'frame', 'Samurai', 'comun', '⛩️', ['#FF8A4C', '#A21D52'], 'Culorile apusului peste templu.', 'solid'),
  item('frame_forest', 'Sigiliul Shinobi', 'frame', 'Shinobi', 'rar', '✦', ['#54E08B', '#173E32'], 'Urme de chakra și fum verde.', 'glow'),
  item('frame_frost', 'Armura Daimyo', 'frame', 'Samurai', 'rar', '❖', ['#DDF7FF', '#394EB0'], 'Plăci ceramice albastre suprapuse.', 'double'),
  item('frame_cyber', 'Circuitul Mecha', 'frame', 'Mecha', 'rar', '⌬', ['#C35BFF', '#00D4E8'], 'Trasee digitale animate.', 'dashed'),
  item('frame_crimson', 'Masca Oni', 'frame', 'Shinobi', 'rar', '👹', ['#FF4F72', '#631522'], 'Energie roșie de demon japonez.', 'glow'),
  item('frame_magma', 'Inelul Dragonului', 'frame', 'Dragon', 'epic', '🔥', ['#FF7A19', '#E3103D'], 'Solzi incandescenți și jar.', 'glow'),
  item('frame_plasma', 'Portalul Neo-Tokyo', 'frame', 'Cyberpunk', 'epic', '◎', ['#E24BFF', '#4248FF'], 'Portal holografic instabil.', 'double'),
  item('frame_gold', 'Coroana Cetății', 'frame', 'Medieval', 'epic', '♜', ['#FFE269', '#996010'], 'Aur regal și turnuri de castel.', 'crown'),
  item('frame_celestial', 'Tronul Cyber-Dragon', 'frame', 'Cyberpunk', 'legendar', '♛', ['#FFD84D', '#732FE8'], 'Fuziune între coroană, dragon și neon.', 'crown'),

  item('effect_pulse', 'Rună Vie', 'effect', 'Medieval', 'comun', '✧', ['#B9E74D', '#28A85E'], 'Rune care pulsează în toată interfața.', undefined, 'pulse'),
  item('effect_bubbles', 'Spirite Kitsune', 'effect', 'Shinobi', 'comun', '◌', ['#65E1F2', '#2770CA'], 'Spirite albastre care orbitează avatarul.', undefined, 'orbit'),
  item('effect_spark', 'Tăiș de Lună', 'effect', 'Samurai', 'rar', '✦', ['#9BDBFF', '#315BE8'], 'Scântei lăsate de o katana spectrală.', undefined, 'sparkle'),
  item('effect_leaf', 'Fumul Ninja', 'effect', 'Shinobi', 'rar', '☁', ['#83E6AE', '#176A4A'], 'Particule de fum și frunze în mișcare.', undefined, 'orbit'),
  item('effect_flame', 'Suflul Dragonului', 'effect', 'Dragon', 'epic', '🔥', ['#FF9B37', '#D31E2D'], 'Flăcări vii în jurul avatarului și ecranelor.', undefined, 'flame'),
  item('effect_lightning', 'Supraîncărcare Mecha', 'effect', 'Mecha', 'epic', 'ϟ', ['#FFE85D', '#00D5E8'], 'Descărcări electrice de reactor.', undefined, 'electric'),
  item('effect_stardust', 'Ploaie Holografică', 'effect', 'Cyberpunk', 'epic', '✺', ['#FFE08A', '#C34BFF'], 'Fragmente holografice peste interfață.', undefined, 'sparkle'),
  item('effect_void', 'Ruptura Neon', 'effect', 'Cyberpunk', 'legendar', '◉', ['#B68CFF', '#050713'], 'O singularitate digitală ce distorsionează lumina.', undefined, 'orbit'),
];

export const COSMETIC_RARITY_CHANCE: Record<Rarity, number> = { comun: 55, rar: 28, epic: 13, legendar: 4 };
export function cosmeticRarityColor(rarity: Rarity): string {
  return rarity === 'legendar' ? '#FACC15' : rarity === 'epic' ? '#C084FC' : rarity === 'rar' ? '#38BDF8' : '#94A3B8';
}

function pickRarity(random: () => number): Rarity {
  let roll = random() * 100;
  for (const rarity of ['legendar', 'epic', 'rar', 'comun'] as Rarity[]) {
    if (roll < COSMETIC_RARITY_CHANCE[rarity]) return rarity;
    roll -= COSMETIC_RARITY_CHANCE[rarity];
  }
  return 'comun';
}

export function rollCosmetic(ownedIds: Set<string>, random: () => number = Math.random): CosmeticItem {
  const sameTier = COSMETIC_CATALOG.filter((entry) => entry.rarity === pickRarity(random));
  const unowned = sameTier.filter((entry) => !ownedIds.has(entry.catalogId));
  const pool = unowned.length ? unowned : sameTier;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

let openingQueue: Promise<unknown> = Promise.resolve();
export function openCosmeticLootBox(random: () => number = Math.random): Promise<{ item: CosmeticItem | null; reward: RewardState; duplicate: boolean }> {
  const operation = openingQueue.then(async () => {
    const state = await loadRewardState();
    if (state.pendingBoxes <= 0) return { item: null, reward: state, duplicate: false };
    const ownedIds = new Set(state.inventory.map((entry) => (entry as CosmeticItem).catalogId || entry.id.split('@')[0]));
    const template = rollCosmetic(ownedIds, random);
    const duplicate = ownedIds.has(template.catalogId);
    const won: CosmeticItem = { ...template, id: `${template.catalogId}@${Date.now()}` };
    const next: RewardState = {
      ...state,
      pendingBoxes: state.pendingBoxes - 1,
      inventory: (duplicate ? state.inventory : [won as RewardItem, ...state.inventory]).slice(0, 100),
      totalXp: state.totalXp + (duplicate ? 25 : 0),
    };
    await saveRewardState(next);
    return { item: won, reward: next, duplicate };
  });
  openingQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function loadEquippedCosmetics(): Promise<EquippedCosmetics> {
  try {
    const raw = await AsyncStorage.getItem(EQUIPPED_COSMETICS_KEY);
    return raw ? { ...EMPTY_EQUIPPED, ...JSON.parse(raw) } : { ...EMPTY_EQUIPPED };
  } catch { return { ...EMPTY_EQUIPPED }; }
}

export async function equipCosmetic(selected: CosmeticItem | null): Promise<EquippedCosmetics> {
  const current = await loadEquippedCosmetics();
  if (!selected) return current;
  const next = { ...current };
  if (selected.cosmeticType === 'avatar') next.avatarId = selected.catalogId;
  if (selected.cosmeticType === 'frame') next.frameId = selected.catalogId;
  if (selected.cosmeticType === 'effect') next.effectId = selected.catalogId;
  await AsyncStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(next));
  return next;
}

export const getCatalogCosmetic = (id: string | null | undefined) => id ? COSMETIC_CATALOG.find((entry) => entry.catalogId === id) || null : null;
export function asCosmetic(reward: RewardItem): CosmeticItem | null {
  const raw = reward as CosmeticItem;
  if (!raw.catalogId || !raw.cosmeticType) return null;
  // Întoarcem versiunea curentă din catalog pentru ca redenumirile tematice să se aplice și obiectelor vechi.
  return getCatalogCosmetic(raw.catalogId) || raw;
}
export async function resetCosmeticsForDevelopment(): Promise<void> {
  await Promise.all([AsyncStorage.setItem(REWARD_STATE_KEY, JSON.stringify(EMPTY_REWARD_STATE)), AsyncStorage.removeItem(EQUIPPED_COSMETICS_KEY)]);
}
