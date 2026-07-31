import * as dotenv from 'dotenv';
// npm install node-fetch sau rulează cu node 18+ (fetch nativ)
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!OPENAI_API_KEY) {
  console.log('⚠️ OPENAI_API_KEY lipsește din .env. Scriptul va ieși.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Exemplu: node --loader ts-node/esm scripts/generateExercises.ts picioare 10
const args = process.argv.slice(2);
const categorie = args[0] || 'picioare';
const count = parseInt(args[1]) || 5;

const PROMPT = `
Generează ${count} exerciții diferite pentru categoria "${categorie}". 
Formatează răspunsul STRICT ca un JSON Array valid, unde fiecare obiect are fix structura asta (vezi mai jos). 
FĂRĂ ALTE TEXTE. DOAR JSON. Nu pune \`\`\`json sau altceva la început/sfârșit.

Structura TypeScript (pentru referință):
{
  id: string; // ex: "genuflexiuni-bulgaresti-gantere" (slug unic, litere mici si cratime)
  nume: string; // ex: "Genuflexiuni Bulgărești cu Gantere"
  categorie: "${categorie}";
  grupe: string[]; // ex: ["cvadriceps", "fesieri"]
  dificultate: "usor" | "mediu" | "greu";
  echipament: string; // ex: "gantere", "bară", "fără echipament"
  met: number; // ex: 6 (număr întreg sau zecimal, energia consumată)
  caloriiPeMinut: number; // ex: 8
  descriere: string; // ex: "Un exercițiu unilateral excelent pentru izolarea picioarelor."
  instructiuni: string[]; // 3-4 instrucțiuni clare scurte
  muschiTinta: { [muschi: string]: number }; // ex: { "cvadriceps": 100, "fesieri": 60 } (procente 0-100)
  seriiDefault: 3,
  repetariDefault: 10
}
`;

async function generateWithOpenAI() {
  console.log(`🧠 Cer de la OpenAI ${count} exerciții pentru: ${categorie}...`);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: PROMPT }],
        temperature: 0.7,
      }),
    });

    const json = await res.json();
    let text = json.choices[0].message.content.trim();
    
    // Curăță markdown dacă a pus AI-ul din greșeală
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);

    const exercitii = JSON.parse(text);
    console.log(`✅ Am generat ${exercitii.length} exerciții cu succes.`);

    console.log('⏳ Le introduc în Supabase...');
    const { error } = await supabase.from('exercitii').upsert(exercitii, { onConflict: 'id' });
    
    if (error) {
      console.error('❌ Eroare la insert in Supabase:', error);
    } else {
      console.log('✅ Toate exercițiile au fost salvate în baza de date!');
    }
  } catch (err) {
    console.error('Eroare la generare:', err);
  }
}

generateWithOpenAI();
