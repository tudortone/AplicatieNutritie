import { parseMealProposal, extractTextWithoutMealProposal } from '../lib/parseMealProposal';

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
});
