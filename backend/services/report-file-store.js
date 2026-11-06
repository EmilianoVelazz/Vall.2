'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { IS_VERCEL } = require('../lib/config');

const DEFAULT_DIR = process.env.VALL_REPORT_STORAGE_DIR || (IS_VERCEL
    ? '/tmp/vall-private-reports' : path.join(__dirname, '..', 'generated-reports', 'chat'));
const MAX_BYTES = 25 * 1024 * 1024;
const TOKEN = /^[a-f0-9]{48}$/;
const writeQueues = new Map();
const MiB = 1024 * 1024;
function quotaMegabytes(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number * MiB : fallback * MiB;
}
async function serializedWrite(root, work) {
    const previous = writeQueues.get(root) || Promise.resolve();
    const pending = previous.catch(() => {}).then(work);
    writeQueues.set(root, pending);
    try { return await pending; }
    finally { if (writeQueues.get(root) === pending) writeQueues.delete(root); }
}

async function checkCapacity(root, owner, bytes, { maxOwnerBytes, maxTotalBytes, maxOwnerFiles, maxTotalFiles }) {
    let totalBytes = 0, ownerBytes = 0, totalFiles = 0, ownerFiles = 0;
    const full = () => totalBytes + bytes > maxTotalBytes || ownerBytes + bytes > maxOwnerBytes
        || totalFiles >= maxTotalFiles || ownerFiles >= maxOwnerFiles;
    const exhausted = () => Object.assign(new Error('Se alcanzó el límite de almacenamiento de reportes. Los archivos guardados se conservan.'), { code: 'REPORT_STORAGE_FULL', status: 507 });
    for await (const folder of await fs.opendir(root)) {
        if (!folder.isDirectory() || !/^[a-f0-9]{64}$/.test(folder.name)) continue;
        const folderPath = path.join(root, folder.name);
        for await (const file of await fs.opendir(folderPath)) {
            if (!file.isFile() || !/^[a-f0-9]{48}\.bin$/.test(file.name)) continue;
            const stat = await fs.stat(path.join(folderPath, file.name));
            totalBytes += stat.size; totalFiles += 1;
            if (folder.name === owner) { ownerBytes += stat.size; ownerFiles += 1; }
            if (full()) throw exhausted();
        }
    }
    if (full()) throw exhausted();
    // Reservar espacio para el resto del proyecto aunque otros programas
    // hayan ocupado el disco y todavía no se alcance el cupo de reportes.
    const disk = await fs.statfs(root);
    if (disk.bavail * disk.bsize < bytes + 32 * MiB) throw exhausted();
}

function ownerKey(owner) {
    const email = String(owner || '').trim().toLowerCase();
    if (!email) throw new Error('El archivo requiere un propietario.');
    return crypto.createHash('sha256').update(email).digest('hex');
}

function createReportFileStore({ directory = DEFAULT_DIR, temporary = IS_VERCEL && !process.env.VALL_REPORT_STORAGE_DIR,
    maxOwnerBytes = quotaMegabytes(process.env.VALL_REPORT_MAX_OWNER_MB, IS_VERCEL ? 64 : 512),
    maxTotalBytes = quotaMegabytes(process.env.VALL_REPORT_MAX_TOTAL_MB, IS_VERCEL ? 256 : 2048),
    maxOwnerFiles = 1000, maxTotalFiles = 5000 } = {}) {
    const root = path.resolve(directory);
    // No hay vencimiento ni borrado tras descargar. El almacenamiento queda
    // fuera de los estáticos y cada acceso vuelve a comprobar al propietario.
    return {
        async save({ buffer, owner, name, mime }) {
            if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) throw new Error('Tamaño de archivo no válido.');
            if (!/^[\w.-]{1,110}$/.test(name || '') || typeof mime !== 'string' || mime.length > 150 || /[\r\n]/.test(mime)) throw new Error('Metadatos del archivo no válidos.');
            const token = crypto.randomBytes(24).toString('hex');
            const ownerId = ownerKey(owner);
            const folder = path.join(root, ownerId);
            const createdAt = new Date().toISOString();
            const metadata = { name, mime, size: buffer.length, createdAt,
                sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
            await serializedWrite(root, async () => {
                await fs.mkdir(root, { recursive: true, mode: 0o700 });
                await checkCapacity(root, ownerId, buffer.length, { maxOwnerBytes, maxTotalBytes, maxOwnerFiles, maxTotalFiles });
                await fs.mkdir(folder, { recursive: true, mode: 0o700 });
                const binary = path.join(folder, `${token}.bin`);
                try {
                    await fs.writeFile(binary, buffer, { flag: 'wx', mode: 0o600 });
                    // Publicar la metadata al final evita servir una escritura incompleta.
                    await fs.writeFile(path.join(folder, `${token}.json`), JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
                } catch (error) {
                    await fs.unlink(binary).catch(() => {});
                    throw error;
                }
            });
            return { token, ...metadata, storage: temporary ? 'temporary_disk' : 'persistent_disk' };
        },
        async get(token, owner) {
            if (!TOKEN.test(String(token || '')) || !owner) return null;
            const folder = path.join(root, ownerKey(owner));
            try {
                const metaPath = path.join(folder, `${token}.json`);
                if ((await fs.stat(metaPath)).size > 4096) return null;
                const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                const binary = path.join(folder, `${token}.bin`);
                const stat = await fs.stat(binary);
                if (!stat.isFile() || stat.size !== metadata.size || stat.size > MAX_BYTES
                    || !/^[\w.-]{1,110}$/.test(metadata.name || '') || /[\r\n]/.test(metadata.mime || '')
                    || typeof metadata.mime !== 'string') return null;
                const buffer = await fs.readFile(binary);
                if (crypto.createHash('sha256').update(buffer).digest('hex') !== metadata.sha256) return null;
                return { ...metadata, buffer };
            } catch (error) {
                if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
                throw error;
            }
        },
    };
}

module.exports = { createReportFileStore, reportFileStore: createReportFileStore() };
