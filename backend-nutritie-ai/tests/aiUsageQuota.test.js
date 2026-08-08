'use strict';

const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

function contorCu(raspunsIncrement, raspunsTtl = 7200) {
  const increment = jest.fn(async () => raspunsIncrement);
  const ttl = jest.fn(async () => raspunsTtl);
  return { increment, ttl };
}

function raspunsFals() {
  const res = { statusCode: 200, headers: {} };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function ruleaza(cereza, contor, { limita = 5 } = {}) {
  const check = creeazaCheckAiUsageQuota({ contor, limitaZi: limita });
  const res = raspunsFals();
  const next = jest.fn();
  return { promise: check(cereza, res, next), res, next, contor };
}

describe('Plafon cost AI per utilizator (H-06)', () => {
  test('#14: sub limita => trece si seteaza header-ul de restant', async () => {
    const contor = contorCu(3);
    const { promise, res, next } = ruleaza({ user: { id: 'u1' } }, contor);
    await promise;
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-AI-Quota-Remaining']).toBe(2);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('#14: exact la limita => trece, header 0', async () => {
    const contor = contorCu(5); // 5 <= 5
    const { promise, res, next } = ruleaza({ user: { id: 'u1' } }, contor);
    await promise;
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['X-AI-Quota-Remaining']).toBe(0);
  });

  test('#14: peste limita => 429 AI_QUOTA_EXCEEDED, fail-closed', async () => {
    const contor = contorCu(6); // 6 > 5
    const { promise, res, next } = ruleaza({ user: { id: 'u1' } }, contor);
    await promise;
    expect(res.statusCode).toBe(429);
    expect(res.body.cod).toBe('AI_QUOTA_EXCEEDED');
    expect(res.headers['X-AI-Quota-Remaining']).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(contor.ttl).toHaveBeenCalledTimes(1);
  });

  test('#14: store indisponibil (contor non-finit) => fail-closed 503', async () => {
    const contor = contorCu(Number.NaN);
    const { promise, res, next } = ruleaza({ user: { id: 'u1' } }, contor);
    await promise;
    expect(res.statusCode).toBe(503);
    expect(res.body.cod).toBe('AI_QUOTA_STORE_UNAVAILABLE');
    expect(next).not.toHaveBeenCalled();
  });

  test('#14: admin trece fara sa consume din plafon', async () => {
    const contor = contorCu(9999);
    const { promise, res, next } = ruleaza({ user: { id: 'u1', esteAdmin: true } }, contor);
    await promise;
    expect(next).toHaveBeenCalledTimes(1);
    expect(contor.increment).not.toHaveBeenCalled();
    expect(res.headers['X-AI-Quota-Remaining']).toBeUndefined();
  });

  test('#14: fara userId => 401, fara contor', async () => {
    const contor = contorCu(1);
    const { promise, res, next } = ruleaza({}, contor);
    await promise;
    expect(res.statusCode).toBe(401);
    expect(contor.increment).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('#M-05: debit reusit urmat de finish cu 500 => refund RPC REFUND_AI_FAILURE', async () => {
    const apeluriRpc = [];
    const admin = {
      rpc: jest.fn(async (functie, params) => {
        apeluriRpc.push({ functie, params });
        if (functie === 'consuma_credit') return { data: 4, error: null };
        if (functie === 'aplica_tranzactie_credite') return { data: 5, error: null };
        return { data: null, error: null };
      }),
    };
    // contor nefolosit: debitul platit are prioritate si iese direct pe next()
    const contor = contorCu(0);
    const check = creeazaCheckAiUsageQuota({ contor, supabaseAdmin: admin, limitaZi: 5 });

    let finishHandler = null;
    const res = { statusCode: 200, headers: {} };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.once = (evnt, handler) => { if (evnt === 'finish') finishHandler = handler; };

    const req = { user: { id: 'u1' } };
    const next = jest.fn();
    await check(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith('consuma_credit', expect.objectContaining({ p_user_id: 'u1' }));

    const debit = apeluriRpc.find((a) => a.functie === 'consuma_credit');
    expect(debit).toBeDefined();
    expect(req._creditConsumat).toBe(true);
    expect(typeof req._creditEventId).toBe('string');

    // Simulam esecul operatiei AI: response-ul se inchide cu 500
    res.statusCode = 500;
    expect(typeof finishHandler).toBe('function');
    finishHandler();
    // flush microtasks
    await Promise.resolve();

    const refund = apeluriRpc.find((a) => a.functie === 'aplica_tranzactie_credite');
    expect(refund).toBeDefined();
    expect(refund.params.p_user_id).toBe('u1');
    expect(refund.params.p_event_id).toBe(req._creditEventId);
    expect(refund.params.p_event_type).toBe('REFUND_AI_FAILURE');
    expect(refund.params.p_delta).toBe(1);
  });

  test('#M-05: finish cu 2xx => NU exista refund', async () => {
    const apeluriRpc = [];
    const admin = {
      rpc: jest.fn(async (functie, params) => {
        apeluriRpc.push({ functie, params });
        if (functie === 'consuma_credit') return { data: 4, error: null };
        if (functie === 'aplica_tranzactie_credite') return { data: 5, error: null };
        return { data: null, error: null };
      }),
    };
    const contor = contorCu(0);
    const c = creeazaCheckAiUsageQuota({ contor, supabaseAdmin: admin, limitaZi: 5 });

    let finishHandler = null;
    const res = { statusCode: 200, headers: {} };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.once = (evnt, handler) => { if (evnt === 'finish') finishHandler = handler; };

    const req = { user: { id: 'u1' } };
    const next = jest.fn();
    await c(req, res, next);

    res.statusCode = 201;
    finishHandler();
    await Promise.resolve();

    const refund = apeluriRpc.filter((a) => a.functie === 'aplica_tranzactie_credite');
    expect(refund).toHaveLength(0);
  });
});