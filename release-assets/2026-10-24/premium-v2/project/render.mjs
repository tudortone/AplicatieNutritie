import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { poster, feature, titlecard } from './templates.mjs';

const require = createRequire('C:/Users/tudor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(fs.readFileSync(new URL('./design.json', import.meta.url), 'utf8'));
const css = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const assets = { icon:'../../sources/brand/getflow-approved-512.png', food:'../../sources/photography/editorial-bowl.png' };
const fonts = [['Manrope', 'Manrope.ttf'], ['Space', 'SpaceGrotesk.ttf']].map(([name, file]) => `@font-face{font-family:${name};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(root, 'sources/fonts', file)).toString('base64')});font-weight:100 900;font-display:block}`).join('');
const tasks = [];
for (const direction of ['a', 'b']) for (const screen of source.screens.slice(0, 3)) tasks.push({ name: `concepts/${direction}/${screen.id}-en-DRAFT`, width:1080, height:1920, markup:poster(screen, 'en', direction, assets) });
if (!process.argv.includes('--concepts-only')) for (const language of ['en']) {
  for (const screen of source.screens) tasks.push({ name:`layouts/${language}/${screen.id}-DRAFT`, width:1080, height:1920, markup:poster(screen, language, 'a', assets) });
  tasks.push({ name:`feature/getflow-feature-${language}`, width:1024, height:500, markup:feature(language, assets) });
  for (const screen of [source.screens[0], source.screens[3], source.screens[4], source.screens[7]]) tasks.push({ name:`video/title-${screen.id}-${language}`, width:1080, height:1920, markup:titlecard(screen, language, assets) });
}
const context = await chromium.launchPersistentContext(path.resolve(root, '../../../.marketing-render-cache/production-render'), {
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, chromiumSandbox:true, serviceWorkers:'block', deviceScaleFactor:1,
  ignoreDefaultArgs:['--unsafely-disable-devtools-self-xss-warnings', '--enable-unsafe-swiftshader'], args:['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'],
});
await context.route(/^https?:/, route => route.abort());
const page = await context.newPage();
const proof = [];
try {
  for (const task of tasks) {
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>GetFlow ${task.name}</title><style>${fonts}${css}</style><body>${task.markup}</body></html>`.replace(/[ \t]+$/gm, '');
    const file = path.join(root, `project/pages/${task.name.replaceAll('/', '-')}.html`);
    fs.mkdirSync(path.dirname(file), { recursive:true }); fs.writeFileSync(file, html);
    await page.setViewportSize({ width:task.width, height:task.height });
    await page.goto(pathToFileURL(file).href); await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    const check = await page.evaluate(() => ({ fonts:document.fonts.check('700 94px Space') && document.fonts.check('500 34px Manrope'),
      overflow:[...document.querySelectorAll('h1 span,.body,.tag')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent) }));
    if (!check.fonts || check.overflow.length) throw new Error(`Typography check failed: ${task.name} ${JSON.stringify(check)}`);
    fs.mkdirSync(path.dirname(path.join(root, task.name)), { recursive:true });
    await page.screenshot({ path:path.join(root, `${task.name}.png`), animations:'disabled' });
    proof.push({ file:`${task.name}.png`, width:task.width, height:task.height, fontsLoaded:true, textOverflow:false, status:task.name.includes('DRAFT') ? source.status : 'BRAND_ART_OWNER_REVIEW' });
  }
  fs.writeFileSync(path.join(root, process.argv.includes('--concepts-only') ? 'review/concept-render.json' : 'review/render-results.json'), JSON.stringify(proof, null, 2));
  console.log(`PASS: ${proof.length} local renders; fonts loaded; no headline/body overflow; all product layouts visibly marked as drafts.`);
} finally { await context.close(); }
