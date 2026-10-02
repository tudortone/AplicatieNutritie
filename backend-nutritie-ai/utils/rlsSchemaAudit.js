'use strict';

/**
 * P0-08 — analiza statica a securitatii schemei Supabase.
 *
 * Calculeaza starea EFECTIVA a schemei aplicand, in ordine cronologica:
 *   CREATE TABLE / ENABLE|FORCE ROW LEVEL SECURITY
 *   CREATE POLICY / DROP POLICY
 *   GRANT / REVOKE
 *
 * Diferenta fata de un simplu `grep` este esentiala: o politica permisiva
 * creata intr-o migrare veche si STEARSA intr-una noua nu mai exista, iar un
 * GRANT urmat de REVOKE nu mai acorda nimic. O analiza pe text brut ar raporta
 * fals-pozitive in primul caz si fals-negative in al doilea.
 *
 * Modulul nu inlocuieste testele PgTAP reale (care cer Postgres/Docker); este
 * plasa de siguranta care ruleaza intotdeauna, inclusiv fara Docker.
 */

const fs = require('fs');
const path = require('path');

const CLASIFICARE = Object.freeze({
  UTILIZATOR: 'USER-OWNED',
  BACKEND_ONLY: 'BACKEND-ONLY',
  FACTURARE: 'BILLING-SECURITY',
  CATALOG_PUBLIC: 'PUBLIC/SAFE READ-ONLY',
});

/** Tabele care persista date de facturare: niciodata accesibile clientului. */
const TABELE_FACTURARE = new Set([
  'google_play_subscriptions',
  'google_play_rtdn_events',
]);

/** Tabele strict interne backend-ului. */
const TABELE_BACKEND_ONLY = new Set([
  'barcode_cache',
  'clerk_user_map',
  'clerk_webhook_esuate',
  'credite_esuate',
  'gdpr_deletions',
]);

/** Cataloage publice, fara date personale (verificate: nicio coloana de owner). */
const TABELE_CATALOG = new Set(['exercises', 'exercitii']);

const ROLURI_CLIENT = /\b(anon|authenticated|public)\b/i;
const PRIVILEGII = ['select', 'insert', 'update', 'delete'];

function normalizeaza(nume) {
  return String(nume || '').replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
}

/** Elimina comentariile si mascheaza corpurile `$$ ... $$` ale functiilor. */
function pregateste(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '@@CORP_FUNCTIE@@');
}

function tabelNou(nume) {
  return {
    nume,
    creata: false,
    rls: false,
    force: false,
    politici: new Map(),
    privilegiiClient: [],
    areColoanaUserId: false,
    clasificare: null,
    areIntentiePrivilegiiExplicita: false,
    areGrantAllClient: false,
  };
}

function clasifica(nume) {
  if (TABELE_FACTURARE.has(nume)) return CLASIFICARE.FACTURARE;
  if (TABELE_BACKEND_ONLY.has(nume)) return CLASIFICARE.BACKEND_ONLY;
  if (TABELE_CATALOG.has(nume)) return CLASIFICARE.CATALOG_PUBLIC;
  return CLASIFICARE.UTILIZATOR;
}

/**
 * @param {{dir?: string, fisiere?: {nume:string,continut:string}[]}} optiuni
 */
function analizeazaSchema(optiuni = {}) {
  const fisiere = optiuni.fisiere
    ? optiuni.fisiere
    : fs
      .readdirSync(optiuni.dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => ({ nume: f, continut: fs.readFileSync(path.join(optiuni.dir, f), 'utf8') }));

  const tabele = new Map();
  const functii = [];
  const views = [];
  // Revocarea privilegiilor IMPLICITE (ALTER DEFAULT PRIVILEGES) determina daca
  // obiectele create de migrari VIITOARE sunt expuse automat rolurilor client.
  const privilegiiImplicite = { tabeleRevocate: false, functiiRevocate: false };
  const ia = (n) => {
    const k = normalizeaza(n);
    if (!tabele.has(k)) tabele.set(k, tabelNou(k));
    return tabele.get(k);
  };

  for (const fisier of fisiere) {
    const brut = fisier.continut;
    const s = pregateste(brut);

    // --- tabele -----------------------------------------------------------
    for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi)) {
      const t = ia(m[1]);
      t.creata = true;
      // corpul CREATE TABLE, pentru coloana de proprietar
      const de_la = s.indexOf(m[0]);
      const corp = s.slice(de_la, de_la + 2000);
      if (/\buser_id\b/i.test(corp)) t.areColoanaUserId = true;
    }
    for (const m of s.matchAll(/alter\s+table\s+([a-z0-9_."]+)\s+enable\s+row\s+level\s+security/gi)) ia(m[1]).rls = true;
    for (const m of s.matchAll(/alter\s+table\s+([a-z0-9_."]+)\s+force\s+row\s+level\s+security/gi)) ia(m[1]).force = true;
    for (const m of s.matchAll(/alter\s+table\s+([a-z0-9_."]+)[\s\S]{0,300}?\buser_id\b/gi)) {
      const t = ia(m[1]);
      if (t.creata) t.areColoanaUserId = true;
    }

    // --- politici ---------------------------------------------------------
    // Ordinea conteaza: `DROP` urmat de `CREATE` (sau invers) in acelasi fisier
    // trebuie aplicat POZITIONAL, altfel starea finala calculata e gresita.
    const opPolitici = [];
    for (const m of s.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"?([^"\n;]+?)"?\s+on\s+([a-z0-9_."]+)/gi)) {
      opPolitici.push({ pozitie: m.index, sterge: true, nume: m[1], tabela: m[2] });
    }
    for (const m of s.matchAll(/create\s+policy\s+"?([^"\n(]+?)"?\s+on\s+([a-z0-9_."]+)([\s\S]*?);/gi)) {
      opPolitici.push({ pozitie: m.index, sterge: false, nume: m[1], tabela: m[2], corp: m[3] || '' });
    }
    opPolitici.sort((a, b) => a.pozitie - b.pozitie);
    for (const op of opPolitici) {
      const cheie = op.nume.trim().toLowerCase();
      if (op.sterge) {
        ia(op.tabela).politici.delete(cheie);
        continue;
      }
      const corp = op.corp;
      const comanda = (corp.match(/\bfor\s+(all|select|insert|update|delete)\b/i) || [, 'ALL'])[1].toUpperCase();
      const roluri = (corp.match(/\bto\s+([a-z_,\s]+?)(?=\s+(?:using|with\s+check)|\s*$)/i) || [, '(implicit)'])[1].trim();
      const using = (corp.match(/\busing\s*\(([\s\S]*?)\)\s*(?:with\s+check|$)/i) || [, null])[1];
      const withCheck = (corp.match(/\bwith\s+check\s*\(([\s\S]*?)\)\s*$/i) || [, null])[1];
      ia(op.tabela).politici.set(cheie, {
        nume: op.nume.trim(),
        comanda,
        roluri,
        using: using ? using.trim() : null,
        withCheck: withCheck ? withCheck.trim() : null,
      });
    }

    // --- privilegii (ordine cronologica reala in interiorul fisierului) ----
    const operatii = [];
    for (const m of s.matchAll(/grant\s+([a-z, ]+?)\s+on\s+(?:table\s+)?([a-z0-9_."]+)\s+to\s+([a-z0-9_, ]+)/gi)) {
      operatii.push({ pozitie: m.index, acorda: true, priv: m[1], tabela: m[2], roluri: m[3] });
    }
    for (const m of s.matchAll(/revoke\s+([a-z, ]+?)\s+on\s+(?:table\s+)?([a-z0-9_."]+)\s+from\s+([a-z0-9_, ]+)/gi)) {
      operatii.push({ pozitie: m.index, acorda: false, priv: m[1], tabela: m[2], roluri: m[3] });
    }
    operatii.sort((a, b) => a.pozitie - b.pozitie);
    for (const op of operatii) {
      const t = ia(op.tabela);
      t.areIntentiePrivilegiiExplicita = true;

      if (!ROLURI_CLIENT.test(op.roluri)) continue;

      if (op.acorda && /\ball\b/i.test(op.priv)) {
        t.areGrantAllClient = true;
      }

      const lista = /\ball\b/i.test(op.priv)
        ? PRIVILEGII.slice()
        : op.priv.toLowerCase().split(',').map((x) => x.trim()).filter((x) => PRIVILEGII.includes(x));
      const set = new Set(t.privilegiiClient);
      for (const p of lista) (op.acorda ? set.add(p) : set.delete(p));
      t.privilegiiClient = [...set].sort();
    }

    // --- functii ----------------------------------------------------------
    for (const m of brut.replace(/--[^\n]*/g, '').matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+([a-z_.]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(?=\$\$)/gi,
    )) {
      const antet = m[0];
      functii.push({
        nume: m[1],
        argumente: m[2] || '',
        securityDefiner: /security\s+definer/i.test(antet),
        searchPath: (antet.match(/set\s+search_path\s*=\s*([^\n;]+)/i) || [, null])[1],
        grantClient: false,
        fisier: fisier.nume,
      });
    }
    for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?view\s+([a-z_."]+)/gi)) views.push(normalizeaza(m[1]));

    // --- privilegii implicite pentru obiecte VIITOARE ----------------------
    for (const m of s.matchAll(
      /alter\s+default\s+privileges[\s\S]{0,200}?\brevoke\s+([a-z ]+?)\s+on\s+(tables|functions|routines)\s+from\s+([a-z_, ]+)/gi,
    )) {
      if (!ROLURI_CLIENT.test(m[3])) continue;
      if (/tables/i.test(m[2])) privilegiiImplicite.tabeleRevocate = true;
      else privilegiiImplicite.functiiRevocate = true;
    }

    // Granturi/revocari EXECUTE catre roluri client — tot POZITIONAL, pentru ca
    // patternul uzual e `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` urmat
    // de un `GRANT EXECUTE ... TO <rol>`; ordinea inversa ar da rezultat gresit.
    const opFunctii = [];
    for (const m of s.matchAll(/grant\s+execute\s+on\s+function\s+([a-z_.]+)[\s\S]{0,500}?\bto\s+([a-z_, ]+)/gi)) {
      opFunctii.push({ pozitie: m.index, acorda: true, nume: m[1], roluri: m[2] });
    }
    for (const m of s.matchAll(/revoke\s+[a-z ]*\s+on\s+function\s+([a-z_.]+)[\s\S]{0,600}?\bfrom\s+([a-z_, ]+)/gi)) {
      opFunctii.push({ pozitie: m.index, acorda: false, nume: m[1], roluri: m[2] });
    }
    opFunctii.sort((a, b) => a.pozitie - b.pozitie);
    for (const op of opFunctii) {
      if (!ROLURI_CLIENT.test(op.roluri)) continue;
      for (const f of functii) if (f.nume === op.nume) f.grantClient = op.acorda;
    }
  }

  // ---------------------------------------------------------------- reguli
  const probleme = [];
  const listaTabele = [...tabele.values()].filter((t) => t.creata);
  for (const t of listaTabele) {
    t.clasificare = clasifica(t.nume);
    t.politici = [...t.politici.values()];

    const areScriereClient = t.privilegiiClient.some((p) => p !== 'select');
    const areOriceClient = t.privilegiiClient.length > 0;

    if (!t.areIntentiePrivilegiiExplicita) {
      probleme.push({
        tip: 'PRIVILEGII_NEEXPLICITE',
        tinta: t.nume,
        detaliu: 'tabela creata in schema public fara declaratie explicita de privilegii (niciun GRANT sau REVOKE explicit). Dupa 30 octombrie, Supabase nu mai acorda acces automat prin Data API.',
      });
    }

    if (t.areGrantAllClient) {
      probleme.push({
        tip: 'PRIVILEGII_EXCESIVE_CLIENT',
        tinta: t.nume,
        detaliu: 'GRANT ALL acordat rolurilor client; foloseste granturi minimale explicite (SELECT, INSERT, etc.) conforme cu arhitectura existenta',
      });
    }

    if (!t.rls && (areOriceClient || t.clasificare !== CLASIFICARE.CATALOG_PUBLIC)) {
      probleme.push({ tip: 'RLS_DEZACTIVAT', tinta: t.nume, detaliu: 'tabela privata fara ROW LEVEL SECURITY' });
    }

    if (t.clasificare === CLASIFICARE.FACTURARE && areOriceClient) {
      probleme.push({
        tip: 'FACTURARE_EXPUSA_CLIENTULUI',
        tinta: t.nume,
        detaliu: `privilegii client: ${t.privilegiiClient.join(',')}`,
      });
    }

    if (t.clasificare === CLASIFICARE.BACKEND_ONLY && areOriceClient) {
      probleme.push({
        tip: 'BACKEND_ONLY_EXPUS',
        tinta: t.nume,
        detaliu: `privilegii client: ${t.privilegiiClient.join(',')}`,
      });
    }

    for (const p of t.politici) {
      const scrie = ['ALL', 'INSERT', 'UPDATE'].includes(p.comanda);
      if (!scrie || !areScriereClient) continue;

      const expresie = `${p.using || ''} ${p.withCheck || ''}`.trim();
      if (/^true$/i.test(p.using || '') || /^true$/i.test(p.withCheck || '')) {
        probleme.push({
          tip: 'POLITICA_SCRIERE_PERMISIVA',
          tinta: `${t.nume}.${p.nume}`,
          detaliu: `politica ${p.comanda} cu expresie permisiva (true) pe tabela cu scriere din client`,
        });
        continue;
      }
      if (p.comanda === 'UPDATE' && !p.withCheck) {
        probleme.push({
          tip: 'UPDATE_FARA_WITH_CHECK',
          tinta: `${t.nume}.${p.nume}`,
          detaliu: 'UPDATE fara WITH CHECK permite mutarea proprietarului randului',
        });
      }
      if (p.comanda === 'INSERT' && !p.withCheck) {
        probleme.push({
          tip: 'INSERT_FARA_WITH_CHECK',
          tinta: `${t.nume}.${p.nume}`,
          detaliu: 'INSERT fara WITH CHECK permite crearea de randuri pe alt proprietar',
        });
      }
      if (!/auth\.uid\(\)/.test(expresie)) {
        probleme.push({
          tip: 'POLITICA_SCRIERE_FARA_AUTH_UID',
          tinta: `${t.nume}.${p.nume}`,
          detaliu: 'politica de scriere care nu leaga randul de auth.uid()',
        });
      }
    }
  }

  for (const f of functii) {
    if (f.securityDefiner && !f.searchPath) {
      probleme.push({
        tip: 'DEFINER_FARA_SEARCH_PATH',
        tinta: f.nume,
        detaliu: `SECURITY DEFINER fara SET search_path (${f.fisier})`,
      });
    }
  }

  return { tabele: listaTabele, functii, views, probleme, privilegiiImplicite };
}

module.exports = { analizeazaSchema, CLASIFICARE, TABELE_FACTURARE, TABELE_BACKEND_ONLY };
