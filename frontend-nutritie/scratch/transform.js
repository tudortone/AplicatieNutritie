const fs = require('fs');
const cheerio = require('cheerio');

function processSvg(inputFile, outputFile, componentName) {
  let content = fs.readFileSync(inputFile, 'utf8');
  
  // Extract just the <svg>...</svg> if there's other junk
  const svgStartMatch = content.match(/<svg[^>]*>/i);
  const svgEndMatch = content.lastIndexOf('</svg>');
  if (svgStartMatch && svgEndMatch !== -1) {
    content = content.substring(svgStartMatch.index, svgEndMatch + 6);
  }

  const $ = cheerio.load(content, { xmlMode: true, decodeEntities: false });

  const svg = $('svg');
  if (!svg.length) {
    console.error("No SVG found in", inputFile);
    return;
  }

  const viewBox = svg.attr('viewBox') || "0 0 431 807";

  function processNode(node, parentId = null) {
    if (node.type !== 'tag') return '';
    
    let tagName = node.name.charAt(0).toUpperCase() + node.name.slice(1);
    if (tagName.toLowerCase() === 'lineargradient') tagName = 'LinearGradient';
    
    let attrs = '';
    let idValue = node.attribs['id'];
    let currentId = idValue || parentId;
    
    for (let [key, value] of Object.entries(node.attribs)) {
      let reactKey = key;
      if (key === 'stop-color') reactKey = 'stopColor';
      if (key === 'stop-opacity') reactKey = 'stopOpacity';
      if (key === 'fill-rule') reactKey = 'fillRule';
      if (key === 'clip-rule') reactKey = 'clipRule';
      if (key === 'stroke-width') reactKey = 'strokeWidth';
      if (key === 'stroke-linecap') reactKey = 'strokeLinecap';
      if (key === 'stroke-linejoin') reactKey = 'strokeLinejoin';
      if (key === 'stroke-miterlimit') reactKey = 'strokeMiterlimit';
      if (key === 'font-family') reactKey = 'fontFamily';
      if (key === 'font-size') reactKey = 'fontSize';
      if (key === 'font-weight') reactKey = 'fontWeight';
      if (key === 'text-anchor') reactKey = 'textAnchor';
      if (key === 'xmlns:xlink') reactKey = 'xmlnsXlink';
      if (key === 'xml:space') reactKey = 'xmlSpace';
      if (key === 'class') reactKey = 'className';
      if (key === 'transform') {
         // React Native SVG supports transform but sometimes differently. It's usually fine as string
      }
      
      // We will override `fill` if it's a muscle path
      if (key === 'fill' && currentId && tagName === 'Path') {
         continue; // skip original fill, we will add dynamic one
      }

      attrs += ` ${reactKey}="${value}"`;
    }
    
    let dynamicFill = '';
    if (currentId && tagName === 'Path') {
       let originalFill = node.attribs['fill'] || 'none';
       // We only override the fill if it's actually an active muscle!
       // But wait, the background or other paths might also have IDs like "corp spate", "Vector_12".
       // So we should only override if the ID is a KNOWN muscle! But we don't know the list in this script.
       // The best way is to call `getMuscleColor(id, originalFill)` which returns the original fill if not active!
       dynamicFill = ` fill={getMuscleColor("${currentId}", "${originalFill}")}`;
    } else if (tagName === 'Path' && node.attribs['fill']) {
       dynamicFill = ` fill="${node.attribs['fill']}"`;
    } else if (tagName === 'Path' && !node.attribs['fill']) {
       // if no fill, keep none or let it inherit
    }

    let childrenStr = '';
    if (node.children) {
      node.children.forEach(child => {
        childrenStr += processNode(child, currentId);
      });
    }

    if (childrenStr) {
      return `<${tagName}${attrs}${dynamicFill}>\n${childrenStr}</${tagName}>\n`;
    } else {
      return `<${tagName}${attrs}${dynamicFill} />\n`;
    }
  }

  let childrenJsx = '';
  if (svg[0].children) {
    svg[0].children.forEach(child => {
      childrenJsx += processNode(child, null);
    });
  }

  const componentTemplate = `import * as React from "react";
import Svg, {
  SvgProps,
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { View } from "react-native";
import { toCanonicalMuscle } from './fitness/exerciseIntensity';
import { muscleForMeshName } from './fitness/muscleMeshMap';
import { heatColor } from './fitness/heatColor';

export interface MuscleMapProps extends SvgProps {
  activeMuscles?: string[];
  intensity?: Record<string, number | undefined>;
  side?: 'front' | 'back';
  activeColor?: string;
  inactiveColor?: string;
}

export const ${componentName}: React.FC<MuscleMapProps> = ({
  activeMuscles = [],
  intensity,
  side = '${componentName === 'MuscleMapFront' ? 'front' : 'back'}',
  activeColor = '#00F0FF',
  inactiveColor = '#2A323D',
  ...props
}) => {

  const getMuscleColor = (id: string, originalFill: string) => {
    if (!id) return originalFill;
    
    // Some IDs might be "corp spate" or "Vector_12", so we check if they map to a muscle
    const canonical = toCanonicalMuscle(id) || muscleForMeshName(id) || id;
    
    // Check if we have intensity for this muscle
    if (intensity && intensity[canonical]) {
        const val = intensity[canonical] || 0;
        if (val > 0) {
            return heatColor(val);
        }
    }
    
    // Fallback to activeMuscles array
    if (activeMuscles && activeMuscles.includes(canonical)) {
        return activeColor;
    }
    
    return originalFill;
  };

  return (
    <View style={[{ position: 'relative', width: props.width || '100%', height: props.height || '100%' }, props.style as any]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="${viewBox}"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        {...props}
      >
        ${childrenJsx}
      </Svg>
    </View>
  );
};

export default ${componentName};
`;

  fs.writeFileSync(outputFile, componentTemplate);
}

try {
  processSvg('extracted_svg_0.txt', '../components/MuscleMapBack.tsx', 'MuscleMapBack');
  // We skip front for now until the user provides it
  console.log("Transformation complete!");
} catch (e) {
  console.error("Error during transformation:", e);
}
