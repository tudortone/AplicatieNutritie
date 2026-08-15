'use strict';

/**
 * Modul de metrici AI (B-23): tokeni, cost estimat si rata de esec, per furnizor
 * si ruta. Latența (p95) si metricsMiddleware au fost eliminate (D4): nu aveau
 * niciun apelant — observabilitatea reala de latency sta in jurnalul de acces.
 */

// ============================================================================
// METRICI AI (B-23): tokeni, cost estimat, rata de esec — per furnizor si ruta.
// Contorizare in-memory: este analitica, nu un mecanism de enforce. Pentru un
// total absolut pe mai multe procese ar trebui Redis; pentru "cat m-a costat
// ieri analiza foto" pe o instanta este suficient.
// ============================================================================

const contorAiFurnizori = new Map();
const contorAiRute = new Map();

/**
 * Preturi ESTIMATIVE USD / 1M tokeni, per model. NU sunt contractul de
 * facturare — doar o aproximare operationala pentru a putea raspunde la
 * "cat ne-a costat". Tarifele pot devia fata de factura reala.
 */
const PRET_PER_MILION = Object.freeze({
  'gpt-4o-mini': { intrare: 0.15, iesire: 0.6 },
  'openai/gpt-oss-120b': { intrare: 0.15, iesire: 0.6 },
  'qwen/qwen3.6-27b': { intrare: 0.15, iesire: 0.6 },
  'llama-4-scout-17b-16e-instruct': { intrare: 0.07, iesire: 0.28 },
  'llama-4-maverick-17b-128e-instruct': { intrare: 0.2, iesire: 0.8 },
  'gemini-2.5-flash': { intrare: 0.3, iesire: 2.5 },
  'gemini-2.0-flash': { intrare: 0.1, iesire: 0.4 },
  'gemini-2.0-flash-lite': { intrare: 0.075, iesire: 0.3 },
  'google/gemini-flash-1.5': { intrare: 0.075, iesire: 0.3 },
});
const PRET_IMPLICIT = Object.freeze({ intrare: 0.5, iesire: 1.5 });

function estimeazaCost(model, tokensIn, tokensOut) {
  const pret = PRET_PER_MILION[model] || PRET_IMPLICIT;
  return (tokensIn * pret.intrare + tokensOut * pret.iesire) / 1_000_000;
}

function contorAi(map, cheie) {
  if (!map.has(cheie)) {
    map.set(cheie, { tokensIn: 0, tokensOut: 0, costUSD: 0, apeluri: 0, esecuri: 0 });
  }
  return map.get(cheie);
}

/**
 * Inregistreaza un apel AI, actualizand furnizorul si ruta in acelasi timp.
 * `usage` accepta forma OpenAI ({ prompt_tokens, completion_tokens }) sau
 * Gemini ({ promptTokenCount, candidatesTokenCount }). Un apel esuat se
 * inregistreaza cu `ok: false` (fara usage) pentru rata de esec.
 */
function inregistreazaAi({ provider, model, ruta, usage, ok }) {
  const tokensIn = usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0;
  const tokensOut = usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0;
  const cost = estimeazaCost(model, tokensIn, tokensOut);

  for (const [map, cheie] of [
    [contorAiFurnizori, provider],
    [contorAiRute, ruta || provider],
  ]) {
    const c = contorAi(map, cheie);
    c.tokensIn += tokensIn;
    c.tokensOut += tokensOut;
    c.costUSD += cost;
    c.apeluri += 1;
    if (!ok) c.esecuri += 1;
  }
}

function contoareLaObiecte(map) {
  return [...map.entries()]
    .map(([nume, c]) => ({
      nume,
      ...c,
      rataEsec: c.apeluri > 0 ? Math.round((c.esecuri / c.apeluri) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.costUSD - a.costUSD);
}

/** Statistici AI pentru /api/ai-status. */
function getAiStatistici() {
  return {
    furnizori: contoareLaObiecte(contorAiFurnizori),
    rute: contoareLaObiecte(contorAiRute),
  };
}

module.exports = {
  PRET_PER_MILION,
  estimeazaCost,
  inregistreazaAi,
  getAiStatistici
};
