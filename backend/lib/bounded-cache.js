'use strict';

class BoundedCache {
    constructor({ maxEntries = 500, maxBytes = 32 * 1024 * 1024 } = {}) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
        this.entries = new Map();
        this.bytes = 0;
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        const bytes = Buffer.byteLength(JSON.stringify(value));
        if (bytes > this.maxBytes) return;
        const old = this.entries.get(key);
        if (old) { this.bytes -= old.bytes; this.entries.delete(key); }
        while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
            const first = this.entries.keys().next().value;
            this.bytes -= this.entries.get(first).bytes;
            this.entries.delete(first);
        }
        this.entries.set(key, { value, bytes });
        this.bytes += bytes;
    }
    snapshot() { return { entries: this.entries.size, bytes: this.bytes }; }
}

function createSingleFlight(maxPending = 20) {
    const pending = new Map();
    return (key, load) => {
        if (pending.has(key)) return pending.get(key);
        if (pending.size >= maxPending) return Promise.reject(Object.assign(new Error('Proveedor ocupado.'), { code: 'UPSTREAM_BUSY' }));
        const promise = Promise.resolve().then(load).finally(() => pending.delete(key));
        pending.set(key, promise);
        return promise;
    };
}

module.exports = { BoundedCache, createSingleFlight };
