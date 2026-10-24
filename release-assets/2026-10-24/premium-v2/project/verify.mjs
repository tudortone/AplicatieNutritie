import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {poster,feature,titlecard} from './templates.mjs';
const require=createRequire(new URL('../../../../frontend-nutritie/package.json',import.meta.url));
const sharp=require('sharp'),root=fileURLToPath(new URL('../',import.meta.url));
const design=JSON.parse(fs.readFileSync(new URL('./design.json',import.meta.url),'utf8'));
const rendered=JSON.parse(fs.readFileSync(path.join(root,'review/render-results.json'),'utf8'));
assert.equal(design.language,'en');assert.equal(design.englishOnly,true);assert.equal(design.screens.length,8);assert.equal(rendered.length,19);
const assets={icon:'approved-icon.png',food:'original-food.png'};
const provenance=JSON.parse(fs.readFileSync(path.join(root,'sources/provenance.json'),'utf8'));
const icon=fs.readFileSync(path.resolve(root,'sources/brand/getflow-approved-512.png'));
assert.equal(crypto.createHash('sha256').update(icon).digest('hex').toUpperCase(),provenance.approvedIcon.sha256);
for(const screen of design.screens){
  assert(!screen.ro);assert(!/[ăâîșț]/i.test(JSON.stringify(screen.en)));
  const html=poster(screen,'en','a',assets);assert(html.includes('REAL CAPTURE'));assert(html.includes('DESIGN CONCEPT'));assert(!html.includes('class="actual"'));
}
assert.throws(()=>poster(design.screens[0],'ro','a',assets),/ENGLISH_ONLY/);
assert.throws(()=>feature('ro',assets),/ENGLISH_ONLY/);
assert.throws(()=>titlecard(design.screens[0],'ro',assets),/ENGLISH_ONLY/);
for(const result of rendered){
  const meta=await sharp(path.join(root,result.file)).metadata();assert.equal(meta.width,result.width);assert.equal(meta.height,result.height);assert.equal(meta.hasAlpha,false);assert(result.fontsLoaded);assert.equal(result.textOverflow,false);assert(!/-ro[-.]/.test(result.file));
}
const video=JSON.parse(fs.readFileSync(path.join(root,'review/video-playback.json'),'utf8'));
assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(video.decodeAndSeek,true);assert(video.duration>=14.5&&video.duration<=16.5);assert.equal(video.frames.length,5);
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const contrasts={headline:contrast(design.tokens.white,design.tokens.background),accent:contrast(design.tokens.lime,design.tokens.background),body:contrast(design.tokens.secondary,design.tokens.background),mutedOnSurface:contrast(design.tokens.muted,design.tokens.surface)};
for(const ratio of Object.values(contrasts))assert(ratio>=4.5);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const inventory=walk(root).filter(file=>!file.endsWith('inventory.json')&&!file.endsWith('verification.json')).sort().map(file=>({file:path.relative(root,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
assert(!inventory.some(file=>/-ro[-.]|layouts\/ro\//.test(file.file)));
fs.writeFileSync(path.join(root,'review/inventory.json'),JSON.stringify(inventory,null,2));
fs.writeFileSync(path.join(root,'review/verification.json'),JSON.stringify({status:'PASS_LOCAL_DESIGN_ONLY',language:'English only',draftLayouts:8,competingConcepts:6,renderedImages:19,videoDurationSeconds:video.duration,contrasts,inventoryFiles:inventory.length,authenticScreenshots:0,appFootage:false},null,2));
console.log(`PASS: English-only guards, 8 honest draft layouts, 19 opaque exact-size renders, font/overflow gates, MP4 decode proof and contrast >=4.5; ${inventory.length} file hashes.`);
