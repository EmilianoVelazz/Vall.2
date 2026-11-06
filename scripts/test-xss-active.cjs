'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const espree = require('espree');

async function main() {
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/vall-ai-page-v4.js'), 'utf8');
    const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true });
    const names = new Set(['escapeHtml', 'markdown', 'inlineMarkdown']);
    const found = new Map();
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) found.set(node.id.name, source.slice(...node.range));
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    }
    visit(tree);
    for (const name of names) assert(found.has(name), `Falta ${name}`);
    const context = vm.createContext({});
    vm.runInContext([...found.values()].join('\n'), context, { timeout: 1000 });
    const { parseFragment } = await import('parse5');
    const attacks = [
        '<img src=x onerror="alert(1)">', '<svg onload="alert(1)"></svg>',
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        '[clic](javascript:alert(1))', '[clic](data:text/html,<script>alert(1)</script>)',
        '[clic](https://example.invalid/"onmouseover="alert(1))',
        '[clic](https://example.invalid/&quot;onmouseover=&quot;alert(1))',
        '**<b onclick="alert(1)">texto</b>**',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
        '| Columna |\n| --- |\n| <img src=x onerror=alert(1)> |',
        '```html\n<script>alert(1)</script>\n```', '<a href="javascript:alert(1)">clic</a>',
    ];
    const blocked = new Set(['script', 'svg', 'math', 'iframe', 'img', 'object', 'embed', 'style', 'link', 'meta', 'form']);
    function inspect(node) {
        assert(!blocked.has(node.tagName), `Etiqueta ejecutable: ${node.tagName}`);
        for (const attribute of node.attrs || []) {
            assert(!/^on/i.test(attribute.name), 'Manejador de evento ejecutable');
            if (['href', 'src', 'action'].includes(attribute.name)) assert.match(attribute.value, /^https?:\/\//);
        }
        (node.childNodes || []).forEach(inspect);
    }
    for (const attack of attacks) for (const render of [context.markdown, context.inlineMarkdown]) inspect(parseFragment(render(attack)));
    assert.match(context.markdown('[Fuente](https://example.invalid/mercado)'), /href="https:\/\/example.invalid\/mercado"/);
    assert.match(context.markdown('**Dato**'), /<strong>Dato<\/strong>/);
    const directory = path.join(__dirname, '../output/auditoria-codigo/xss-activo');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'resultados.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
        passed: true, cases: attacks.length * 2, controls: 2,
        scope: 'markdown/inlineMarkdown reales del renderer activo de ORION; parser HTML5; sin ejecución en navegador ni Mermaid' }, null, 2));
    console.log(`XSS del renderer activo de ORION: ${attacks.length * 2} casos y 2 controles OK`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
