import { parseMealProposal, extractTextWithoutMealProposal, formatMealProposalForChat, containsStructuredMealProtocol } from '../lib/parseMealProposal';

describe('Phase B: Chat Advisory First & MEAL_PROPOSAL Handling', () => {
  it('extracts conversational recipe text while cleanly removing the MEAL_PROPOSAL JSON', () => {
    const rawAiResponse = `Iată o rețetă excelentă de clătite proteice:

Ingrediente:
- 2 ouă (100g)
- 30g pudră proteică
- 50g ovăz măcinat

Mod de preparare:
1. Amestecă ingredientele într-un bol până la omogenizare.
2. Încinge o tigaie antiaderentă și toarnă compoziția.
3. Coace 2 minute pe fiecare parte.

Poftă bună!

{"type":"MEAL_PROPOSAL","nume":"Clătite proteice","items":[{"name":"Ouă","qty":100,"unit":"g","kcal":143,"protein_g":12.6,"carbs_g":0.7,"fat_g":9.5,"fiber_g":0},{"name":"Pudră proteică","qty":30,"unit":"g","kcal":115,"protein_g":24,"carbs_g":2,"fat_g":1,"fiber_g":0},{"name":"Fulgi ovăz","qty":50,"unit":"g","kcal":185,"protein_g":6.5,"carbs_g":30,"fat_g":3.5,"fiber_g":5}],"totals":{"kcal":443,"protein_g":43.1,"carbs_g":32.7,"fat_g":13.5}}`;

    const cleanText = extractTextWithoutMealProposal(rawAiResponse);
    expect(cleanText).toContain('Iată o rețetă excelentă de clătite proteice:');
    expect(cleanText).toContain('Mod de preparare:');
    expect(cleanText).toContain('Poftă bună!');
    expect(cleanText).not.toContain('"type":"MEAL_PROPOSAL"');
    expect(cleanText).not.toContain('protein_g');

    // Canonical parser preserves structured schema names
    const proposal = parseMealProposal(rawAiResponse);
    expect(proposal).not.toBeNull();
    expect(proposal?.type).toBe('MEAL_PROPOSAL');
    expect(proposal?.nume).toBe('Clătite proteice');
    expect(proposal?.items).toHaveLength(3);
    expect(proposal?.totals.kcal).toBe(443);
    expect(proposal?.totals.protein_g).toBe(43.1);
  });

  it('returns original text untouched when no MEAL_PROPOSAL JSON is present', () => {
    const advice = 'Pentru a-ți crește masa musculară, recomand un surplus caloric de 300 kcal și 1.8g proteine per kg corp.';
    expect(extractTextWithoutMealProposal(advice)).toBe(advice);
    expect(parseMealProposal(advice)).toBeNull();
  });

  it('handles meal proposal object directly without mutating or auto-saving', () => {
    const obj = {
      type: 'MEAL_PROPOSAL',
      nume: 'Omletă cu brânză',
      items: [
        { name: 'Ouă', qty: 150, unit: 'g', kcal: 215, protein_g: 19, carbs_g: 1, fat_g: 14, fiber_g: 0 }
      ],
      totals: { kcal: 215, protein_g: 19, carbs_g: 1, fat_g: 14 }
    };
    const parsed = parseMealProposal(obj);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('MEAL_PROPOSAL');
    expect(parsed?.items[0].name).toBe('Ouă');
    expect(parsed?.totals.protein_g).toBe(19);
  });

  it('turns a JSON-only recipe proposal into readable, numbered recipe copy', () => {
    const proposal = parseMealProposal({
      type: 'MEAL_PROPOSAL',
      nume: 'Protein bowl',
      items: [
        { name: 'Chicken', qty: 150, unit: 'g', kcal: 248, protein_g: 46, carbs_g: 0, fat_g: 5 },
        { name: 'Rice', qty: 120, unit: 'g', kcal: 156, protein_g: 3, carbs_g: 34, fat_g: 0 },
      ],
      preparare: ['Cook the rice.', 'Grill the chicken.', 'Serve together.'],
      totals: { kcal: 404, protein_g: 49, carbs_g: 34, fat_g: 5 },
    });

    expect(proposal).not.toBeNull();
    const text = formatMealProposalForChat(proposal!, 'en');
    expect(text).toContain('Protein bowl');
    expect(text).toContain('Ingredients');
    expect(text).toContain('Chicken — 150 g');
    expect(text).toContain('1. Cook the rice.');
    expect(text).toContain('2. Grill the chicken.');
    expect(text).toContain('404 kcal');
    expect(text).not.toContain('MEAL_PROPOSAL');
    expect(text).not.toContain('protein_g');
  });

  it('detects malformed structured protocol so it cannot leak into a chat bubble', () => {
    const malformed = '{"type":"MEAL_PROPOSAL","meal_type":"pranz","items":[';
    expect(parseMealProposal(malformed)).toBeNull();
    expect(containsStructuredMealProtocol(malformed)).toBe(true);
    expect(containsStructuredMealProtocol('A normal nutrition answer.')).toBe(false);
  });

  test.each([
    ['ro', 'Ingrediente', 'Mod de preparare'],
    ['en', 'Ingredients', 'Preparation'],
    ['fr', 'Ingrédients', 'Préparation'],
    ['de', 'Zutaten', 'Zubereitung'],
  ])('formats structured recipe presentation in current %s locale', (locale, ingredients, preparation) => {
    const proposal = parseMealProposal({
      type: 'MEAL_PROPOSAL', meal_type: 'pranz', nume: 'Bowl',
      items: [{ name: 'Rice', qty: 100, unit: 'g', kcal: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3, fiber_g: 0.3 }],
      preparare: ['Cook.', 'Serve.'],
      totals: { kcal: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3 },
    })!;
    const visible = formatMealProposalForChat(proposal, locale);
    expect(visible).toContain(ingredients);
    expect(visible).toContain(preparation);
    expect(visible).not.toContain('MEAL_PROPOSAL');
  });
});
