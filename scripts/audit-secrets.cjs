'use strict';

// Escaneo local y acotado. Nunca escribe el contenido de una credencial.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
const environmentFiles = ['backend/.env', '.env.local', 'frontend/.env', 'frontend/.env.local'];
const secrets = [];
const configuration = [];
for (const relative of environmentFiles) {
    if (!fs.existsSync(path.join(root, relative))) continue;
    const values = dotenv.parse(fs.readFileSync(path.join(root, relative)));
    configuration.push({ file: relative, tracked: tracked.includes(relative),
        jwtAtLeast32Bytes: values.JWT_SECRET ? Buffer.byteLength(values.JWT_SECRET) >= 32 : null,
        loginPasswordHasBcryptHash: (values.VALL_AUTH_PASSWORD || values.USER_PASSWORD) ? /^\$2[aby]\$/.test(values.VALL_AUTH_PASSWORD || values.USER_PASSWORD) : null });
    for (const [name, value] of Object.entries(values)) {
        if (/(?:SECRET|PASSWORD|PASS|TOKEN|API_KEY|SERVICE_ROLE_KEY|DATABASE_URL|ANON_KEY)$/.test(name) && value.length >= 16) {
            secrets.push({ name, value });
        }
    }
}
const publicFiles = [];
function walk(relative) {
    const directory = path.join(root, relative);
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) publicFiles.push(file);
    }
}
walk('dist'); walk('frontend/dist');
const rules = [
    ['google-api-key', /AIza[0-9A-Za-z_-]{35}/g],
    ['aws-access-key-id', /(?:AKIA|ASIA)[0-9A-Z]{16}/g],
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['database-uri-with-password', /(?:postgres(?:ql)?|mysql):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/g],
    ['github-token', /(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/g],
];
const matches = [];
let scanned = 0;
const skipped = [];
for (const file of new Set([...tracked, ...publicFiles])) {
    if (!/\.(?:js|jsx|mjs|cjs|json|md|sql|txt|ya?ml|html|css|env|example)$/.test(file)) continue;
    const absolute = path.join(root, file);
    let stat;
    try { stat = fs.lstatSync(absolute); } catch { skipped.push(file); continue; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) { skipped.push(file); continue; }
    const source = fs.readFileSync(absolute, 'utf8');
    if (source.includes('\0')) { skipped.push(file); continue; }
    scanned++;
    const publicAsset = /^(?:assets\/|dist\/|frontend\/dist\/)/.test(file);
    for (const secret of secrets) {
        const index = source.indexOf(secret.value);
        if (index !== -1) matches.push({ file, line: source.slice(0, index).split('\n').length,
            type: `local-environment-value:${secret.name}`, publicAsset, redacted: true });
    }
    for (const [type, expression] of rules) {
        expression.lastIndex = 0;
        for (const match of source.matchAll(expression)) {
            // URI de ejemplo/ficticia: registrar solo las que no son fixtures.
            if (type === 'database-uri-with-password' && /(?:fixture|example|localhost|127\.0\.0\.1|user:password|USER:PASSWORD)/i.test(match[0])) continue;
            matches.push({ file, line: source.slice(0, match.index).split('\n').length, type, publicAsset, redacted: true });
        }
    }
}
const report = { generatedAt: new Date().toISOString(), scanned, configuration, matches, skipped,
    scope: 'Archivos actuales versionados y dist/frontend/dist; patrones y comparación con valores locales >=16 caracteres. No revisa historial Git ni prueba validez de claves. Los matches requieren revisión; anon/publishable pueden ser públicos.', redacted: true };
const directory = path.join(root, 'output', 'auditoria-codigo', 'secretos');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'resultados.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ scanned, configuration, matches, skipped: skipped.length }, null, 2));
