const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const lines = values => values.map(value => `<span>${escape(value)}</span>`).join('');
export const brand = icon => `<div class="brand"><img src="${icon}" alt="Approved GetFlow icon"><span>Get<em>Flow</em></span></div>`;
/** @param {string} label @param {string} language @param {string|null} capture @param {string} extra */
function device(label, language, capture = null, extra = '') {
  if (language !== 'en') throw new Error('ENGLISH_ONLY');
  const text = ['REAL CAPTURE', 'REQUIRED', 'This is not a simulated app screen.'];
  return `<div class="device ${extra}"><div class="screen">${capture ? `<img class="actual" src="${capture}" alt="${escape(label)}">` : `<div class="capture-needed"><strong>${text[0]}<br>${text[1]}</strong><div class="rule"></div>${escape(label)}<small>${text[2]}</small></div>`}<div class="hole"></div></div></div>`;
}
/** @param {object} screen @param {string} language @param {string} direction @param {object} assets */
export function poster(screen, language, direction, assets) {
  if (language !== 'en') throw new Error('ENGLISH_ONLY');
  const copy = screen.en;
  const pending = 'DESIGN CONCEPT · AUTHENTIC CAPTURES REQUIRED';
  return `<main class="${direction} s${screen.id.slice(0, 2)} ${copy.headline.length === 3 ? 'three' : ''}"><div class="wash"></div>${brand(assets.icon)}
    <div class="tag">${escape(copy.tag)}</div><h1>${lines(copy.headline)}</h1><div class="body">${escape(copy.body)}</div>
    ${screen.photo ? `<img class="food" src="${assets.food}" alt="Original AI-generated editorial food photography; not an app result">` : ''}
    ${device(copy.screen, language)}${screen.secondCapture ? device(copy.screen, language, null, 'second') : ''}
    ${copy.side && !screen.secondCapture ? `<div class="side">${lines(copy.side)}</div>` : ''}
    ${screen.secondCapture ? '<div class="ecosystem-label">Food. Movement. GetFlow.</div>' : ''}
    <div class="footer">${pending}</div></main>`;
}
/** @param {string} language @param {object} assets */
export function feature(language, assets) {
  if (language !== 'en') throw new Error('ENGLISH_ONLY');
  const text = ['Food and fitness.', 'At your pace.'];
  return `<main class="feature"><div class="wash"></div>${brand(assets.icon)}<h1>${lines(text)}</h1><img class="food" src="${assets.food}" alt="Editorial food image"><div class="feature-label">YOUR ROUTINE. IN ONE PLACE.</div></main>`;
}
/** @param {object} screen @param {string} language @param {object} assets */
export function titlecard(screen, language, assets) {
  if (language !== 'en') throw new Error('ENGLISH_ONLY');
  const copy = screen.en;
  return `<main class="titlecard"><div class="wash"></div>${brand(assets.icon)}<div class="tag">${escape(copy.tag)}</div><h1>${lines(copy.headline)}</h1><div class="body">${escape(copy.body)}</div><img class="food" src="${assets.food}" alt="Editorial food illustration"><div class="note">Food and movement. At your pace.</div></main>`;
}
