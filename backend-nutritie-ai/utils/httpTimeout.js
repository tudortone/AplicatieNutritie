'use strict';

/**
 * Deadline-uri pentru apelurile catre furnizorii AI.
 *
 * Varianta anterioara (callWithTimeout din server.js) instantia un AbortController,
 * dar `signal` nu ajungea la niciun fetch: toate call-site-urile ii pasau o
 * promisiune DEJA pornita. Rezultatul: `Promise.race` respingea cererea catre
 * client, in timp ce socketul catre OpenAI/Groq/Gemini ramanea deschis si
 * raspunsul continua sa fie generat si facturat. Timeout-ul era cosmetic.
 *
 * Aici forma canonica accepta EXCLUSIV o factory care primeste `signal`, deci
 * anularea este reala la nivel de transport. Forma "soft" ramane disponibila
 * pentru SDK-urile care nu accepta AbortSignal, dar este numita explicit asa,
 * ca nimeni sa nu o foloseasca din inertie.
 */

class TimeoutAiError extends Error {
	constructor(ms) {
		super(`Cererea AI a expirat dupa ${ms}ms.`);
		this.name = 'TimeoutAiError';
		this.cod = 'AI_TIMEOUT';
	}
}

class ClientAbortError extends Error {
	constructor() {
		super('Cererea AI a fost anulata de client.');
		this.name = 'AbortError';
		this.cod = 'CLIENT_ABORTED';
	}
}

function esteAnulatDeClient(eroare, signalExtern) {
	return Boolean(
		signalExtern?.aborted
		|| eroare?.cod === 'CLIENT_ABORTED'
		|| eroare?.cod === 'REQUEST_ABORTED'
		|| (eroare?.name === 'AbortError' && eroare?.cod !== 'AI_TIMEOUT'),
	);
}

/**
 * Construieste un deadline global per cerere AI, combinat optional cu
 * `signalExtern` (deconectarea clientului). Expune `timpRamasMs()` pentru a
 * margini fiecare incercare individuala la bugetul ramas.
 */
function creeazaDeadlineCerere(ms, signalExtern) {
	const deadlineMs = Math.max(1, Number(ms) || 30000);
	const expiraLa = Date.now() + deadlineMs;
	const semnalTimeout = AbortSignal.timeout(deadlineMs);
	const signal = signalExtern ? AbortSignal.any([semnalTimeout, signalExtern]) : semnalTimeout;
	return {
		signal,
		expiraLa,
		timpRamasMs: () => Math.max(0, expiraLa - Date.now()),
		esteExpirat: () => semnalTimeout.aborted || Date.now() >= expiraLa,
		esteAnulatDeClient: () => Boolean(signalExtern?.aborted),
	};
}

/**
 * Ruleaza o cerere cu deadline strict, optional anulabila si din exterior.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} factory
 * @param {number} [ms]
 * @param {AbortSignal} [signalExtern] — aborteaza cererea la deconectarea
 *   clientului (S4-04); combinat cu timeout-ul prin AbortSignal.any
 * @returns {Promise<T>}
 */
async function callWithTimeout(factory, ms = 30000, signalExtern) {
	if (typeof factory !== 'function') {
		throw new TypeError(
			'callWithTimeout necesita o factory (signal) => Promise. O promisiune deja ' +
				'pornita nu poate fi anulata, deci deadline-ul ar fi doar decorativ.',
		);
	}

	if (signalExtern?.aborted) {
		throw new ClientAbortError();
	}
	if (!Number.isFinite(ms) || ms <= 0) {
		throw new TimeoutAiError(ms);
	}

	const signalTimeout = AbortSignal.timeout(ms);
	const signal = signalExtern ? AbortSignal.any([signalTimeout, signalExtern]) : signalTimeout;

	try {
		return await factory(signal);
	} catch (eroare) {
		// Pastram AbortError distinct cand clientul s-a deconectat, ca buclele
		// din cascada/chat sa iasa imediat fara sa incerce alti furnizori.
		if (signalExtern?.aborted) {
			throw new ClientAbortError();
		}
		if (signalTimeout.aborted || eroare?.name === 'TimeoutError' || eroare?.name === 'AbortError') {
			throw new TimeoutAiError(ms);
		}
		throw eroare;
	}
}

/**
 * Deadline pentru promisiuni care NU pot fi anulate (ex. @google/generative-ai).
 * Cererea continua in fundal; singurul castig este ca utilizatorul nu asteapta.
 * Rejectia intarziata primeste explicit un handler, ca sa nu depinda de faptul
 * ca `Promise.race` o absoarbe implicit.
 */
async function callWithSoftTimeout(promise, ms = 30000) {
	if (typeof promise?.then !== 'function') {
		throw new TypeError('callWithSoftTimeout necesita o promisiune.');
	}

	promise.catch(() => {});

	let idTimer;
	const asteptare = new Promise((_, reject) => {
		idTimer = setTimeout(() => reject(new TimeoutAiError(ms)), ms);
		if (typeof idTimer.unref === 'function') idTimer.unref();
	});

	try {
		return await Promise.race([promise, asteptare]);
	} finally {
		clearTimeout(idTimer);
	}
}

module.exports = {
	TimeoutAiError,
	ClientAbortError,
	esteAnulatDeClient,
	creeazaDeadlineCerere,
	callWithTimeout,
	callWithSoftTimeout,
};
