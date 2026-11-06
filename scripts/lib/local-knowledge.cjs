'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// La documentación actual reemplaza las páginas HTML eliminadas al migrar
// a React. No se ingiere JSX: incluiría código y expresiones sin renderizar.
const LOCAL_DOCUMENTS = [
    ['docs/orion-proteinas.md', '/orion'],
    ['docs/orion-comercio.md', '/orion'],
    ['docs/orion-pronosticos.md', '/orion'],
];

function markdownToText(markdown) {
    return String(markdown)
        .replace(/```[^\n]*\n[\s\S]*?```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*`]/g, '')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n').trim();
}

async function loadLocalDocuments(root) {
    return Promise.all(LOCAL_DOCUMENTS.map(async ([localPath, canonicalUrl]) => {
        const source = await fs.readFile(path.join(root, localPath), 'utf8');
        const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
        const body = markdownToText(source);
        if (!title || body.length < 100) throw new Error(`Documento local incompleto: ${localPath}`);
        return { externalId: `documentation:${localPath}`, canonicalUrl, title,
            type: 'site_page', language: 'es', body,
            metadata: { localPath, format: 'markdown', ownership: 'vallnews', priority: 100 } };
    }));
}

module.exports = { LOCAL_DOCUMENTS, markdownToText, loadLocalDocuments };
