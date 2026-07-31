const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, 'frontend-nutritie');
const outputFile = path.join(__dirname, 'toate_fisierele_cod.txt');

// Liste de directoare și fișiere pe care nu vrem să le exportăm
const excludeDirs = ['node_modules', '.expo', 'dist', '.git', 'assets'];
const validExtensions = ['.ts', '.tsx', '.js', '.jsx'];

let totalFiles = 0;

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        
        if (stat && stat.isDirectory()) {
            const folderName = path.basename(file);
            if (!excludeDirs.includes(folderName) && !folderName.startsWith('.')) {
                results = results.concat(walkDir(file));
            }
        } else {
            const ext = path.extname(file);
            if (validExtensions.includes(ext)) {
                results.push(file);
            }
        }
    });
    return results;
}

try {
    const allFiles = walkDir(rootDir);
    let outputContent = '';

    allFiles.forEach(filePath => {
        const relativePath = path.relative(rootDir, filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Excludem fișierele de config inutile care au mii de linii, cum ar fi package-lock
        if (relativePath.includes('package-lock.json')) return;

        outputContent += `\n\n========================================================================\n`;
        outputContent += `FILE: ${relativePath}\n`;
        outputContent += `========================================================================\n\n`;
        outputContent += content;
        totalFiles++;
    });

    fs.writeFileSync(outputFile, outputContent);
    console.log(`✅ Succes! S-au combinat ${totalFiles} fisiere de cod în ${outputFile}`);
} catch (error) {
    console.error('❌ Eroare la generarea fisierului:', error);
}
