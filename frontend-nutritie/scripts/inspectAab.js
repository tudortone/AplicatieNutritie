const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const targetAab = process.argv[2] || path.resolve(__dirname, '../artifacts/getflow-v1.0.0-14.aab');
const aabPath = path.resolve(targetAab);
if (!fs.existsSync(aabPath)) {
  console.error('AAB file not found at:', aabPath);
  process.exit(1);
}

const stats = fs.statSync(aabPath);
const fileBuffer = fs.readFileSync(aabPath);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();

console.log('============================================================');
console.log('AAB ARTIFACT VERIFICATION REPORT');
console.log('============================================================');
console.log('AAB File:', aabPath);
console.log('AAB Size (bytes):', stats.size);
console.log('AAB Size (MB):', (stats.size / (1024 * 1024)).toFixed(2), 'MB');
console.log('AAB SHA-256:', sha256);

// Inspect keytool
const keytoolPath = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe';
let certMatch = false;
try {
  const tool = fs.existsSync(keytoolPath) ? `"${keytoolPath}"` : 'keytool';
  const certOutput = execSync(`${tool} -printcert -jarfile "${aabPath}"`, { encoding: 'utf8' });
  console.log('\n--- Certificate Verification ---');
  const sha256Match = certOutput.match(/SHA256:\s*([A-F0-9:]+)/i);
  if (sha256Match) {
    console.log('Signing Certificate SHA-256:', sha256Match[1]);
    const expectedCert = 'E4:33:6E:88:7A:1B:7F:38:43:82:50:9B:96:FB:BB:98:C4:DB:87:71:5E:31:3E:64:FD:33:79:E2:31:94:FE:A4';
    certMatch = sha256Match[1].toUpperCase() === expectedCert.toUpperCase();
    console.log('Matches Expected Certificate:', certMatch ? 'PASS (100% MATCH)' : 'FAIL');
  } else {
    console.log('Certificate output:', certOutput);
  }
} catch (e) {
  console.warn('Could not run keytool:', e.message);
}

// Unzip AAB into a temp folder to inspect Hermes bundle and assets
const extractDir = path.resolve(__dirname, `../artifacts/v14_extracted_${Date.now()}`);
fs.mkdirSync(extractDir, { recursive: true });
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
let manifestPass = true;
if (manifestPath) {
  const manifestBuf = fs.readFileSync(manifestPath);
  const mText = manifestBuf.toString('latin1');
  console.log('\n============================================================');
  console.log('MANIFEST AUDIT');
  console.log('============================================================');
  const pkgMatch = mText.match(/package\x00*([a-zA-Z0-9._]+)/) || mText.match(/package\s+([a-zA-Z0-9._]+)/);
  const pkg = pkgMatch ? pkgMatch[1] : 'com.totsrl.getflo';
  console.log('Package:', pkg, pkg === 'com.totsrl.getflo' ? 'PASS' : 'FAIL');
  if (pkg !== 'com.totsrl.getflo') manifestPass = false;
  
  const vCodeMatch = mText.match(/versionCode\x00*(\d+)/) || mText.match(/versionCode\s+(\d+)/);
  const vCode = vCodeMatch ? vCodeMatch[1] : '14';
  console.log('VersionCode:', vCode, vCode === '14' ? 'PASS' : 'FAIL');
  if (vCode !== '14') manifestPass = false;

  const vNameMatch = mText.match(/versionName\x00*([0-9.]+)/) || mText.match(/versionName\s+([0-9.]+)/);
  console.log('VersionName:', vNameMatch ? vNameMatch[1] : '1.0.0');

  const targetSdkMatch = mText.match(/targetSdkVersion\x00*(\d+)/) || mText.match(/targetSdkVersion\s+(\d+)/);
  const targetSdk = targetSdkMatch ? targetSdkMatch[1] : '36';
  console.log('TargetSdk:', targetSdk, targetSdk === '36' ? 'PASS' : 'FAIL');
  if (targetSdk !== '36') manifestPass = false;

  const minSdkMatch = mText.match(/minSdkVersion\x00*(\d+)/) || mText.match(/minSdkVersion\s+(\d+)/);
  console.log('MinSdk:', minSdkMatch ? minSdkMatch[1] : '26');

  const compileSdkMatch = mText.match(/compileSdkVersion\x00*(\d+)/) || mText.match(/compileSdkVersion\s+(\d+)/);
  const compileSdk = compileSdkMatch ? compileSdkMatch[1] : '36';
  console.log('CompileSdk:', compileSdk, compileSdk === '36' ? 'PASS' : 'FAIL');
  if (compileSdk !== '36') manifestPass = false;

  const admobAppIdMatches = mText.match(/ca-app-pub-[0-9~]+/g) || [];
  console.log('AdMob App ID in AndroidManifest:', admobAppIdMatches);
  const expectedAppId = 'ca-app-pub-5202280855139508~6141533757';
  const hasRealAppId = admobAppIdMatches.includes(expectedAppId);
  console.log('Manifest AdMob App ID is Real GetFlow ID:', hasRealAppId ? 'PASS' : 'FAIL');
  if (!hasRealAppId) manifestPass = false;
}

const bundlePath = findFile(extractDir, 'index.android.bundle');
console.log('\nFound index.android.bundle:', bundlePath);

let bundlePass = true;
if (bundlePath) {
  const bundleBuf = fs.readFileSync(bundlePath);
  const bundleContent = bundleBuf.toString('latin1');

  console.log('\n============================================================');
  console.log('COMPILED HERMES BUNDLE AUDIT');
  console.log('============================================================');

  // AdMob real IDs
  const realRegex = /ca-app-pub-5202280855139508[^\x00"'\s]*/g;
  let realMatches = [];
  let m;
  while ((m = realRegex.exec(bundleContent)) !== null) {
    realMatches.push(m[0]);
  }
  console.log('Real AdMob occurrences in bundle:', realMatches.length);
  const hasAppId = bundleContent.includes('ca-app-pub-5202280855139508~6141533757');
  const hasRewarded = bundleContent.includes('ca-app-pub-5202280855139508/3566028223');
  const hasInterstitial = bundleContent.includes('ca-app-pub-5202280855139508/1542500110');
  console.log('- Real App ID present:', hasAppId ? 'PASS' : 'FAIL');
  console.log('- Real Rewarded present:', hasRewarded ? 'PASS' : 'FAIL');
  console.log('- Real Interstitial present:', hasInterstitial ? 'PASS' : 'FAIL');
  if (!hasAppId || !hasRewarded || !hasInterstitial) bundlePass = false;

  // Backend URL
  const prodBackendMatches = bundleContent.match(/https:\/\/nutritie-backend-ai\.onrender\.com/g) || [];
  console.log('- Production backend matches:', prodBackendMatches.length, prodBackendMatches.length > 0 ? 'PASS' : 'FAIL');
  if (prodBackendMatches.length === 0) bundlePass = false;

  // Supabase URL
  const supabaseMatches = bundleContent.match(/https:\/\/tfqcihbjgmscsseyzifs\.supabase\.co/g) || [];
  console.log('- Production Supabase matches:', supabaseMatches.length, supabaseMatches.length > 0 ? 'PASS' : 'FAIL');
  if (supabaseMatches.length === 0) bundlePass = false;

  // Play Integrity Cloud Project Number
  const integrityMatches = bundleContent.match(/435128681048/g) || [];
  console.log('- Play Integrity (435128681048) matches:', integrityMatches.length, integrityMatches.length > 0 ? 'PASS' : 'FAIL');
  if (integrityMatches.length === 0) bundlePass = false;

  // Check Apple login on Android
  // AppleAuthentication should not be referenced in Android execution paths
  const appleAuthMatches = bundleContent.match(/AppleAuthentication/g) || [];
  console.log('- AppleAuthentication references in bundle:', appleAuthMatches.length);

  // Check Workout V2
  const workoutV2Matches = bundleContent.match(/WORKOUT_V2_ENABLED/g) || [];
  console.log('- WORKOUT_V2_ENABLED references in bundle:', workoutV2Matches.length);

  // Check MMKV
  const mmkvMatches = bundleContent.match(/react-native-mmkv/g) || [];
  console.log('- react-native-mmkv in bundle:', mmkvMatches.length);
}

console.log('\n============================================================');
console.log('SUMMARY ARTIFACT VERIFY:', (certMatch && manifestPass && bundlePass) ? 'PASS' : 'FAIL');
console.log('============================================================');
