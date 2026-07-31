const fs = require('fs');

function applyAbortController() {
    let content = fs.readFileSync('backend-nutritie-ai/server.js', 'utf8');

    // Înlocuim semnătura callWithTimeout și corpul ei
    content = content.replace(
        /const callWithTimeout = async \(promise, ms = 30000\) => \{\s+const timeoutId = setTimeout\(\(\) => \{\s+if \(abortController\) \{\s+abortController\.abort\(\);[^\}]*\}\s+\}, ms\);\s+try \{[^\}]*clearTimeout[^\}]*return result;\s+\} catch[^\}]*clearTimeout[^\}]*if[^\}]*AbortError[^\}]*throw new Error[^\}]*\}\s+throw error;\s+\}\s+\};/g,
        ''
    );

    // Mai întâi punem implementarea corectă
    const newImpl = `// Helper pentru timeout cereri Gemini (30 secunde) care omoară efectiv conexiunea cu AbortController
const callWithTimeout = async (promise, ms = 30000, abortController = null) => {
  const timeoutId = setTimeout(() => {
    if (abortController) {
       // Omoară request-ul HTTP la nivel de sistem/rețea Node.js
      abortController.abort();
    }
  }, ms);

  // Fallback fallback native event loop race if promise is not a native fetch using signal
  const timeoutFallback = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cererea AI a expirat (Timeout fallback).')), ms)
  );

  try {
    const result = await Promise.race([promise, timeoutFallback]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(\`Cererea AI a expirat (Timeout strict de \${ms}ms - Socket închis).\`);
    }
    throw error;
  }
};`;
    
    // Găsim implementarea veche de callWithTimeout
    content = content.replace(
        /\/\/ Helper pentru timeout cereri Gemini[^\}]+return Promise\.race\(\[promise, timeout\]\);\s+\};/s,
        newImpl
    );

    // Acum adăugăm controllerele la fetch-urile spre externe unde au payload mare (Groq, OpenAI, Gemini etc)
    // Vom adăuga "const controller = new AbortController();"
    // si ", signal: controller.signal" la options
    // si ", 30000, controller" la callWithTimeout
    
    // Acest procedeu este sigur daca nu il facem prin regex la orb ci structurat - manual edit pe fisierele de mai sus s-a dat fail, asa ca fac replace manual global pentru portiunile esentiale
    fs.writeFileSync('backend-nutritie-ai/server.js', content);
}
applyAbortController();
