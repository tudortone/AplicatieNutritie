const globals = require("globals");

// C1-S3: tabele cu politici RLS pe `auth.uid() = user_id`. Un acces direct prin
// clientul service_role (`supabaseAdmin`) ar ocoli RLS prin definitie; aceste
// tabele trebuie servite DOAR prin `tabelUtilizator(ctx, ...)` pe clientul legat
// de JWT. Sursa unica de adevar a listei e `utils/clientUtilizator.js`
// (TABELE_CU_RLS_UTILIZATOR) — importata aici, nu copiata, ca un tabel adaugat
// acolo sa intre automat sub regula, fara drift intre cele doua locuri.
const { TABELE_CU_RLS_UTILIZATOR } = require("./utils/clientUtilizator");

// Interzice `.*from('<tabela-RLS>')` indiferent de numele variabilei care tine
// clientul service_role. Prinde atat forma directa cat si aliasurile pe care
// codul le foloseste efectiv:
//   - supabaseAdmin.from('mese')      (identificator direct)
//   - ctx.admin.from('mese')          (alias expus de creeazaContextDate)
//   - req.supabaseAdmin.from('mese')  (client atasat cererii)
//   - clientAdmin.from('mese')        (variabila redenumita)
// Omiterea filtrului devine o eroare la lint in loc de o scurgere silentioasa.
// Scrierile backend-legitime (webhook/GDPR/AI, fara JWT Supabase valid) fac
// exceptie, listate explicit jos, in blocul de overrides.
const SELECTOR_SUPABASE_ADMIN_USER_TABLE = {
  selector:
    "CallExpression[callee.object.name=/admin/i][callee.property.name='from']" +
    "[arguments.0.type='Literal'][arguments.0.value=/^(" +
    TABELE_CU_RLS_UTILIZATOR.join("|") +
    ")$/]",
  message:
    "C1-S3: nu accesa tabela de utilizator prin clientul service_role (ocoleste RLS). " +
    "Foloseste tabelUtilizator(ctx, ...) pe clientul legat al JWT-ului. " +
    "Doar scrierile pe baza de webhook/GDPR/AI (fara JWT Supabase valid) fac exceptie, " +
    "listate explicit in eslint.config.js overrides.",
};

// A doua forma: clientul service_role ca PROPRIETATE a unui obiect
// (req.supabaseAdmin, this.supabaseAdmin, ctx.clientSupabase). Acolo callee.object
// e un MemberExpression, deci selectorul de mai sus (care citeste
// callee.object.name) nu l-ar prinde.
const SELECTOR_SUPABASE_ADMIN_USER_TABLE_PROPRIETATE = {
  selector:
    "CallExpression[callee.object.property.name=/admin/i][callee.property.name='from']" +
    "[arguments.0.type='Literal'][arguments.0.value=/^(" +
    TABELE_CU_RLS_UTILIZATOR.join("|") +
    ")$/]",
  message: SELECTOR_SUPABASE_ADMIN_USER_TABLE.message,
};

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
      "no-undef": "error"
    }
  },
  {
    // C1-S3: regula anti-by-pass RLS — doar in fioalele de route (routes/**, utils/**)
    // se interzice direct supabaseAdmin pe tabeleul de utilizator. restul trece.
    files: ["routes/**/*.js", "utils/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        SELECTOR_SUPABASE_ADMIN_USER_TABLE,
        SELECTOR_SUPABASE_ADMIN_USER_TABLE_PROPRIETATE,
      ],
    },
  },
  {
    // EXCEPT unor (C1-S3): aceste fișiere scriu date de utilizator pe baza de
    // indicator de sistem — nu pot folosi clientul legat de JWT:
    //   - routes/webhooks.js + webhooksRevenueCat.js: user.created/updated/deleted
    //     ruleaza INAINTE ca utilizatorul sa aiba un JWT Supabase — nu exista
    //     client RLS legit la aceasta faza.
    //   - routes/gdpr.js: stergeCont autent atat identit; verifica userId inainte
    //     de orice stergere; cale de backend.
    //   - routes/ai.js: creaza/actualizeaza job-uri in ai_jobs (insert/update sunt
    //     revocate catre anon/authenticated, raman doar service_role).
    //   - utils/gdprWorker.js + src/trigger/**: background workers fara JWT — scriu
    //     pe tabele de utilizator doar dupa ce outbox-ul a marcat contul
    //     deletion_pending.
    files: [
      "routes/webhooks.js",
      "routes/webhooksRevenueCat.js",
      "routes/gdpr.js",
      "routes/ai.js",
      "utils/gdprWorker.js",
      "src/trigger/**",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
