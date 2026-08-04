'use strict';

/**
 * Middleware pentru plafonarea costurilor AI per utilizator (S-10).
 * Previne facturi neașteptate prin limitarea numărului de cereri AI scumpe pe o fereastră de 24 ore.
 */

const usageStore = new Map();

// Curățare periodică a intrărilor expirate o dată pe oră
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of usageStore.entries()) {
    if (now > record.resetTime) {
      usageStore.delete(key);
    }
  }
}, 60 * 60 * 1000).unref();

const DAILY_LIMIT = 50; // Maxim 50 cereri AI per utilizator în 24h
const WINDOW_MS = 24 * 60 * 60 * 1000;

const checkAiUsageQuota = (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ eroare: "Acces neautorizat. Token lipsă sau nevalidat." });
  }

  const now = Date.now();
  let record = usageStore.get(userId);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + WINDOW_MS };
    usageStore.set(userId, record);
  }

  if (record.count >= DAILY_LIMIT) {
    const hoursLeft = Math.ceil((record.resetTime - now) / (60 * 60 * 1000));
    return res.status(429).json({
      eroare: `Ai atins plafonul zilnic de 50 de analize AI. Limita se resetează în aproximativ ${hoursLeft} ore.`,
      cod: 'AI_QUOTA_EXCEEDED'
    });
  }

  record.count += 1;
  res.setHeader('X-AI-Quota-Remaining', DAILY_LIMIT - record.count);
  next();
};

module.exports = {
  checkAiUsageQuota,
  DAILY_LIMIT
};
