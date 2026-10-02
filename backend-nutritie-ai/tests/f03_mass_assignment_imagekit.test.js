'use strict';

/**
 * F-03 — mass assignment in `alimente` + stergere cross-user pe ImageKit.
 *
 * Lantul de atac original:
 *   client -> POST /api/mese cu `alimente: [{..., imageKitFileId: "<FILE_A>"}]`
 *          -> `valideazaAlimente` facea `{ ...aliment, nume }`, deci cheia
 *             arbitrara ajungea verbatim in JSONB
 *          -> la DELETE /gdpr/delete-account, `extrageFileIds` o culegea
 *          -> `stergeActiveImageKit` o stergea cu cheia PRIVATA ImageKit,
 *             fara nicio verificare de proprietate
 *   => utilizatorul B distrugea fisierul utilizatorului A.
 *
 * Aparare pe doua straturi, testata aici:
 *   1. allowlist la validare (nicio cheie necunoscuta in DB);
 *   2. verificare de proprietate server-side inainte de stergere (id-ul trimis
 *      de client nu e dovada de proprietate).
 */

const { valideazaAlimente, valideazaMasa } = require('../utils/validareMese');

const FILE_A = 'fileA_1111111111';
const FILE_B = 'fileB_2222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Catalog ImageKit fals: fileId -> filePath real (sursa de adevar server-side). */
const CATALOG = {
  [FILE_A]: `/mancare/${USER_A}/pranz.jpg`,
  [FILE_B]: `/mancare/${USER_B}/cina.jpg`,
};

function instaleazaFetchFals({ esueaza = false } = {}) {
  const sterse = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const href = String(url);
    const method = opts.method || 'GET';

    if (esueaza) throw new Error('network down');

    // GET /files/<id>/details
    const detalii = href.match(/\/files\/([^/]+)\/details$/);
    if (detalii && method === 'GET') {
      const id = decodeURIComponent(detalii[1]);
      const filePath = CATALOG[id];
      if (!filePath) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ filePath }) };
    }

    // DELETE /files/<id>
    const del = href.match(/\/files\/([^/]+)$/);
    if (del && method === 'DELETE') {
      sterse.push(decodeURIComponent(del[1]));
      return { ok: true, status: 200, json: async () => ({}) };
    }

    // DELETE /folder/
    if (href.endsWith('/folder/')) return { ok: true, status: 200, json: async () => ({}) };

    return { ok: true, status: 200, json: async () => ({}) };
  });
  return { sterse };
}

describe('F-03 strat 1 — allowlist la validarea alimentelor', () => {
  it('respinge cheile arbitrare injectate de client', () => {
    const rez = valideazaAlimente([
      {
        nume: 'Piept de pui',
        calorii: 200,
        // Injectari ostile / necunoscute:
        imagekit_file_id: FILE_A,
        fileId: FILE_A,
        __proto__hack: 'x',
        rol: 'admin',
        user_id: USER_A,
        orice_altceva: { adanc: { fileId: FILE_A } },
      },
    ]);

    expect(rez.ok).toBe(true);
    const aliment = rez.valoare[0];

    // Nicio cheie necunoscuta nu supravietuieste.
    expect(aliment).not.toHaveProperty('fileId');
    expect(aliment).not.toHaveProperty('imagekit_file_id');
    expect(aliment).not.toHaveProperty('rol');
    expect(aliment).not.toHaveProperty('user_id');
    expect(aliment).not.toHaveProperty('orice_altceva');
    expect(Object.keys(aliment).sort()).toEqual(['calorii', 'nume']);
  });

  it('pastreaza campurile legitime din contract', () => {
    const rez = valideazaAlimente([
      {
        nume: 'Omleta',
        calorii: 250,
        proteine: 18,
        grasimi: 20,
        carbohidrati: 2,
        fibre: 1,
        grame: 150,
        id: 'local-1',
        imageUrl: 'https://ik.imagekit.io/x/a.jpg',
        imageKitFileId: FILE_B,
        aminoacizi: { leucina: 1200 },
        micronutrienti: { potasiu: 300 },
      },
    ]);
    expect(rez.ok).toBe(true);
    const a = rez.valoare[0];
    expect(a.nume).toBe('Omleta');
    expect(a.calorii).toBe(250);
    expect(a.grame).toBe(150);
    expect(a.imageUrl).toBe('https://ik.imagekit.io/x/a.jpg');
    expect(a.imageKitFileId).toBe(FILE_B);
    expect(a.aminoacizi.leucina).toBe(1200);
    expect(a.micronutrienti.potasiu).toBe(300);
  });

  it('nu permite user_id sa fie setat prin corpul mesei', () => {
    const rez = valideazaMasa({
      nume: 'Masa',
      calorii: 100,
      user_id: USER_A,
      id: 'ceva',
    });
    expect(rez.ok).toBe(true);
    expect(rez.payload).not.toHaveProperty('user_id');
    expect(rez.payload).not.toHaveProperty('id');
  });
});

describe('F-03 strat 2 — verificarea proprietatii inainte de stergere', () => {
  let gdpr;
  const CHEIE = 'private-key-test';

  beforeEach(() => {
    jest.resetModules();
    gdpr = require('../utils/gdprServices');
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('B NU poate sterge FILE_A injectat in propria masa', async () => {
    const { sterse } = instaleazaFetchFals();

    await gdpr.stergeActiveImageKit({
      userId: USER_B,
      fileIds: new Set([FILE_A, FILE_B]),
      privateKey: CHEIE,
    });

    expect(sterse).not.toContain(FILE_A); // fisierul lui A ramane intact
    expect(sterse).toContain(FILE_B);     // B isi sterge propriul fisier
  });

  it('A isi poate sterge propriul fisier', async () => {
    const { sterse } = instaleazaFetchFals();
    await gdpr.stergeActiveImageKit({
      userId: USER_A,
      fileIds: new Set([FILE_A]),
      privateKey: CHEIE,
    });
    expect(sterse).toEqual([FILE_A]);
  });

  it('verificarea de proprietate este fail-closed la eroare de retea', async () => {
    instaleazaFetchFals({ esueaza: true });
    const apartine = await gdpr.fileIdApartineUtilizatorului({
      fileId: FILE_A,
      userId: USER_A,
      privateKey: CHEIE,
    });
    expect(apartine).toBe(false);
  });

  it('un fileId inexistent (404) nu este considerat al utilizatorului', async () => {
    instaleazaFetchFals();
    const apartine = await gdpr.fileIdApartineUtilizatorului({
      fileId: 'inexistent_9999',
      userId: USER_A,
      privateKey: CHEIE,
    });
    expect(apartine).toBe(false);
  });

  it('filtrarea separa corect fisierele proprii de cele straine', async () => {
    instaleazaFetchFals();
    const proprii = await gdpr.filtreazaFileIdsProprii({
      userId: USER_A,
      fileIds: new Set([FILE_A, FILE_B, 'inexistent_9999']),
      privateKey: CHEIE,
    });
    expect(proprii).toEqual([FILE_A]);
  });
});
