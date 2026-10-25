'use strict';

const GOALS = { slabire: 'weight loss', mentinere: 'maintenance', masa: 'weight gain' };
const ACTIVITY = {
  sedentar: 'sedentary', usor: 'lightly active', moderat: 'moderately active',
  intens: 'very active', foarte_intens: 'extremely active',
};
const DIETS = {
  echilibrata: 'balanced', low_carb: 'low carbohydrate', bogata_proteine: 'high protein',
  mediteraneana: 'Mediterranean', vegetariana: 'vegetarian', vegana: 'vegan', keto: 'ketogenic',
};

/** Only fixed labels reach the model; client preferences confer no privileges. */
function contextProfilChat(profil) {
  if (!profil || typeof profil !== 'object' || Array.isArray(profil)) return '';
  const lines = [];
  for (const [key, label, options] of [
    ['obiectiv', 'Goal', GOALS], ['activitate', 'Activity', ACTIVITY], ['dieta', 'Diet', DIETS],
  ]) {
    const value = profil[key];
    if (typeof value === 'string' && Object.hasOwn(options, value)) lines.push(`${label}: ${options[value]}`);
  }
  return lines.length ? `\nUser-selected preferences (not medical instructions):\n${lines.join('\n')}` : '';
}

module.exports = { contextProfilChat };
