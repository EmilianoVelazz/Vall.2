import assert from 'node:assert/strict';
import { apiGet, apiPost } from '../frontend/src/api/client.js';
import { createAuthSession } from '../frontend/src/lib/authSession.js';
import loadScripts from '../frontend/src/lib/loadScripts.js';

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
try {
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, ...options };
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    assert.equal((await apiPost('/api/example', { value: 3 }, { headers: new Headers({ 'x-test': 'yes' }), cache: 'no-store' })).ok, true);
    assert.equal(request.credentials, 'include');
    assert.equal(request.headers.get('x-test'), 'yes');
    assert.equal(request.headers.get('Content-Type'), 'application/json');
    assert.equal(request.cache, 'no-store');
    assert.deepEqual(JSON.parse(request.body), { value: 3 });

    globalThis.fetch = async () => new Response('<html>Error de proxy</html>', { status: 200 });
    assert.equal((await apiGet('/api/example')).ok, false, 'HTML con HTTP 200 no debe aceptarse como JSON');
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.deepEqual((await apiPost('/api/logout', {})).data, {});

    globalThis.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    await assert.rejects(apiGet('/api/slow', { timeoutMs: 15 }), { name: 'TimeoutError' });
    const abortController = new AbortController();
    const cancelled = apiGet('/api/cancel', { signal: abortController.signal });
    abortController.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    await assert.rejects(apiGet('/api/cancel', { signal: abortController.signal }), { name: 'AbortError' });

    // También se limita el tiempo de lectura del cuerpo, no sólo las cabeceras.
    globalThis.fetch = async (_, { signal }) => ({
        ok: true, status: 200,
        json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    });
    await assert.rejects(apiGet('/api/slow-body', { timeoutMs: 15 }), { name: 'TimeoutError' });

    const blockedStorage = { setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
    const offline = createAuthSession({ storage: blockedStorage, verify: async () => { throw new Error('offline'); } });
    await offline.check();
    assert.equal(offline.getSnapshot().sessionChecked, true);
    offline.login('demo@example.invalid');
    assert.equal(offline.getSnapshot().token, '1');
    offline.logout();
    assert.equal(offline.getSnapshot().token, null);

    let reply;
    const racedLogin = createAuthSession({ storage: null, verify: () => new Promise(resolve => { reply = resolve; }) });
    const oldCheck = racedLogin.check();
    racedLogin.login('demo@example.invalid');
    reply({ ok: false, data: { success: false } });
    await oldCheck;
    assert.equal(racedLogin.getSnapshot().user, 'demo@example.invalid', 'Una comprobación antigua no debe cerrar un login reciente');
    const racedLogout = createAuthSession({ storage: null, verify: () => new Promise(resolve => { reply = resolve; }) });
    const staleCheck = racedLogout.check();
    racedLogout.logout();
    reply({ ok: true, data: { success: true, email: 'demo@example.invalid' } });
    await staleCheck;
    assert.equal(racedLogout.getSnapshot().token, null, 'Una comprobación antigua no debe reabrir una sesión cerrada');

    const saved = new Map([['vn_auth', '1']]);
    const expired = createAuthSession({
        storage: { setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
        verify: async () => ({ ok: false, data: { success: false } }),
    });
    assert.equal(expired.getSnapshot().token, null, 'Un marcador local no sustituye a la cookie');
    await expired.check();
    assert.equal(saved.has('vn_auth'), false);

    const scripts = [];
    let failNext = true;
    let postponed = false;
    let insertions = 0;
    globalThis.document = {
        querySelector: selector => scripts.find(script => selector.includes(script.dataset.vnLib)),
        createElement: () => ({ dataset: {}, remove() { scripts.splice(scripts.indexOf(this), 1); } }),
        head: { appendChild(script) {
            scripts.push(script);
            insertions += 1;
            if (!postponed) queueMicrotask(() => failNext ? script.onerror() : script.onload());
        } },
    };
    await assert.rejects(loadScripts(['/library.js']), /No se pudo cargar/);
    assert.equal(scripts.length, 0, 'El script fallido debe retirarse');
    failNext = false;
    await Promise.all([loadScripts(['/library.js']), loadScripts(['/library.js'])]);
    assert.equal(insertions, 2, 'La biblioteca se reintenta una vez y comparte la carga concurrente');
    await loadScripts(['/library.js']);
    assert.equal(insertions, 2, 'Una biblioteca cargada no debe ejecutarse de nuevo');
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    try {
        let deadline;
        postponed = true;
        globalThis.setTimeout = callback => { deadline = callback; return 1; };
        globalThis.clearTimeout = () => {};
        const late = loadScripts(['/late-library.js']);
        deadline();
        await assert.rejects(late, /tardó demasiado/);
        await assert.rejects(loadScripts(['/late-library.js']), /tardó demasiado/);
        assert.equal(insertions, 3, 'Una biblioteca lenta no debe cargarse dos veces');
        scripts.find(script => script.dataset.vnLib === '/late-library.js').onload();
        await loadScripts(['/late-library.js']);
        assert.equal(insertions, 3, 'Una carga tardía debe quedar disponible sin reejecutar el script');
    } finally {
        globalThis.setTimeout = realSetTimeout;
        globalThis.clearTimeout = realClearTimeout;
    }
    console.log('Frontend resilience tests: OK');
} finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
}
