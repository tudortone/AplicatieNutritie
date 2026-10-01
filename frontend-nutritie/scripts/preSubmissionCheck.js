'use strict';

/**
 * preSubmissionCheck.js — Gatekeeper complet înainte de EAS Build / EAS Submit.
 *
 * Verifică:
 * 1. Integritatea TypeScript (tsc --noEmit)
 * 2. Linting (expo lint)
 * 3. Teste unitare (jest)
 * 4. Gate de securitate audit (scripts/auditGate.js)
 * 5. Consistența app.json (package, projectId, version, icons)
 * 6. Prezența variabilelor de mediu critice pentru producție via process.env
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  VARIABILE_OBLIGATORII,
  valideazaMediuProductie,
  valideazaVariabileProductie,
  obtineMediuPreSubmission,
  executaVerificareMediu,
} = require('./preSubmissionConfig');

const { evalueazaVersiuneNode } = require('./auditGate');

const rootDir = path.resolve(__dirname, '..');
const appJsonPath = path.join(rootDir, 'app.json');
const envPath = path.join(rootDir, '.env');
// Sursa pentru `engines.node` — verificata de gate inainte de orice build.
const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function buildCodeCheckEnv(sourceEnv = process.env) {
  const current = sourceEnv || {};
  const sanitized = {};

  for (const [key, val] of Object.entries(current)) {
    if (val === undefined) continue;

    const upperKey = key.toUpperCase();

    // Strip out all Expo public application variables (e.g. EXPO_PUBLIC_APP_ENV, EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_ADS_MODE)
    if (upperKey.startsWith('EXPO_PUBLIC_')) {
      continue;
    }

    // Strip out EAS build profile and platform flags
    if (upperKey.startsWith('EAS_')) {
      continue;
    }

    // Strip out generic application environment variables
    if (upperKey === 'APP_ENV' || upperKey === 'ADS_MODE') {
      continue;
    }

    // Strip out Sentry runtime variables so Sentry.init is not triggered inside tests
    if (upperKey.startsWith('SENTRY_')) {
      continue;
    }

    // Strip out AdMob configuration if any non-prefixed exist
    if (upperKey.startsWith('ADMOB_')) {
      continue;
    }

    sanitized[key] = val;
  }

  // Explicitly set deterministic test/dev values for code quality subprocesses
  sanitized.NODE_ENV = 'test';
  sanitized.PRE_SUBMISSION_CHILD = '1';

  return sanitized;
}

function runStep(name, command, options = {}) {
  const silent = options.silent ?? false;
  const env = options.env || process.env;
  if (!silent) {
    process.stdout.write(`[+] Rulare ${name}... `);
  }
  try {
    execSync(command, { cwd: rootDir, stdio: silent ? 'pipe' : 'pipe', env });
    if (!silent) console.log('✅ OK');
    return true;
  } catch (err) {
    if (!silent) {
      console.log('❌ EȘUAT');
      if (err.stdout) console.error(err.stdout.toString());
      if (err.stderr) console.error(err.stderr.toString());
    }
    return false;
  }
}

function executaVerificari(optiuni = {}) {
  const silent = optiuni.silent ?? false;
  const envSursa = optiuni.env || process.env;
  let hasErrors = false;

  if (!silent) {
    console.log('====================================================');
    console.log('🛡️  NutriAI — Pre-Submission & Build Integrity Check');
    console.log('====================================================\n');
  }

  // 1. Verificări Cod (Rulează în mediu izolat hermetic)
  if (!optiuni.skipCodeChecks) {
    // 1.0 Versiunea de Node care executa build-ul (P0-04).
    // `engines.node` este `>=22 <23`; un build pe alt major poate produce
    // artefacte diferite de cele validate in CI/EAS, deci gate-ul o verifica
    // explicit, nu se bazeaza doar pe avertismentul EBADENGINE al npm.
    // Sta in blocul de verificari de cod pentru ca este o preconditie a lor;
    // `skipCodeChecks` (folosit de testele care izoleaza DOAR configurarea
    // P0-05) o sare impreuna cu restul.
    const engineCerut = pkgJson?.engines?.node;
    const versiuneNod = optiuni.versiuneNode || process.version;
    if (!engineCerut) {
      if (!silent) console.error('❌ package.json nu declara `engines.node` — nu pot valida runtime-ul de build.');
      hasErrors = true;
    } else {
      const rezultatNode = evalueazaVersiuneNode(versiuneNod, engineCerut);
      if (!silent) console.log(`[+] Rulare Verificare versiune Node... ${rezultatNode.ok ? '✅ OK' : '❌ EȘUAT'} (${rezultatNode.mesaj})`);
      if (!rezultatNode.ok) {
        if (!silent) {
          console.error('   Foloseste Node 22 (nvm-windows / Volta / imaginea CI/EAS) pentru build-ul de release.');
        }
        hasErrors = true;
      }
    }

    const codeCheckEnv = buildCodeCheckEnv(envSursa);
    if (!runStep('Typecheck (tsc --noEmit)', 'npm run typecheck', { silent, env: codeCheckEnv })) hasErrors = true;
    if (!runStep('Linter (expo lint)', 'npm run lint', { silent, env: codeCheckEnv })) hasErrors = true;
    if (!runStep('Teste Unitare (jest)', 'npm run test:ci', { silent, env: codeCheckEnv })) hasErrors = true;
    if (!runStep('Release Manifest Permissions (verifyAndroidReleasePermissions.js)', 'npm run permissions:verify', { silent, env: envSursa })) hasErrors = true;
    if (!runStep('Audit Security Gate (auditGate.js)', 'npm run audit:gate', { silent, env: codeCheckEnv })) hasErrors = true;
  }

  // 2. Verificare app.json
  if (!silent) console.log('\n[+] Verificare configurare app.json...');
  if (!fs.existsSync(appJsonPath)) {
    if (!silent) console.error('❌ Fișierul app.json lipsește!');
    hasErrors = true;
  } else {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const expo = appJson.expo || {};
    const pkg = expo.android?.package;
    const projectId = expo.extra?.eas?.projectId;
    const cameraPlugin = (expo.plugins || []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
    );
    const imagePickerPlugin = (expo.plugins || []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
    );

    if (pkg !== 'com.totsrl.getflo') {
      if (!silent) console.error(`❌ android.package este incorect: "${pkg}" (așteptat: "com.totsrl.getflo")`);
      hasErrors = true;
    } else if (!silent) {
      console.log('  ✅ android.package = com.totsrl.getflo');
    }

    if (projectId !== '18cf8908-194b-4386-a700-22dea945da47') {
      if (!silent) console.error(`❌ EAS projectId incorect: "${projectId}"`);
      hasErrors = true;
    } else if (!silent) {
      console.log('  ✅ EAS Project ID = 18cf8908-194b-4386-a700-22dea945da47');
    }

    // P0-06: Verificare permisiuni Android (least privilege)
    if (
      cameraPlugin?.[1]?.recordAudioAndroid !== false ||
      imagePickerPlugin?.[1]?.microphonePermission !== false ||
      expo.android?.permissions?.includes('android.permission.RECORD_AUDIO') ||
      !expo.android?.blockedPermissions?.includes('android.permission.RECORD_AUDIO')
    ) {
      if (!silent) console.error('❌ RECORD_AUDIO trebuie dezactivat: aplicația folosește camera numai pentru foto/barcode și image-picker fără microfon');
      hasErrors = true;
    } else if (!silent) {
      console.log('  ✅ RECORD_AUDIO dezactivat pentru Android');
    }

    const permisiuniInterzise = [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ];
    let mediaStorageOk = true;
    for (const perm of permisiuniInterzise) {
      if (expo.android?.permissions?.includes(perm)) {
        if (!silent) console.error(`❌ Permisiune media/storage nepermisă declarată în permissions: ${perm}`);
        hasErrors = true;
        mediaStorageOk = false;
      }
      if (!expo.android?.blockedPermissions?.includes(perm)) {
        if (!silent) console.error(`❌ Permisiune media/storage absentă din blockedPermissions: ${perm}`);
        hasErrors = true;
        mediaStorageOk = false;
      }
    }
    if (mediaStorageOk && !silent) {
      console.log('  ✅ Permisiuni media/storage broad dezactivate și blocate pentru Android');
    }

    if (!expo.android?.permissions?.includes('android.permission.CAMERA')) {
      if (!silent) console.error('❌ Permisiunea CAMERA lipsește din permissions (necesară pentru foto/barcode)');
      hasErrors = true;
    } else if (!silent) {
      console.log('  ✅ CAMERA configurată pentru foto/barcode');
    }
  }

  // 3. Verificare mediu de producție (process.env autoritar)
  if (!silent) console.log('\n[INFO] Verificare variabile de mediu de producție (process.env):');
  const verificareMediu = executaVerificareMediu(envSursa, optiuni.platforma || 'android', optiuni);
  if (!silent) {
    console.log(`  Sursă rezoluție mediu: ${verificareMediu.sursa}`);
    if (verificareMediu.aFolositLocalEnv) {
      console.log('  ⚠️  NOTĂ: .env local este utilizat exclusiv ca fallback de conveniență în dezvoltare.');
      console.log('  ⚠️  .env local NU reprezintă dovadă de release pentru producție/EAS!');
    }
  }

  for (const nume of VARIABILE_OBLIGATORII) {
    const lipseste = verificareMediu.erori.some((eroare) => eroare.startsWith(`${nume} `));
    if (!silent) {
      console.log(lipseste ? `  ❌ ${nume} este invalid sau lipsește` : `  ✅ ${nume} este prezent`);
    }
  }
  for (const eroare of verificareMediu.erori) {
    if (!silent) console.error(`  ❌ ${eroare}`);
  }

  if (!verificareMediu.ok) {
    hasErrors = true;
  }

  if (!silent) {
    console.log('\n====================================================');
    if (hasErrors) {
      console.error('❌ Verificarea a eșuat. NU continua cu build-ul sau submit-ul!');
    } else {
      console.log('🎉 TOATE VERIFICĂRILE DE COD AU TRECUT CU SUCCES!');
      console.log('====================================================\n');
    }
  }

  return {
    ok: !hasErrors,
    verificareMediu,
  };
}

if (require.main === module) {
  const rezultat = executaVerificari();
  process.exit(rezultat.ok ? 0 : 1);
}

module.exports = {
  runStep,
  buildCodeCheckEnv,
  executaVerificari,
  obtineMediuPreSubmission,
  executaVerificareMediu,
};
