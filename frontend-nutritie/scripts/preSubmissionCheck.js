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
 * 6. Prezența variabilelor de mediu critice pentru producție
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  VARIABILE_OBLIGATORII,
  valideazaVariabileProductie,
} = require('./preSubmissionConfig');

const rootDir = path.resolve(__dirname, '..');
const appJsonPath = path.join(rootDir, 'app.json');
const envPath = path.join(rootDir, '.env');

console.log('====================================================');
console.log('🛡️  NutriAI — Pre-Submission & Build Integrity Check');
console.log('====================================================\n');

let hasErrors = false;

function runStep(name, command) {
  process.stdout.write(`[+] Rulare ${name}... `);
  try {
    execSync(command, { cwd: rootDir, stdio: 'pipe' });
    console.log('✅ OK');
    return true;
  } catch (err) {
    console.log('❌ EȘUAT');
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    hasErrors = true;
    return false;
  }
}

// 1. Verificări Cod
runStep('Typecheck (tsc --noEmit)', 'npm run typecheck');
runStep('Linter (expo lint)', 'npm run lint');
runStep('Teste Unitare (jest)', 'npm run test:ci');
runStep('Audit Security Gate (auditGate.js)', 'npm run audit:gate');

// 2. Verificare app.json
console.log('\n[+] Verificare configurare app.json...');
if (!fs.existsSync(appJsonPath)) {
  console.error('❌ Fișierul app.json lipsește!');
  hasErrors = true;
} else {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const expo = appJson.expo || {};
  const pkg = expo.android?.package;
  const projectId = expo.extra?.eas?.projectId;
  const cameraPlugin = (expo.plugins || []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
  );

  if (pkg !== 'com.totsrl.getflo') {
    console.error(`❌ android.package este incorect: "${pkg}" (așteptat: "com.totsrl.getflo")`);
    hasErrors = true;
  } else {
    console.log('  ✅ android.package = com.totsrl.getflo');
  }

  if (projectId !== '18cf8908-194b-4386-a700-22dea945da47') {
    console.error(`❌ EAS projectId incorect: "${projectId}"`);
    hasErrors = true;
  } else {
    console.log('  ✅ EAS Project ID = 18cf8908-194b-4386-a700-22dea945da47');
  }

  if (
    cameraPlugin?.[1]?.recordAudioAndroid !== false ||
    expo.android?.permissions?.includes('android.permission.RECORD_AUDIO') ||
    !expo.android?.blockedPermissions?.includes('android.permission.RECORD_AUDIO')
  ) {
    console.error('❌ RECORD_AUDIO trebuie dezactivat: aplicația folosește camera numai pentru foto/barcode');
    hasErrors = true;
  } else {
    console.log('  ✅ RECORD_AUDIO dezactivat pentru Android');
  }
}

// 3. Verificare variabile de mediu .env
console.log('\n[INFO] Verificare variabile de mediu de producție (.env):');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const rezultatEnv = valideazaVariabileProductie(envContent);
  for (const nume of VARIABILE_OBLIGATORII) {
    const lipseste = rezultatEnv.erori.some((eroare) => eroare.startsWith(`${nume} `));
    console.log(lipseste ? `  ❌ ${nume} este invalid sau lipsește` : `  ✅ ${nume} este prezent`);
  }
  for (const eroare of rezultatEnv.erori) console.error(`  ❌ ${eroare}`);
  if (!rezultatEnv.ok) hasErrors = true;
} else {
  console.error('  ❌ Fișierul .env local lipsește.');
  hasErrors = true;
}

console.log('\n====================================================');
if (hasErrors) {
  console.error('❌ Verificarea a eșuat. NU continua cu build-ul sau submit-ul!');
  process.exit(1);
} else {
  console.log('🎉 TOATE VERIFICĂRILE DE COD AU TRECUT CU SUCCES!');
  console.log('====================================================\n');
  process.exit(0);
}
