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
    // H3: debitul e înregistrat atomic în ledger cu event_id generat la debitare.
    expect(debit.params.p_event_id).toBe(req._creditEventId);
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
    // H3: refund-ul foloseste namespace `refund:` ca sa NU colizeze cu rândul
    // CONSUM_AI (UNIQUE pe credite_tranzactii.event_id).
    expect(refund.params.p_event_id).toBe('refund:' + req._creditEventId);
    expect(refund.params.p_event_type).toBe('REFUND_AI_FAILURE');
    expect(refund.params.p_delta).toBe(1);
  });

  test('#H1: finish cu 429 (cooldown provider) => refund credit platit', async () => {
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

    // Cooldown-ul furnizorului răspunde 429: creditul plătit trebuie restituit,
    // altfel o analiză refuzată arde un credit plătit fără rezultat.
    res.statusCode = 429;
    finishHandler();
    await Promise.resolve();

    const refund = apeluriRpc.find((a) => a.functie === 'aplica_tranzactie_credite');
    expect(refund).toBeDefined();
    expect(refund.params.p_user_id).toBe('u1');
    expect(refund.params.p_event_id).toBe('refund:' + req._creditEventId);
    expect(refund.params.p_event_type).toBe('REFUND_AI_FAILURE');
    expect(refund.params.p_delta).toBe(1);
  });

  test('#M-05/H3: finish cu 2xx => confirmare consum (ok), fara refund', async () => {
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

    // H3: la succes (2xx) confirmam consumul (marcaj `ok:`) ca reconcilierea sa
    // nu restituie in plus un credit castigat corect. Nu exista REFUND.
    const confirm = apeluriRpc.find(
      (a) => a.functie === 'aplica_tranzactie_credite' && a.params.p_event_type === 'CONSUM_AI_CONFIRM'
    );
    expect(confirm).toBeDefined();
    expect(confirm.params.p_user_id).toBe('u1');
    expect(confirm.params.p_event_id).toBe('ok:' + req._creditEventId);
    expect(confirm.params.p_delta).toBe(0);

    const refund = apeluriRpc.filter(
      (a) => a.functie === 'aplica_tranzactie_credite' && a.params.p_event_type === 'REFUND_AI_FAILURE'
    );
    expect(refund).toHaveLength(0);
  });

  test('#G3: close fara raspuns complet (client deconectat) => refund pe event_id', async () => {
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

    let closeHandler = null;
    const res = { statusCode: 200, headers: {}, writableEnded: false };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.once = (evnt, handler) => { if (evnt === 'close') closeHandler = handler; };

    const req = { user: { id: 'u1' } };
    const next = jest.fn();
    await c(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req._creditConsumat).toBe(true);

    // Clientul s-a deconectat înainte ca răspunsul să fie finalizat (writableEnded
    // fals) → creditul se restituie, altfel s-ar arde o analiză plătită fără rezultat.
    expect(typeof closeHandler).toBe('function');
    closeHandler();
    await Promise.resolve();

    const refund = apeluriRpc.find((a) => a.functie === 'aplica_tranzactie_credite');
    expect(refund).toBeDefined();
    expect(refund.params.p_user_id).toBe('u1');
    expect(refund.params.p_event_id).toBe('refund:' + req._creditEventId);
    expect(refund.params.p_event_type).toBe('REFUND_AI_FAILURE');
    expect(refund.params.p_delta).toBe(1);
  });

  test('#G3: close cu raspuns 2xx complet => NU exista refund', async () => {
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

    let closeHandler = null;
    const res = { statusCode: 200, headers: {}, writableEnded: true };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.once = (evnt, handler) => { if (evnt === 'close') closeHandler = handler; };

    const req = { user: { id: 'u1' } };
    const next = jest.fn();
    await c(req, res, next);

    closeHandler();
    await Promise.resolve();

    const refund = apeluriRpc.filter((a) => a.functie === 'aplica_tranzactie_credite');
    expect(refund).toHaveLength(0);
  });
});