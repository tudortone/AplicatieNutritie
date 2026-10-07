const globals = require("globals");
const createNoServiceRoleBypassRule = require("./eslint-rules/no-service-role-bypass");

// C1-S3: tabele cu politici RLS pe `auth.uid() = user_id`. Un acces direct prin
// clientul service_role (`supabaseAdmin`) ar ocoli RLS prin definitie; aceste
// tabele trebuie servite DOAR prin `tabelUtilizator(ctx, ...)` pe clientul legat
// de JWT. Sursa unica de adevar a listei e `utils/clientUtilizator.js`
// (TABELE_CU_RLS_UTILIZATOR) — importata aici, nu copiata, ca un tabel adaugat
// acolo sa intre automat sub regula, fara drift intre cele doua locuri.
const { TABELE_CU_RLS_UTILIZATOR } = require("./utils/clientUtilizator");

const noServiceRoleBypass = createNoServiceRoleBypassRule(TABELE_CU_RLS_UTILIZATOR);

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**", ".trigger/**", "public/**"]
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
    // TASK-001: regula urmareste provenienta createClient(...serviceRoleKey),
    // inclusiv aliasuri si atribuiri, in intreaga suprafata backend de runtime.
    files: [
      "server.js",
      "routes/**/*.js",
      "repositories/**/*.js",
      "utils/**/*.js",
      "services/**/*.js",
      "src/**/*.js",
    ],
    plugins: {
      task001: {
        rules: {
          "no-service-role-bypass": noServiceRoleBypass,
        },
      },
    },
    rules: {
      "task001/no-service-role-bypass": "error",
    },
  },
  {
    // EXCEPT unor (C1-S3): aceste fișiere scriu date de utilizator pe baza de
    // indicator de sistem — nu pot folosi clientul legat de JWT:
    //   - routes/webhooks.js: user.created/updated/deleted
    //     ruleaza INAINTE ca utilizatorul sa aiba un JWT Supabase — nu exista
    //     client RLS legit la aceasta faza.
    //   - routes/gdpr.js: stergeCont autent atat identit; verifica userId inainte
    //     de orice stergere; cale de backend.
    //   - routes/ai.js: creaza/actualizeaza job-uri in ai_jobs (insert/update sunt
    //     revocate catre anon/authenticated, raman doar service_role).
    //   - utils/gdprWorker.js + utils/gdprServices.js + src/trigger/**: background
    //     workers fara JWT — scriu pe tabele de utilizator doar dupa ce
    //     outbox-ul a marcat contul deletion_pending.
    files: [
      "routes/webhooks.js",
      "routes/gdpr.js",
      "routes/ai.js",
      "utils/gdprWorker.js",
      "utils/gdprServices.js",
      "src/trigger/**",
    ],
    rules: {
      "task001/no-service-role-bypass": "off",
    },
  },
];
