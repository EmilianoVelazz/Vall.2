'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();
const { inspectOrionStorage } = require('../backend/services/orion-storage-health');
const { connectDatabase } = require('../backend/lib/database-connection');
(async () => {
    const report = await inspectOrionStorage({ connect: connectDatabase });
    const directory = path.resolve(__dirname, '../output/analisis-inteligencia-orion');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'storage-health.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.remoteReady) process.exitCode = 1;
})().catch(() => { console.error('Diagnóstico de almacenamiento no completado.'); process.exitCode = 1; });
