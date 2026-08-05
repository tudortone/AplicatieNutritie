'use strict';

require('dotenv').config();

/**
 * Configurare centralizata si validata la pornire.
 *
 * Inainte, citirea variabilelor de mediu era imprastiata prin server.js, cu
 * valori implicite ascunse in mijlocul rutelor. Consecinta: o variabila lipsa
 * nu se manifesta la pornire, ci abia la prima cerere a unui utilizator real.
 *
 * Aici totul e citit o singura data, validat fail-fast, si expus ca obiect
 * inghetat. Un deploy cu configuratie incompleta moare la boot, nu in productie.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const esteProductie = NODE_ENV === 'production';
const esteTest = NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

const VARIABILE_OBLIGATORII = [
	'SUPABASE_URL',
	'SUPABASE_ANON_KEY',
	'SUPABASE_SERVICE_ROLE_KEY',
];

// Valori inofensive folosite EXCLUSIV sub Jest, ca suita de teste sa nu depinda
// de un fisier .env local. Nu ajung niciodata intr-un proces de productie.
const IMPLICITE_TEST = {
	SUPABASE_URL: 'http://localhost:54321',
	SUPABASE_ANON_KEY: 'anon-key-de-test',
	SUPABASE_SERVICE_ROLE_KEY: 'service-role-de-test',
	GEMINI_API_KEY: 'gemini-key-de-test',
	GROQ_API_KEY: 'groq-key-de-test',
};

function opreste(mesaj) {
	console.error(`EROARE CRITICA DE CONFIGURARE: ${mesaj}`);
	process.exit(1);
}

function listaDinEnv(valoare) {
	return String(valoare || '')
		.split(',')
		.map((element) => element.trim())
		.filter(Boolean);
}

function numarDinEnv(valoare, implicit) {
	const numar = Number(valoare);
	return Number.isFinite(numar) && numar > 0 ? numar : implicit;
}

let configCache = null;

function incarcaConfig() {
	if (configCache) return configCache;

	if (esteTest) {
		for (const [cheie, valoare] of Object.entries(IMPLICITE_TEST)) {
			if (!process.env[cheie]) process.env[cheie] = valoare;
		}
	}

	const lipsa = VARIABILE_OBLIGATORII.filter((cheie) => !process.env[cheie]);
	if (lipsa.length > 0) {
		opreste(`Lipsesc variabilele obligatorii: ${lipsa.join(', ')}`);
	}

	// CORS: in productie nu exista varianta "orice origine". Inainte, absenta
	// variabilei ducea la origin: true, adica reflectarea oricarui Origin primit.
	const originiBrute = process.env.CORS_ORIGINS ?? (esteProductie ? '' : '*');
	const origini = listaDinEnv(originiBrute);
	const permiteOrice = origini.includes('*');

	if (esteProductie && (origini.length === 0 || permiteOrice)) {
		opreste(
			'CORS_ORIGINS trebuie sa contina o lista explicita de origini in productie ' +
				'(wildcard-ul "*" nu este acceptat).',
		);
	}
	if (!esteProductie && permiteOrice && !esteTest) {
		console.warn(
			'CORS_ORIGINS este "*": se accepta orice origine. Valabil doar in dezvoltare.',
		);
	}

	// B-3: cheia Gemini trebuie sa existe in productie. Fara ea, server.js ar porni
	// cu un literal placeholder si ar esua abia la prima cerere reala de utilizator.
	if (esteProductie && !process.env.GEMINI_API_KEY) {
		opreste('GEMINI_API_KEY este obligatorie in productie.');
	}
	// B-4: fara REDIS_URL, rate-limiting-ul si cooldown-urile sunt per-proces. Pe
	// mai multe instante, un atacator obtine de N ori limita configurata, iar
	// cooldown-urile furnizorilor AI nu se propaga intre instante.
	if (esteProductie && !process.env.REDIS_URL) {
		opreste('REDIS_URL este obligatoriu in productie (rate-limiting partajat intre instante).');
	}
	if (!esteProductie && !esteTest && !process.env.REDIS_URL) {
		console.warn(
			'REDIS_URL lipseste: rate-limiting-ul e per-proces. Acceptabil doar pe o singura instanta.',
		);
	}

	const config = Object.freeze({
		NODE_ENV,
		esteProductie,
		esteTest,
		port: numarDinEnv(process.env.PORT, 3000),
		host: process.env.HOST || '0.0.0.0',
		cors: Object.freeze({ origini, permiteOrice }),
		supabase: Object.freeze({
			url: process.env.SUPABASE_URL,
			anonKey: process.env.SUPABASE_ANON_KEY,
			serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
		}),
		ai: Object.freeze({
			geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
			// B-3: cheia trece prin config validata (obligatorie in productie), nu se
			// citeste direct din process.env in bootstrap.
			geminiApiKey: process.env.GEMINI_API_KEY || null,
			groqVisionModels: listaDinEnv(process.env.GROQ_VISION_MODELS),
			// Plafon de cereri AI simultane pe instanta. Fara el, 20 de utilizatori
			// paraleli inseamna 20 de imagini base64 de pana la 6,7 MB tinute in heap
			// pe toata durata cascadei de furnizori.
			maxConcurenta: numarDinEnv(process.env.AI_MAX_CONCURENTA, 4),
			maxCoada: numarDinEnv(process.env.AI_MAX_COADA, 12),
			// Plafon de apeluri de furnizori per cerere AI (anti-cost). Peste el,
			// cascada inceteaza sa mai incerce alti provideri la acelasi upload.
			// 8 = intregul lant de fallback cu cate o cheie (1 OpenAI + 2 Groq + 3
			// Gemini + 1 OpenRouter). 0 (sau absenta) = nelimitat.
			maxApeluriPerRequest: (() => {
				const valoare = Number(process.env.AI_MAX_APELURI_PER_REQUEST);
				return Number.isFinite(valoare) && valoare >= 0 ? valoare : 8;
			})(),
		}),
		clerkSecretKey: process.env.CLERK_SECRET_KEY || null,
		clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET || process.env.CLERK_WEBHOOK_SIGNING_SECRET || null,
		sentryDsn: process.env.SENTRY_DSN || null,
		triggerSecretKey: process.env.TRIGGER_SECRET_KEY || null,
		// Store partajat Redis (B-10). Lipsește => MemoryStore per-proces.
		redisUrl: process.env.REDIS_URL || null,
		// Validare premium server-side (B-09). Lipsește => 503 pe /premium-status.
		revenuecat: Object.freeze({
			secretApiKey: process.env.REVENUECAT_SECRET_API_KEY || null,
		}),
		imagekit: Object.freeze({
			publicKey: process.env.IMAGEKIT_PUBLIC_KEY || null,
			privateKey: process.env.IMAGEKIT_PRIVATE_KEY || null,
			urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || null,
		}),
		keepAlive: Object.freeze({
			url: process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || null,
			intervalMinute: numarDinEnv(process.env.KEEP_ALIVE_INTERVAL_MINUTES, 14),
		}),
	});

	configCache = config;
	return config;
}

module.exports = { incarcaConfig, NODE_ENV, esteProductie, esteTest };
