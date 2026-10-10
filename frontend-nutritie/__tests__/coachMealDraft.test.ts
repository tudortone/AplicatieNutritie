import { extractCoachMealDrafts, isBareJournalCommand, validateCoachMealDraft } from '../lib/coachMealDraft';

const meal = (name: string) => ({
  type: 'MEAL_PROPOSAL', name, meal_type: 'pranz',
  items: [{ name: 'Rice', qty: 150, unit: 'g', kcal: 195, protein_g: 4, carbs_g: 42, fat_g: 1, fiber_g: 1 }],
});

describe('Coach meal drafts are suggestions, never automatic writes', () => {
  test('keeps two structured suggestions independently selectable', () => {
    const drafts = extractCoachMealDrafts({ suggestions: [meal('Lunch A'), meal('Lunch B')] }, '');
    expect(drafts.map((draft) => draft.name)).toEqual(['Lunch A', 'Lunch B']);
    expect(drafts[0].items[0].quantity).toBe('150');
  });

  test('missing nutrition stays missing rather than becoming a fabricated zero', () => {
    const drafts = extractCoachMealDrafts({ type: 'MEAL_PROPOSAL', name: 'Soup', items: [{ name: 'Soup' }] }, '');
    expect(drafts[0].items[0].quantity).toBe('');
    expect(drafts[0].calories).toBe('');
    expect(validateCoachMealDraft(drafts[0])).toBe(false);
  });

  test.each(['Adaugă în jurnal', 'Adaugă această masă în jurnal.', 'Salvează masa asta', 'Add this meal to my food diary', 'Ajoute ce repas au journal', 'Füge diese Mahlzeit zum Tagebuch hinzu'])(
    'recognizes a context-only save command: %s', (command) => {
      expect(isBareJournalCommand(command)).toBe(true);
    },
  );

  test('does not turn unrelated advice into a food suggestion', () => {
    expect(extractCoachMealDrafts({ raspuns: 'Drink enough water and rest.' }, 'How can I sleep better?')).toEqual([]);
  });

  test('recipe preparation steps are not misclassified as six separate meals', () => {
    expect(extractCoachMealDrafts({ raspuns: '# Tomato soup\nIngredients:\n- Tomatoes\n- Water\nPreparation:\n1. Chop tomatoes\n2. Simmer water' }, 'Give me a recipe')).toHaveLength(1);
  });
});
