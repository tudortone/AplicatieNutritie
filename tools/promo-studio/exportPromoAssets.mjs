import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.resolve(REPO_ROOT, 'release-assets/promo-campaign/images');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9224;
const HTTP_PORT = 8991;

// Define the comprehensive promo asset list across 9:16, 4:5, 16:9, and Google Play feature formats
const EXPORT_JOBS = [
  // 9:16 Vertical Stories / TikTok / Reels (1080x1920)
  { filename: '01-hero-scan-2sec-ro.png', scene: 'post-01', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '01-hero-scan-2sec-en.png', scene: 'post-01', format: 'size-story', lang: 'en', w: 1080, h: 1920 },
  { filename: '02-background-magic-ro.png', scene: 'post-02', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '02-background-magic-en.png', scene: 'post-02', format: 'size-story', lang: 'en', w: 1080, h: 1920 },
  { filename: '03-companion-evolution-ro.png', scene: 'post-03', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '03-companion-evolution-en.png', scene: 'post-03', format: 'size-story', lang: 'en', w: 1080, h: 1920 },
  { filename: '04-pantry-to-plate-ro.png', scene: 'post-04', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '04-pantry-to-plate-en.png', scene: 'post-04', format: 'size-story', lang: 'en', w: 1080, h: 1920 },
  { filename: '05-anatomy-workouts-ro.png', scene: 'post-05', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '05-anatomy-workouts-en.png', scene: 'post-05', format: 'size-story', lang: 'en', w: 1080, h: 1920 },
  { filename: '06-barcode-instant-ro.png', scene: 'post-06', format: 'size-story', lang: 'ro', w: 1080, h: 1920 },
  { filename: '06-barcode-instant-en.png', scene: 'post-06', format: 'size-story', lang: 'en', w: 1080, h: 1920 },

  // 4:5 Instagram Feed (1080x1350)
  { filename: 'feed-01-hero-scan-ro.png', scene: 'post-01', format: 'size-feed', lang: 'ro', w: 1080, h: 1350 },
  { filename: 'feed-01-hero-scan-en.png', scene: 'post-01', format: 'size-feed', lang: 'en', w: 1080, h: 1350 },
  { filename: 'feed-03-companion-ro.png', scene: 'post-03', format: 'size-feed', lang: 'ro', w: 1080, h: 1350 },
  { filename: 'feed-03-companion-en.png', scene: 'post-03', format: 'size-feed', lang: 'en', w: 1080, h: 1350 },

  // 16:9 Landscape / Web / YouTube (1920x1080)
  { filename: 'landscape-01-hero-scan-ro.png', scene: 'post-01', format: 'size-landscape', lang: 'ro', w: 1920, h: 1080 },
  { filename: 'landscape-01-hero-scan-en.png', scene: 'post-01', format: 'size-landscape', lang: 'en', w: 1920, h: 1080 },

  // Google Play Store Feature Graphic (1024x500)
  { filename: 'google-play-feature-graphic-ro.png', scene: 'post-01', format: 'size-feature', lang: 'ro', w: 1024, h: 500 },
  { filename: 'google-play-feature-graphic-en.png', scene: 'post-01', format: 'size-feature', lang: 'en', w: 1024, h: 500 },
];

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// 1. Start lightweight local HTTP server
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
      let filePath = path.join(REPO_ROOT, decodeURIComponent(parsedUrl.pathname));

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(HTTP_PORT, '127.0.0.1', () => {
      console.log(`[HTTP] Static server active on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

// 2. Poll helper
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 3. Connect to Chrome CDP via native WebSocket
async function initCDP() {
  console.log(`[Chrome] Launching headless Chrome at ${CHROME_PATH}...`);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-networking',
  ], { stdio: 'ignore' });

  // Poll until debugging port is ready
  let versionData = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {
      // Chrome is starting up
    }
  }

  if (!versionData || !versionData.webSocketDebuggerUrl) {
    chromeProc.kill();
    throw new Error('Failed to connect to Chrome remote debugging port.');
  }

  console.log(`[Chrome] Connected. Target: ${versionData.Browser}`);

  // Create a new blank page target
  const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
  const tabData = await newTabRes.json();
  const wsUrl = tabData.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    } catch (err) {
      console.error('[CDP] Message parsing error:', err);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send('Page.enable');
  await send('Runtime.enable');

  return { ws, send, chromeProc };
}

async function main() {
  console.log('=== GetFlow Promo & Motion Studio Asset Exporter ===');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  let cdp;

  try {
    cdp = await initCDP();
    const { send } = cdp;

    const results = [];

    for (let i = 0; i < EXPORT_JOBS.length; i++) {
      const job = EXPORT_JOBS[i];
      const targetPath = path.join(OUTPUT_DIR, job.filename);
      console.log(`[Export ${i + 1}/${EXPORT_JOBS.length}] Generating ${job.filename} (${job.w}x${job.h}, ${job.lang.toUpperCase()})...`);

      // Set viewport and device metrics
      await send('Emulation.setDeviceMetricsOverride', {
        width: job.w,
        height: job.h,
        deviceScaleFactor: 1,
        mobile: false,
      });

      // Navigate to target URL
      const pageUrl = `http://127.0.0.1:${HTTP_PORT}/tools/promo-studio/index.html?scene=${job.scene}&format=${job.format}&lang=${job.lang}&clean=true`;
      await send('Page.navigate', { url: pageUrl });

      // Wait for rendering & animations to settle
      await sleep(750);

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 0,
          y: 0,
          width: job.w,
          height: job.h,
          scale: 1,
        },
      });

      const buffer = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(targetPath, buffer);
      const sizeKb = (buffer.length / 1024).toFixed(1);
      console.log(`  -> Saved: ${job.filename} (${sizeKb} KB)`);

      results.push({
        filename: job.filename,
        resolution: `${job.w}x${job.h}`,
        sizeKb: `${sizeKb} KB`,
        status: buffer.length > 50000 ? 'PASS (>50KB)' : 'WARN',
      });
    }

    console.log('\n=== Export Summary ===');
    console.table(results);
    console.log(`\nAll promotional assets successfully exported to:\n${OUTPUT_DIR}\n`);

  } finally {
    if (cdp) {
      try { cdp.ws.close(); } catch {}
      try { cdp.chromeProc.kill(); } catch {}
    }
    server.close();
    console.log('[Cleanup] Headless Chrome and HTTP server terminated cleanly.');
  }
}

main().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});

