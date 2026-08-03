'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Limitatoare de trafic.
 *
 * Rezolva C1. Varianta anterioara construia cheia de limitare din claim-ul `sub`
 * al unui JWT decodat cu Buffer.from(..., 'base64'), FARA verificarea semnaturii,
 * intr-un middleware montat pe `/api/` care rulează inaintea lui requireAuth.
 * Consecinta: oricine putea trimite un token fabricat, cu `sub` diferit la fiecare
 * cerere, si primea o fereastra noua de 100 de cereri de fiecare data.
 *
 * REGULA, fara exceptii: nicio decizie de limitare nu se ia pe baza unui token
 * nevalidat. Cererile neautentificate se limiteaza pe IP, mai strict. Limitarea
 * per utilizator se aplica DOAR dupa requireAuth, cand req.user provine dintr-o
 * validare reala (Supabase Auth sau Clerk verifyToken).
 */

/** Cheie derivata din IP. Pentru IPv6 grupam /64 ca sa nu fie banal de rotit. */
const ipFallbackKey = (req) => {
	const ip = req.ip || req.socket?.remoteAddress || 'unknown';
	if (ip.includes(':')) return `ip6:${ip.split(':').slice(0, 4).join(':')}`;
	return `ip4:${ip}`;
};

/**
 * Cheie per utilizator. Foloseste EXCLUSIV req.user, populat de requireAuth.
 * Daca lipseste (middleware montat gresit, inaintea autentificarii), cade pe IP
 * in loc sa citeasca headere — asa un montaj gresit degradeaza securitatea in
 * mod controlat, nu o dezactiveaza.
 */
const cheieIdentitateVerificata = (req) =>
	req.user?.id ? `user:${req.user.id}` : ipFallbackKey(req);

const mesaj = (text) => ({ eroare: text });

/**
 * Creeaza setul de limitatoare.
 *
 * @param {object} [optiuni]
 * @param {object} [optiuni.store] Store partajat (ex. Redis). Obligatoriu daca
 *   backend-ul ruleaza pe mai multe instante: MemoryStore este per proces, deci
 *   limitele efective se inmultesc cu numarul de instante.
 */
function creeazaLimitatoare({ store } = {}) {
	const comun = {
		standardHeaders: true,
		legacyHeaders: false,
		...(store ? { store } : {}),
	};

	// Plasa de siguranta pentru trafic neautentificat. Se monteaza INAINTE de
	// requireAuth. Strict, pentru ca inca nu stim cine e la capatul celalalt.
	const preAuthLimiter = rateLimit({
		...comun,
		windowMs: 15 * 60 * 1000,
		max: 30,
		keyGenerator: ipFallbackKey,
		message: mesaj('Prea multe cereri. Incearca mai tarziu.'),
	});

	// Limitator general per utilizator. Se monteaza DUPA requireAuth.
	const generalLimiter = rateLimit({
		...comun,
		windowMs: 15 * 60 * 1000,
		max: 100,
		keyGenerator: cheieIdentitateVerificata,
		message: mesaj('Prea multe cereri. Incearca mai tarziu.'),
	});

	// /api/ai-status este public si interogat prin polling, deci limita e generoasa,
	// dar pe IP — nu pe un `sub` pe care oricine il poate inventa.
	const statusLimiter = rateLimit({
		...comun,
		windowMs: 60 * 1000,
		max: 120,
		keyGenerator: ipFallbackKey,
		message: mesaj('Prea multe cereri de status. Incearca in cateva secunde.'),
	});

	// Endpoint-uri AI: scumpe, deci strict per utilizator autentificat.
	const aiLimiter = rateLimit({
		...comun,
		windowMs: 60 * 1000,
		max: 15,
		keyGenerator: cheieIdentitateVerificata,
		message: mesaj(
			'Ai depasit limita de 15 cereri pe minut pentru AI. Te rugam sa astepti un minut.',
		),
	});

	return { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter };
}

module.exports = {
	ipFallbackKey,
	cheieIdentitateVerificata,
	creeazaLimitatoare,
};
