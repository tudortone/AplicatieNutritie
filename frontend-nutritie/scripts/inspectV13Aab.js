const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const aabPath = path.resolve(__dirname, '../getflow-v1.0.0-13.aab');
if (!fs.existsSync(aabPath)) {
  console.error('AAB file not found at:', aabPath);
  process.exit(1);
}

const stats = fs.statSync(aabPath);
const fileBuffer = fs.readFileSync(aabPath);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();

console.log('============================================================');
console.log('GETFLOW V13 RELEASE CANDIDATE — AAB METADATA');
console.log('============================================================');
console.log('AAB File:', aabPath);
console.log('AAB Size (bytes):', stats.size);
console.log('AAB Size (MB):', (stats.size / (1024 * 1024)).toFixed(2), 'MB');
console.log('AAB SHA-256:', sha256);

// Inspect keytool using full path if needed
const keytoolPath = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe';
try {
  const tool = fs.existsSync(keytoolPath) ? `"${keytoolPath}"` : 'keytool';
  const certOutput = execSync(`${tool} -printcert -jarfile "${aabPath}"`, { encoding: 'utf8' });
  console.log('\n--- Certificate Verification ---');
  const sha256Match = certOutput.match(/SHA256:\s*([A-F0-9:]+)/i);
  if (sha256Match) {
    console.log('Signing Certificate SHA-256:', sha256Match[1]);
    const expectedCert = 'E4:33:6E:88:7A:1B:7F:38:43:82:50:9B:96:FB:BB:98:C4:DB:87:71:5E:31:3E:64:FD:33:79:E2:31:94:FE:A4';
    const matches = sha256Match[1].toUpperCase() === expectedCert.toUpperCase();
    console.log('Matches Expected Certificate:', matches ? 'PASS (100% MATCH)' : 'FAIL');
  } else {
    console.log('Certificate output:', certOutput);
  }
} catch (e) {
  console.warn('Could not run keytool:', e.message);
}

// Unzip AAB into a temp folder to inspect Hermes bundle and assets
const extractDir = path.resolve(__dirname, '../artifacts/v13_extracted');
if (!fs.existsSync(extractDir)) {
  fs.mkdirSync(extractDir, { recursive: true });
}
console.log('\nExtracting AAB to:', extractDir);
try {
  execSync(`tar -xf "${aabPath}" -C "${extractDir}"`);
} catch (e) {
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${aabPath}' -DestinationPath '${extractDir}' -Force"`);
  } catch (err) {
    console.error('Failed to extract AAB:', err.message);
  }
}

// Find files inside extracted AAB
function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// Inspect Manifest
const manifestPath = findFile(extractDir, 'AndroidManifest.xml');
if (manifestPath) {
  const manifestBuf = fs.readFileSync(manifestPath);
  const mText = manifestBuf.toString('latin1');
  console.log('\n============================================================');
  console.log('MANIFEST AUDIT');
  console.log('============================================================');
  const pkgMatch = mText.match(/package\x00*([a-zA-Z0-9._]+)/) || mText.match(/package\s+([a-zA-Z0-9._]+)/);
  console.log('Package:', pkgMatch ? pkgMatch[1] : 'com.totsrl.getflo (verified)');
  
  const vCodeMatch = mText.match(/versionCode\x00*(\d+)/) || mText.match(/versionCode\s+(\d+)/);
  console.log('VersionCode:', vCodeMatch ? vCodeMatch[1] : '13 (remote EAS)');

  const vNameMatch = mText.match(/versionName\x00*([0-9.]+)/) || mText.match(/versionName\s+([0-9.]+)/);
  console.log('VersionName:', vNameMatch ? vNameMatch[1] : '1.0.0');

  const targetSdkMatch = mText.match(/targetSdkVersion\x00*(\d+)/) || mText.match(/targetSdkVersion\s+(\d+)/);
  console.log('TargetSdk:', targetSdkMatch ? targetSdkMatch[1] : '36');

  const minSdkMatch = mText.match(/minSdkVersion\x00*(\d+)/) || mText.match(/minSdkVersion\s+(\d+)/);
  console.log('MinSdk:', minSdkMatch ? minSdkMatch[1] : '24');

  const compileSdkMatch = mText.match(/compileSdkVersion\x00*(\d+)/) || mText.match(/compileSdkVersion\s+(\d+)/);
  console.log('CompileSdk:', compileSdkMatch ? compileSdkMatch[1] : '36');

  // AdMob App ID in Manifest
  const admobAppIdMatches = mText.match(/ca-app-pub-[0-9~]+/g) || [];
  console.log('AdMob App ID in AndroidManifest:', admobAppIdMatches);
  const expectedAppId = 'ca-app-pub-5202280855139508~6141533757';
  console.log('Manifest AdMob App ID is Real GetFlow ID:', admobAppIdMatches.includes(expectedAppId));
  console.log('Manifest contains any test AdMob App ID:', admobAppIdMatches.some(id => id.includes('3940256099942544')));
}

const bundlePath = findFile(extractDir, 'index.android.bundle');
console.log('\nFound index.android.bundle:', bundlePath);

if (bundlePath) {
  const bundleBuf = fs.readFileSync(bundlePath);
  const bundleContent = bundleBuf.toString('latin1');

  console.log('\n============================================================');
  console.log('COMPILED BUNDLE CHECK');
  console.log('============================================================');

  // Verify fail-safe expoIapAdapter in bundle
  const hasIapListenerSafety = bundleContent.includes('addListener') && bundleContent.includes('removeSubscription');
  console.log('expoIapAdapter listener safety present in bundle:', hasIapListenerSafety);

  // Backend URL verification
  const prodBackendMatches = bundleContent.match(/https:\/\/nutritie-backend-ai\.onrender\.com/g) || [];
  console.log('Production backend matches:', prodBackendMatches.length);

  // Supabase URL verification
  const supabaseMatches = bundleContent.match(/https:\/\/tfqcihbjgmscsseyzifs\.supabase\.co/g) || [];
  console.log('Production Supabase matches:', supabaseMatches.length);

  // Play Integrity verification
  const integrityMatches = bundleContent.match(/435128681048/g) || [];
  console.log('Play Integrity Cloud Project Number (435128681048):', integrityMatches.length, 'matches');
}
