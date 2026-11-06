'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { sourceDate } = require('../ai/evidence-coverage');

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DEFAULT_DIRECTORY = process.env.ORION_FORECAST_DIRECTORY || path.join(__dirname, '..', 'data', 'orion-forecast');
const queues = new Map();
const identityFields = ['productId','countryCode','stateCode','market','category','priceBasis','currency','unit','frequency','source'];
function priceIdentity(record) {
    if (record && !record.market && typeof record.country === 'string') record = { ...record, market:record.country };
    if (!record?.verified || !identityFields.every(key => key === 'stateCode' || typeof record[key] === 'string' && record[key].trim() && record[key].length <= 250)) return null;
    if (!['daily_report','daily','weekly'].includes(record.frequency) || record.priceType === 'reported_range') return null;
    try {
        const url = new URL(record.url);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return Object.fromEntries([...identityFields.map(key => [key, record[key] || null]), ['sourceEndpoint', url.origin + url.pathname]]);
    } catch { return null; }
}
function createForecastJournal({ directory = DEFAULT_DIRECTORY, now = Date.now, maxBytes = 64 * 1024 * 1024, maxFiles = 256 } = {}) {
    const root = path.resolve(directory);
    async function files() {
        try { return (await fs.readdir(root)).filter(file => /^[a-f0-9]{64}\.json$/.test(file)); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    async function read(key) {
        try {
            const file = path.join(root, `${key}.json`);
            if ((await fs.stat(file)).size > 4 * 1024 * 1024) throw Error('Registro demasiado grande.');
            return JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    async function write(key, data) {
        const json = JSON.stringify(data);
        const bytes = Buffer.byteLength(json);
        const entries = await files();
        let total = bytes;
        for (const file of entries) if (file !== `${key}.json`) total += (await fs.stat(path.join(root, file))).size;
        if (bytes > 4 * 1024 * 1024 || total > maxBytes || !entries.includes(`${key}.json`) && entries.length >= maxFiles) throw Object.assign(Error('Cupo del seguimiento agotado; se conservan los registros.'), { code: 'FORECAST_STORAGE_FULL' });
        const temporary = path.join(root, `${key}.${crypto.randomBytes(8).toString('hex')}.tmp`);
        try {
            const handle = await fs.open(temporary, 'wx', 0o600);
            try { await handle.writeFile(json); await handle.sync(); } finally { await handle.close(); }
            await fs.rename(temporary, path.join(root, `${key}.json`));
        } finally { await fs.unlink(temporary).catch(() => {}); }
    }
    async function mutate(work) {
        const previous = queues.get(root) || Promise.resolve();
        const pending = previous.catch(() => {}).then(async () => {
            await fs.mkdir(root, { recursive: true, mode: 0o700 });
            const lockPath = path.join(root, 'journal.lock');
            let lock;
            try { lock = await fs.open(lockPath, 'wx', 0o600); }
            catch (error) {
                if (error.code !== 'EEXIST') throw error;
                const info = JSON.parse(await fs.readFile(lockPath, 'utf8'));
                if (!Number.isInteger(info.pid) || info.pid <= 0) throw Error('Bloqueo de seguimiento inválido.');
                try { process.kill(info.pid, 0); throw Object.assign(Error('Seguimiento ocupado.'), { code: 'FORECAST_STORAGE_BUSY' }); }
                catch (check) { if (check.code !== 'ESRCH') throw check; }
                await fs.unlink(lockPath);
                lock = await fs.open(lockPath, 'wx', 0o600);
            }
            try { await lock.writeFile(JSON.stringify({ pid: process.pid })); return await work(); }
            finally { await lock.close(); await fs.unlink(lockPath); }
        });
        queues.set(root, pending);
        try { return await pending; } finally { if (queues.get(root) === pending) queues.delete(root); }
    }
    const trialBucket = (symbol, horizon) => hash(['trials', symbol, horizon]);
    return {
        backend: 'local_persistent',
        async list(symbol, horizon) { return (await read(trialBucket(symbol,horizon)))?.trials || []; },
        async save(trial) {
            return mutate(async () => {
                const key = trialBucket(trial.symbol, trial.horizon);
                const data = await read(key) || { version: 1, trials: [] };
                const existing = data.trials.find(row => row.trial_key === trial.trial_key);
                if (existing) return existing;
                if (data.trials.length >= 120) {
                    const resolved = data.trials.findIndex(row => row.status !== 'pending');
                    if (resolved < 0) throw Error('Hay 120 estimaciones pendientes en esta serie; no se borra ninguna.');
                    data.trials.splice(resolved, 1);
                }
                const saved = { ...structuredClone(trial), id: crypto.randomUUID() };
                data.trials.push(saved);
                await write(key,data);
                return saved;
            });
        },
        async complete(updates) {
            if (updates.length > 120) throw RangeError('Demasiados resultados.');
            return mutate(async () => {
                const changed = [];
                for (const file of await files()) {
                    const key = file.slice(0,64), data = await read(key);
                    let dirty = false;
                    for (const trial of data?.trials || []) {
                        const update = updates.find(row => row.id === trial.id);
                        if (!update || trial.status !== 'pending' || !['evaluated','data_revised'].includes(update.status)) continue;
                        Object.assign(trial, { status: update.status, actual_observed_at: update.actual_observed_at, outcome: update.outcome, evaluated_at: new Date(now()).toISOString() });
                        changed.push(trial.id); dirty = true;
                    }
                    if (dirty) await write(key,data);
                }
                return changed;
            });
        },
        async pending(limit = 12) {
            const distinct = new Map();
            for (const file of await files()) for (const row of (await read(file.slice(0,64)))?.trials || []) {
                if (row.status === 'pending') distinct.set(`${row.symbol}:${row.horizon}`, { symbol: row.symbol, horizon: row.horizon });
            }
            return [...distinct.values()].slice(0, Math.min(24,limit));
        },
        async observe(records) {
            return mutate(async () => {
                const groups = new Map();
                const today = new Date(now()).toISOString().slice(0,10);
                for (const record of records.slice(0,128)) {
                    const identity = priceIdentity(record), date = sourceDate(record.date);
                    if (!identity || !date || date > today || !Number.isFinite(record.value) || record.value <= 0 || record.value >= 1e12) continue;
                    const key = hash(['physical',identity]);
                    if (!groups.has(key)) groups.set(key, { identity, rows: [] });
                    groups.get(key).rows.push({ date, value: record.value });
                }
                for (const [key, group] of groups) {
                    const data = await read(key) || { version: 1, identity: group.identity, points: [] };
                    const byDate = new Map(data.points.map(row => [row.date,row]));
                    for (const row of group.rows) {
                        const prior = byDate.get(row.date);
                        if (prior && prior.value !== row.value) byDate.set(row.date, { ...row, revised: true });
                        else if (!prior) byDate.set(row.date,row);
                    }
                    data.points = [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-740);
                    await write(key,data);
                }
                return groups.size;
            });
        },
        async series() {
            const result = [];
            for (const file of await files()) {
                const row = await read(file.slice(0,64));
                if (row?.identity && Array.isArray(row.points)) result.push({ ...row, key: file.slice(0,64) });
            }
            return result;
        },
    };
}
module.exports = { createForecastJournal, priceIdentity, journal: createForecastJournal() };
