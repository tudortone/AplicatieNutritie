import type { FoodPreset } from '../constants/foodPresets';

type SupportedQuickPortionLanguage = 'ro' | 'en' | 'fr' | 'de';
type LocalizedPortionLabels = Record<string, readonly string[]>;

// Presentation-only translations. Nutrition values and grams remain authoritative
// in foodPresets.ts; arrays intentionally mirror each preset's unit order.
const EN: LocalizedPortionLabels = {
  mar: ['1/2 apple', '1 small apple', '1 medium apple', '1 large apple'],
  banana: ['1/2 banana', '1 small banana', '1 medium banana', '1 large banana'],
  para: ['1 small pear', '1 medium pear', '1 large pear'],
  piersica: ['1 small peach', '1 medium peach', '1 large peach'],
  nectarina: ['1 small nectarine', '1 medium nectarine', '1 large nectarine'],
  prune: ['3 plums', '5 plums', '1 small bowl (~200g)'],
  struguri: ['1 small bunch (~100g)', '1 medium portion (~150g)', '1 large bunch (~250g)'],
  cirese: ['1 handful (~100g)', '1 small bowl (~150g)', '1 medium bowl (~250g)'],
  visine: ['1 handful (~100g)', '1 small bowl (~150g)', '1 medium bowl (~200g)'],
  afine: ['1 small punnet (125g)', '1 handful (~50g)', '1 bowl (~100g)'],
  zmeura: ['1 punnet (125g)', '1 handful (~60g)', '1 portion (~100g)'],
  mure: ['1 punnet (125g)', '1 handful (~60g)', '1 portion (~100g)'],
  capsuni: ['5 strawberries', '10 strawberries', '1 punnet (250g)'],
  'pepene-rosu-buc': ['1 small slice (~200g)', '1 medium slice (~300g)', '1 large slice (~450g)'],
  'pepene-galben': ['1 small slice (~150g)', '1 medium slice (~200g)', '1 large slice (~300g)'],
  kiwi: ['1 kiwi (~75g)', '2 kiwis (~150g)'],
  portocala: ['1 small orange', '1 medium orange', '1 large orange'],
  mandarina: ['1 mandarin (~80g)', '2 mandarins (~160g)', '3 mandarins (~240g)'],
  grapefruit: ['1/2 grapefruit (~120g)', '1 grapefruit (~220g)'],
  ananas: ['1 slice (~100g)', '2 slices (~200g)'],
  mango: ['1/2 mango (~100g)', '1 medium mango (~200g)'],
  papaya: ['1 portion (~150g)', '1/2 papaya (~250g)'],
  rodie: ['1/2 pomegranate (~80g)', '1 pomegranate (~150g)'],
  smochine: ['2 figs (~100g)', '3 figs (~150g)'],
  curmale: ['3 dates (~30g)', '5 dates (~50g)'],
  avocado: ['1/2 avocado (~75g)', '1 medium avocado (~150g)'],
  lamaie: ['1 half (~30g)', '1 lemon (~60g)'],
  lime: ['1 lime (~40g)'],
  caisa: ['2 apricots (~70g)', '3 apricots (~105g)', '5 apricots (~175g)'],
};

const FR: LocalizedPortionLabels = {
  mar: ['1/2 pomme', '1 petite pomme', '1 pomme moyenne', '1 grosse pomme'],
  banana: ['1/2 banane', '1 petite banane', '1 banane moyenne', '1 grosse banane'],
  para: ['1 petite poire', '1 poire moyenne', '1 grosse poire'],
  piersica: ['1 petite pêche', '1 pêche moyenne', '1 grosse pêche'],
  nectarina: ['1 petite nectarine', '1 nectarine moyenne', '1 grosse nectarine'],
  prune: ['3 prunes', '5 prunes', '1 petit bol (~200g)'],
  struguri: ['1 petite grappe (~100g)', '1 portion moyenne (~150g)', '1 grosse grappe (~250g)'],
  cirese: ['1 poignée (~100g)', '1 petit bol (~150g)', '1 bol moyen (~250g)'],
  visine: ['1 poignée (~100g)', '1 petit bol (~150g)', '1 bol moyen (~200g)'],
  afine: ['1 petite barquette (125g)', '1 poignée (~50g)', '1 bol (~100g)'],
  zmeura: ['1 barquette (125g)', '1 poignée (~60g)', '1 portion (~100g)'],
  mure: ['1 barquette (125g)', '1 poignée (~60g)', '1 portion (~100g)'],
  capsuni: ['5 fraises', '10 fraises', '1 barquette (250g)'],
  'pepene-rosu-buc': ['1 petite tranche (~200g)', '1 tranche moyenne (~300g)', '1 grosse tranche (~450g)'],
  'pepene-galben': ['1 petite tranche (~150g)', '1 tranche moyenne (~200g)', '1 grosse tranche (~300g)'],
  kiwi: ['1 kiwi (~75g)', '2 kiwis (~150g)'],
  portocala: ['1 petite orange', '1 orange moyenne', '1 grosse orange'],
  mandarina: ['1 mandarine (~80g)', '2 mandarines (~160g)', '3 mandarines (~240g)'],
  grapefruit: ['1/2 pamplemousse (~120g)', '1 pamplemousse (~220g)'],
  ananas: ['1 tranche (~100g)', '2 tranches (~200g)'],
  mango: ['1/2 mangue (~100g)', '1 mangue moyenne (~200g)'],
  papaya: ['1 portion (~150g)', '1/2 papaye (~250g)'],
  rodie: ['1/2 grenade (~80g)', '1 grenade (~150g)'],
  smochine: ['2 figues (~100g)', '3 figues (~150g)'],
  curmale: ['3 dattes (~30g)', '5 dattes (~50g)'],
  avocado: ['1/2 avocat (~75g)', '1 avocat moyen (~150g)'],
  lamaie: ['1 moitié (~30g)', '1 citron (~60g)'],
  lime: ['1 citron vert (~40g)'],
  caisa: ['2 abricots (~70g)', '3 abricots (~105g)', '5 abricots (~175g)'],
};

const DE: LocalizedPortionLabels = {
  mar: ['1/2 Apfel', '1 kleiner Apfel', '1 mittlerer Apfel', '1 großer Apfel'],
  banana: ['1/2 Banane', '1 kleine Banane', '1 mittlere Banane', '1 große Banane'],
  para: ['1 kleine Birne', '1 mittlere Birne', '1 große Birne'],
  piersica: ['1 kleiner Pfirsich', '1 mittlerer Pfirsich', '1 großer Pfirsich'],
  nectarina: ['1 kleine Nektarine', '1 mittlere Nektarine', '1 große Nektarine'],
  prune: ['3 Pflaumen', '5 Pflaumen', '1 kleine Schale (~200g)'],
  struguri: ['1 kleine Traube (~100g)', '1 mittlere Portion (~150g)', '1 große Traube (~250g)'],
  cirese: ['1 Handvoll (~100g)', '1 kleine Schale (~150g)', '1 mittlere Schale (~250g)'],
  visine: ['1 Handvoll (~100g)', '1 kleine Schale (~150g)', '1 mittlere Schale (~200g)'],
  afine: ['1 kleine Schale (125g)', '1 Handvoll (~50g)', '1 Schale (~100g)'],
  zmeura: ['1 Schale (125g)', '1 Handvoll (~60g)', '1 Portion (~100g)'],
  mure: ['1 Schale (125g)', '1 Handvoll (~60g)', '1 Portion (~100g)'],
  capsuni: ['5 Erdbeeren', '10 Erdbeeren', '1 Schale (250g)'],
  'pepene-rosu-buc': ['1 kleine Scheibe (~200g)', '1 mittlere Scheibe (~300g)', '1 große Scheibe (~450g)'],
  'pepene-galben': ['1 kleine Scheibe (~150g)', '1 mittlere Scheibe (~200g)', '1 große Scheibe (~300g)'],
  kiwi: ['1 Kiwi (~75g)', '2 Kiwis (~150g)'],
  portocala: ['1 kleine Orange', '1 mittlere Orange', '1 große Orange'],
  mandarina: ['1 Mandarine (~80g)', '2 Mandarinen (~160g)', '3 Mandarinen (~240g)'],
  grapefruit: ['1/2 Grapefruit (~120g)', '1 Grapefruit (~220g)'],
  ananas: ['1 Scheibe (~100g)', '2 Scheiben (~200g)'],
  mango: ['1/2 Mango (~100g)', '1 mittlere Mango (~200g)'],
  papaya: ['1 Portion (~150g)', '1/2 Papaya (~250g)'],
  rodie: ['1/2 Granatapfel (~80g)', '1 Granatapfel (~150g)'],
  smochine: ['2 Feigen (~100g)', '3 Feigen (~150g)'],
  curmale: ['3 Datteln (~30g)', '5 Datteln (~50g)'],
  avocado: ['1/2 Avocado (~75g)', '1 mittlere Avocado (~150g)'],
  lamaie: ['1 Hälfte (~30g)', '1 Zitrone (~60g)'],
  lime: ['1 Limette (~40g)'],
  caisa: ['2 Aprikosen (~70g)', '3 Aprikosen (~105g)', '5 Aprikosen (~175g)'],
};

const LABELS: Record<Exclude<SupportedQuickPortionLanguage, 'ro'>, LocalizedPortionLabels> = {
  en: EN,
  fr: FR,
  de: DE,
};

export function getQuickPortionLabel(preset: FoodPreset, unitIndex: number, language?: string): string {
  const unit = preset.unitati?.[unitIndex];
  if (!unit) return '';
  const normalized = (language || 'ro').slice(0, 2).toLowerCase() as SupportedQuickPortionLanguage;
  if (normalized === 'ro') return unit.label;
  return LABELS[normalized]?.[preset.id]?.[unitIndex] ?? unit.label;
}

export function hasCompleteQuickPortionTranslations(preset: FoodPreset): boolean {
  const expected = preset.unitati?.length ?? 0;
  return expected === 0 || (['en', 'fr', 'de'] as const).every((language) => LABELS[language][preset.id]?.length === expected);
}
