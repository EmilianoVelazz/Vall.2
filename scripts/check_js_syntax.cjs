const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'finanzas.html'), 'utf8');
const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/gi;

let match;
let count = 0;
let failures = 0;

while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    if (code.trim().length > 0) {
        try {
            new Function(code);
            console.log(`Script ${count} OK.`);
        } catch (error) {
            console.error(`Script ${count} Syntax Error:`, error.message, 'Snippet:', code.substring(0, 150));
            failures++;
        }
    }
    count++;
}

if (failures > 0) process.exitCode = 1;
