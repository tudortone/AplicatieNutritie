require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Verifică variabilele de mediu
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; // sau SERVICE_ROLE_KEY pentru scripturi

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ EROARE: Setările Supabase lipsesc din .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Exemplu limitat de categorii și mușchi pentru a genera variații
const categories = ['piept', 'spate', 'picioare', 'brate', 'umeri', 'abdomen', 'cardio'];
const muscleKeys = ['chest', 'lats', 'quads', 'hamstrings', 'biceps', 'triceps', 'shoulders', 'abs', 'calves', 'glutes'];

function generateExercises(count = 500) {
  const exercises = [];
  for (let i = 1; i <= count; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    let primaryMuscle = muscleKeys[Math.floor(Math.random() * muscleKeys.length)];
    let secondaryMuscle = muscleKeys[Math.floor(Math.random() * muscleKeys.length)];
    
    // Asigură-te că au sens mușchii pentru categorie
    if (category === 'piept') primaryMuscle = 'chest';
    if (category === 'spate') primaryMuscle = 'lats';
    if (category === 'picioare') primaryMuscle = Math.random() > 0.5 ? 'quads' : 'hamstrings';
    if (category === 'abdomen') primaryMuscle = 'abs';
    if (category === 'brate') primaryMuscle = Math.random() > 0.5 ? 'biceps' : 'triceps';
    
    const nume = `Exercițiu Generat Automat ${i} (${category})`;
    
    exercises.push({
      nume,
      categorie: category,
      grupe: [primaryMuscle, secondaryMuscle], // Fallback vechi
      muschiTinta: {
        [primaryMuscle]: 1.0,
        [secondaryMuscle]: 0.5
      },
      echipament: Math.random() > 0.5 ? 'bodyweight' : 'dumbbell',
      repetariDefault: 12,
      input_type: category === 'cardio' ? 'time_distance' : 'weighted_reps',
      met: parseFloat((Math.random() * 5 + 3).toFixed(1)), // MET între 3.0 și 8.0
      user_id: null // Global
    });
  }
  return exercises;
}

async function insertExercises() {
  console.log("⚙️  Generare 500 de exerciții...");
  const data = generateExercises(500);
  
  console.log("🚀 Trimitere către Supabase...");
  
  // Batch insert in bucăți de câte 100 pentru a nu depăși limitele API-ului
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const { error } = await supabase.from('exercitii').insert(batch);
    
    if (error) {
      console.error(`❌ Eroare la insertia batch-ului ${i/batchSize + 1}:`, error.message);
      return;
    }
    console.log(`✅ Inserat batch ${i/batchSize + 1} (${batch.length} exerciții)`);
  }
  
  console.log("🎉 Toate cele 500 de exerciții au fost adăugate cu succes!");
}

insertExercises();
