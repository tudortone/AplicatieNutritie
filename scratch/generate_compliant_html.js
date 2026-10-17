const fs = require('fs');
const path = require('path');

// Synchronize canonical public/ legal documents to backend-nutritie-ai/public/
const rootPublic = path.join(__dirname, '..', 'public');
const backendPublic = path.join(__dirname, '..', 'backend-nutritie-ai', 'public');

const filesToSync = [
  'politica-de-confidentialitate.html',
  'termeni-si-conditii.html',
  'stergere-cont.html',
  'privacy.html',
  'app-ads.txt',
  'index.html'
];

for (const file of filesToSync) {
  const src = path.join(rootPublic, file);
  const dest = path.join(backendPublic, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Synced ${file} -> backend-nutritie-ai/public/`);
  }
}
console.log('Legal document sync complete.');
