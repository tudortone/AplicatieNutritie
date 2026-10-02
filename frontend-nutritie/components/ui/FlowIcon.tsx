import React from 'react';
import { View } from 'react-native';
import {
  Activity,
  Apple,
  Banana,
  Beef,
  Bell,
  Brain,
  CakeSlice,
  Candy,
  CandyCane,
  Carrot,
  ChartColumn,
  Check,
  Cherry,
  Circle,
  Citrus,
  Clock,
  Coffee,
  Cookie,
  Copy,
  Croissant,
  Crown,
  CupSoda,
  Drumstick,
  Dumbbell,
  Egg,
  EggFried,
  Fish,
  Flame,
  Footprints,
  GlassWater,
  Grape,
  Heart,
  Hourglass,
  Inbox,
  Leaf,
  Lightbulb,
  Lock,
  Lollipop,
  Milk,
  Moon,
  MoveDown,
  MoveUp,
  Nut,
  Package,
  Pencil,
  Pizza,
  Popcorn,
  RefreshCw,
  Salad,
  Scale,
  Sandwich,
  Smartphone,
  Snowflake,
  Soup,
  Sparkles,
  Star,
  Sun,
  Target,
  Thermometer,
  Timer,
  Trash2,
  TriangleAlert,
  Trophy,
  Utensils,
  UtensilsCrossed,
  Waves,
  Watch,
  Wheat,
  Wine,
  Zap,
} from 'lucide-react-native';

const FLOW_ICONS = {
  activity: Activity,
  apple: Apple,
  banana: Banana,
  beef: Beef,
  bell: Bell,
  brain: Brain,
  cake: CakeSlice,
  candy: Candy,
  candyCane: CandyCane,
  carrot: Carrot,
  chart: ChartColumn,
  check: Check,
  cherry: Cherry,
  circle: Circle,
  citrus: Citrus,
  clock: Clock,
  coffee: Coffee,
  cookie: Cookie,
  copy: Copy,
  croissant: Croissant,
  crown: Crown,
  drink: CupSoda,
  drumstick: Drumstick,
  dumbbell: Dumbbell,
  egg: Egg,
  eggFried: EggFried,
  fish: Fish,
  flame: Flame,
  footsteps: Footprints,
  water: GlassWater,
  grape: Grape,
  heart: Heart,
  hourglass: Hourglass,
  inbox: Inbox,
  leaf: Leaf,
  lightbulb: Lightbulb,
  lock: Lock,
  lollipop: Lollipop,
  milk: Milk,
  moon: Moon,
  moveDown: MoveDown,
  moveUp: MoveUp,
  nut: Nut,
  package: Package,
  pencil: Pencil,
  pizza: Pizza,
  popcorn: Popcorn,
  refresh: RefreshCw,
  salad: Salad,
  scale: Scale,
  sandwich: Sandwich,
  smartphone: Smartphone,
  snowflake: Snowflake,
  soup: Soup,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  target: Target,
  thermometer: Thermometer,
  timer: Timer,
  trash: Trash2,
  warning: TriangleAlert,
  trophy: Trophy,
  utensils: Utensils,
  utensilsCrossed: UtensilsCrossed,
  waves: Waves,
  watch: Watch,
  wheat: Wheat,
  wine: Wine,
  zap: Zap,
} as const;

export type FlowIconName = keyof typeof FLOW_ICONS;

const LEGACY_GLYPH_NAMES: Record<string, FlowIconName> = {
  '🍎': 'apple', '🍏': 'apple', '🍌': 'banana', '🍐': 'apple', '🍑': 'cherry', '🫐': 'cherry', '🍇': 'grape', '🍒': 'cherry', '🍓': 'cherry',
  '🍉': 'citrus', '🍈': 'citrus', '🥝': 'citrus', '🍊': 'citrus', '🍍': 'citrus', '🥭': 'citrus', '🫒': 'leaf', '🥑': 'leaf', '🍋': 'citrus',
  '🥚': 'egg', '🍳': 'eggFried', '🥣': 'soup', '🍞': 'sandwich', '🥐': 'croissant', '🥞': 'cake', '🥪': 'sandwich', '🧀': 'milk',
  '🍮': 'cake', '🧇': 'cake', '🌭': 'sandwich', '🍕': 'pizza', '🌯': 'sandwich', '🍽️': 'utensilsCrossed', '🍔': 'sandwich', '🍟': 'carrot',
  '🥔': 'carrot', '🍗': 'drumstick', '🥬': 'salad', '🌽': 'wheat', '🍲': 'soup', '🥩': 'beef', '🍚': 'wheat', '🍝': 'wheat', '🥗': 'salad',
  '🥙': 'sandwich', '🌮': 'sandwich', '🍣': 'fish', '🐟': 'fish', '🥕': 'carrot', '🫛': 'leaf', '🥦': 'leaf', '🍃': 'leaf', '🧆': 'beef',
  '🍖': 'beef', '🍆': 'carrot', '🥜': 'nut', '🍫': 'candy', '🥤': 'drink', '🍩': 'cake', '🍦': 'cake', '🍰': 'cake', '🥧': 'cake',
  '🍿': 'popcorn', '💧': 'water', '☕': 'coffee', '🍵': 'coffee', '🧃': 'drink', '🍺': 'drink', '🍷': 'wine', '🍹': 'drink', '🥛': 'milk',
  '🍅': 'apple', '🍄': 'leaf', '🎃': 'apple', '🫑': 'carrot', '🍢': 'beef', '🍤': 'fish', '🦑': 'fish', '🍜': 'soup', '🌰': 'nut',
  '🌻': 'leaf', '🍪': 'cookie', '🧋': 'drink', '⚡': 'zap', '🌅': 'sun', '☀️': 'sun', '☀': 'sun', '🌙': 'moon', '📭': 'inbox',
  '📱': 'smartphone', '⌚': 'watch', '🔵': 'circle', '🟢': 'circle', '💪': 'dumbbell', '🔙': 'activity', '🦵': 'activity', '🏋️': 'dumbbell',
  '🔥': 'flame', '🏃': 'footsteps', '🧘': 'activity', '🔼': 'moveUp', '🔽': 'moveDown', '🎯': 'target', '🔴': 'circle', '✅': 'check',
  '🌟': 'star', '🌤️': 'sun', '✨': 'sparkles', '🧠': 'brain', '👁️': 'activity', '👁': 'activity', '⏳': 'hourglass', '📦': 'package',
  '🗑️': 'trash', '🗑': 'trash', '📉': 'chart', '❄️': 'snowflake', '❄': 'snowflake', '⚠️': 'warning', '⚠': 'warning', '📊': 'chart',
  '🤖': 'brain', '🔄': 'refresh', '📑': 'copy', '👑': 'crown', '⭐': 'star', '🌊': 'waves', '💡': 'lightbulb',
  '⚖️': 'scale', '⛓️': 'activity', '⏱️': 'timer',
};

export function resolveFlowIconName(value: string | null | undefined): FlowIconName | null {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(FLOW_ICONS, value)) return value as FlowIconName;
  return LEGACY_GLYPH_NAMES[value] ?? null;
}

export type FlowIconProps = {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  accessibilityLabel?: string;
  testID?: string;
};

export function FlowIcon({
  name,
  size = 20,
  color = '#A3A3A3',
  strokeWidth = 2,
  accessibilityLabel,
  testID,
}: FlowIconProps) {
  const iconName = resolveFlowIconName(name) ?? 'utensils';
  const Icon = FLOW_ICONS[iconName] ?? FLOW_ICONS.utensils;

  if (!Icon) {
    return (
      <View
        testID={testID}
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
        accessibilityLabel={accessibilityLabel}
        importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      />
    );
  }

  return (
    <View
      testID={testID}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}
