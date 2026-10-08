import fs from 'fs';
import path from 'path';
import { buildRecipePrompt } from '../lib/coachRecipePrompt';

describe('Coach recipe language and calm motion contract', () => {
  const base = {
    ingredients: ['Eggs', 'Tomatoes'],
    mealType: 'Orice',
    prepTime: 'Rapid (< 15 min)',
    caloriesRemaining: 800,
    proteinRemaining: 45,
  };

  test.each([
    ['en', /step-by-step/i],
    ['ro', /pas cu pas/i],
    ['fr', /étape par étape/i],
    ['de', /Schritt für Schritt/i],
  ])('builds a readable recipe request in %s', (locale, expected) => {
    const prompt = buildRecipePrompt({ ...base, locale });
    expect(prompt).toMatch(expected);
    expect(prompt).not.toMatch(/return only json|răspunde doar cu json/i);
  });

  it('does not use spring or bounce animation in the Coach recipe confirmation flow', () => {
    const files = [
      '../components/RecipeGeneratorModal.tsx',
      '../components/ui/ConfirmSheet.tsx',
      '../components/ui/MealSaveSuccessModal.tsx',
      '../components/BouncingDot.tsx',
    ];
    for (const relative of files) {
      const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
      expect(source).not.toMatch(/springify\s*\(|withSpring\s*\(|translateY\s*:/);
    }
  });
});
