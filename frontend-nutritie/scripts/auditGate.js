'use strict';

/**
 * Gate de audit npm pentru frontend (înlocuiește `npm audit --audit-level=moderate`
 * în CI, care eșua fără cale reală de remediere).
 *
 * Context: aplicația e pe Expo SDK 54 (expo ~54.0.34, react-native 0.81.5). Toate
 * advisory-urile din 2026-08-08 pentru lanțul Expo (`@expo/*`, `metro`, `expo-*`,
 * `react-native` etc.) au ca singură remediere un upgrade MAJOR la Expo SDK 57 —
 * nu există versiune "patched" în SDK 54, iar un override pe un sub-pachet Expo
 * rupe prebuild/bundler-ul. Acest backlog e urmărit ca upgrade separat (expo@57).
 *
 * Reguli (mențin severitatea gate-ului original pentru tot ce NU e backlog):
 *   - CRITICAL  -> EȘUEAZĂ întotdeauna (niciun pachet nu e scutit, inclusiv backlog).
 *   - moderate/high într-un pachet DIN ALLOWLIST -> permis (backlog documentat).
 *   - moderate/high într-un pachet ÎN AFARA ALLOWLIST -> EȘUEAZĂ (vuln nou, de triat).
 *   - low -> permis (idem `--audit-level=moderate`).
 */

const { execFileSync } = require('child_process');

// Pe Windows, `npm` e `npm.cmd`; cu `shell: true` execFileSync il ruleaza corect
// si pe Linux (unde `npm` e script shell).
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Pachete blocate de SDK-ul Expo 54. Se goleste la upgrade-ul expo@57.
// NU adauga pachete noi aici fara motiv: un pachet nou vulnerabil trebuie triat.
const ALLOWLIST = new Set([
	'@expo/cli',
	'@expo/config',
	'@expo/config-plugins',
	'@expo/metro',
	'@expo/metro-config',
	'@expo/prebuild-config',
	'@react-native/community-cli-plugin',
	'@react-three/drei',
	'@react-three/fiber',
	'@testing-library/react-native',
	'expo',
	'expo-asset',
	'expo-constants',
	'expo-linking',
	'expo-manifests',
	'expo-notifications',
	'expo-router',
	'expo-splash-screen',
	'expo-updates',
	'image-size',
	'metro',
	'metro-config',
	'metro-transform-worker',
	'postcss',
	'react-native',
	'react-native-purchases',
	'react-native-reanimated',
	'uuid',
	'xcode',
]);

const SEVERITATI = ['low', 'moderate', 'high', 'critical'];

let stdout = '';
try {
	stdout = execFileSync(npmCmd, ['audit', '--json'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: true,
	});
} catch (err) {
	// `npm audit` iese non-zero când găsește vulnerabilități; JSON-ul util e pe stdout.
	stdout = err.stdout || '';
}

let date;
try {
	date = JSON.parse(stdout);
} catch {
	console.error('auditGate: nu am putut parsa iesirea `npm audit --json`.');
	process.exit(1);
}

const vulnerabilitati = date.vulnerabilities || {};
const blocate = [];
const permise = [];

for (const [nume, vuln] of Object.entries(vulnerabilitati)) {
	const severitate = vuln.severity || 'unknown';
	if (severitate === 'critical') {
		blocate.push(`${nume} [CRITICAL]`);
	} else if (severitate !== 'low' && !ALLOWLIST.has(nume)) {
		blocate.push(`${nume} [${severitate}]`);
	} else {
		permise.push(`${nume} [${severitate}]`);
	}
}

const total = date.metadata?.vulnerabilities?.total ?? Object.keys(vulnerabilitati).length;

console.log(`auditGate: ${total} pachete vulnerabile in total.`);
if (permise.length > 0) {
	console.log(`  permise (backlog expo@57, documentat): ${permise.length}`);
	for (const p of permise) console.log(`    - ${p}`);
}

if (blocate.length > 0) {
	console.error(`\nauditGate: ${blocate.length} vulnerabilitati NEPERMISE:`);
	for (const p of blocate) console.error(`    - ${p}`);
	console.error('Candida spre ALLOWLIST doar daca fac parte din lanțul Expo SDK 54 blocat;');
	console.error('altfel remediaza-le (override / upgrade) inainte de merge.');
	process.exit(1);
}

console.log('\nauditGate: OK — nicio vulnerabilitate in afara backlog-ului documentat.');
process.exit(0);
