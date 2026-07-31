const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const outputFile = path.join(rootDir, 'cod_complet_nutriai_fara_chei.txt');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'dist-test',
  'scratch',
  '.claude',
  '.vscode',
  '.gemini',
  '.system_generated',
  'brain',
  '.agents',
  '.zcode',
  'components',
  'scripts'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.json', '.md', '.sql', '.html',
  '.css', '.env'
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'cod_complet_nutriai_fara_chei.txt',
  'cod_sursa_complet_nutriai_fara_chei.txt',
  'cod_sursa_fara_chei.txt',
  'cod_sursa_pentru_ai.txt',
  'generate_clean_dump.js',
  'export_code.js',
  'fix_contexts.js',
  'fix_healthsync.js',
  'fix_healthsync2.js',
  'fix_hooks.sh',
  'fix_meseazi.js',
  'fix_meseazi2.js',
  'update_healthsync.js',
  'update_meseazi.js',
  'backend_check.sh',
  'porneste_aplicatia.bat',
  'CHANGELOG_AI.md',
  'INSTRUCTIUNI_AI.md',
  'INSTRUCTIUNI_AI_v5.md',
  'INSTRUCTIUNI_GEMINI_v6.md',
  'toate_fisierele_cod.txt'
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
      
      // Include only source code directories or root sql schema
      const isAppSource = relPath.startsWith('frontend-nutritie/') || 
                          relPath.startsWith('backend-nutritie-ai/') || 
                          relPath === 'supabase_rls_policies.sql';

      if (!isAppSource) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
        fileList.push(relPath);
      }
    }
  }

  return fileList;
}

function buildTree(fileList) {
  const tree = {};
  for (const filePath of fileList) {
    const parts = filePath.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = null;
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }
  return tree;
}

function renderTree(node, prefix = '') {
  let result = '';
  const keys = Object.keys(node).sort((a, b) => {
    const aIsDir = node[a] !== null;
    const bIsDir = node[b] !== null;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.localeCompare(b);
  });

  keys.forEach((key, index) => {
    const isLast = index === keys.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const isDir = node[key] !== null;
    result += `${prefix}${connector}${key}${isDir ? '/' : ''}\n`;
    if (isDir) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      result += renderTree(node[key], childPrefix);
    }
  });
  return result;
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
  const tree = buildTree(files);

  let output = '';
  output += '================================================================================\n';
  output += 'COD SURSA EXCLUSIV NUTRITIE AI & FITNESS (FARA CHEI API / SECRETE)\n';
  output += `GENERAT LA: ${new Date().toISOString()}\n`;
  output += `NUMAR FISIERE SURSA: ${files.length}\n`;
  output += '================================================================================\n\n';

  output += 'HARTA ARBORE A STRUCTURII DE FIȘIERE (PROJECT TREE MAP):\n';
  output += '.\n';
  output += renderTree(tree);
  output += '\n================================================================================\n\n';

  output += 'CUPRINS NUMEROTAT AL FIȘIERELOR:\n';
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
  console.log(`Total fisiere sursa procesate: ${files.length}`);
}

generateDump();

