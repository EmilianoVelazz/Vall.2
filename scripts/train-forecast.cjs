'use strict';

const { trainForSymbol } = require('../backend/ml/forecasting-service');

const symbol = process.argv.find(argument => argument.startsWith('--symbol='))?.slice('--symbol='.length).trim().toUpperCase();
const intervalCode = process.argv.find(argument => argument.startsWith('--interval='))?.slice('--interval='.length).trim() || '1d';

if (!symbol || !/^[A-Z0-9.^=-]+$/i.test(symbol)) {
    console.error('Uso: npm run train:forecast -- --symbol=USDMXN=X [--interval=1d]');
    process.exitCode = 1;
} else {
    trainForSymbol(symbol, { intervalCode })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => { console.error(`[Forecast] ${error.message}`); process.exitCode = 1; });
}
