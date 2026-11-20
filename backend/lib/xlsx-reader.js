'use strict';

const JSZip = require('jszip');

const MAX_SHEET_XML_BYTES = 4 * 1024 * 1024;
const MAX_SHARED_STRINGS_BYTES = 4 * 1024 * 1024;
const MAX_SHEETS = 3;
const MAX_ROWS_PER_SHEET = 4000;
const MAX_COLS = 120;

function decodeXmlEntities(text) {
    return String(text || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
        })
        .replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function columnLettersToIndex(letters) {
    let col = 0;
    const upper = String(letters || '').toUpperCase();
    for (let i = 0; i < upper.length; i++) {
        const code = upper.charCodeAt(i);
        if (code < 65 || code > 90) return -1;
        col = col * 26 + (code - 64);
    }
    return col - 1;
}

function parseSharedStrings(xml) {
    const items = [];
    const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRe.exec(xml))) {
        const parts = [];
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let tMatch;
        while ((tMatch = tRe.exec(siMatch[1]))) {
            parts.push(decodeXmlEntities(tMatch[1]));
        }
        items.push(parts.join(''));
        if (items.length >= 250000) break;
    }
    return items;
}

function csvCell(value) {
    const text = String(value ?? '');
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function extractSheetRows(xml, sharedStrings) {
    const rows = [];
    const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
    let rowMatch;
    while ((rowMatch = rowRe.exec(xml)) && rows.length < MAX_ROWS_PER_SHEET) {
        const rowCells = [];
        const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch;
        let fallbackCol = 0;
        while ((cellMatch = cellRe.exec(rowMatch[1]))) {
            const attrs = cellMatch[1] || '';
            const body = cellMatch[2] || '';
            const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
            const colIndex = refMatch ? columnLettersToIndex(refMatch[1]) : fallbackCol;
            fallbackCol = colIndex >= 0 ? colIndex + 1 : fallbackCol + 1;
            if (colIndex < 0 || colIndex >= MAX_COLS) continue;

            const typeMatch = attrs.match(/\bt="([^"]+)"/i);
            const type = typeMatch ? typeMatch[1] : '';
            let value = '';
            if (type === 'inlineStr') {
                const tMatches = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
                value = tMatches.map((m) => decodeXmlEntities(m[1])).join('');
            } else {
                const vMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
                const raw = vMatch ? decodeXmlEntities(vMatch[1]) : '';
                if (type === 's') {
                    const idx = Number(raw);
                    value = Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : raw;
                } else if (type === 'b') {
                    value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
                } else {
                    value = raw;
                }
            }
            while (rowCells.length <= colIndex) rowCells.push('');
            rowCells[colIndex] = value;
        }
        while (rowCells.length && rowCells[rowCells.length - 1] === '') rowCells.pop();
        if (rowCells.some((cell) => cell !== '')) rows.push(rowCells);
    }
    return rows;
}

function sheetDisplayNames(workbookXml) {
    const names = [];
    const sheetRe = /<sheet\b[^>]*name="([^"]+)"[^>]*\/?>/gi;
    let match;
    while ((match = sheetRe.exec(workbookXml || ''))) {
        names.push(decodeXmlEntities(match[1]));
    }
    return names;
}

async function readZipTextLimited(zip, entryName, maxBytes) {
    const entry = zip.file(entryName);
    if (!entry) return '';
    const buf = await entry.async('nodebuffer');
    if (buf.length > maxBytes) {
        throw Object.assign(new Error(`El archivo Excel excede el tamaño seguro en "${entryName}".`), { status: 400 });
    }
    return buf.toString('utf8');
}

async function xlsxToCsv(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw Object.assign(new Error('El archivo Excel está vacío.'), { status: 400 });
    }
    let zip;
    try {
        zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    } catch {
        throw Object.assign(new Error('No se pudo abrir el archivo Excel (.xlsx). Verifica que no esté corrupto o protegido con contraseña.'), { status: 400 });
    }

    const sheetPaths = Object.keys(zip.files)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const na = Number(a.match(/(\d+)/)?.[1] || 0);
            const nb = Number(b.match(/(\d+)/)?.[1] || 0);
            return na - nb;
        })
        .slice(0, MAX_SHEETS);

    if (!sheetPaths.length) {
        throw Object.assign(new Error('El archivo Excel no contiene hojas de cálculo legibles.'), { status: 400 });
    }

    const sharedXml = await readZipTextLimited(zip, 'xl/sharedStrings.xml', MAX_SHARED_STRINGS_BYTES);
    const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];
    const workbookXml = await readZipTextLimited(zip, 'xl/workbook.xml', 512 * 1024);
    const workbookNames = sheetDisplayNames(workbookXml);

    const blocks = [];
    let totalRows = 0;
    let maxCols = 0;
    const usedSheets = [];

    for (let i = 0; i < sheetPaths.length; i++) {
        const xml = await readZipTextLimited(zip, sheetPaths[i], MAX_SHEET_XML_BYTES);
        const rows = extractSheetRows(xml, sharedStrings);
        if (!rows.length) continue;
        const label = workbookNames[i] || `Hoja ${i + 1}`;
        usedSheets.push(label);
        totalRows += rows.length;
        rows.forEach((r) => { if (r.length > maxCols) maxCols = r.length; });
        const csvLines = rows.map((row) => row.map(csvCell).join(','));
        blocks.push({ label, csv: csvLines.join('\n') });
    }

    if (!blocks.length) {
        throw Object.assign(new Error('El archivo Excel no contiene datos en sus hojas.'), { status: 400 });
    }

    const csv = blocks.length === 1
        ? blocks[0].csv
        : blocks.map((b) => `# Hoja: ${b.label}\n${b.csv}`).join('\n\n');

    return {
        csv,
        sheets: usedSheets,
        rowCount: totalRows,
        columnCount: maxCols,
    };
}

module.exports = { xlsxToCsv };
