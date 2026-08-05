'use strict';

/**
 * Crearea contului de admin (super-utilizator) pentru NutriAI.
 *
 * Contul are:
 *   - email: admin@nutriai.app (login-ul din aplicatie se face cu username-ul `admin`)
 *   - parola: ADMIN_PASSWORD din env, implicit `admin` (DECIZIE ASUMATĂ de proprietar)
 *   - app_metadata.rol = 'admin'  =>  Premium permanent + analize AI nelimitate
 *   - email_confirm: true         =>  login-ul cu parola nu e blocat de confirmare
 *
 * Rolul se citeste din `app_metadata` (server-controlled), NU din `user_metadata`
 * (editabil de orice utilizator prin SDK) — altfel ar exista auto-escaladare.
 *
 * Idempotent: daca utilizatorul exista deja, doar actualizeaza parola si rolul.
 *
 * Rulare (din backend-nutritie-ai, cu .env prezent):
 *   node scripts/create-admin.js
 *
 * Risc: parola implicita `admin` este extrem de slaba. Schimbarea ulterioara se
 * face cu admin API (o singura linie), nu din cod:
 *   auth.admin.updateUserById(<userId>, { password: 'noua-parola-forta' })
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'admin@nutriai.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ROL_ADMIN = 'admin';

function opreste(mesaj) {
  console.error(`EROARE: ${mesaj}`);
  process.exit(1);
}

async function gasesteUserDupaEmail(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`Nu s-au putut lista utilizatorii: ${error.message}`);
  }
  return (data?.users ?? []).find(
    (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  ) ?? null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    opreste('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY din .env.');
  }
  if (!url.startsWith('https://') || serviceRole.length < 20) {
    opreste('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY par a fi valorile de test — verifica .env.');
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existent = await gasesteUserDupaEmail(supabase, ADMIN_EMAIL);

  let userId;
  if (existent) {
    const { data, error } = await supabase.auth.admin.updateUserById(existent.id, {
      password: ADMIN_PASSWORD,
      app_metadata: { ...(existent.app_metadata ?? {}), rol: ROL_ADMIN },
    });
    if (error) throw new Error(`Actualizarea adminului a esuat: ${error.message}`);
    userId = data.user.id;
    console.log(`Contul ${ADMIN_EMAIL} exista deja — parola si rolul 'admin' au fost actualizate.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      app_metadata: { rol: ROL_ADMIN },
    });
    if (error) throw new Error(`Crearea adminului a esuat: ${error.message}`);
    userId = data.user.id;
    console.log(`Contul ${ADMIN_EMAIL} a fost creat.`);
  }

  console.log('');
  console.log('============================================================');
  console.log('  Cont ADMIN creat/actualizat');
  console.log(`  Email:  ${ADMIN_EMAIL}`);
  console.log(`  UserID: ${userId}`);
  console.log('  Login în aplicație: utilizatorul „admin" + parola ta');
  console.log('  Rol:    app_metadata.rol = "admin" (Premium + AI nelimitat)');
  console.log('------------------------------------------------------------');
  console.log('  ⚠️  PAROLA ADMIN ESTE SLABĂ — SCHIMB-O!');
  console.log('  Schimbare (admin API):');
  console.log('    auth.admin.updateUserById("<userId>", { password: "noua-parola-forta" })');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('EROARE CRITICA:', err?.message || err);
  process.exit(1);
});
