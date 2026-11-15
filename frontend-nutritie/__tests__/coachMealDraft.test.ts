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
    expect(drafts[0].category).toBe('pranz');
  });

  test('explicit meal category in the user request overrides a conflicting AI category', () => {
    const drafts = extractCoachMealDrafts(
      { type: 'MEAL_PROPOSAL', name: 'Yogurt bowl', meal_type: 'mic_dejun', items: meal('Yogurt bowl').items },
      'Give me an evening snack with yogurt',
    );

    expect(drafts[0].category).toBe('gustare');
  });

  test.each([
    ['Gustare la 23:00', 'gustare'],
    ['Breakfast at 20:00', 'mic_dejun'],
    ['Collation du soir', 'gustare'],
    ['Abend-Snack', 'gustare'],
  ])('proposes the explicit localized category from user text: %s', (prompt, expected) => {
    const drafts = extractCoachMealDrafts(
      { type: 'MEAL_PROPOSAL', name: 'Meal', meal_type: 'cina', items: meal('Meal').items },
      prompt,
    );

    expect(drafts[0].category).toBe(expected);
  });

  test('leaves an ambiguous category unset instead of inventing a user preference', () => {
    const drafts = extractCoachMealDrafts(
      { type: 'MEAL_PROPOSAL', name: 'Bowl', items: meal('Bowl').items },
      'Suggest a balanced bowl for later',
    );

    expect(drafts[0].category).toBeNull();
  });

  test('applies an explicit user category to a free-form recipe draft', () => {
    const drafts = extractCoachMealDrafts(
      { raspuns: '# Lentil soup\nIngredients:\n- Lentils\n- Water' },
      'Give me a dinner recipe',
    );

    expect(drafts[0].category).toBe('cina');
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

  test('extracts multiple meals from MEAL_PROPOSALS with ml->g, comma decimals, and omitted fiber', () => {
    const drafts = extractCoachMealDrafts({
      type: 'MEAL_PROPOSALS',
      meals: [
        {
          type: 'MEAL_PROPOSAL',
          nume: 'Iaurt cu ovăz',
          meal_type: 'mic_dejun',
          items: [{ name: 'Iaurt', qty: 200, unit: 'ml', kcal: 140, protein_g: '10,5', carbs_g: 9, fat_g: 4 }],
        },
        {
          type: 'MEAL_PROPOSAL',
          nume: 'Piept de pui',
          meal_type: 'pranz',
          items: [{ name: 'Piept de pui', qty: 180, unit: 'g', kcal: 290, protein_g: 52, carbs_g: 0, fat_g: 6 }],
        },
      ],
    }, 'adaugă-le în jurnal');
    expect(drafts).toHaveLength(2);
    expect(drafts[0].category).toBe('mic_dejun');
    expect(drafts[0].items[0].unit).toBe('g');
    expect(drafts[0].items[0].protein).toBe('10.5');
    expect(drafts[0].items[0].fiber).toBe('0');
    expect(drafts[1].category).toBe('pranz');
    expect(validateCoachMealDraft({ ...drafts[0], date: '2026-09-25' })).toBe(true);
  });

  test('extracts multiple JSON meal blocks embedded in /chat text', () => {
    const raw = `Prima opțiune:\n{"type":"MEAL_PROPOSAL","nume":"Meal 1","meal_type":"mic_dejun","items":[{"name":"Eggs","qty":100,"unit":"g","kcal":140,"protein_g":12,"carbs_g":1,"fat_g":10}]}\n\nA doua opțiune:\n{"type":"MEAL_PROPOSAL","nume":"Meal 2","meal_type":"pranz","items":[{"name":"Chicken","qty":150,"unit":"g","kcal":240,"protein_g":42,"carbs_g":0,"fat_g":5}]}`;
    const drafts = extractCoachMealDrafts({ raspuns: raw }, 'fă-mi 2 mese');
    expect(drafts.map((d) => d.name)).toEqual(['Meal 1', 'Meal 2']);
    expect(drafts[0].category).toBe('mic_dejun');
    expect(drafts[1].category).toBe('pranz');
  });
});
