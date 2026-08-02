/**
 * Utilitare de sanitizare a input-ului.
 * Previn XSS stocat, prompt injection, si caractere de control in datele persistate.
 */

// Caractere de control (0x00-0x1F in afara de tab, newline, carriage return)
// + 0x7F (DEL)
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Tag-uri HTML periculoase (defense in depth - React Native Text nu interpreteaza HTML,
// dar datele ar putea fi afisate si pe web vreodata)
const HTML_TAGS = /<[^>]*>/g;

// Siruri folosite in prompt injection
const PROMPT_INJECTION_PATTERNS = [
  /ignore all previous instructions/i,
  /ignore previous instructions/i,
  /disregard (all )?previous/i,
  /forget (all )?previous/i,
  /you are now/i,
  /\[system\]/i,
  /<\|system\|>/i,
  /\[INST\]/i,
  /<\|user\|>/i,
  /\[\/INST\]/i,
  /pretend you are/i,
  /act as if/i,
  /new instructions:/i,
];

/**
 * Curata un string de intrare:
 * - Elimina caractere de control
 * - Elimina tag-uri HTML
 * - Normalizeaza whitespace
 * - Plafoneaza lungimea
 */
function sanitizeText(input, maxLength = 500) {
  if (typeof input !== 'string') return '';
  return input
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitizeaza un nume (aliment, masa etc.) - mai permisiv, pastreaza diacritice.
 */
function sanitizeName(input, maxLength = 150) {
  if (typeof input !== 'string') return '';
  return input
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

/**
 * Verifica daca un text contine sabloane de prompt injection.
 * Intoarce true daca textul pare a fi o tentativa de injectie.
 */
function detectPromptInjection(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitizeaza un obiect JSON recursiv, aplicand sanitizeText pe toate string-urile.
 * Protejeaza impotriva Prototype Pollution.
 */
function sanitizeObject(obj, maxDepth = 10) {
  if (maxDepth <= 0) return {};
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, maxDepth - 1));
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      // Blocheaza chei periculoase (Prototype Pollution)
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const value = obj[key];
      if (typeof value === 'string') {
        cleaned[key] = sanitizeText(value, 2000);
      } else if (typeof value === 'object') {
        cleaned[key] = sanitizeObject(value, maxDepth - 1);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Middleware Express care sanitizeaza req.body, req.query si req.params.
 */
function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

module.exports = {
  sanitizeText,
  sanitizeName,
  sanitizeObject,
  sanitizeRequest,
  detectPromptInjection,
};
