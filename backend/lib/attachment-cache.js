'use strict';

class AttachmentCache {
    constructor({ maxBytes = 128 * 1024 * 1024, perOwnerBytes = 40 * 1024 * 1024,
        maxItems = 200, perOwnerItems = 10, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
        Object.assign(this, { maxBytes, perOwnerBytes, maxItems, perOwnerItems, ttlMs, now });
        this.items = new Map();
        this.bytes = 0;
        this.owners = new Map();
    }
    cleanup() {
        for (const [id, item] of this.items) if (item.expiresAt <= this.now()) this.delete(id);
    }
    delete(id) {
        const item = this.items.get(id);
        if (!item) return;
        this.items.delete(id);
        this.bytes -= item.storedBytes;
        const usage = this.owners.get(item.owner);
        usage.bytes -= item.storedBytes;
        usage.count--;
        if (!usage.count) this.owners.delete(item.owner);
    }
    put(item) {
        this.cleanup();
        const storedBytes = Buffer.byteLength(item.base64, 'utf8');
        const usage = this.owners.get(item.owner) || { bytes: 0, count: 0 };
        if (usage.count >= this.perOwnerItems || usage.bytes + storedBytes > this.perOwnerBytes) return 'owner';
        if (this.items.size >= this.maxItems || this.bytes + storedBytes > this.maxBytes) return 'capacity';
        if (this.items.has(item.id)) this.delete(item.id);
        this.items.set(item.id, { ...item, storedBytes, expiresAt: this.now() + this.ttlMs });
        this.bytes += storedBytes;
        this.owners.set(item.owner, { count: usage.count + 1, bytes: usage.bytes + storedBytes });
        return null;
    }
    get(id, owner) {
        this.cleanup();
        const item = this.items.get(id);
        return item?.owner === owner ? item : undefined;
    }
    snapshot() { this.cleanup(); return { items: this.items.size, bytes: this.bytes, owners: this.owners.size }; }
}

module.exports = { AttachmentCache };
