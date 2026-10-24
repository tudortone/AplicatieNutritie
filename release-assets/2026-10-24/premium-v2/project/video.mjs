import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/tudor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv[2] && process.argv[2] !== 'en') throw new Error('ENGLISH_ONLY');
const language = 'en';
const output = path.join(root, `video/getflow-brand-motion-${language}-NOT-APP-DEMO.mp4`);
if (fs.existsSync(output)) throw new Error('OUTPUT_EXISTS_NO_OVERWRITE');
const cards = ['01-hero','04-food-journal','05-training','08-ecosystem'].map(id => 'data:image/png;base64,' + fs.readFileSync(path.join(root, `video/title-${id}-${language}.png`)).toString('base64'));
const context = await chromium.launchPersistentContext(path.resolve(root, '../../../.marketing-render-cache/video-render'), {
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, chromiumSandbox:true, serviceWorkers:'block',
  ignoreDefaultArgs:['--unsafely-disable-devtools-self-xss-warnings', '--enable-unsafe-swiftshader'], args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run'], viewport:{width:1080,height:1920},
});
await context.route(/^https?:/, route => route.abort());
const page = await context.newPage();
try {
  const result = await page.evaluate(async sources => {
    const mime = 'video/mp4;codecs=avc1.42001E';
    if (!MediaRecorder.isTypeSupported(mime)) throw new Error('H264_MP4_UNAVAILABLE');
    const images = await Promise.all(sources.map(src => new Promise((resolve, reject) => { const image = new Image(); image.onload=() => resolve(image); image.onerror=reject; image.src=src; })));
    const canvas = document.createElement('canvas'); canvas.width=1080; canvas.height=1920; document.body.append(canvas);
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(30), recorder = new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
    const chunks=[]; recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const stopped = new Promise(resolve => { recorder.onstop=resolve; });
    const duration=15000, start=performance.now(); let draws=0;
    recorder.start();
    await new Promise(resolve => { const draw=now=>{const elapsed=now-start,index=Math.min(3,Math.floor(elapsed/3750)),fade=Math.min(1,(elapsed%3750)/220);ctx.fillStyle='#090c0e';ctx.fillRect(0,0,1080,1920);ctx.globalAlpha=index===0?1:fade;ctx.drawImage(images[index],0,0);ctx.globalAlpha=1;draws++;if(elapsed<duration)requestAnimationFrame(draw);else resolve();};requestAnimationFrame(draw);});
    recorder.stop(); await stopped; stream.getTracks().forEach(track=>track.stop());
    const bytes = new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer()); let binary='';
    for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return { base64:btoa(binary), draws, requestedFps:30, requestedDurationMs:duration, mime, noAppFootage:true, audio:false };
  }, cards);
  const { base64, ...proof } = result; fs.writeFileSync(output,Buffer.from(base64,'base64'),{flag:'wx'});
  fs.writeFileSync(path.join(root,`review/video-recording-${language}.json`),JSON.stringify(proof,null,2));
  console.log(`PASS: genuine H264 MP4 brand-motion export (${language}), 1080x1920, silent; not an application demo.`);
} finally { await context.close(); }
