import fs from 'fs';
import path from 'path';

describe('paywall foloseste exclusiv metadatele Play eligibile', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/paywall.tsx'), 'utf8');

  test('nu mai contine discount, best-price sau trial inventate', () => {
    expect(source).not.toMatch(/~35% reducere/i);
    expect(source).not.toMatch(/CEL MAI BUN PREȚ/i);
    expect(source).not.toMatch(/trial gratuit/i);
  });

  test('afiseaza campurile normalizate Play', () => {
    expect(source).not.toContain('PurchasesPackage');
    expect(source).toContain('offer.displayPrice');
    expect(source).toContain('offer.billingPeriod');
    expect(source).toContain('purchasesAvailable');
  });
});
