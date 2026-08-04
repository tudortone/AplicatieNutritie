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

/**
 * Ruleaza o cerere anulabila cu deadline strict.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} factory
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
async function callWithTimeout(factory, ms = 30000) {
	if (typeof factory !== 'function') {
		throw new TypeError(
			'callWithTimeout necesita o factory (signal) => Promise. O promisiune deja ' +
				'pornita nu poate fi anulata, deci deadline-ul ar fi doar decorativ.',
		);
	}

	const signal = AbortSignal.timeout(ms);

	try {
		return await factory(signal);
	} catch (eroare) {
		if (eroare?.name === 'TimeoutError' || eroare?.name === 'AbortError') {
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

module.exports = { TimeoutAiError, callWithTimeout, callWithSoftTimeout };
