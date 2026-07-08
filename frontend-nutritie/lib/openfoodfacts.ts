export interface ProdusScanat {
  barcode: string;
  nume: string;
  brand?: string;
  calorii_100g: number;
  proteine_100g: number;
  grasimi_100g: number;
  carbohidrati_100g: number;
  imagine_url?: string;
}

/**
 * Caută un produs după codul de bare în OpenFoodFacts API (gratuit, fără cheie).
 */
export async function getProdusByBarcode(barcode: string): Promise<ProdusScanat | null> {
  const code = barcode.trim();
  if (!code) return null;

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: {
        'User-Agent': 'NutriAI - React Native App - Contact: tudortone'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return null;
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    const calorii = Math.round(Number(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0));
    const proteine = Math.round(Number(nutriments['proteins_100g'] || nutriments['proteins'] || 0));
    const grasimi = Math.round(Number(nutriments['fat_100g'] || nutriments['fat'] || 0));
    const carbohidrati = Math.round(Number(nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0));

    const numeProdus = p.product_name_ro || p.product_name || `Produs EAN ${code}`;
    const brand = p.brands || p.brand_owner || '';

    return {
      barcode: code,
      nume: numeProdus,
      brand: brand,
      calorii_100g: calorii,
      proteine_100g: proteine,
      grasimi_100g: grasimi,
      carbohidrati_100g: carbohidrati,
      imagine_url: p.image_front_small_url || p.image_url || undefined,
    };
  } catch (error) {
    console.warn('Eroare fetch OpenFoodFacts:', error);
    return null;
  }
}
