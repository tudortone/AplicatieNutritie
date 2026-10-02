const {
  evalueazaAudit,
  evalueazaVersiuneNode,
  EXCEPTII_AUDIT,
  exceptieValida,
} = require('../scripts/auditGate');

/** Construieste un raport `npm audit --json` valid, cu vulnerabilitatile date. */
function raport(vulnerabilities: Record<string, unknown>) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
  };
}

/** Nod de vulnerabilitate in forma pe care o emite npm audit. */
function vuln(severity: string, range: string, ghsa: string) {
  return {
    severity,
    range,
    via: [{ title: 'x', severity, url: `https://github.com/advisories/${ghsa}` }],
  };
}

describe('poarta auditului npm — validitate raport', () => {
  it('refuza un raspuns de eroare sau incomplet al registrului (fail-closed)', () => {
    expect(evalueazaAudit({ message: 'registry unavailable', error: {} })).toEqual(
      expect.objectContaining({ valid: false }),
    );
    expect(evalueazaAudit({ auditReportVersion: 2 })).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });

  it('accepta un raport valid fara vulnerabilitati', () => {
    const r = evalueazaAudit(raport({}));
    expect(r.valid).toBe(true);
    expect(r.total).toBe(0);
    expect(r.blocate).toEqual([]);
  });
});

describe('P0-04 — politica de severitate', () => {
  it('1. o vulnerabilitate HIGH cunoscuta blocheaza gate-ul', () => {
    const r = evalueazaAudit(raport({ sharp: vuln('high', '<0.35.4', 'GHSA-aaaa-bbbb-cccc') }));
    expect(r.blocate.join()).toContain('sharp');
    expect(r.blocate).toHaveLength(1);
  });

  it('2. MODERATE blocheaza; LOW este permis (semantica --audit-level=moderate)', () => {
    const mod = evalueazaAudit(raport({ 'query-string': vuln('moderate', '<=9.4.1', 'GHSA-mmmm-1111-2222') }));
    expect(mod.blocate.join()).toContain('query-string');

    const low = evalueazaAudit(raport({ trivial: vuln('low', '<1.0.0', 'GHSA-low0-0000-0000') }));
    expect(low.blocate).toEqual([]);
  });

  it('3. un advisory remediat nu mai apare in raport, deci nu mai blocheaza', () => {
    expect(evalueazaAudit(raport({})).blocate).toEqual([]);
  });

  it('4. un advisory NOU, necunoscut, blocheaza fail-closed', () => {
    const r = evalueazaAudit(raport({ 'pachet-nou-necunoscut': vuln('high', '*', 'GHSA-new0-0000-0000') }));
    expect(r.blocate.join()).toContain('pachet-nou-necunoscut');
  });

  it('CRITICAL nu poate fi exceptat niciodata', () => {
    const exceptii = [{
      pachet: 'x', range: '*', advisory: 'GHSA-crit-0000-0000',
      motiv: 'test', expira: '2099-01-01',
    }];
    const r = evalueazaAudit(raport({ x: vuln('critical', '*', 'GHSA-crit-0000-0000') }), exceptii);
    expect(r.blocate.join()).toContain('CRITICAL');
  });
});

describe('P0-04 — exceptii cu potrivire EXACTA', () => {
  const exceptie = {
    pachet: 'demo-pkg',
    range: '<=1.2.3',
    advisory: 'GHSA-1111-2222-3333',
    motiv: 'build-time only, nereachable in productie',
    expira: '2099-12-31',
  };

  it('5. exceptia se aplica DOAR la pachet+versiune+advisory identice', () => {
    const potrivit = evalueazaAudit(
      raport({ 'demo-pkg': vuln('high', '<=1.2.3', 'GHSA-1111-2222-3333') }),
      [exceptie],
    );
    expect(potrivit.blocate).toEqual([]);
    expect(potrivit.permise).toHaveLength(1);

    // alt advisory pe acelasi pachet+versiune -> NU este acoperit
    const altAdvisory = evalueazaAudit(
      raport({ 'demo-pkg': vuln('high', '<=1.2.3', 'GHSA-9999-9999-9999') }),
      [exceptie],
    );
    expect(altAdvisory.blocate.join()).toContain('demo-pkg');

    // alt pachet cu acelasi advisory -> NU este acoperit
    const altPachet = evalueazaAudit(
      raport({ 'alt-pkg': vuln('high', '<=1.2.3', 'GHSA-1111-2222-3333') }),
      [exceptie],
    );
    expect(altPachet.blocate.join()).toContain('alt-pkg');
  });

  it('6. o exceptie invechita NU poate ascunde o versiune schimbata', () => {
    // acelasi pachet + acelasi advisory, dar range-ul s-a schimbat (versiune noua afectata)
    const r = evalueazaAudit(
      raport({ 'demo-pkg': vuln('high', '<=2.0.0', 'GHSA-1111-2222-3333') }),
      [exceptie],
    );
    expect(r.blocate.join()).toContain('demo-pkg');
  });

  it('o exceptie EXPIRATA nu mai acopera nimic', () => {
    const expirata = { ...exceptie, expira: '2000-01-01' };
    const r = evalueazaAudit(
      raport({ 'demo-pkg': vuln('high', '<=1.2.3', 'GHSA-1111-2222-3333') }),
      [expirata],
    );
    expect(r.blocate.join()).toContain('demo-pkg');
  });

  it('o exceptie fara advisory/expirare este respinsa (nu poate fi wildcard)', () => {
    const fadaAdvisory = { pachet: 'demo-pkg', range: '<=1.2.3', motiv: 'x', expira: '2099-01-01' };
    const r = evalueazaAudit(
      raport({ 'demo-pkg': vuln('high', '<=1.2.3', 'GHSA-1111-2222-3333') }),
      [fadaAdvisory as never],
    );
    expect(r.blocate.join()).toContain('demo-pkg');
  });

  it('toate exceptiile livrate sunt valide, documentate si neexpirate', () => {
    expect(Array.isArray(EXCEPTII_AUDIT)).toBe(true);
    for (const exceptie of EXCEPTII_AUDIT) {
      expect(exceptieValida(exceptie)).toBe(true);
      expect(new Date(`${exceptie.expira}T23:59:59Z`).getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe('P0-04 — verificarea versiunii de Node (engines >=22 <23)', () => {
  it('9. Node 22 este acceptat', () => {
    expect(evalueazaVersiuneNode('v22.11.0', '>=22 <23').ok).toBe(true);
    expect(evalueazaVersiuneNode('22.0.0', '>=22 <23').ok).toBe(true);
  });

  it('8. o versiune in afara intervalului este raportata corect', () => {
    const prea_nou = evalueazaVersiuneNode('v24.18.0', '>=22 <23');
    expect(prea_nou.ok).toBe(false);
    expect(prea_nou.mesaj).toContain('24');
    expect(prea_nou.mesaj).toContain('>=22 <23');

    const prea_vechi = evalueazaVersiuneNode('v20.11.0', '>=22 <23');
    expect(prea_vechi.ok).toBe(false);
    expect(prea_vechi.mesaj).toContain('20');
  });

  it('o versiune ilizibila esueaza fail-closed', () => {
    expect(evalueazaVersiuneNode('necunoscut', '>=22 <23').ok).toBe(false);
    expect(evalueazaVersiuneNode('', '>=22 <23').ok).toBe(false);
  });
});
