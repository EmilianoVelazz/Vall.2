'use strict';
// Archivos ficticios en un directorio temporal; no consulta proveedores ni DB.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createReportHistoryStore } = require('../backend/services/report-history-store');
const option = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const label = option('label', 'current').replace(/[^a-z0-9-]/gi, '');
const output = path.resolve(__dirname, '..', 'output/performance-20261113');

async function main() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vall-history-performance-'));
    const nativeRead = fs.readFile, nativeStat = fs.stat;
    let reads = 0, stats = 0;
    try {
        await fs.mkdir(path.join(directory, 'index'));
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
        const editions = 1000;
        let next = 0;
        await Promise.all(Array.from({ length: 8 }, async () => {
            while (next < editions) {
                const number = next++, id = crypto.createHash('sha256').update('history-performance-' + number).digest('hex');
                const generatedAt = new Date(Date.UTC(2026, 0, 1) + number * 3600000).toISOString();
                const metadata = { id, collection: 'markets', key: 'proteins', title: 'Informe ficticio ' + number,
                    generatedAt, date: formatter.format(new Date(generatedAt)) };
                await fs.writeFile(path.join(directory, id + '.json'), JSON.stringify({ ...metadata,
                    report: { key: metadata.key, title: metadata.title, generatedAt } }));
                await fs.writeFile(path.join(directory, 'index', id + '.json'), JSON.stringify(metadata));
            }
        }));
        fs.readFile = async (...args) => { if (String(args[0]).startsWith(directory + path.sep)) reads++; return nativeRead(...args); };
        fs.stat = async (...args) => { if (String(args[0]).startsWith(directory + path.sep)) stats++; return nativeStat(...args); };
        const store = createReportHistoryStore({ directory, mode: 'disk' });
        async function measure(concurrency) {
            reads = 0; stats = 0;
            const started = performance.now();
            const pages = await Promise.all(Array.from({ length: concurrency }, () => store.listPage({ area: 'markets', limit: 10 })));
            for (const page of pages) {
                assert.equal(page.data.length, 10); assert(page.nextCursor);
                assert.deepEqual(page.data.map(item => item.id), pages[0].data.map(item => item.id));
            }
            if (pages.length > 1) {
                pages[0].data[0].title = 'Cambio exclusivo del primer lector';
                assert.notEqual(pages[1].data[0].title, pages[0].data[0].title);
            }
            return { concurrency, editions, returnedPerPage: 10, ms: Math.round(performance.now() - started), reads, stats };
        }
        const single = [];
        for (let index = 0; index < 3; index++) single.push(await measure(1));
        const concurrent = await measure(8);
        if (!process.argv.includes('--measure-only')) assert.equal(concurrent.reads, editions,
            'Ocho lectores simultáneos deben compartir un recorrido de los metadatos');
        const first = await store.listPage({ area: 'markets', limit: 10 });
        const second = await store.listPage({ area: 'markets', limit: 10, cursor: first.nextCursor });
        assert(second.data.every(item => !first.data.some(previous => previous.id === item.id)));
        await assert.rejects(store.listPage({ area: 'finance', cursor: first.nextCursor }), { status: 400 });
        const latest = { key: 'proteins', title: 'Edición ficticia recién publicada', generatedAt: '2026-11-13T18:00:00Z' };
        await createReportHistoryStore({ directory, mode: 'disk' }).archive([latest], 'markets');
        assert.equal((await store.listPage({ area: 'markets', limit: 1 })).data[0].title, latest.title,
            'Una nueva edición debe verse sin esperar caducidades de una caché de listados');
        const folder = path.join(directory, 'index', first.data[0].id + '.json');
        await fs.writeFile(folder, '{invalid');
        const repaired = await store.listPage({ area: 'markets', limit: 10 });
        assert(repaired.data.some(item => item.id === first.data[0].id));
        assert.doesNotThrow(() => JSON.parse(require('node:fs').readFileSync(folder, 'utf8')));
        const mixed = await Promise.all([store.listPage({ date: '2026-01-02', limit: 100 }),
            store.listPage({ area: 'finance' }), store.listPage({ area: 'markets', key: 'proteins', limit: 3 })]);
        assert(mixed[0].data.length && mixed[0].data.every(item => item.date === '2026-01-02'));
        assert.equal(mixed[1].data.length, 0); assert.equal(mixed[2].data.length, 3);
        await fs.writeFile(folder, '{invalid');
        const write = fs.writeFile;
        fs.writeFile = async (file, ...args) => {
            if (String(file).startsWith(folder + '.') && String(file).endsWith('.tmp')) throw Object.assign(Error('Synthetic index write failure'), { code: 'EACCES' });
            return write(file, ...args);
        };
        try { await assert.rejects(store.listPage({ limit: 10 }), { code: 'EACCES' }); }
        finally { fs.writeFile = write; }
        assert.equal((await store.listPage({ limit: 10 })).data.length, 10, 'Un fallo de escritura no deja bloqueada la lectura compartida');
        const report = { generatedAt: new Date().toISOString(), label, single, concurrent,
            medianSingleMs: single.map(item => item.ms).sort((a, b) => a - b)[1],
            cursorPagination: true, immediateNewEditions: true, corruptIndexRecovery: true,
            dateFilters: true, independentFiltersAndResults: true, failedIndexRecovery: true,
            temporaryStorage: true, realProvidersUsed: false };
        await fs.mkdir(output, { recursive: true });
        await fs.writeFile(path.join(output, 'history-' + label + '.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
    } finally {
        fs.readFile = nativeRead; fs.stat = nativeStat;
        const target = path.resolve(directory), relative = path.relative(path.resolve(os.tmpdir()), target);
        assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('vall-history-performance-'));
        await fs.rm(target, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
