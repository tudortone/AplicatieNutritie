export interface CoachRecipePromptInput {
  ingredients: string[];
  mealType: string;
  prepTime: string;
  caloriesRemaining: number;
  proteinRemaining: number;
  locale?: string;
}

const baseLocale = (locale?: string) => {
  const candidate = String(locale || 'en').toLowerCase().split(/[-_]/)[0];
  return candidate === 'ro' || candidate === 'fr' || candidate === 'de' ? candidate : 'en';
};

export function buildRecipePrompt(input: CoachRecipePromptInput): string {
  const locale = baseLocale(input.locale);
  const ingredients = input.ingredients.join(', ');
  const calories = Math.max(input.caloriesRemaining, 300);
  const protein = Math.max(input.proteinRemaining, 15);

  if (locale === 'ro') {
    return `Am disponibile aceste ingrediente: ${ingredients}. Creează o rețetă gustoasă și sănătoasă pentru ${input.mealType === 'Orice' ? 'orice masă a zilei' : input.mealType.toLowerCase()}, cu timp de preparare ${input.prepTime.toLowerCase()}. Țintele rămase sunt aproximativ ${calories} kcal și ${protein} g proteine. Răspunde clar pentru utilizator cu: numele rețetei, ingrediente și cantități exacte, preparare pas cu pas numerotată și valori nutriționale estimate (calorii, proteine, carbohidrați, grăsimi). Nu afișa JSON sau comentarii tehnice.`;
  }
  if (locale === 'fr') {
    return `J'ai ces ingrédients disponibles : ${ingredients}. Crée une recette savoureuse et équilibrée pour ${input.mealType}, avec un temps de préparation ${input.prepTime}. Mes objectifs restants sont d'environ ${calories} kcal et ${protein} g de protéines. Réponds clairement avec : le nom de la recette, les ingrédients et quantités exactes, une préparation numérotée étape par étape et les valeurs nutritionnelles estimées (calories, protéines, glucides, lipides). N'affiche ni JSON ni commentaire technique.`;
  }
  if (locale === 'de') {
    return `Diese Zutaten sind verfügbar: ${ingredients}. Erstelle ein leckeres, ausgewogenes Rezept für ${input.mealType} mit der Zubereitungszeit ${input.prepTime}. Meine verbleibenden Ziele liegen bei etwa ${calories} kcal und ${protein} g Protein. Antworte verständlich mit: Rezeptname, Zutaten und genauen Mengen, nummerierter Zubereitung Schritt für Schritt und geschätzten Nährwerten (Kalorien, Protein, Kohlenhydrate, Fett). Zeige kein JSON und keine technischen Kommentare.`;
  }
  return `I have these ingredients available: ${ingredients}. Create a tasty, balanced recipe for ${input.mealType}, with a preparation time of ${input.prepTime}. My remaining targets are approximately ${calories} kcal and ${protein} g protein. Reply clearly with: the recipe name, ingredients and exact quantities, numbered step-by-step preparation, and estimated nutrition (calories, protein, carbs, fat). Do not display JSON or technical commentary.`;
}
