'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const jwt = require('jsonwebtoken');

// Siempre inicia una copia aislada de la API en loopback. No admite URLs
// externas, cuentas reales ni llamadas de pago. El millón es una proyección.
const child = fork(path.join(__dirname, 'lib/security-fixture.cjs'), [], { silent: true });
child.stdout.on('data', () => {});
child.stderr.on('data', () => {});
const waitMessage = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('El proceso de prueba no respondió.')); }, 60000);
    const message = value => { if (predicate(value)) { cleanup(); resolve(value); } };
    const exited = code => { cleanup(); reject(new Error(`El proceso de prueba terminó (${code}).`)); };
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exited); };
    child.on('message', message); child.once('exit', exited);
});
function percentile(values, fraction) { return values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0; }
async function runStage(url, { users, requests, concurrency }) {
    const tokens = Array.from({ length: users }, (_, i) => 'Bearer ' + jwt.sign({ sub: `load-${users}-${i}`,
        email: `load-${i}@example.invalid`, role: 'user', trainingOptIn: false }, 'fixture-only-security-secret-never-for-production', { expiresIn: '5m' }));
    let next = 0, decodedBytes = 0, networkErrors = 0, aborted = false;
    const latencies = [], statuses = {};
    const started = performance.now();
    const deadline = started + 20000;
    await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
        while (next < requests && !aborted) {
            const i = next++;
            if (performance.now() > deadline) { aborted = true; break; }
            const route = i % 10 < 8 ? '/api/stock-history?ticker=TSN&range=1y' : i % 10 === 8 ? '/api/profile' : '/api/chat-conversations';
            const begin = performance.now();
            try {
                const response = await fetch(url + route, { headers: { Authorization: tokens[i % users] }, signal: AbortSignal.timeout(5000) });
                const responseBytes = (await response.arrayBuffer()).byteLength;
                decodedBytes += responseBytes;
                statuses[response.status] = (statuses[response.status] || 0) + 1;
            } catch { networkErrors++; }
            latencies.push(performance.now() - begin);
            const failures = networkErrors + Object.entries(statuses).reduce((sum, [status, count]) => sum + (Number(status) >= 500 ? count : 0), 0);
            if (latencies.length >= 100 && (failures / latencies.length > .1 || percentile(latencies.slice(-100), .95) > 3000)) aborted = true;
        }
    }));
    const elapsedSeconds = (performance.now() - started) / 1000;
    return { users, requested: requests, completed: latencies.length, maxConcurrency: concurrency, aborted, statuses, networkErrors,
        elapsedSeconds, requestsPerSecond: latencies.length / elapsedSeconds,
        latencyP50Ms: percentile(latencies, .5), latencyP95Ms: percentile(latencies, .95), latencyP99Ms: percentile(latencies, .99),
        averageDecodedResponseBytes: decodedBytes / Math.max(1, latencies.length) };
}
async function main() {
    try {
        const { url } = await waitMessage(value => value.ready);
        const stages = [];
        for (const config of [{ users: 10, requests: 200, concurrency: 10 }, { users: 1000, requests: 4000, concurrency: 64 }]) {
            const result = await runStage(url, config); stages.push(result);
            console.log(`Carga ${config.users} cuentas: ${result.completed} solicitudes, ${result.requestsPerSecond.toFixed(1)} req/s, p95 ${result.latencyP95Ms.toFixed(1)} ms; estados ${JSON.stringify(result.statuses)}`);
            if (result.aborted || result.networkErrors) throw new Error('Prueba detenida por umbral de seguridad o errores de red.');
        }
        const waiting = waitMessage(value => value.metrics); child.send('metrics');
        const metrics = await waiting;
        const projections = [10, 1000, 1000000].map(users => ({ users, assumedApiRequestsPerSecond: users / 5,
            assumedDecodedMbPerSecond: (users / 5) * 20000 / 1e6,
            assumedAiQueriesPerSecond: users / 600, assumedAiConcurrency: (users / 600) * 15 }));
        fs.mkdirSync(path.resolve('output/seguridad-carga'), { recursive: true });
        fs.writeFileSync(path.resolve('output/seguridad-carga/carga.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
            environment: 'API Express real en proceso hijo; DB, datos de mercado e IA simulados; localhost; sin CDN ni TLS de entrada',
            workload: '80% stock-history (128 velas simuladas), 10% profile, 10% chat-conversations; JWT HS256 distintos por cuenta; caché caliente',
            stages, server: metrics,
            assumptions: 'Proyección: 1 petición API por usuario cada 5 segundos; respuesta de 20 KB sin compresión; 1 consulta IA por usuario cada 10 minutos y 15 s por consulta. No es capacidad medida.',
            projections }, null, 2));
        console.log(`Servidor: pico RSS ${metrics.peakRssMb.toFixed(1)} MB; consultas simuladas al proveedor: ${metrics.upstreamCalls}`);
        if (stages.some(stage => Object.keys(stage.statuses).some(status => Number(status) !== 200))) throw new Error('Hubo respuestas fuera de 200. Consultar carga.json.');
    } finally { child.send?.('close'); setTimeout(() => { if (child.exitCode === null) child.kill(); }, 2000).unref(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
