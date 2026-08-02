const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..'); // AplicatieNutritie
const outputFile = path.join(rootDir, 'cod_sursa_pentru_ai.txt');

const includeExtensions = ['.ts', '.tsx', '.js', '.json', '.md'];
const excludeDirs = ['node_modules', '.expo', '.git', '.vscode', 'dist', '.claude', 'assets', 'public', '.gemini', '.system_generated', 'brain'];
const excludeFiles = ['package-lock.json', 'cod_sursa_pentru_ai.txt', 'cod_complet_proiect.txt', 'export_for_ai.js'];

let outputContent = `# COD SURSĂ CONSOLIDAT — NUTRIAI (FRONTEND + BACKEND)\n`;
outputContent += `# GENERAT AUTOMAT PENTRU ASISTENȚĂ AI\n`;
outputContent += `# NOTĂ: Fişierele de securitate (.env, chei secrete, token-uri JWT) au fost EXCLUSE sau MASCATE automat.\n\n`;

function scanDirectory(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(rootDir, fullPath);
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(item)) {
        scanDirectory(fullPath);
      }
    } else {
      // Exclundem fisiere temporare sau cu date sensibile (.env)
      if (item.startsWith('.env') || excludeFiles.includes(item) || item.endsWith('-lock.json')) {
        continue;
      }
      const ext = path.extname(item);
      if (includeExtensions.includes(ext)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Sanitizare suplimentara pentru securitate (mascare potențiale chei sau tokene în text)
        content = content.replace(/(EXPO_PUBLIC_SUPABASE_URL\s*=\s*)([^\s;"']+)/gi, '$1[REDACTED_SUPABASE_URL]');
        content = content.replace(/(EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*)([^\s;"']+)/gi, '$1[REDACTED_SUPABASE_KEY]');
        content = content.replace(/(SUPABASE_URL\s*=\s*)([^\s;"']+)/gi, '$1[REDACTED_SUPABASE_URL]');
        content = content.replace(/(SUPABASE_ANON_KEY\s*=\s*)([^\s;"']+)/gi, '$1[REDACTED_SUPABASE_KEY]');
        content = content.replace(/(GEMINI_API_KEY\s*=\s*)([^\s;"']+)/gi, '$1[REDACTED_GEMINI_KEY]');
        content = content.replace(/(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/g, '[REDACTED_JWT_TOKEN]');
        content = content.replace(/(AIza[0-9A-Za-z-_]{35})/g, '[REDACTED_GOOGLE_API_KEY]');

        outputContent += `================================================================================\n`;
        outputContent += `FILE: ${relPath.replace(/\\/g, '/')}\n`;
        outputContent += `================================================================================\n\n`;
        outputContent += content.trim() + `\n\n`;
      }
    }
  }
}

try {
  scanDirectory(rootDir);
  fs.writeFileSync(outputFile, outputContent, 'utf8');
  console.log('SUCCESS: Fisier generat la:', outputFile);
  console.log('Dimensiune:', (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2), 'MB');
} catch (err) {
  console.error('ERROR generating AI export:', err);
}
