import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { EXERCITII_DB } from '../constants/exercitii';

// Încărcăm variabilele de mediu (dacă scriptul este rulat din rădăcină)
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
// ATENȚIE: Aici trebuie folosit SERVICE ROLE KEY pentru a putea face insert (având în vedere RLS-ul public care e doar SELECT)
// Dacă vrei să folosești ANON KEY, trebuie să oprești RLS-ul temporar.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ EROARE: Nu am putut găsi variabilele de mediu pentru Supabase (URL sau KEY).');
  console.log('Asigură-te că fișierul .env conține EXPO_PUBLIC_SUPABASE_URL și un KEY (ideal SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDatabase() {
  console.log(`⏳ Încep seeding-ul a ${EXERCITII_DB.length} exerciții în Supabase...`);

  let successCount = 0;
  let errorCount = 0;

  for (const ex of EXERCITII_DB) {
    try {
      const { error } = await supabase
        .from('exercitii')
        .upsert(
          {
            id: ex.id,
            nume: ex.nume,
            categorie: ex.categorie,
            grupe: ex.grupe,
            muscleActivations: ex.muscleActivations || null,
            dificultate: ex.dificultate,
            echipament: ex.echipament || null,
            met: ex.met,
            caloriiPeMinut: ex.caloriiPeMinut || null,
            descriere: ex.descriere || null,
            instructiuni: ex.instructiuni || null,
            muschiTinta: ex.muschiTinta || null,
            target_muscles: ex.target_muscles || null,
            activation: ex.activation || null,
            masurare: ex.masurare || null,
            greseliComune: ex.greseliComune || null,
            sfaturi: ex.sfaturi || null,
            seriiDefault: ex.seriiDefault || 3,
            repetariDefault: ex.repetariDefault || 10,
            icon: ex.icon || null,
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error(`❌ Eroare la ${ex.nume}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        process.stdout.write('.'); // progress indicator
      }
    } catch (e) {
      console.error(`❌ Excepție la ${ex.nume}:`, e);
      errorCount++;
    }
  }

  console.log('\n\n✅ Seeding finalizat!');
  console.log(`👍 Succes: ${successCount}`);
  console.log(`👎 Erori: ${errorCount}`);

  if (errorCount > 0) {
    console.log('⚠️ Ai grijă să dezactivezi RLS temporar (DISABLE ROW LEVEL SECURITY) dacă folosești ANON_KEY, altfel nu vei putea insera date.');
  }
}

seedDatabase();
