#!/usr/bin/env node
'use strict';

/**
 * verifyAndroidReleasePermissions.js
 *
 * Authoritative release evidence verifier for Android permissions (P0-06).
 * Inspects Gradle's actual merged RELEASE AndroidManifest.xml produced by
 * :app:processReleaseMainManifest from an isolated EAS-equivalent Expo native prebuild.
 *
 * Rules:
 * 1. Default mode ALWAYS generates a fresh disposable workspace and executes prebuild + Gradle merge.
 * 2. NO ambient artifact scanning (no searching previous getflow-prebuild-*, no falling back to local android/).
 * 3. Explicit --manifest <path> must exist or FAIL IMMEDIATELY (no fallback).
 * 4. Temporary workspaces are ALWAYS cleaned up in finally.
 * 5. Structural XML parsing via @xmldom/xmldom (comments are strictly ignored).
 * 6. compileSdk provenance is authoritatively extracted from Gradle build output or manifest attribute,
 *    NEVER faked from targetSdk.
 * 7. Dependencies in disposable workspace are installed via npm ci consistent with lockfile.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { DOMParser } = require('@xmldom/xmldom');

const EXPECTED_PACKAGE = 'com.totsrl.getflo';
const EXPECTED_MIN_SDK = '26';
const EXPECTED_TARGET_SDK = '36';
const EXPECTED_COMPILE_SDK = '36';

const FORBIDDEN_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

const REQUIRED_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.health.READ_STEPS',
];

const APP_DIRECT_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.health.READ_STEPS',
  'android.permission.INTERNET',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.VIBRATE',
];

/**
 * Parses an AndroidManifest.xml string using standard DOMParser.
 * Comments are DOM Comment nodes and therefore completely ignored when querying uses-permission elements.
 */
function parseMergedManifest(manifestContent, options = {}) {
  if (!manifestContent || typeof manifestContent !== 'string') {
    throw new Error('Manifest content must be a non-empty string');
  }

  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => { throw new Error(`XML Parse error: ${msg}`); },
      fatalError: (msg) => { throw new Error(`XML Fatal error: ${msg}`); },
    },
  }).parseFromString(manifestContent, 'text/xml');

  const manifestElem = doc.documentElement;
  if (!manifestElem || manifestElem.tagName !== 'manifest') {
    throw new Error('Invalid AndroidManifest.xml: missing root <manifest> element');
  }

  const pkg = manifestElem.getAttribute('package') || null;

  const usesSdkNodes = doc.getElementsByTagName('uses-sdk');
  let minSdkVersion = null;
  let targetSdkVersion = null;
  if (usesSdkNodes.length > 0) {
    minSdkVersion = usesSdkNodes[0].getAttribute('android:minSdkVersion') || null;
    targetSdkVersion = usesSdkNodes[0].getAttribute('android:targetSdkVersion') || null;
  }

  // compileSdkVersion: extract if present as manifest attribute;
  // or use explicit build provenance if provided in options;
  // NEVER fall back to targetSdkVersion!
  let compileSdkVersion = manifestElem.getAttribute('android:compileSdkVersion') || null;
  let compileSdkProvenance = 'manifest-attribute';

  if (!compileSdkVersion && options.compileSdkVersion) {
    compileSdkVersion = String(options.compileSdkVersion);
    compileSdkProvenance = options.compileSdkProvenance || 'gradle-build-output';
  } else if (!compileSdkVersion) {
    compileSdkProvenance = 'unproven';
  }

  const permNodes = doc.getElementsByTagName('uses-permission');
  const permissions = [];
  for (let i = 0; i < permNodes.length; i++) {
    const name = permNodes[i].getAttribute('android:name');
    if (name && !permissions.includes(name)) {
      permissions.push(name);
    }
  }

  return {
    package: pkg,
    minSdkVersion,
    targetSdkVersion,
    compileSdkVersion,
    compileSdkProvenance,
    permissions,
  };
}

/**
 * Validates parsed manifest data against security and release policy.
 */
function verifyPermissionPolicy(parsed) {
  const errors = [];

  if (parsed.package !== EXPECTED_PACKAGE) {
    errors.push(`Package mismatch: expected "${EXPECTED_PACKAGE}", got "${parsed.package}"`);
  }

  if (parsed.minSdkVersion !== EXPECTED_MIN_SDK) {
    errors.push(`minSdkVersion mismatch: expected "${EXPECTED_MIN_SDK}", got "${parsed.minSdkVersion}"`);
  }

  if (parsed.targetSdkVersion !== EXPECTED_TARGET_SDK) {
    errors.push(`targetSdkVersion mismatch: expected "${EXPECTED_TARGET_SDK}", got "${parsed.targetSdkVersion}"`);
  }

  if (!parsed.compileSdkVersion || parsed.compileSdkVersion !== EXPECTED_COMPILE_SDK) {
    errors.push(
      `compileSdkVersion mismatch or unproven: expected "${EXPECTED_COMPILE_SDK}", got "${parsed.compileSdkVersion}" (provenance: ${parsed.compileSdkProvenance || 'unknown'})`
    );
  }

  // Check forbidden permissions are strictly ABSENT
  for (const forbidden of FORBIDDEN_PERMISSIONS) {
    if (parsed.permissions.includes(forbidden)) {
      errors.push(`Forbidden permission PRESENT in merged release manifest: ${forbidden}`);
    }
  }

  // Check required permissions are PRESENT
  for (const required of REQUIRED_PERMISSIONS) {
    if (!parsed.permissions.includes(required)) {
      errors.push(`Required permission ABSENT from merged release manifest: ${required}`);
    }
  }

  const appDirect = parsed.permissions.filter(p => APP_DIRECT_PERMISSIONS.includes(p));
  const dependencyPermissions = parsed.permissions.filter(p => !APP_DIRECT_PERMISSIONS.includes(p));

  const summary = {
    package: parsed.package,
    minSdkVersion: parsed.minSdkVersion,
    targetSdkVersion: parsed.targetSdkVersion,
    compileSdkVersion: parsed.compileSdkVersion,
    compileSdkProvenance: parsed.compileSdkProvenance,
    totalPermissionsCount: parsed.permissions.length,
    appDirectPermissions: appDirect,
    dependencyPermissionsCount: dependencyPermissions.length,
    dependencyPermissions,
    forbiddenChecked: FORBIDDEN_PERMISSIONS,
    requiredChecked: REQUIRED_PERMISSIONS,
  };

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}

/**
 * Authoritatively resolves input manifest when --manifest is passed.
 * Fails closed if the specified file does not exist.
 * Returns null if no manifest path was provided (signaling fresh generation is required).
 */
function resolveManifestInput(options = {}) {
  const manifestPath = options.manifestPath;
  if (manifestPath) {
    const resolvedPath = path.resolve(manifestPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Specified manifest file not found: ${resolvedPath}`);
    }
    return {
      isExplicit: true,
      manifestPath: resolvedPath,
      manifestContent: fs.readFileSync(resolvedPath, 'utf8'),
      sourceDesc: `Explicit manifest: ${resolvedPath}`,
    };
  }

  // Default mode: NO ambient discovery! Return null to mandate fresh build generation.
  return null;
}

/**
 * Finds Java 17 or 21 on Windows/Linux/macOS.
 */
function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    try {
      const javaBin = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
      if (fs.existsSync(javaBin)) {
        const out = execSync(`"${javaBin}" -version 2>&1`, { encoding: 'utf-8' });
        const vMatch = out.match(/version "(?:1\.)?(\d+)/);
        const major = vMatch ? parseInt(vMatch[1], 10) : 0;
        if (major >= 17 && major <= 21) {
          return process.env.JAVA_HOME;
        }
      }
    } catch {}
  }

  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    path.join(process.env.LOCALAPPDATA || '', 'Programs\\Android Studio\\jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/usr/lib/jvm/java-21-openjdk',
    '/usr/lib/jvm/java-17-openjdk',
  ];

  for (const cand of candidates) {
    if (cand && fs.existsSync(cand)) {
      return cand;
    }
  }

  return process.env.JAVA_HOME || null;
}

/**
 * Finds Android SDK location.
 */
function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) {
    return process.env.ANDROID_HOME;
  }
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) {
    return process.env.ANDROID_SDK_ROOT;
  }

  const localSdk = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  if (fs.existsSync(localSdk)) {
    return localSdk;
  }

  const macSdk = path.join(os.homedir(), 'Library', 'Android', 'sdk');
  if (fs.existsSync(macSdk)) {
    return macSdk;
  }

  return null;
}

/**
 * Platform-safe lookup for existing PATH key in an environment object (e.g. 'PATH', 'Path', 'path').
 * Preserves the exact case variant present in targetEnv; defaults to 'Path' on Windows and 'PATH' elsewhere.
 */
function getExistingPathKey(targetEnv) {
  if (targetEnv && typeof targetEnv === 'object') {
    const found = Object.keys(targetEnv).find(k => k.toUpperCase() === 'PATH');
    if (found) return found;
  }
  return process.platform === 'win32' ? 'Path' : 'PATH';
}

/**
 * Prepends a directory to PATH in targetEnv, preserving existing search paths across
 * Windows ('Path' / 'PATH') and Unix ('PATH'), using path.delimiter.
 * Cleans up any conflicting duplicate casing to prevent Windows subprocess ambiguity.
 */
function prependPathToEnv(targetEnv, dirToPrepend) {
  if (!dirToPrepend || !targetEnv || typeof targetEnv !== 'object') {
    return targetEnv;
  }
  const key = getExistingPathKey(targetEnv);

  // Find all existing path keys to extract the existing value and remove duplicates
  const allPathKeys = Object.keys(targetEnv).filter(k => k.toUpperCase() === 'PATH');
  let existingPath = '';
  for (const k of allPathKeys) {
    if (targetEnv[k]) {
      existingPath = targetEnv[k];
      break;
    }
  }

  // Fallback to process.env if targetEnv had empty or no path
  if (!existingPath && typeof process !== 'undefined' && process.env) {
    const procKey = getExistingPathKey(process.env);
    existingPath = process.env[procKey] || '';
  }

  // Remove any conflicting duplicate path keys
  for (const k of allPathKeys) {
    if (k !== key) {
      delete targetEnv[k];
    }
  }

  targetEnv[key] = existingPath
    ? `${dirToPrepend}${path.delimiter}${existingPath}`
    : dirToPrepend;

  return targetEnv;
}

/**
 * Builds the canonical child-process environment for the release verifier.
 * Preserves inherited system/platform variables, injects synthetic production configuration,
 * and authoritatively prepends Java / JBR bin to the active PATH key without losing
 * existing search paths on Windows ('Path') or Unix ('PATH').
 */
function buildReleaseVerifierEnv(baseEnv = process.env, options = {}) {
  const javaHome = options.javaHome !== undefined ? options.javaHome : resolveJavaHome();
  const androidHome = options.androidHome !== undefined ? options.androidHome : resolveAndroidHome();

  // Synthetic valid-shaped production configuration for reproducible native release prebuild
  const syntheticProdEnv = {
    EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_ADS_MODE: 'real',
    EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-5202280855139508~6141533757',
    EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: 'ca-app-pub-5202280855139508/1542500110',
    EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: 'ca-app-pub-5202280855139508/3566028223',
    EXPO_PUBLIC_API_URL: 'https://api.getflow.ro',
    EXPO_PUBLIC_SUPABASE_URL: 'https://xyz.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake',
    EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public_fakeKey123',
    EXPO_PUBLIC_SENTRY_DSN: 'https://fake@sentry.io/12345',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://getflow.ro/politica-de-confidentialitate',
    EXPO_PUBLIC_TERMS_OF_SERVICE_URL: 'https://getflow.ro/termeni-si-conditii',
  };

  const env = {
    ...syntheticProdEnv,
    ...(baseEnv || {}),
    CI: '1',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_ADS_MODE: (baseEnv && baseEnv.EXPO_PUBLIC_ADS_MODE) || 'real',
  };

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    const binDir = path.join(javaHome, 'bin');
    prependPathToEnv(env, binDir);
  }

  if (androidHome) {
    env.ANDROID_HOME = androidHome;
    env.ANDROID_SDK_ROOT = androidHome;
  }

  return env;
}

/**
 * Runs an isolated disposable Expo prebuild and Gradle merged manifest processing step.
 * Guarantees fresh generation, lockfile-consistent dependencies, and cleanup in finally.
 */
function runDisposableReleaseManifestMerge(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const tmpDir = options.tmpDir || path.join(os.tmpdir(), 'getflow-prebuild-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

  if (options.onDirCreated) {
    options.onDirCreated(tmpDir);
  }

  console.log(`[P0-06] Creating disposable native build environment at:\n  ${tmpDir}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let manifestContent = null;
  let manifestPath = null;
  let compileSdkVersion = null;
  const execFn = options.execOverride || execSync;

  try {
    // Exclude non-EAS inputs
    const excluded = new Set([
      'node_modules',
      '.git',
      'android',
      'ios',
      '.expo',
      'dist',
      'dist-test',
      'web-build',
      'coverage',
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      '.agents',
      '.claude',
      '.playwright-mcp',
      '.superpowers',
      '.zcode',
    ]);

    const isExcluded = (item) => {
      if (excluded.has(item)) return true;
      if (item.startsWith('.env') && item !== '.env.example') return true;
      if (
        item.endsWith('.tsbuildinfo') ||
        item.endsWith('.jks') ||
        item.endsWith('.keystore') ||
        item.endsWith('.aab') ||
        item.endsWith('.apk')
      ) {
        return true;
      }
      return false;
    };

    // Copy project source files (EAS-equivalent inputs)
    const items = fs.readdirSync(projectRoot);
    for (const item of items) {
      if (isExcluded(item)) continue;
      const src = path.join(projectRoot, item);
      const dest = path.join(tmpDir, item);
      fs.cpSync(src, dest, { recursive: true });
    }

    // Configure environment for Gradle & Expo using platform-safe PATH handling
    const javaHome = resolveJavaHome();
    const androidHome = resolveAndroidHome();
    const childEnv = buildReleaseVerifierEnv(process.env, { javaHome, androidHome });
    const quoteCommandPath = (value) => `"${String(value).replace(/"/g, '\\"')}"`;
    const nodeExecutable = quoteCommandPath(process.execPath);
    const npmCli = process.env.npm_execpath;
    if (!npmCli) {
      throw new Error('npm_execpath is unavailable; cannot prove the npm subprocess uses the requested Node runtime.');
    }

    // Install lockfile-consistent dependencies via npm ci
    console.log(`[P0-06] Installing lockfile-consistent dependencies via npm ci...`);
    execFn(`${nodeExecutable} ${quoteCommandPath(npmCli)} ci --prefer-offline --no-audit --ignore-scripts`, {
      cwd: tmpDir,
      stdio: options.silent ? 'ignore' : 'inherit',
      env: childEnv,
    });

    const expoCli = path.join(tmpDir, 'node_modules', 'expo', 'bin', 'cli');
    console.log(`[P0-06] Running Expo prebuild with the verified Node runtime...`);
    execFn(`${nodeExecutable} ${quoteCommandPath(expoCli)} prebuild --platform android --no-install`, {
      cwd: tmpDir,
      stdio: options.silent ? 'ignore' : 'inherit',
      env: childEnv,
    });

    const androidDir = path.join(tmpDir, 'android');
    if (androidHome) {
      fs.mkdirSync(androidDir, { recursive: true });
      const normalizedSdkDir = androidHome.replace(/\\/g, '/');
      const localPropsPath = path.join(androidDir, 'local.properties');
      fs.writeFileSync(localPropsPath, `sdk.dir=${normalizedSdkDir}\n`, 'utf8');
    }

    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

    console.log(`[P0-06] Running ${gradlewCmd} :app:processReleaseMainManifest --no-daemon...`);
    const gradleOutput = execFn(`${gradlewCmd} :app:processReleaseMainManifest --no-daemon`, {
      cwd: androidDir,
      stdio: options.silent ? 'pipe' : 'pipe',
      env: childEnv,
      encoding: 'utf-8',
    });

    if (gradleOutput && typeof gradleOutput === 'string') {
      const cleanOut = gradleOutput.replace(/\x1B\[[0-9;]*[mGKH]/g, '');
      const csMatch = cleanOut.match(/compileSdk:\s*(\d+)/i);
      if (csMatch) {
        compileSdkVersion = csMatch[1];
      }
    }

    // Secondary authoritative check in app/build.gradle if not captured in stdout
    if (!compileSdkVersion) {
      const appBuildGradle = path.join(androidDir, 'app/build.gradle');
      if (fs.existsSync(appBuildGradle)) {
        const bgContent = fs.readFileSync(appBuildGradle, 'utf8');
        const csMatch = bgContent.match(/compileSdk\s+(\d+)/);
        if (csMatch) {
          compileSdkVersion = csMatch[1];
        }
      }
    }

    manifestPath = path.join(
      androidDir,
      'app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml'
    );

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Merged release manifest not found at expected path: ${manifestPath}`);
    }

    manifestContent = fs.readFileSync(manifestPath, 'utf8');

    return {
      manifestPath,
      manifestContent,
      compileSdkVersion,
      compileSdkProvenance: compileSdkVersion ? 'gradle-build-output' : 'unproven',
      tmpDir,
    };
  } finally {
    if (!options.keepTemp && tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log(`[P0-06] Cleaned temporary workspace at: ${tmpDir}`);
      } catch (err) {
        console.warn(`[P0-06] Warning: Failed to clean temp dir ${tmpDir}:`, err.message);
      }
    }
  }
}

/**
 * CLI execution entrypoint.
 */
function main() {
  const args = process.argv.slice(2);
  let explicitManifestPath = null;
  let keepTemp = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && args[i + 1]) {
      explicitManifestPath = args[i + 1];
      i++;
    } else if (args[i] === '--keep-temp') {
      keepTemp = true;
    }
  }

  let content = null;
  let sourceDesc = '';
  let compileSdk = null;
  let compileSdkProvenance = 'unproven';

  if (explicitManifestPath) {
    const explicit = resolveManifestInput({ manifestPath: explicitManifestPath });
    content = explicit.manifestContent;
    sourceDesc = explicit.sourceDesc;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--compile-sdk' && args[i + 1]) {
        compileSdk = args[i + 1];
        compileSdkProvenance = 'explicit-cli-arg';
        i++;
      }
    }
  } else {
    console.log('[P0-06] Canonical release mode: generating fresh disposable release merge...');
    const res = runDisposableReleaseManifestMerge({ keepTemp });
    content = res.manifestContent;
    compileSdk = res.compileSdkVersion;
    compileSdkProvenance = res.compileSdkProvenance;
    sourceDesc = `Freshly generated disposable release merge: ${res.manifestPath}`;
  }

  console.log(`\n============================================================`);
  console.log(`P0-06 ANDROID RELEASE MERGED MANIFEST VERIFICATION`);
  console.log(`Source: ${sourceDesc}`);
  console.log(`============================================================\n`);

  const parsed = parseMergedManifest(content, { compileSdkVersion: compileSdk, compileSdkProvenance });
  const result = verifyPermissionPolicy(parsed);

  console.log(`PACKAGE:            ${parsed.package}`);
  console.log(`MIN SDK:            ${parsed.minSdkVersion}`);
  console.log(`COMPILE SDK:        ${parsed.compileSdkVersion} (provenance: ${parsed.compileSdkProvenance})`);
  console.log(`TARGET SDK:         ${parsed.targetSdkVersion}`);
  console.log(`ACTIVE PERMISSIONS: ${parsed.permissions.length}`);
  console.log(`APP-DIRECT SENSITIVE: ${result.summary.appDirectPermissions.join(', ')}`);
  console.log(`DEPENDENCY PERMISSIONS COUNT: ${result.summary.dependencyPermissionsCount}\n`);

  console.log(`FORBIDDEN PERMISSIONS CHECK:`);
  for (const f of FORBIDDEN_PERMISSIONS) {
    const absent = !parsed.permissions.includes(f);
    console.log(`  ${absent ? '✅ ABSENT ' : '❌ PRESENT'}: ${f}`);
  }

  console.log(`\nREQUIRED PERMISSIONS CHECK:`);
  for (const r of REQUIRED_PERMISSIONS) {
    const present = parsed.permissions.includes(r);
    console.log(`  ${present ? '✅ PRESENT' : '❌ ABSENT '}: ${r}`);
  }

  console.log(`\nFULL MERGED PERMISSION SET (${parsed.permissions.length} total):`);
  parsed.permissions.forEach(p => console.log(`  - ${p}`));

  if (!result.valid) {
    console.error(`\n❌ VERIFICATION FAILED:`);
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\n✅ P0-06 MERGED RELEASE MANIFEST POLICY: PASS\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseMergedManifest,
  verifyPermissionPolicy,
  resolveManifestInput,
  runDisposableReleaseManifestMerge,
  resolveJavaHome,
  resolveAndroidHome,
  getExistingPathKey,
  prependPathToEnv,
  buildReleaseVerifierEnv,
  EXPECTED_PACKAGE,
  EXPECTED_MIN_SDK,
  EXPECTED_TARGET_SDK,
  EXPECTED_COMPILE_SDK,
  FORBIDDEN_PERMISSIONS,
  REQUIRED_PERMISSIONS,
  APP_DIRECT_PERMISSIONS,
};
