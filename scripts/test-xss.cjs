'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const espree = require('espree');

function functionsFrom(file, names, sourceType = 'script') {
    const source = fs.readFileSync(file, 'utf8');
    const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType, range: true });
    const found = new Map();
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && names.includes(node.id?.name)) found.set(node.id.name, source.slice(...node.range));
        if (node.type === 'VariableDeclaration') {
            for (const declaration of node.declarations) {
                if (names.includes(declaration.id?.name)) found.set(declaration.id.name, source.slice(...node.range));
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    }
    visit(tree);
    for (const name of names) assert.ok(found.has(name), `Falta el renderizador ${name}`);
    return [...found.values()].join('\n');
}
async function main() {
    const { parseFragment } = await import('parse5');
    const context = { btoa, unescape, encodeURIComponent };
    vm.createContext(context);
    vm.runInContext(functionsFrom('assets/js/vall-ai-page-v4.js', ['escapeHtml', 'markdown']), context);
    vm.runInContext(functionsFrom('frontend/src/lib/textoEnriquecido.js', ['ETIQUETAS_PERMITIDAS', 'textoEnriquecido'], 'module'), context);
    const attacks = [
        '<img src=x onerror="alert(1)">',
        '<svg><a href="javascript:alert(1)">X</a></svg>',
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        '[Haz clic](javascript:alert(1))',
        '[Haz clic](https://example.invalid/"onmouseover="alert(1))',
        '[Haz clic](data:text/html,<script>alert(1)</script>)',
        '**<b onclick="alert(1)">texto</b>**',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
        '| Columna |\n| --- |\n| <img src=x onerror=alert(1)> |',
        '```chart\n' + JSON.stringify({ title: '<img src=x onerror=alert(1)>', labels: ['X'], datasets: [{ data: [1] }], source: '<script>alert(1)</script>' }) + '\n```',
    ];
    const blocked = new Set(['script', 'svg', 'math', 'iframe', 'img', 'object', 'embed', 'style', 'link', 'meta', 'form']);
    function inspect(node) {
        assert.ok(!blocked.has(node.tagName), `Etiqueta ejecutable: ${node.tagName}`);
        for (const attr of node.attrs || []) {
            assert.ok(!/^on/i.test(attr.name), 'No deben sobrevivir manejadores de eventos');
            if (['href', 'src', 'action'].includes(attr.name)) assert.match(attr.value, /^https?:\/\//);
        }
        for (const child of node.childNodes || []) inspect(child);
    }
    for (const attack of attacks) {
        inspect(parseFragment(context.markdown(attack)));
        inspect(parseFragment(context.textoEnriquecido(attack)));
    }
    assert.match(context.markdown('[Fuente](https://example.invalid/mercado)'), /href="https:\/\/example.invalid\/mercado"/);
    assert.equal(context.textoEnriquecido('<strong>Dato</strong>'), '<strong>Dato</strong>');
    fs.mkdirSync('output/seguridad-carga', { recursive: true });
    fs.writeFileSync('output/seguridad-carga/pruebas-xss.json', JSON.stringify({ generatedAt: new Date().toISOString(),
        cases: attacks.length * 2, passed: true, scope: 'HTML real de ORION y textoEnriquecido; parser HTML5; no ejecución en navegador' }, null, 2));
    console.log(`XSS renderers: ${attacks.length * 2} payload checks OK`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
