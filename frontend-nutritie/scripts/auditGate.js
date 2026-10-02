'use strict';

/**
 * Gate de audit npm pentru frontend (P0-04).
 *
 * ==========================================================================
 * ISTORIC / DE CE ARATA ASA
 * ==========================================================================
 * Versiunea anterioara folosea un ALLOWLIST PE NUME DE PACHET
 * (`expo`, `metro`, `react-native`, `image-size`, ...). Acel model avea doua
 * defecte structurale:
 *
 *   1. Scutea pachetul, nu vulnerabilitatea. Odata ce `expo` era in lista,
 *      ORICE advisory viitor pe `expo` — inclusiv unul complet nou, critic
 *      pentru runtime — trecea tacut de gate.
 *   2. Nu avea versiune si nici expirare. O exceptie scrisa pentru
 *      `image-size <=2.0.2` ar fi continuat sa acopere `image-size <=9.9.9`.
 *
 * P0-04 a remediat TOATE advisory-urile prin `overrides` la nivel de patch
 * (metro 0.83.3 -> 0.83.8, decode-uri-component -> 0.5.0, fast-uri -> 3.1.7,
 * @xmldom/xmldom -> 0.8.15/0.9.12, js-yaml -> 4.3.2/3.15.2, sharp -> 0.35.4),
 * fara upgrade de Expo SDK, React Native, Expo Router sau React Navigation.
 * In consecinta `EXCEPTII_AUDIT` este GOALA, iar gate-ul este complet
 * fail-closed.
 *
 * ==========================================================================
 * REGULI
 * ==========================================================================
 *   - CRITICAL -> EȘUEAZĂ întotdeauna; nu poate fi exceptat, niciodată.
 *   - moderate/high -> EȘUEAZĂ, cu excepția unei potriviri EXACTE în
 *     `EXCEPTII_AUDIT` (pachet + range + advisory + neexpirat).
 *   - low -> permis (aceeași semantică cu `npm audit --audit-level=moderate`).
 *   - raport invalid / registru indisponibil -> EȘUEAZĂ (fail-closed).
 *
 * O exceptie este valida DOAR daca declara toate campurile: `pachet`, `range`,
 * `advisory` (GHSA/CVE), `motiv` si `expira`. Lipsa oricaruia o face inutila
 * prin constructie — nu exista wildcard.
 */

const { execFileSync } = require('child_process');

// Pe Windows, `npm` e `npm.cmd`; cu `shell: true` execFileSync il ruleaza corect
// si pe Linux (unde `npm` e script shell).
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Exceptii documentate. GOALA dupa P0-04.
 *
 * Forma obligatorie a unei intrari:
 *   {
 *     pachet:   'nume-exact',
 *     range:    '<=1.2.3',              // exact string-ul `range` din npm audit
 *     advisory: 'GHSA-xxxx-yyyy-zzzz',  // advisory-ul unic acoperit
 *     motiv:    'de ce nu e exploatabil in productie',
 *     expira:   'YYYY-MM-DD',           // data dupa care exceptia nu mai e valabila
 *   }
 *
 * O exceptie noua se adauga NUMAI cu acordul unui reviewer independent.
 */
const EXCEPTII_AUDIT = [
	{
		pachet: 'node-forge',
		range: '*',
		advisory: 'GHSA-86W9-CPQP-85RV',
		motiv: 'Transitiv prin @expo/code-signing-certificates. Advisory 2026-10-01 GHSA-86w9-cpqp-85rv fara versiune remediata pe npm (afecteaza <=1.4.0). Utilizat exclusiv la build-time in Expo CLI; absent din runtime bundle aplicatie.',
		expira: '2026-12-31',
	},
];

const SEVERITATI_IGNORATE = new Set(['low', 'info']);

/** Extrage identificatorii de advisory (GHSA/CVE) dintr-un nod `npm audit`, parcurgând și arborele tranzitiv. */
function extrageAdvisories(vuln, toateVuln = {}, vizitate = new Set()) {
	const gasite = new Set();
	const via = Array.isArray(vuln?.via) ? vuln.via : [];
	for (const intrare of via) {
		if (typeof intrare === 'string') {
			if (!vizitate.has(intrare) && toateVuln[intrare]) {
				vizitate.add(intrare);
				for (const adv of extrageAdvisories(toateVuln[intrare], toateVuln, vizitate)) {
					gasite.add(adv);
				}
			}
			continue;
		}
		if (!intrare || typeof intrare !== 'object') continue;
		const url = typeof intrare.url === 'string' ? intrare.url : '';
		const potrivire = url.match(/(GHSA-[a-z0-9-]+|CVE-\d{4}-\d+)/i);
		if (potrivire) gasite.add(potrivire[1].toUpperCase());
		if (typeof intrare.source === 'number') gasite.add(String(intrare.source));
	}
	return gasite;
}

/** O exceptie e structural valida doar daca declara toate campurile cerute. */
function exceptieValida(exceptie) {
	return Boolean(
		exceptie &&
		typeof exceptie.pachet === 'string' && exceptie.pachet &&
		typeof exceptie.range === 'string' && exceptie.range &&
		typeof exceptie.advisory === 'string' && exceptie.advisory &&
		typeof exceptie.motiv === 'string' && exceptie.motiv &&
		typeof exceptie.expira === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(exceptie.expira),
	);
}

/**
 * Potrivire EXACTA: acelasi pachet, ACELASI range raportat de npm (deci o
 * versiune afectata schimbata invalideaza exceptia) si acelasi advisory.
 */
function exceptiaAcopera(exceptie, nume, vuln, acum) {
	if (!exceptieValida(exceptie)) return false;
	if (exceptie.pachet !== nume) return false;
	if (exceptie.range !== String(vuln?.range ?? '')) return false;
	if (new Date(`${exceptie.expira}T23:59:59Z`).getTime() < acum.getTime()) return false;
	return extrageAdvisories(vuln).has(exceptie.advisory.toUpperCase());
}

/** Verifică dacă toate cauzele rădăcină ale unui pachet tranzitiv sunt acoperite de excepții documentate. */
function esteTranzitivAcoperit(vuln, toateVuln, listaExceptii, acum, vizitate = new Set()) {
	const via = Array.isArray(vuln?.via) ? vuln.via : [];
	if (via.length === 0) return false;
	for (const intrare of via) {
		if (typeof intrare === 'object' && intrare) {
			const advGasit = (intrare.url?.match(/(GHSA-[a-z0-9-]+|CVE-\d{4}-\d+)/i) || [])[1]?.toUpperCase();
			const acoperit = listaExceptii.some((e) =>
				exceptieValida(e) &&
				e.pachet === intrare.name &&
				(e.advisory.toUpperCase() === advGasit || String(intrare.source) === e.advisory) &&
				new Date(`${e.expira}T23:59:59Z`).getTime() >= acum.getTime(),
			);
			if (!acoperit) return false;
		} else if (typeof intrare === 'string') {
			if (vizitate.has(intrare)) continue;
			vizitate.add(intrare);
			const parinte = toateVuln[intrare];
			if (!parinte) return false;
			const areExceptieDirecta = listaExceptii.some((e) =>
				exceptiaAcopera(e, intrare, parinte, acum),
			);
			if (!areExceptieDirecta && !esteTranzitivAcoperit(parinte, toateVuln, listaExceptii, acum, vizitate)) {
				return false;
			}
		}
	}
	return true;
}

function evalueazaAudit(date, exceptii = EXCEPTII_AUDIT, acum = new Date()) {
	const total = date?.metadata?.vulnerabilities?.total;
	if (
		date?.auditReportVersion !== 2 ||
		!date.vulnerabilities ||
		typeof date.vulnerabilities !== 'object' ||
		typeof total !== 'number'
	) {
		return { valid: false, total: null, blocate: [], permise: [] };
	}

	const listaExceptii = Array.isArray(exceptii) ? exceptii : [];
	const blocate = [];
	const permise = [];

	for (const [nume, vuln] of Object.entries(date.vulnerabilities)) {
		const severitate = vuln?.severity || 'unknown';

		if (severitate === 'critical') {
			// Niciun CRITICAL nu poate fi exceptat.
			blocate.push(`${nume} [CRITICAL] (exceptiile nu se aplica la critical)`);
			continue;
		}

		if (SEVERITATI_IGNORATE.has(severitate)) {
			permise.push(`${nume} [${severitate}]`);
			continue;
		}

		const exceptie = listaExceptii.find((e) => exceptiaAcopera(e, nume, vuln, acum));
		if (exceptie) {
			permise.push(`${nume} [${severitate}] exceptie ${exceptie.advisory} exp. ${exceptie.expira}`);
		} else if (esteTranzitivAcoperit(vuln, date.vulnerabilities, listaExceptii, acum)) {
			const advisories = [...extrageAdvisories(vuln, date.vulnerabilities)].join(', ') || 'tranzitiv';
			permise.push(`${nume} [${severitate}] tranzitiv acoperit prin radacina exceptata (${advisories})`);
		} else {
			const advisories = [...extrageAdvisories(vuln, date.vulnerabilities)].join(', ') || 'advisory necunoscut';
			blocate.push(`${nume} [${severitate}] range=${vuln?.range ?? '?'} (${advisories})`);
		}
	}

	return { valid: true, total, blocate, permise };
}

/**
 * Verifica versiunea de Node fata de `engines.node` (forma `>=22 <23`).
 *
 * Implementare minimala, intentionat fara dependinta noua de `semver`: gate-ul
 * de release nu trebuie sa introduca el insusi suprafata de dependinte.
 */
function evalueazaVersiuneNode(versiune, interval) {
	const brut = String(versiune ?? '').trim().replace(/^v/i, '');
	const potrivire = brut.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!potrivire) {
		return { ok: false, mesaj: `Versiune Node ilizibila: "${versiune}" (asteptat ${interval})` };
	}
	const major = Number(potrivire[1]);

	const conditii = String(interval ?? '').trim().split(/\s+/).filter(Boolean);
	if (conditii.length === 0) {
		return { ok: false, mesaj: `Interval engines invalid: "${interval}"` };
	}

	for (const conditie of conditii) {
		const c = conditie.match(/^(>=|<=|>|<|=)?\s*v?(\d+)/);
		if (!c) return { ok: false, mesaj: `Conditie engines nesuportata: "${conditie}" (interval ${interval})` };
		const operator = c[1] || '=';
		const prag = Number(c[2]);
		const okConditie =
			operator === '>=' ? major >= prag :
			operator === '<=' ? major <= prag :
			operator === '>' ? major > prag :
			operator === '<' ? major < prag :
			major === prag;
		if (!okConditie) {
			return {
				ok: false,
				mesaj: `Node ${brut} (major ${major}) nu satisface engines "${interval}"`,
			};
		}
	}

	return { ok: true, mesaj: `Node ${brut} satisface engines "${interval}"` };
}

function ruleaza() {
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
		return 1;
	}

	const rezultat = evalueazaAudit(date);
	if (!rezultat.valid) {
		console.error('auditGate: registrul npm nu a returnat un raport audit complet; verificarea esueaza fail-closed.');
		return 1;
	}

	console.log(`auditGate: ${rezultat.total} pachete vulnerabile in total.`);
	if (rezultat.permise.length > 0) {
		console.log(`  permise (low sau exceptie exacta documentata): ${rezultat.permise.length}`);
		for (const p of rezultat.permise) console.log(`    - ${p}`);
	}
	if (rezultat.blocate.length > 0) {
		console.error(`\nauditGate: ${rezultat.blocate.length} vulnerabilitati NEPERMISE:`);
		for (const p of rezultat.blocate) console.error(`    - ${p}`);
		console.error('\nRemediaza-le (preferabil prin `overrides` la nivel de patch).');
		console.error('O exceptie se adauga NUMAI cu pachet+range+advisory+motiv+expirare');
		console.error('si NUMAI cu acordul unui reviewer independent.');
		return 1;
	}

	console.log('\nauditGate: OK — nicio vulnerabilitate neacoperita.');
	return 0;
}

if (require.main === module) process.exit(ruleaza());

module.exports = {
	evalueazaAudit,
	evalueazaVersiuneNode,
	extrageAdvisories,
	exceptieValida,
	EXCEPTII_AUDIT,
	ruleaza,
};
