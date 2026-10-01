const fs = require('fs');
const path = require('path');

const candidateDirs = [
  path.resolve(__dirname, '../dist/_expo/static/js/android'),
  path.resolve(__dirname, '../dist-test/_expo/static/js/android'),
];
const dir = candidateDirs.find(d => fs.existsSync(d));
if (!dir) {
  console.log('No build directory found in:', candidateDirs);
  process.exit(1);
}

const files = fs.readdirSync(dir);
const bundleFile = files.find(f => f.endsWith('.hbc') || f.endsWith('.bundle') || f.endsWith('.js'));
if (!bundleFile) {
  console.log('No bundle file found in', dir);
  process.exit(1);
}

const fullPath = path.join(dir, bundleFile);
console.log('Inspecting compiled bundle:', fullPath);
const buf = fs.readFileSync(fullPath);
const content = buf.toString('latin1');

const testMatches = content.match(/ca-app-pub-3940256099942544[^\x00"'\s]*/g) || [];
console.log('============================================================');
console.log('COMPILED BUNDLE ADMOB AUDIT RESULT:');
console.log('============================================================');
console.log('Google Test AdMob IDs count in bundle:', testMatches.length);
if (testMatches.length > 0) {
  console.log('Occurrences found:', [...new Set(testMatches)]);
} else {
  console.log('✅ ZERO Google sample AdMob IDs found in the compiled bundle!');
}

const realMatches = content.match(/ca-app-pub-5202280855139508[^\x00"'\s]*/g) || [];
console.log('Real GetFlow AdMob IDs count in bundle:', realMatches.length);
console.log('Real IDs found:', [...new Set(realMatches)]);
console.log('============================================================');
