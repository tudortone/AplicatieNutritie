'use strict';

const { sanitizeText, sanitizeName, detectPromptInjection } = require('./sanitize');

/**
 * Pregatirea datelor controlate de client inainte de a intra intr-un prompt.
 *
 * Gaura anterioara: detectPromptInjection se aplica DOAR pe ultimul mesaj din
 * /api/chat. Restul istoricului (10 mesaje) si `current_ingredients` din
 * /api/vision-fallback erau interpolate brut, deci atacatorul isi punea sarcina
 * utila pe pozitia 0 si trecea nestingherit.
 *
 * Regula aplicata aici: NIMIC controlat de client nu ajunge intr-un prompt fara
 * sa treaca prin acest modul. Un denylist de sabloane nu e o garantie — de aceea
 * mesajele suspecte sunt ELIMINATE, nu doar semnalate, iar istoricul este trimis
 * ca mesaje cu rol separat, nu concatenat in text liber.
 */

const ROLURI_PERMISE = new Set(['user', 'assistant']);
const MAX_MESAJE = 10;
const MAX_LUNGIME_MESAJ = 800;

/**
 * Normalizeaza si filtreaza istoricul de conversatie.
 * @returns {{ mesaje: Array<{role: string, content: string}>, respinse: number }}
 */
function construiesteIstoricSigur(istoric, { maxMesaje = MAX_MESAJE } = {}) {
	if (!Array.isArray(istoric)) return { mesaje: [], respinse: 0 };

	const mesaje = [];
	let respinse = 0;

	for (const brut of istoric.slice(-maxMesaje)) {
		if (!brut || typeof brut !== 'object') {
			respinse += 1;
			continue;
		}

		const rolBrut = brut.role === 'assistant' || brut.isUser === false ? 'assistant' : 'user';
		if (!ROLURI_PERMISE.has(rolBrut)) {
			respinse += 1;
			continue;
		}

		const continut = sanitizeText(brut.content ?? brut.text ?? '', MAX_LUNGIME_MESAJ);
		if (!continut) {
			respinse += 1;
			continue;
		}

		// Mesajele modelului nu sunt de incredere nici ele: pot contine text
		// reflectat dintr-o injectie anterioara.
		if (detectPromptInjection(continut)) {
			respinse += 1;
			continue;
		}

		mesaje.push({ role: rolBrut, content: continut });
	}

	return { mesaje, respinse };
}

/** Transforma istoricul in text, pentru modelele fara API de conversatie. */
function istoricCaText(mesaje) {
	return mesaje
		.map((m) => `${m.role === 'assistant' ? 'Asistent' : 'Utilizator'}: ${m.content}`)
		.join('\n');
}

const MAX_INGREDIENTE = 50;

function numarSigur(valoare, { min = 0, max = 100000, implicit = null }) {
	const numar = Number(valoare);
	if (!Number.isFinite(numar)) return implicit;
	if (numar < min || numar > max) return implicit;
	return numar;
}

/**
 * Valideaza lista de ingrediente primita de la client inainte de a fi
 * serializata intr-un prompt. Inainte se folosea JSON.stringify direct pe
 * `req.body.current_ingredients`, deci orice text putea fi injectat in prompt.
 *
 * @returns {{ ok: boolean, eroare?: string, ingrediente?: Array<object> }}
 */
function valideazaIngrediente(lista, { maxElemente = MAX_INGREDIENTE } = {}) {
	if (lista === undefined || lista === null) return { ok: true, ingrediente: [] };
	if (!Array.isArray(lista)) {
		return { ok: false, eroare: 'Lista de ingrediente trebuie sa fie un array.' };
	}
	if (lista.length > maxElemente) {
		return {
			ok: false,
			eroare: `Prea multe ingrediente (maxim ${maxElemente}).`,
		};
	}

	const ingrediente = [];
	for (const brut of lista) {
		if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
			return { ok: false, eroare: 'Fiecare ingredient trebuie sa fie un obiect.' };
		}

		const nume = sanitizeName(brut.nume ?? brut.name ?? '', 80);
		if (!nume) {
			return { ok: false, eroare: 'Fiecare ingredient trebuie sa aiba un nume valid.' };
		}
		if (detectPromptInjection(nume)) {
			return { ok: false, eroare: 'Continut nepermis in lista de ingrediente.' };
		}

		ingrediente.push({
			nume,
			grame: numarSigur(brut.grame ?? brut.estimare_grame, {
				min: 0,
				max: 5000,
				implicit: null,
			}),
			calorii: numarSigur(brut.calorii, { min: 0, max: 10000, implicit: null }),
		});
	}

	return { ok: true, ingrediente };
}

module.exports = {
	construiesteIstoricSigur,
	istoricCaText,
	valideazaIngrediente,
	MAX_MESAJE,
};
