'use strict';

/**
 * Sanitizare de intrare.
 *
 * Trei defecte corectate fata de varianta anterioara:
 *
 * 1. `req.query = sanitizeObject(req.query)` — pe Express 5, `query` este un
 *    getter pe prototip. In modul non-strict atribuirea esua TACUT, deci
 *    sanitizarea query-ului nu se intampla niciodata; in modul strict ar fi
 *    aruncat TypeError pe fiecare cerere cu query string. Ambele variante sunt
 *    inacceptabile intr-un middleware global. Aici query-ul se curata la
 *    citire, prin `citesteQuery()`.
 * 2. Docstring-ul promitea sanitizarea lui `req.params`; codul nu o facea.
 *    Acum o face.
 * 3. Eliminarea globala a tag-urilor HTML (`/<[^>]*>/g`) distrugea date
 *    legitime: "branza <30% grasime" devenea "branza". Pasul global curata
 *    doar caractere de control si plafoneaza lungimea; eliminarea HTML se
 *    aplica tintit, la persistare, prin sanitizeName/sanitizeText.
 */

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
// B-5: se elimina doar tag-uri plauzibile, cu nume de element valid. Regexul vechi
// (/<[^>]*>/) trata orice "<" ca inceput de tag: "branza <30% grasime si >5g sare"
// devenea "branza 5g sare" — pierdere de date introduse de utilizator.
const HTML_TAGS = /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?>/g;
const CHEI_INTERZISE = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_NODURI = 5000;

/**
 * Sabloane de prompt injection.
 *
 * Un denylist NU este un control de securitate — este telemetrie. Apararea reala
 * este structurala: mesaje cu rol separat, fara interpolare de text controlat de
 * client in instructiunile de sistem (vezi utils/promptSafety.js).
 * Varianta anterioara continea exclusiv sabloane in engleza, intr-o aplicatie
 * romaneasca. Lista de mai jos acopera si romana, dar ramane o plasa cu ochiuri.
 */
const PROMPT_INJECTION_PATTERNS = [
	/ignore (all )?(previous|prior|above)/i,
	/disregard (all )?previous/i,
	/forget (all )?previous/i,
	/you are now/i,
	/pretend (you are|to be)/i,
	/act as (if|though|a)/i,
	/new instructions?:/i,
	/system prompt/i,
	/reveal (your|the) (prompt|instructions)/i,
	/ignor[aăâ] (toate )?(instruc[tț]iunile|mesajele) (anterioare|de mai sus|precedente)/i,
	/uit[aă] (tot|toate|instruc[tț]iunile)/i,
	/de acum (e[sș]ti|vei fi)/i,
	/comport[aă]-te ca/i,
	/prefă-te c[aă]/i,
	/instruc[tț]iuni noi:/i,
	/arat[aă]-mi (prompt-?ul|instruc[tț]iunile)/i,
	/\[system\]/i,
	/<\|system\|>/i,
	/<\|user\|>/i,
	/<\|im_start\|>/i,
	/\[\/?INST\]/i,
];

/** Curata un text: caractere de control, tag-uri HTML, whitespace, lungime. */
function sanitizeText(input, maxLength = 500) {
	if (typeof input !== 'string') return '';
	return input
		.replace(CONTROL_CHARS, '')
		.replace(HTML_TAGS, '')
		.replace(/\s+/g, ' ')
		.trim()
		.substring(0, maxLength);
}

/** Idem, pentru nume de alimente/mese. Pastreaza diacriticele. */
function sanitizeName(input, maxLength = 150) {
	return sanitizeText(input, maxLength);
}

/** Curatare minima, nedistructiva: doar caractere de control si lungime. */
function curataMinim(input, maxLength = 2000) {
	if (typeof input !== 'string') return input;
	return input.replace(CONTROL_CHARS, '').substring(0, maxLength);
}

function detectPromptInjection(text) {
	if (typeof text !== 'string' || !text.trim()) return false;
	return PROMPT_INJECTION_PATTERNS.some((sablon) => sablon.test(text));
}

/**
 * Curata recursiv un obiect. Plafon si pe adancime, si pe numar de noduri:
 * un array cu 100.000 de elemente sub limita de 1 MB ar fi blocat event loop-ul.
 */
function sanitizeObject(obj, maxDepth = 10, buget = { noduri: MAX_NODURI }) {
	if (maxDepth <= 0 || buget.noduri <= 0) return Array.isArray(obj) ? [] : {};

	if (Array.isArray(obj)) {
		const rezultat = [];
		for (const element of obj) {
			if (buget.noduri-- <= 0) break;
			rezultat.push(sanitizeValoare(element, maxDepth - 1, buget));
		}
		return rezultat;
	}

	if (obj !== null && typeof obj === 'object') {
		const rezultat = {};
		for (const cheie of Object.keys(obj)) {
			if (CHEI_INTERZISE.has(cheie)) continue;
			if (buget.noduri-- <= 0) break;
			rezultat[cheie] = sanitizeValoare(obj[cheie], maxDepth - 1, buget);
		}
		return rezultat;
	}

	return obj;
}

function sanitizeValoare(valoare, maxDepth, buget) {
	if (typeof valoare === 'string') return curataMinim(valoare, 2000);
	if (valoare !== null && typeof valoare === 'object') {
		return sanitizeObject(valoare, maxDepth, buget);
	}
	return valoare;
}

/** Curata in loc, pentru obiecte care nu pot fi reatribuite (ex. req.params). */
function curataInLoc(tinta) {
	if (!tinta || typeof tinta !== 'object') return;
	for (const cheie of Object.keys(tinta)) {
		if (CHEI_INTERZISE.has(cheie)) {
			delete tinta[cheie];
			continue;
		}
		const valoare = tinta[cheie];
		if (typeof valoare === 'string') tinta[cheie] = curataMinim(valoare, 2000);
	}
}

/**
 * Citeste un parametru de query curatat. De folosit in locul lui req.query.x,
 * pentru ca middleware-ul nu poate rescrie getter-ul din Express 5.
 */
function citesteQuery(req, cheie, maxLength = 200) {
	const valoare = req?.query?.[cheie];
	if (Array.isArray(valoare)) return sanitizeText(valoare[0], maxLength);
	if (typeof valoare !== 'string') return '';
	return sanitizeText(valoare, maxLength);
}

/** Middleware: curata req.body (reatribuibil) si req.params (in loc). */
function sanitizeRequest(req, _res, next) {
	if (req.body && typeof req.body === 'object') {
		req.body = sanitizeObject(req.body);
	}
	curataInLoc(req.params);
	next();
}

module.exports = {
	sanitizeText,
	sanitizeName,
	sanitizeObject,
	sanitizeRequest,
	detectPromptInjection,
	curataMinim,
	curataInLoc,
	citesteQuery,
	PROMPT_INJECTION_PATTERNS,
};
