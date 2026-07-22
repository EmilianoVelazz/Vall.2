const fs = require('fs');

const html = fs.readFileSync('C:\\Users\\JonathanEmirLópezVel\\Documents\\public_html\\finanzas\\finanzas.html', 'utf-8');

const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    if (code.trim().length > 0) {
        try {
            new Function(code);
            console.log(`Script ${count} OK.`);
        } catch (e) {
            console.error(`Script ${count} Syntax Error:`, e.message, `Snippet:`, code.substring(0, 150));
        }
    }
    count++;
}
