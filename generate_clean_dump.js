const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const outputFile = path.join(rootDir, 'cod_sursa_complet_nutriai_fara_chei.txt');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  '.claude',
  '.vscode',
  '.gemini',
  '.system_generated',
  'brain'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.json', '.md', '.sql', '.html',
  '.css', '.bat', '.env'
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'cod_sursa_complet_nutriai_fara_chei.txt',
  'cod_sursa_fara_chei.txt',
  'cod_sursa_pentru_ai.txt',
  'generate_clean_dump.js',
  'Instructiuni_Gemini_Redesign_Antrenamente.txt',
  'Raport_Imbunatatiri_NutriAI.txt'
]);

function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        getAllFiles(fullPath, fileList);
      }
    } else {
      if (EXCLUDED_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      // include if allowed extension or if it's .env
      if (ALLOWED_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
        fileList.push(relPath);
      }
    }
  }

  return fileList;
}

function redactSecrets(content, relPath) {
  let redacted = content;

  // Redact Gemini Keys
  redacted = redacted.replace(/AQ\.[A-Za-z0-9_-]{20,}/g, '[GEMINI_API_KEY_REDACTED]');
  redacted = redacted.replace(/AIza[A-Za-z0-9_-]{30,}/g, '[GEMINI_API_KEY_REDACTED]');

  // Redact Groq Keys
  redacted = redacted.replace(/gsk_[A-Za-z0-9_-]{20,}/g, '[GROQ_API_KEY_REDACTED]');

  // Redact OpenAI Keys
  redacted = redacted.replace(/sk-proj-[A-Za-z0-9_-]{20,}/g, '[OPENAI_API_KEY_REDACTED]');
  redacted = redacted.replace(/sk-[A-Za-z0-9_-]{30,}/g, '[OPENAI_API_KEY_REDACTED]');

  // Redact Supabase Keys
  redacted = redacted.replace(/sb_publishable_[A-Za-z0-9_-]{10,}/g, '[SUPABASE_ANON_KEY_REDACTED]');
  redacted = redacted.replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[SUPABASE_JWT_KEY_REDACTED]');

  // If it's a .env file, ensure all key assignments are redacted
  if (relPath.includes('.env')) {
    const lines = redacted.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          return `${parts[0]}=[REDACTED]`;
        }
      }
      return line;
    });
    redacted = lines.join('\n');
  }

  return redacted;
}

function generateDump() {
  const files = getAllFiles(rootDir).sort();

  let output = '';
  output += '================================================================================\n';
  output += 'COD SURSA COMPLET NUTRITIE AI & FITNESS (FARA CHEI API / SECRETE)\n';
  output += `GENERAT LA: ${new Date().toISOString()}\n`;
  output += `NUMAR FISIERE: ${files.length}\n`;
  output += '================================================================================\n\n';

  output += 'CUPRINS FISIERE:\n';
  files.forEach((file, index) => {
    output += `${index + 1}. ${file}\n`;
  });
  output += '\n================================================================================\n\n';

  files.forEach((file, index) => {
    const fullPath = path.join(rootDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const safeContent = redactSecrets(content, file);

    output += '================================================================================\n';
    output += `FISIER (${index + 1}/${files.length}): ${file}\n`;
    output += '================================================================================\n\n';
    output += safeContent;
    if (!safeContent.endsWith('\n')) output += '\n';
    output += '\n\n';
  });

  fs.writeFileSync(outputFile, output, 'utf8');
  console.log(`Dump generat cu succes in: ${outputFile}`);
  console.log(`Total fisiere procesate: ${files.length}`);
}

generateDump();
