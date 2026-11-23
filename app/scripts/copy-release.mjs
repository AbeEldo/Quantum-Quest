// Copies the single-file build to the project root as QuantumQuest.html
import fs from 'node:fs';
fs.copyFileSync('dist/index.html', '../QuantumQuest.html');
const kb = Math.round(fs.statSync('../QuantumQuest.html').size / 1024);
console.log(`Wrote ../QuantumQuest.html (${kb} KB)`);
