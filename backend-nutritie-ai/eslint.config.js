const globals = require("globals");

// C1-S3: tabele cu politici RLS pe `auth.uid() = user_id`. Un acces direct prin
// `supabaseAdmin.from(...)` (service_role) ar ocoli RLS prin definitie.
// Acestea trebuie servite DOAR prin `tabelUtilizator(ctx, ...)`, care construieste
// clientul legat de JWT si refuza omisiunea filtrului. Rule-listeaza tabelele
// inregistrate in `utils/clientUtilizator.js` (TABELE_CU_RLS_UTILIZATOR).
const TABELE_RLS_UTILIZATOR = [
  "mese",
  "profil",
  "antrenamente",
  "produse_camara",
  "gamificare",
  "workout_logs",
  "audit_log",
  "barcode_estimari_utilizator",
  "ai_jobs",
  "credite_ai",
];

// Selector ac: orice `supabaseAdmin.from('<tabela>')` unde `<tabela>` e una din
// cu RLS. Interzice pe volume de route-uri (fișierele care scriu date de
// utilizator pe provider Clerk/webhook user.created sunt exceptionare explicit,
// jos, in blocul de overrides).
const SELECTOR_SUPABASE_ADMIN_USER_TABLE = {
  selector:
    "CallExpression[callee.object.name='supabaseAdmin'][callee.property.name='from']" +
    "[arguments.0.type='Literal'][arguments.0.value=/^(" +
    TABELE_RLS_UTILIZATOR.join("|") +
    ")$/]",
  message:
    "C1-S3: nu accesa tabela de utilizator prin supabaseAdmin (ocoleste RLS). " +
    "Foloseste tabelUtilizator(ctx, ...) pe clientul legat al JWT-ului. " +
    "Doar apeluri inamic/scriere pe baza de webhook confirm fara JWT Supabase " +
    "fac exceptie, listate explicit in eslint.config.js overrides.",
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
      "no-restricted-syntax": ["error", SELECTOR_SUPABASE_ADMIN_USER_TABLE],
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
