'use strict';

const {
  construiesteSystemPromptChat,
  REGEX_MEAL_LOG_MULTILINGUAL,
  estePropunereMasaValida,
} = require('../services/ai/chat');
const { obtinePromptAnalizaFoto } = require('../services/ai/vision');

describe('P1-16: Chat & Vision Locale Contract & Meal Proposal Verification', () => {
  describe('construiesteSystemPromptChat', () => {
    it('generates English system prompt with strict language contract and canonical meal_type ids', () => {
      const prompt = construiesteSystemPromptChat({ limba: 'en', calCons: 500, calTinta: 2200, protCons: 40, protTinta: 160 });
      expect(prompt).toContain('Selected Application Language: ENGLISH.');
      expect(prompt).toContain('You MUST respond EXCLUSIVELY in English.');
      expect(prompt).toContain('CRITICAL LANGUAGE CONTRACT:');
      expect(prompt).toContain('Sal');
      expect(prompt).toContain('The "meal_type" key MUST be one of: "mic_dejun", "pranz", "cina", "gustare"');
      expect(prompt).toContain('"meal_type": "pranz"');
    });

    it('generates French system prompt with strict language contract', () => {
      const prompt = construiesteSystemPromptChat({ limba: 'fr', calCons: 600, calTinta: 2000, protCons: 50, protTinta: 150 });
      expect(prompt).toContain('Langue sélectionnée dans l\'application : FRANÇAIS.');
      expect(prompt).toContain('Tu DOIS répondre EXCLUSIVEMENT en français.');
      expect(prompt).toContain('CONTRAT DE LANGUE STRICT :');
      expect(prompt).toContain('Sal');
      expect(prompt).toContain('"mic_dejun", "pranz", "cina", "gustare"');
    });

    it('generates German system prompt with strict language contract', () => {
      const prompt = construiesteSystemPromptChat({ limba: 'de', calCons: 700, calTinta: 2500, protCons: 60, protTinta: 180 });
      expect(prompt).toContain('Ausgewählte App-Sprache: DEUTSCH.');
      expect(prompt).toContain('Du MUSST AUSSCHLIESSLICH auf Deutsch antworten.');
      expect(prompt).toContain('STRIKTER SPRACHVERTRAG:');
      expect(prompt).toContain('Sal');
      expect(prompt).toContain('"mic_dejun", "pranz", "cina", "gustare"');
    });

    it('generates Romanian system prompt by default or with ro', () => {
      const promptRo = construiesteSystemPromptChat({ limba: 'ro' });
      expect(promptRo).toContain('CONTRAT DE LIMBĂ STRICT:');
      expect(promptRo).toContain('Limba selectată în aplicație: ROMÂNĂ.');
      expect(promptRo).toContain('"mic_dejun", "pranz", "cina", "gustare"');

      const promptDef = construiesteSystemPromptChat({});
      expect(promptDef).toContain('Selected Application Language: ENGLISH.');
    });

    it('normalizes regional app locales before selecting the response language', () => {
      expect(construiesteSystemPromptChat({ limba: 'en-US' })).toContain('Selected Application Language: ENGLISH.');
      expect(construiesteSystemPromptChat({ limba: 'fr-FR' })).toContain("Langue sélectionnée dans l'application : FRANÇAIS.");
      expect(construiesteSystemPromptChat({ limba: 'de-DE' })).toContain('Ausgewählte App-Sprache: DEUTSCH.');
      expect(construiesteSystemPromptChat({ limba: 'ro-RO' })).toContain('Limba selectată în aplicație: ROMÂNĂ.');
    });

    it.each([
      ['en', 'For recipe requests, provide a human-readable recipe'],
      ['fr', 'Pour toute demande de recette, fournis une recette lisible'],
      ['de', 'Gib bei Rezeptanfragen ein gut lesbares Rezept aus'],
      ['ro', 'Pentru cererile de rețete, oferă o rețetă ușor de citit'],
    ])('requires a localized, step-by-step recipe instead of raw JSON in %s', (limba, contract) => {
      expect(construiesteSystemPromptChat({ limba })).toContain(contract);
    });
  });

  describe('REGEX_MEAL_LOG_MULTILINGUAL', () => {
    it('matches multilingual meal logging phrases', () => {
      // Romanian
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('am mancat o salata si pui')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('am consumat 200g orez')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('logheaza micul dejun')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('adauga in jurnal masa')).toBe(true);

      // English
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('i ate 2 scrambled eggs')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('i had an apple and protein shake')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('i drank a smoothie')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('log meal please')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('add to diary')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('log food: 1 banana')).toBe(true);

      // French
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('j\'ai mangé une omelette')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('ajouter au journal mon repas')).toBe(true);

      // German
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('ich habe gegessen einen Salat')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('mahlzeit loggen')).toBe(true);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('zum tagebuch hinzufügen')).toBe(true);
    });

    it('does not trigger on general greetings or nutrition queries', () => {
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('Sal')).toBe(false);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('Salut')).toBe(false);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('Hello there')).toBe(false);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('Hi, how are you?')).toBe(false);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('What should I eat before workout?')).toBe(false);
      expect(REGEX_MEAL_LOG_MULTILINGUAL.test('Ce alimente au mult potasiu?')).toBe(false);
    });
  });

  describe('estePropunereMasaValida & ALIASE_MEAL_TYPE', () => {
    it('validates and normalizes canonical proposal structure', () => {
      const canonicalProposal = {
        type: 'MEAL_PROPOSAL',
        meal_type: 'pranz',
        items: [{ name: 'Chicken', qty: 150, unit: 'g', kcal: 200, protein_g: 35, carbs_g: 0, fat_g: 4 }],
        totals: { kcal: 200, protein_g: 35, carbs_g: 0, fat_g: 4 },
      };
      expect(estePropunereMasaValida(canonicalProposal)).toBe(true);
      expect(canonicalProposal.meal_type).toBe('pranz');
    });

    it('normalizes international meal_type aliases to canonical DB identifiers', () => {
      const enLunch = {
        type: 'MEAL_PROPOSAL',
        meal_type: 'lunch',
        items: [{ name: 'Salad' }],
        totals: { kcal: 100 },
      };
      expect(estePropunereMasaValida(enLunch)).toBe(true);
      expect(enLunch.meal_type).toBe('pranz');

      const frBreakfast = {
        type: 'MEAL_PROPOSAL',
        meal_type: 'petit-dejeuner',
        items: [{ name: 'Croissant' }],
        totals: { kcal: 250 },
      };
      expect(estePropunereMasaValida(frBreakfast)).toBe(true);
      expect(frBreakfast.meal_type).toBe('mic_dejun');

      const deDinner = {
        type: 'MEAL_PROPOSAL',
        meal_type: 'abendessen',
        items: [{ name: 'Brot' }],
        totals: { kcal: 300 },
      };
      expect(estePropunereMasaValida(deDinner)).toBe(true);
      expect(deDinner.meal_type).toBe('cina');

      const enSnack = {
        type: 'MEAL_PROPOSAL',
        meal_type: 'snack',
        items: [{ name: 'Almonds' }],
        totals: { kcal: 160 },
      };
      expect(estePropunereMasaValida(enSnack)).toBe(true);
      expect(enSnack.meal_type).toBe('gustare');
    });

    it('rejects invalid meal proposal structures', () => {
      expect(estePropunereMasaValida(null)).toBe(false);
      expect(estePropunereMasaValida({})).toBe(false);
      expect(estePropunereMasaValida({ type: 'OTHER' })).toBe(false);
      expect(estePropunereMasaValida({ type: 'MEAL_PROPOSAL', meal_type: 'invalid', items: [{ name: 'X' }], totals: {} })).toBe(false);
      expect(estePropunereMasaValida({ type: 'MEAL_PROPOSAL', meal_type: 'pranz', items: [], totals: {} })).toBe(false);
      expect(estePropunereMasaValida({ type: 'MEAL_PROPOSAL', meal_type: 'pranz', items: [{ name: 'X' }] })).toBe(false);
    });
  });

  describe('obtinePromptAnalizaFoto', () => {
    it('provides English directive when limba is en', () => {
      const promptEn = obtinePromptAnalizaFoto('en');
      expect(promptEn).toContain('CRITICAL LANGUAGE DIRECTIVE: All food names in the "nume" field MUST be in English');
      expect(promptEn).toContain('"nume": "numele alimentului 1"');
    });

    it('provides French directive when limba is fr', () => {
      const promptFr = obtinePromptAnalizaFoto('fr');
      expect(promptFr).toContain('DIRECTIVE DE LANGUE CRITIQUE: Tous les noms d\'aliments dans le champ "nume" DOIVENT être en français');
    });

    it('provides German directive when limba is de', () => {
      const promptDe = obtinePromptAnalizaFoto('de');
      expect(promptDe).toContain('KRITISCHE SPRACHANWEISUNG: Alle Lebensmittelbezeichnungen im Feld "nume" MÜSSEN auf Deutsch sein');
    });

    it('provides Romanian directive by default', () => {
      const promptRo = obtinePromptAnalizaFoto('ro');
      expect(promptRo).toContain('IMPORTANT: Numele alimentelor din campul "nume" trebuie sa fie in limba romana.');
    });
  });
});
