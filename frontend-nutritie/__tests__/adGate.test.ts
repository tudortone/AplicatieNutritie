import {
  AD_GATE_INITIAL_STATE,
  AD_EVERY_N_CHAT_MESSAGES,
  SHARED_AD_COOLDOWN_SECONDS,
  evaluateAdEligibility,
  recordSuccessfulAnalysis,
  recordChatUserMessage,
  sanitizeAdGateState,
  type AdGateState,
} from '../lib/ads/adGate';

const NOW = 1_700_000_000_000;

function analyze(times: number, state: AdGateState = { ...AD_GATE_INITIAL_STATE }): AdGateState {
  let s = state;
  for (let i = 0; i < times; i += 1) s = recordSuccessfulAnalysis(s);
  return s;
}

function sendChatMessages(times: number, state: AdGateState = { ...AD_GATE_INITIAL_STATE }): AdGateState {
  let s = state;
  for (let i = 0; i < times; i += 1) s = recordChatUserMessage(s);
  return s;
}

describe('adGate — contorul de analize foto reușite (utilizatori FREE)', () => {
  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, true],
    [4, false],
    [5, false],
    [6, true],
  ])('la %i analize reușite consecutive, eligibilitatea reclamei este %s', (n, eligibleExpected) => {
    const state = analyze(n);
    const decizie = evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW });
    expect(decizie.eligible).toBe(eligibleExpected);
  });

  it('analiza EȘUATĂ nu modifică deloc contorul (nu se apelează recordSuccessfulAnalysis)', () => {
    const state = analyze(2);
    expect(state.successfulAnalysisCount).toBe(2);
    const dupaEsecSimulat = state;
    expect(dupaEsecSimulat.successfulAnalysisCount).toBe(2);
    expect(evaluateAdEligibility(dupaEsecSimulat, { hasFullAccess: false, nowMs: NOW }).eligible).toBe(false);
  });

  it('la a 3-a analiză reușită, reclama e eligibilă și starea de consum se calculează corect', () => {
    const state = analyze(3);
    const decizie = evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW });
    expect(decizie.eligible).toBe(true);
    expect(decizie.reason).toBe('eligible');
    expect(decizie.nextStateIfAttempted.successfulAnalysisCount).toBe(3);
    expect(decizie.nextStateIfAttempted.lastAdCounterValue).toBe(3);
    expect(decizie.nextStateIfAttempted.lastAdShownAtMs).toBe(NOW);
  });

  it('IDEMPOTENT per eveniment: reevaluarea pentru ACELAȘI contor nu redeclanșează reclama', () => {
    const dupaAnaliza = analyze(3);
    const primaEvaluare = evaluateAdEligibility(dupaAnaliza, { hasFullAccess: false, nowMs: NOW });
    expect(primaEvaluare.eligible).toBe(true);

    const staraDupaIncercare = primaEvaluare.nextStateIfAttempted;
    const aDouaEvaluare = evaluateAdEligibility(staraDupaIncercare, { hasFullAccess: false, nowMs: NOW + 500 });
    expect(aDouaEvaluare.eligible).toBe(false);
    expect(aDouaEvaluare.reason).toBe('already-attempted-for-count');
  });

  it('eșecul afișării reclamei nu blochează progresul: analizele 4-5 rămân neeligibile, a 6-a redevine eligibilă după cooldown', () => {
    let state = analyze(3);
    const decizieLa3 = evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW });
    state = decizieLa3.nextStateIfAttempted;

    state = recordSuccessfulAnalysis(state); // #4
    expect(evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW + 1000 }).eligible).toBe(false);

    state = recordSuccessfulAnalysis(state); // #5
    expect(evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW + 2000 }).eligible).toBe(false);

    state = recordSuccessfulAnalysis(state); // #6 (după 11 minute, peste cooldown-ul de 10 min)
    const decizieLa6 = evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW + 660_000 });
    expect(decizieLa6.eligible).toBe(true);
  });

  it('PREMIUM: niciodată eligibil, nici la 3, nici la 6 analize', () => {
    const stateLa3 = analyze(3);
    expect(evaluateAdEligibility(stateLa3, { hasFullAccess: true, nowMs: NOW }).eligible).toBe(false);
    expect(evaluateAdEligibility(stateLa3, { hasFullAccess: true, nowMs: NOW }).reason).toBe('full-access');

    const stateLa6 = analyze(6);
    expect(evaluateAdEligibility(stateLa6, { hasFullAccess: true, nowMs: NOW }).eligible).toBe(false);
  });

  it('TESTER_FULL_ACCESS: aceeași decizie partajată suprimă reclamele', () => {
    const state = analyze(3);
    const decizie = evaluateAdEligibility(state, { hasFullAccess: true, nowMs: NOW });
    expect(decizie.eligible).toBe(false);
    expect(decizie.reason).toBe('full-access');
  });

  it('sanitizează o stare coruptă/veche fără să arunce', () => {
    expect(sanitizeAdGateState(null)).toEqual(AD_GATE_INITIAL_STATE);
    expect(sanitizeAdGateState(undefined)).toEqual(AD_GATE_INITIAL_STATE);
    expect(sanitizeAdGateState({
      successfulAnalysisCount: -5,
      chatMessageCount: -2,
      lastAdShownAtMs: Number.NaN,
      lastAdCounterValue: 'trei',
    })).toEqual({
      successfulAnalysisCount: 0,
      chatMessageCount: 0,
      lastAdShownAtMs: null,
      lastAdCounterValue: null,
      lastChatAdCounterValue: null,
    });
  });
});

describe('adGate — contorul de mesaje chat și cooldown-ul partajat (Phase C)', () => {
  it('contorizează corect mesajele de utilizator trimise către AI', () => {
    let state = { ...AD_GATE_INITIAL_STATE };
    state = recordChatUserMessage(state);
    state = recordChatUserMessage(state);
    expect(state.chatMessageCount).toBe(2);
  });

  it('nu este eligibil pentru reclamă chat la sub 15 mesaje', () => {
    const state = sendChatMessages(14);
    const decizie = evaluateAdEligibility(state, {
      hasFullAccess: false,
      nowMs: NOW,
      source: 'chat',
    });
    expect(decizie.eligible).toBe(false);
    expect(decizie.reason).toBe('not-multiple');
  });

  it('devine eligibil la mesajul #15 și resetează contorul chat în nextStateIfAttempted', () => {
    const state = sendChatMessages(AD_EVERY_N_CHAT_MESSAGES);
    const decizie = evaluateAdEligibility(state, {
      hasFullAccess: false,
      nowMs: NOW,
      source: 'chat',
    });
    expect(decizie.eligible).toBe(true);
    expect(decizie.reason).toBe('eligible');
    expect(decizie.nextStateIfAttempted.chatMessageCount).toBe(0);
    expect(decizie.nextStateIfAttempted.lastChatAdCounterValue).toBe(15);
    expect(decizie.nextStateIfAttempted.lastAdShownAtMs).toBe(NOW);
  });

  it('respectă cooldown-ul partajat de 10 minute: reclamă foto blochează reclamă chat imediată', () => {
    // 1. Utilizatorul are reclamă foto la analiza #3 la t = 0
    let state = analyze(3);
    const decizieFoto = evaluateAdEligibility(state, { hasFullAccess: false, nowMs: NOW, source: 'photo' });
    expect(decizieFoto.eligible).toBe(true);
    state = decizieFoto.nextStateIfAttempted;
    expect(state.lastAdShownAtMs).toBe(NOW);

    // 2. În chat, utilizatorul trimite 15 mesaje doar 3 minute mai târziu (NOW + 180s)
    state = sendChatMessages(15, state);
    const decizieChatPrecoce = evaluateAdEligibility(state, {
      hasFullAccess: false,
      nowMs: NOW + 180_000,
      source: 'chat',
    });
    // Cooldown-ul partajat de 10 minute (600s) blochează reclama chat!
    expect(decizieChatPrecoce.eligible).toBe(false);
    expect(decizieChatPrecoce.reason).toBe('min-interval');

    // 3. La 10 minute și 1 secundă după reclama foto (NOW + 601s), reclama chat devine eligibilă
    const decizieChatDupaCooldown = evaluateAdEligibility(state, {
      hasFullAccess: false,
      nowMs: NOW + 601_000,
      source: 'chat',
    });
    expect(decizieChatDupaCooldown.eligible).toBe(true);
    state = decizieChatDupaCooldown.nextStateIfAttempted;
    expect(state.lastAdShownAtMs).toBe(NOW + 601_000);

    // 4. Invers: dacă acum utilizatorul face analiza foto #6 la doar 2 minute după reclama chat:
    state = analyze(3, state); // count = 6
    const decizieFotoPrecoce = evaluateAdEligibility(state, {
      hasFullAccess: false,
      nowMs: NOW + 721_000, // 2 minute după reclama chat
      source: 'photo',
    });
    expect(decizieFotoPrecoce.eligible).toBe(false);
    expect(decizieFotoPrecoce.reason).toBe('min-interval');
  });

  it('PREMIUM suprimă complet reclamele chat', () => {
    const state = sendChatMessages(25);
    const decizie = evaluateAdEligibility(state, {
      hasFullAccess: true,
      nowMs: NOW,
      source: 'chat',
    });
    expect(decizie.eligible).toBe(false);
    expect(decizie.reason).toBe('full-access');
  });
});
