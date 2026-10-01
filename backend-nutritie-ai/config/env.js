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
	GROQ_TEXT_MODELS: 'openai/gpt-oss-120b,qwen/qwen3.6-27b',
	GOOGLE_PLAY_PACKAGE_NAME: 'com.totsrl.getflo',
	GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS: 'premium_monthly,premium_annual',
	GOOGLE_PLAY_CREDIT_PRODUCT_IDS: 'getflow_credits_10,getflow_credits_30',
	GOOGLE_APPLICATION_CREDENTIALS: 'C:\\secure\\google-play-service-account-test.json',
	GOOGLE_PLAY_PUBSUB_AUDIENCE: 'https://api.nutriai.ro/api/v1/webhooks/google-play',
	GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL: 'play-rtdn@nutriai.iam.gserviceaccount.com',
	ADMOB_REWARDED_AD_UNIT_ID: '3566028223',
	ADMOB_REWARDED_REWARD_AMOUNT: '1',
	ADMOB_REWARDED_REWARD_ITEM: 'Flow Credit',
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

function intregDinEnv(valoare, implicit, { minimZero = false } = {}) {
	const numar = Number(valoare);
	const admisibil = minimZero ? numar >= 0 : numar > 0;
	return Number.isInteger(numar) && admisibil ? numar : implicit;
}

function urlPublicSigur(valoare, protocoale) {
	try {
		const url = new URL(String(valoare || ''));
		const host = url.hostname.toLowerCase();
		const hostInvalid = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
			host === 'example.com' || host.endsWith('.example.com') || host.endsWith('.invalid') || host.endsWith('.test');
		return protocoale.includes(url.protocol) && !hostInvalid;
	} catch {
		return false;
	}
}

function parePlaceholder(valoare) {
	return /(?:\[redacted\]|placeholder|change[-_ ]?me|de[-_ ]completat|key[-_ ]de[-_ ]test|(?:^|[_-])dummy(?:$|[_-])|(?:^|[_-])test(?:$|[_-]))/i
		.test(String(valoare || ''));
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

	const clerkWebhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SECRET;

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
	const admobRewardedAdUnitId = process.env.ADMOB_REWARDED_AD_UNIT_ID;
	// P0-BILLING-01: Google Play este singura autoritate comerciala pentru Android.
	// Configuratia este obligatorie si validata la boot; nu acceptam produse sau
	// package names implicite in productie.
	const googlePlayProductIds = listaDinEnv(process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS);
	const googlePlayCreditProductIds = listaDinEnv(process.env.GOOGLE_PLAY_CREDIT_PRODUCT_IDS);
	const playIntegrityMode = process.env.PLAY_INTEGRITY_MODE || 'off';
	if (!['off', 'observe', 'enforce'].includes(playIntegrityMode)) {
		opreste('PLAY_INTEGRITY_MODE trebuie sa fie off, observe sau enforce.');
	}
	if (
		esteProductie &&
		(!process.env.GOOGLE_PLAY_PACKAGE_NAME ||
			googlePlayProductIds.length === 0 ||
			googlePlayCreditProductIds.length === 0 ||
			!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
			!process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE ||
			!process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL)
	) {
		opreste(
			'GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS, GOOGLE_PLAY_CREDIT_PRODUCT_IDS, ' +
			'GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PLAY_PUBSUB_AUDIENCE si ' +
			'GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL sunt obligatorii in productie.',
		);
	}
	if (esteProductie && process.env.GOOGLE_PLAY_PACKAGE_NAME !== 'com.totsrl.getflo') {
		opreste('GOOGLE_PLAY_PACKAGE_NAME trebuie sa fie package-ul autoritativ com.totsrl.getflo.');
	}
	if (
		esteProductie &&
		(googlePlayProductIds.length !== new Set(googlePlayProductIds).size ||
			googlePlayProductIds.some((productId) => !/^[a-z0-9][a-z0-9._]*$/.test(productId)))
	) {
		opreste(
			'GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS trebuie sa fie o lista unica de identificatori Play valizi.',
		);
	}
	if (
		esteProductie &&
		(googlePlayCreditProductIds.length !== new Set(googlePlayCreditProductIds).size ||
			googlePlayCreditProductIds.some((productId) => !/^[a-z0-9][a-z0-9._]*$/.test(productId)))
	) {
		opreste('GOOGLE_PLAY_CREDIT_PRODUCT_IDS trebuie sa fie o lista unica de identificatori Play valizi.');
	}
	if (esteProductie && !urlPublicSigur(process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE, ['https:'])) {
		opreste('GOOGLE_PLAY_PUBSUB_AUDIENCE trebuie sa fie un URL HTTPS public real in productie.');
	}
	if (
		esteProductie &&
		(!process.env.ADMOB_REWARDED_AD_UNIT_ID ||
			!process.env.ADMOB_REWARDED_REWARD_AMOUNT ||
			!process.env.ADMOB_REWARDED_REWARD_ITEM)
	) {
		opreste(
			'ADMOB_REWARDED_AD_UNIT_ID, ADMOB_REWARDED_REWARD_AMOUNT si ' +
			'ADMOB_REWARDED_REWARD_ITEM sunt obligatorii in productie.',
		);
	}
	if (
		esteProductie &&
		(process.env.ADMOB_REWARDED_AD_UNIT_ID !== '3566028223' ||
			process.env.ADMOB_REWARDED_REWARD_AMOUNT !== '1' ||
			process.env.ADMOB_REWARDED_REWARD_ITEM !== 'Flow Credit')
	) {
		opreste('Contractul AdMob Rewarded trebuie sa fie 3566028223 / 1 / Flow Credit.');
	}
	if (
		esteProductie &&
		!/^[-a-z0-9.]+@[-a-z0-9.]+\.iam\.gserviceaccount\.com$/i.test(
			process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL,
		)
	) {
		opreste('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL trebuie sa fie un cont de serviciu Google valid.');
	}
	// S4-07: fara cheile Clerk, autentificarea raspunde 401 din identitate.js la
	// prima cerere, iar fara ImageKit, pozele 500 in webhooks/ai. Fail-fast la
	// boot, aliniat cu GEMINI/REDIS/Google Play de mai sus.
	if (esteProductie && (!process.env.CLERK_SECRET_KEY || !clerkWebhookSecret)) {
		opreste(
			'CLERK_SECRET_KEY si CLERK_WEBHOOK_SIGNING_SECRET sunt obligatorii in productie ' +
				'(autentificare + webhook-uri Clerk).',
		);
	}
	if (
		esteProductie &&
		(!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT)
	) {
		opreste(
			'IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY si IMAGEKIT_URL_ENDPOINT sunt obligatorii in productie ' +
				'(upload poze ImageKit).',
		);
	}
	if (esteProductie && (!process.env.SENTRY_DSN || !process.env.SENTRY_PII_SALT)) {
		opreste('SENTRY_DSN si SENTRY_PII_SALT sunt obligatorii in productie (observabilitate fara PII).');
	}
	if (esteProductie && !process.env.TRIGGER_SECRET_KEY) {
		opreste('TRIGGER_SECRET_KEY este obligatoriu in productie (analiza asincrona Trigger.dev).');
	}
	if (esteProductie && process.env.GDPR_WORKER_ACTIV !== '1') {
		opreste('GDPR_WORKER_ACTIV trebuie sa fie "1" in productie (reluarea stergerilor externe).');
	}

	if (esteProductie) {
		if (!urlPublicSigur(process.env.SUPABASE_URL, ['https:'])) {
			opreste('SUPABASE_URL trebuie sa fie un URL HTTPS public real in productie.');
		}
		if (!urlPublicSigur(process.env.IMAGEKIT_URL_ENDPOINT, ['https:'])) {
			opreste('IMAGEKIT_URL_ENDPOINT trebuie sa fie un URL HTTPS public real in productie.');
		}
		if (!urlPublicSigur(process.env.SENTRY_DSN, ['https:']) || !/^https:\/\/[^@\s/]+@[^/\s]+\/.+/.test(process.env.SENTRY_DSN)) {
			opreste('SENTRY_DSN trebuie sa fie DSN-ul HTTPS complet din Sentry.');
		}
		if (!urlPublicSigur(process.env.REDIS_URL, ['rediss:'])) {
			opreste('REDIS_URL trebuie sa foloseasca rediss:// in productie.');
		}
		if (origini.some((origine) => !urlPublicSigur(origine, ['https:']))) {
			opreste('CORS_ORIGINS poate contine numai origini HTTPS publice in productie.');
		}
		if (!process.env.CLERK_SECRET_KEY.startsWith('sk_live_')) {
			opreste('CLERK_SECRET_KEY trebuie sa fie cheia sk_live_ a instantei Clerk de productie.');
		}
		if (!clerkWebhookSecret.startsWith('whsec_')) {
			opreste('CLERK_WEBHOOK_SIGNING_SECRET trebuie sa fie secretul whsec_ al webhook-ului Clerk.');
		}
		if (!process.env.TRIGGER_SECRET_KEY.startsWith('tr_prod_')) {
			opreste('TRIGGER_SECRET_KEY trebuie sa fie cheia tr_prod_ a mediului Trigger.dev de productie.');
		}
		if (process.env.SENTRY_PII_SALT.length < 32 || process.env.SENTRY_PII_SALT === 'nutriai-telemetry') {
			opreste('SENTRY_PII_SALT trebuie sa fie un secret aleator unic, de minimum 32 caractere.');
		}
		for (const cheie of [
			'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY',
			'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL',
			'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY',
		]) {
			if (parePlaceholder(process.env[cheie])) opreste(`${cheie} contine un placeholder de configurare.`);
		}
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
			groqTextModels: (() => {
				const dinEnv = listaDinEnv(process.env.GROQ_TEXT_MODELS);
				return dinEnv.length > 0 ? dinEnv : ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'];
			})(),
			groqVisionModels: listaDinEnv(process.env.GROQ_VISION_MODELS),
			// Plafon de cereri AI simultane pe instanta. Fara el, 20 de utilizatori
			// paraleli inseamna 20 de imagini base64 de pana la 6,7 MB tinute in heap
			// pe toata durata cascadei de furnizori.
			maxConcurenta: intregDinEnv(process.env.AI_MAX_CONCURENTA, 4),
			maxCoada: intregDinEnv(process.env.AI_MAX_COADA, 12, { minimZero: true }),
			photoTriggerConcurrency: intregDinEnv(process.env.AI_PHOTO_TRIGGER_CONCURRENCY, 8),
			chatGlobalConcurrency: intregDinEnv(process.env.AI_CHAT_GLOBAL_CONCURRENCY, 12),
			// Plafon de apeluri de furnizori per cerere AI (anti-cost). Peste el,
			// cascada inceteaza sa mai incerce alti provideri la acelasi upload.
			// 8 = intregul lant de fallback cu cate o cheie (1 OpenAI + 2 Groq + 3
			// Gemini + 1 OpenRouter). 0 (sau absenta) = nelimitat.
			maxApeluriPerRequest: (() => {
				const valoare = Number(process.env.AI_MAX_APELURI_PER_REQUEST);
				return Number.isFinite(valoare) && valoare >= 0 ? valoare : 8;
			})(),
		}),
		flowCredits: Object.freeze({
			dailyLimit: intregDinEnv(process.env.FLOW_CREDITS_DAILY_LIMIT, 3, { minimZero: true }),
			rewardedDailyLimit: intregDinEnv(process.env.FLOW_REWARDED_DAILY_LIMIT, 5, { minimZero: true }),
			premiumDailyFairUse: intregDinEnv(process.env.PREMIUM_PHOTO_DAILY_FAIR_USE, 50),
		}),
		admob: Object.freeze({
			rewardedAdUnitId: process.env.ADMOB_REWARDED_AD_UNIT_ID || null,
			rewardedAmount: process.env.ADMOB_REWARDED_REWARD_AMOUNT || null,
			rewardedItem: process.env.ADMOB_REWARDED_REWARD_ITEM || null,
		}),
		clerkSecretKey: process.env.CLERK_SECRET_KEY || null,
		// Numele canonic este CLERK_WEBHOOK_SIGNING_SECRET; aliasul istoric
		// CLERK_WEBHOOK_SECRET rămâne acceptat temporar pentru deploy-uri existente.
		clerkWebhookSecret: clerkWebhookSecret || null,
		sentryDsn: process.env.SENTRY_DSN || null,
		triggerSecretKey: process.env.TRIGGER_SECRET_KEY || null,
		// Store partajat Redis (B-10). Lipsește => MemoryStore per-proces.
		redisUrl: process.env.REDIS_URL || null,
		// Autoritatea comerciala Android este backend-ul, alimentat exclusiv de
		// Google Play Developer API si RTDN autentificat.
		googlePlay: Object.freeze({
			packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || null,
			productIds: Object.freeze([...googlePlayProductIds]),
			creditProductIds: Object.freeze([...googlePlayCreditProductIds]),
			pubsubAudience: process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE || null,
			pubsubServiceAccountEmail: process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL || null,
		}),
		playIntegrity: Object.freeze({
			mode: playIntegrityMode,
			packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || null,
		}),
		admob: Object.freeze({
			rewardedAdUnitId: admobRewardedAdUnitId,
			rewardedAmount: admobRewardedAmount,
			rewardedItem: admobRewardedItem,
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
