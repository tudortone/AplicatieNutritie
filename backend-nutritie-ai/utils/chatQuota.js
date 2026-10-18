'use strict';

/**
 * Plafon zilnic independent pentru AI Chat (Groq / Gemini fallback).
 *
 * Distinct de creditele Foto AI (Photo AI Flow Credits):
 * - Chatul NU consumă credite plătite sau cota de analize foto.
 * - Utilizatorii Free au o cotă zilnică de 10 mesaje (configurabilă).
 * - Utilizatorii Premium au 150 mesaje/zi (fair-use).
 * - Testerii au 500 mesaje/zi; Adminii au acces nelimitat.
 * - Atomic: rollback la erori de provider (5xx, 429) sau deconectare client.
 */

const { creeazaContorPartajat } = require('./contorPartajat');
const { rezumatEroareSigur } = require('./sentrySanitize');

const LIMITA_FREE_IMPLICITA = Number(process.env.CHAT_LIMITA_ZI_FREE) || 10;
const LIMITA_PREMIUM_IMPLICITA = Number(process.env.CHAT_LIMITA_ZI_PREMIUM) || 150;
const LIMITA_TESTER_IMPLICITA = Number(process.env.CHAT_LIMITA_ZI_TESTER) || 500;
const FEREASTRA_MS_IMPLICITA = 24 * 60 * 60 * 1000;

function calculeazaMsPanaLaMiezulNoptiiUtc() {
  const acum = new Date();
  const miezulNoptii = new Date(Date.UTC(
    acum.getUTCFullYear(),
    acum.getUTCMonth(),
    acum.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(60 * 1000, miezulNoptii.getTime() - acum.getTime());
}

function creeazaServiciuChatQuota({
  contor = null,
  billingService = null,
  limitaFree = LIMITA_FREE_IMPLICITA,
  limitaPremium = LIMITA_PREMIUM_IMPLICITA,
  limitaTester = LIMITA_TESTER_IMPLICITA,
  fereastraMs = null,
} = {}) {
  const sursa = contor || creeazaContorPartajat({
    url: process.env.REDIS_URL,
    prefix: 'nutri:quota-chat',
  });

  async function verificaEstePremium(userId) {
    if (!billingService || typeof billingService.getPaidEntitlement !== 'function' || !userId) {
      return false;
    }
    try {
      const paid = await billingService.getPaidEntitlement({ userId });
      return paid?.premium === true;
    } catch {
      return false;
    }
  }

  function cheieUtilizator(userId) {
    const dataAzi = new Date().toISOString().slice(0, 10);
    return `${userId}:${dataAzi}`;
  }

  async function obtineCota(user) {
    const userId = user?.id;
    if (!userId) {
      return { total: limitaFree, consumate: 0, ramase: limitaFree, tier: 'free', reseteazaLa: new Date().toISOString() };
    }

    if (user?.esteAdmin) {
      return { total: 999999, consumate: 0, ramase: 999999, tier: 'admin', reseteazaLa: null };
    }

    const estePremium = await verificaEstePremium(userId);
    const esteTester = user?.esteTester === true;
    const tier = esteTester ? 'tester' : (estePremium ? 'premium' : 'free');
    const limita = esteTester ? limitaTester : (estePremium ? limitaPremium : limitaFree);

    const cheie = cheieUtilizator(userId);
    const secundeRamase = await sursa.ttl(cheie);
    const oreRamase = secundeRamase > 0 ? Math.ceil(secundeRamase / 3600) : 24;

    const msTtl = fereastraMs || calculeazaMsPanaLaMiezulNoptiiUtc();
    const reseteazaLa = new Date(Date.now() + (secundeRamase > 0 ? secundeRamase * 1000 : msTtl)).toISOString();

    // Deducem valoarea curentă atomic prin increment + decrement imediat
    const countTest = await sursa.increment(cheie, msTtl);
    if (typeof sursa.decrement === 'function') {
      await Promise.resolve(sursa.decrement(cheie)).catch(() => {});
    }
    const consumatReal = Math.max(0, countTest - 1);
    const ramase = Math.max(0, limita - consumatReal);

    return {
      total: limita,
      consumate: consumatReal,
      ramase,
      tier,
      oreRamase,
      reseteazaLa,
    };
  }

  async function middlewareCotaChat(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        eroare: 'Acces neautorizat. Token lipsă sau nevalidat.',
      });
    }

    if (req.user?.esteAdmin) {
      res.setHeader('X-AI-Chat-Quota-Tier', 'admin');
      res.setHeader('X-AI-Chat-Quota-Remaining', '999999');
      res.setHeader('X-AI-Chat-Quota-Total', '999999');
      return next();
    }

    const estePremium = await verificaEstePremium(userId);
    const esteTester = req.user?.esteTester === true;
    const tier = esteTester ? 'tester' : (estePremium ? 'premium' : 'free');
    const limita = esteTester ? limitaTester : (estePremium ? limitaPremium : limitaFree);

    const cheie = cheieUtilizator(userId);
    const msTtl = fereastraMs || calculeazaMsPanaLaMiezulNoptiiUtc();

    const count = await sursa.increment(cheie, msTtl);

    if (!Number.isFinite(count)) {
      return res.status(503).json({
        cod: 'CHAT_QUOTA_STORE_UNAVAILABLE',
        eroare: 'Contorul de mesaje chat este temporar indisponibil.',
      });
    }

    if (count > limita) {
      // Revert rejected increment
      if (typeof sursa.decrement === 'function') {
        await Promise.resolve(sursa.decrement(cheie)).catch((err) => {
          console.error('[Chat Quota]', rezumatEroareSigur(err, { operation: 'revert_chat_quota_429' }));
        });
      }

      const secundeRamase = await sursa.ttl(cheie);
      const oreRamase = secundeRamase > 0 ? Math.ceil(secundeRamase / 3600) : 24;

      const mesajEroare = estePremium
        ? `Ai atins limita de utilizare rezonabilă de ${limita} de mesaje chat/zi. Limita se resetează în aproximativ ${oreRamase} ore.`
        : `Ai atins limita zilnică de ${limita} mesaje în chat. Limita se resetează în aproximativ ${oreRamase} ore. Treci la Premium pentru acces extins!`;

      return res.status(429).json({
        cod: 'CHAT_QUOTA_EXCEEDED',
        raspuns: mesajEroare,
        eroare: mesajEroare,
        total: limita,
        ramase: 0,
        tier,
        oreRamase,
      });
    }

    const ramase = Math.max(0, limita - count);
    res.setHeader('X-AI-Chat-Quota-Tier', tier);
    res.setHeader('X-AI-Chat-Quota-Remaining', String(ramase));
    res.setHeader('X-AI-Chat-Quota-Total', String(limita));

    // Gestionare refund la eșec 5xx / 429 provider sau socket închis prematur
    req._chatQuotaConsumata = true;
    const restituieMesaj = () => {
      if (req._chatQuotaRestituita || req._chatQuotaConfirmata) return;
      req._chatQuotaRestituita = true;
      if (typeof sursa.decrement !== 'function') return;
      Promise.resolve(sursa.decrement(cheie)).catch((err) => {
        console.error('[Chat Quota]', rezumatEroareSigur(err, { operation: 'refund_chat_quota' }));
      });
    };

    const confirmaMesaj = () => {
      if (req._chatQuotaRestituita || req._chatQuotaConfirmata) return;
      req._chatQuotaConfirmata = true;
    };

    if (typeof res.once === 'function') {
      res.once('finish', () => {
        if (!req._chatQuotaConsumata || !res.statusCode) return;
        if (res.statusCode >= 500 || res.statusCode === 429) {
          restituieMesaj();
        } else {
          confirmaMesaj();
        }
      });

      res.once('close', () => {
        if (!req._chatQuotaConsumata) return;
        if (res.writableEnded) return;
        restituieMesaj();
      });
    }

    return next();
  }

  return {
    sursa,
    obtineCota,
    middlewareCotaChat,
    limitaFree,
    limitaPremium,
    limitaTester,
  };
}

module.exports = {
  creeazaServiciuChatQuota,
  LIMITA_FREE_IMPLICITA,
  LIMITA_PREMIUM_IMPLICITA,
  LIMITA_TESTER_IMPLICITA,
  FEREASTRA_MS_IMPLICITA,
};
