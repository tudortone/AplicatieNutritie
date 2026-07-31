/**
 * convertSvgToTsx.js
 *
 * Convertește SVG-urile anatomice din Figma în componente React Native TSX.
 * 
 * Reguli de conversie:
 * - Path-uri cu ID-uri anatomice → fill dinamic prin getMuscleFill()
 * - Path-uri cu ID-uri "Vector_*" în interiorul unui <g> anatomic → moștenesc ID-ul grupului
 * - Path-uri cu ID-uri "Vector_*" la nivel top-level → păstrează fill-ul original
 * - <defs> cu <linearGradient> → convertite în <LinearGradient> cu <Stop>
 * 
 * Usage: node scripts/convertSvgToTsx.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', 'frontend-nutritie');
const SVG_DIR = path.join(PROJECT_ROOT, 'assets', 'body');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'components');

// Pattern pentru ID-uri care NU sunt anatomice
const VECTOR_ID_PATTERN = /^Vector(?:_\d+)?$/i;

// Pattern pentru ID-uri non-anatomice: litere simple, numerice, sub-grupuri Figma
const NON_ANATOMICAL_PATTERN = /^[a-z]$|^\d+(_\d+)?$/i;

// Mapare nume românești → engleză (pentru ID-uri cu diacritice/entități HTML din Figma)
const ROMANIAN_TO_ENGLISH_ID = {
  // Spate
  'muèchii extensori ai antebraèului': 'forearm_extensors',
  'muèchiul brahial': 'brachialis',
  'muèchiul triceps brahial': 'triceps_brachii',
  'muèchiul triceps brahial_2': 'triceps_brachii_alt',
  'muèchiul soleus': 'soleus',
  'capätul medial': 'calves_medial_head',
  // Față (dacă există)
  'parte_abdomen_trb_rsmsd_spate': null, // ignorat complet
  'clavicula_fata_satnga_dreapta': 'clavicle',
};

// ID-uri de grup de exclus complet din output
const EXCLUDED_GROUP_IDS = {
  MuscleMapFront: new Set([
    'muschii_generali_strat_spate',  // stratul de spate - e în MuscleMapBack
    'm uschi_generali _fata',        // variantă cu spații
  ]),
  MuscleMapBack: new Set([
    // Nimic de exclus pentru spate
  ]),
};

// ID-uri de container care nu sunt mușchi individuali
const NON_MUSCLE_GROUP_IDS = new Set([
  'semi-cartoon-realistic-male-anatomical-chart--full (1) 1',
  'corp spate',
  'corp fata',
  'muschi mana spate',
  'muschi spate generali',
  'muschii_generali_strat_spate',
  'muschii_generali_corp_front',
  'm uschi_generali _fata',
  'head_back',
  'head_front',
  'Group 1', 'Group 2', 'Group 3', 'Group 4', 'Group 5',
  '1', '2', '4', // numeric sub-group IDs
  'parte_abdomen_trb_rsmsd_spate',
]);

/**
 * Decodifică entitățile HTML din ID-uri (ex: &#200;&#152; → Ș)
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/**
 * Normalizează un ID: decode HTML entities, lowercase, strip diacritics, replace spaces/special chars
 */
function normalizeId(rawId) {
  let id = decodeHtmlEntities(rawId);
  id = id
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimină diacriticele
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return id;
}

/**
 * Traduce un ID românesc în echivalentul englez
 */
function translateRomanianId(normalizedId) {
  for (const [roPattern, enId] of Object.entries(ROMANIAN_TO_ENGLISH_ID)) {
    const roNormalized = normalizeId(roPattern);
    if (normalizedId.startsWith(roNormalized)) {
      if (enId === null) return null; // ignoră complet
      // Păstrează sufixul _left/_right
      const suffix = normalizedId.replace(roNormalized, '');
      return enId + suffix;
    }
  }
  return null;
}

/**
 * Verifică dacă un ID este un mușchi anatomic (trebuie colorat dinamic)
 */
function isAnatomicalId(id) {
  if (!id || NON_MUSCLE_GROUP_IDS.has(id)) return false;
  if (VECTOR_ID_PATTERN.test(id)) return false;
  if (NON_ANATOMICAL_PATTERN.test(id)) return false;
  if (/^paint\d+_linear/.test(id)) return false;
  // Exclude group_* IDs (Figma auto-names)
  if (/^group_\d+$/i.test(id)) return false;
  return true;
}

/**
 * Procesează un ID brut din SVG: decode, traducere, curățare
 * Returnează ID-ul final de folosit în getMuscleFill
 */
function processId(rawId) {
  if (!rawId) return { finalId: rawId, isAnatomical: false };
  
  const trimmed = rawId.trim();
  
  // Verifică dacă e non-anatomic
  if (!isAnatomicalId(trimmed)) {
    return { finalId: trimmed, isAnatomical: false };
  }
  
  // Normalizează
  const normalized = normalizeId(trimmed);
  
  // Verifică traducerea română→engleză
  const translated = translateRomanianId(normalized);
  if (translated !== null) {
    if (translated === undefined) {
      return { finalId: trimmed, isAnatomical: false }; // ignorat
    }
    return { finalId: translated, isAnatomical: true };
  }
  
  // Păstrează ID-ul normalizat (fără diacritice, lowercase, underscore)
  return { finalId: normalized, isAnatomical: true };
}

/**
 * Parsează atributele unui tag XML
 */
function parseAttributes(tagContent) {
  const attrs = {};
  const regex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = regex.exec(tagContent)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function isNumericAttr(name) {
  return ['width', 'height', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'offset', 'stopOpacity', 'opacity', 'strokeWidth', 'strokeMiterlimit',
    'fontSize', 'letterSpacing'].includes(name);
}

/**
 * Convertiește atributele SVG în props JSX (fără fill și id)
 */
function attrsToProps(attrs) {
  const parts = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'id' || key === 'fill') continue;
    if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
    if (key === 'class') continue;

    const camelKey = toCamelCase(key);
    if (isNumericAttr(camelKey)) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        parts.push(`${camelKey}={${num}}`);
      } else {
        parts.push(`${camelKey}="${value}"`);
      }
    } else if (camelKey === 'style') {
      continue;
    } else {
      parts.push(`${camelKey}="${value}"`);
    }
  }
  return parts.join(' ');
}

/**
 * Generează fill-ul pentru un element
 * @param {object} processed - Rezultatul processId (cu finalId și isAnatomical)
 * @param {object} attrs - Atributele elementului
 * @param {string} indent - Indentarea curentă
 */
function generateFill(processed, attrs, indent) {
  const fillAttr = attrs['fill'];
  if (!fillAttr || fillAttr === 'none' || fillAttr.startsWith('url(')) {
    if (fillAttr) {
      return `\n${indent}  fill="${fillAttr}"`;
    }
    return '';
  }
  if (processed && processed.isAnatomical) {
    return `\n${indent}  fill={getMuscleFill("${processed.finalId}", "${fillAttr}", intensity, activeMuscles, activeColor, inactiveColor)}`;
  }
  return `\n${indent}  fill="${fillAttr}"`;
}

/**
 * Parsează SVG-ul într-o structură de linii
 */
function parseSvgToLines(svgContent) {
  const lines = [];
  let lastIndex = 0;

  const content = svgContent
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<rect[^>]*\/>\s*/g, '')
    .trim();

  const tagRegex = /(<(\/?)([a-zA-Z_:][a-zA-Z0-9_:.-]*)((?:\s+[a-zA-Z_:][a-zA-Z0-9_:.-]*\s*=\s*"[^"]*")*)\s*(\/?)>)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) lines.push({ type: 'text', content: text });
    }

    const isClosing = match[2] === '/';
    const tagName = match[3];
    const attrStr = match[4] || '';
    const isSelfClosing = match[5] === '/';
    const attrs = parseAttributes(attrStr);

    lines.push({
      type: isClosing ? 'close' : (isSelfClosing ? 'selfclose' : 'open'),
      tagName,
      attrs,
    });

    lastIndex = match.index + match[0].length;
  }

  return lines;
}

/**
 * Mapează numele de tag SVG la componenta React Native SVG
 */
function mapTagName(svgTag) {
  const map = {
    'path': 'Path',
    'g': 'G',
    'defs': 'Defs',
    'linearGradient': 'LinearGradient',
    'stop': 'Stop',
    'rect': 'Rect',
  };
  return map[svgTag] || null;
}

/**
 * Convertiește liniile parsate în JSX cu suport pentru moștenirea ID-ului de grup
 */
function linesToJsx(lines, componentName, viewBox) {
  const output = [];
  let indentLevel = 0;
  const indent = () => '  '.repeat(indentLevel);

  // Stiva de grupuri: fiecare element e { tagName, groupId, isAnatomical, excluded }
  const groupStack = [];
  const excludedIds = EXCLUDED_GROUP_IDS[componentName] || new Set();
  let skipDepth = 0; // cât de adânc suntem într-un grup exclus

  // Imports
  output.push(`import React from 'react';`);
  output.push(`import Svg, { G, Path, Defs, LinearGradient, Stop } from 'react-native-svg';`);
  output.push(`import { getMuscleFill } from './fitness/muscleColorUtils';`);
  output.push(``);
  output.push(`export interface MuscleMapProps {`);
  output.push(`  activeMuscles?: string[];`);
  output.push(`  intensity?: Record<string, number | undefined>;`);
  output.push(`  activeColor?: string;`);
  output.push(`  inactiveColor?: string;`);
  output.push(`  width?: number | string;`);
  output.push(`  height?: number | string;`);
  output.push(`  style?: any;`);
  output.push(`}`);
  output.push(``);
  output.push(`export const ${componentName}: React.FC<MuscleMapProps> = ({`);
  output.push(`  activeMuscles = [],`);
  output.push(`  intensity,`);
  output.push(`  activeColor = "#3B82F6",`);
  output.push(`  inactiveColor = "#1E293B",`);
  output.push(`  width = "100%",`);
  output.push(`  height = "100%",`);
  output.push(`  style,`);
  output.push(`}) => {`);
  output.push(`  return (`);
  output.push(`    <Svg`);
  output.push(`      width={width}`);
  output.push(`      height={height}`);
  output.push(`      viewBox="${viewBox}"`);
  output.push(`      preserveAspectRatio="xMidYMid meet"`);
  output.push(`      fill="none"`);
  output.push(`      style={style}`);
  output.push(`    >`);

  indentLevel = 3;

  for (const line of lines) {
    if (line.type === 'open') {
      const { tagName, attrs } = line;
      const rnTag = mapTagName(tagName);
      if (!rnTag) continue;

      const elementId = (attrs['id'] || '').trim();

      // Verifică dacă acest grup trebuie exclus
      if (rnTag === 'G' && excludedIds.has(elementId)) {
        skipDepth++;
        groupStack.push({ tagName: rnTag, groupId: elementId, isAnatomical: false, excluded: true });
        continue;
      }

      // Dacă suntem într-un grup exclus, skip
      if (skipDepth > 0) {
        if (rnTag === 'G') {
          groupStack.push({ tagName: rnTag, groupId: elementId, isAnatomical: false, excluded: true });
        }
        continue;
      }

      if (rnTag === 'G') {
        // Grup: verifică dacă e anatomic
        const processed = processId(elementId);
        const isGroupAnatomical = processed.isAnatomical;
        groupStack.push({ tagName: rnTag, groupId: processed.finalId, isAnatomical: isGroupAnatomical });

        const props = attrsToProps(attrs);
        const displayId = processed.finalId;
        const idProp = displayId ? ` id="${displayId}"` : '';
        const propStr = [idProp, props].filter(Boolean).join(' ');
        output.push(`${indent()}<${rnTag}${propStr ? ' ' + propStr : ''}>`);
        indentLevel++;
      } else if (rnTag === 'Path') {
        // Determină ID-ul efectiv
        const processed = processId(elementId);
        let effectiveProcessed = processed;
        if (!processed.isAnatomical) {
          // Caută în stivă un grup părinte anatomic
          for (let i = groupStack.length - 1; i >= 0; i--) {
            if (groupStack[i].isAnatomical) {
              effectiveProcessed = { finalId: groupStack[i].groupId, isAnatomical: true };
              break;
            }
          }
        }

        const props = attrsToProps(attrs);
        const displayId = processed.finalId;
        const idProp = displayId ? ` id="${displayId}"` : '';
        const dynamicFill = generateFill(effectiveProcessed, attrs, indent());
        const propStr = [idProp, props].filter(Boolean).join(' ');
        output.push(`${indent()}<Path${propStr ? ' ' + propStr : ''}${dynamicFill} />`);
      } else {
        // Defs, LinearGradient, Stop etc.
        const props = attrsToProps(attrs);
        const idProp = elementId ? ` id="${elementId.replace(/\s+/g, '_')}"` : '';
        const propStr = [idProp, props].filter(Boolean).join(' ');

        if (rnTag === 'Stop') {
          output.push(`${indent()}<Stop${propStr ? ' ' + propStr : ''} />`);
        } else {
          output.push(`${indent()}<${rnTag}${propStr ? ' ' + propStr : ''}>`);
          indentLevel++;
        }
      }
    } else if (line.type === 'selfclose') {
      // Skip if inside excluded group
      if (skipDepth > 0) continue;

      const { tagName, attrs } = line;
      const rnTag = mapTagName(tagName);
      if (!rnTag) continue;

      const elementId = (attrs['id'] || '').trim();

      if (rnTag === 'Path') {
        const processed = processId(elementId);
        let effectiveProcessed = processed;
        if (!processed.isAnatomical) {
          for (let i = groupStack.length - 1; i >= 0; i--) {
            if (groupStack[i].isAnatomical) {
              effectiveProcessed = { finalId: groupStack[i].groupId, isAnatomical: true };
              break;
            }
          }
        }
        const props = attrsToProps(attrs);
        const displayId = processed.finalId;
        const idProp = displayId ? ` id="${displayId}"` : '';
        const dynamicFill = generateFill(effectiveProcessed, attrs, indent());
        const propStr = [idProp, props].filter(Boolean).join(' ');
        output.push(`${indent()}<Path${propStr ? ' ' + propStr : ''}${dynamicFill} />`);
      } else {
        const props = attrsToProps(attrs);
        const idProp = elementId ? ` id="${elementId}"` : '';
        const propStr = [idProp, props].filter(Boolean).join(' ');
        output.push(`${indent()}<${rnTag}${propStr ? ' ' + propStr : ''} />`);
      }
    } else if (line.type === 'close') {
      const { tagName } = line;
      const rnTag = mapTagName(tagName);
      if (!rnTag) continue;

      // Dacă suntem într-un grup exclus
      if (skipDepth > 0) {
        if (rnTag === 'G' && groupStack.length > 0 && groupStack[groupStack.length - 1].excluded) {
          groupStack.pop();
          skipDepth--;
        }
        continue;
      }

      indentLevel = Math.max(0, indentLevel - 1);
      output.push(`${indent()}</${rnTag}>`);

      // Scoate din stivă dacă e grup
      if (rnTag === 'G' && groupStack.length > 0) {
        groupStack.pop();
      }
    }
  }

  // Close all remaining open groups
  while (groupStack.length > 0) {
    indentLevel = Math.max(0, indentLevel - 1);
    output.push(`${indent()}</G>`);
    groupStack.pop();
  }

  output.push(`    </Svg>`);
  output.push(`  );`);
  output.push(`};`);
  output.push(``);
  output.push(`export default ${componentName};`);

  return output.join('\n');
}

function main() {
  // Procesează back_body.svg
  const backSvgPath = path.join(SVG_DIR, 'back_body.svg');
  const backSvg = fs.readFileSync(backSvgPath, 'utf-8');
  const viewBoxMatch = backSvg.match(/viewBox="([^"]+)"/);
  const backViewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 431 807';

  const backLines = parseSvgToLines(backSvg);
  const backTsx = linesToJsx(backLines, 'MuscleMapBack', backViewBox);
  const backOutputPath = path.join(OUTPUT_DIR, 'MuscleMapBack.tsx');
  fs.writeFileSync(backOutputPath, backTsx, 'utf-8');
  console.log(`✅ Generated MuscleMapBack.tsx (${backLines.length} elements)`);

  // Procesează front_body.svg
  const frontSvgPath = path.join(SVG_DIR, 'front_body.svg');
  const frontSvg = fs.readFileSync(frontSvgPath, 'utf-8');
  const frontViewBoxMatch = frontSvg.match(/viewBox="([^"]+)"/);
  const frontViewBox = frontViewBoxMatch ? frontViewBoxMatch[1] : '0 0 427 808';

  const frontLines = parseSvgToLines(frontSvg);
  const frontTsx = linesToJsx(frontLines, 'MuscleMapFront', frontViewBox);
  const frontOutputPath = path.join(OUTPUT_DIR, 'MuscleMapFront.tsx');
  fs.writeFileSync(frontOutputPath, frontTsx, 'utf-8');
  console.log(`✅ Generated MuscleMapFront.tsx (${frontLines.length} elements)`);

  console.log('\n🎉 Conversion complete!');
}

main();
