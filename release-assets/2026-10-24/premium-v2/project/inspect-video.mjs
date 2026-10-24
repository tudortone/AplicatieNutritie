import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire('C:/Users/tudor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const file=path.join(root,'video/getflow-brand-motion-en-NOT-APP-DEMO.mp4');
const bytes=fs.readFileSync(file); if(bytes.subarray(4,8).toString()!=='ftyp')throw new Error('NOT_ISOBMFF_MP4');
const context=await chromium.launchPersistentContext(path.resolve(root,'../../../.marketing-render-cache/video-inspect'),{
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,chromiumSandbox:true,serviceWorkers:'block',
  ignoreDefaultArgs:['--unsafely-disable-devtools-self-xss-warnings','--enable-unsafe-swiftshader'],args:['--disable-background-networking','--disable-component-update','--disable-sync'],viewport:{width:1080,height:1920},
});
await context.route(/^https?:/,route=>route.abort()); const page=await context.newPage();
try{
  const proof=await page.evaluate(async base64=>{
    const video=document.createElement('video');video.muted=true;video.src='data:video/mp4;base64,'+base64;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;document.body.append(canvas);
    const frames=[];for(const time of [1,4.5,8.5,12.5,14.5]){await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});canvas.getContext('2d').drawImage(video,0,0);frames.push({time,png:canvas.toDataURL('image/png').split(',')[1]});}
    return{duration:video.duration,width:video.videoWidth,height:video.videoHeight,frames};
  },bytes.toString('base64'));
  if(proof.width!==1080||proof.height!==1920||proof.duration<14.5||proof.duration>16.5)throw new Error('UNEXPECTED_VIDEO_METADATA');
  for(const frame of proof.frames)fs.writeFileSync(path.join(root,`review/video-frame-${frame.time}.png`),Buffer.from(frame.png,'base64'));
  fs.writeFileSync(path.join(root,'review/video-playback.json'),JSON.stringify({...proof,frames:proof.frames.map(frame=>({time:frame.time,saved:true})),bytes:bytes.length,mp4Container:true,decodeAndSeek:true},null,2));
  console.log(`PASS: MP4 decoded and seeked at five timestamps; ${proof.width}x${proof.height}; ${proof.duration.toFixed(3)}s; ${bytes.length} bytes.`);
}finally{await context.close();}
