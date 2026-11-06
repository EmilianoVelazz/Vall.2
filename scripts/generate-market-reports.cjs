'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { refreshMarketExecutiveReports } = require('../backend/routes/market');

refreshMarketExecutiveReports(undefined,{force:process.argv.includes('--force')})
    .then(snapshot => console.log(JSON.stringify({ reports: snapshot.reports.length, generatedAt: snapshot.generatedAt, persistence: snapshot.persistence })))
    .catch(error => { console.error('[market-reports] Generación falló:', error.message); process.exitCode = 1; });
