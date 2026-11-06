'use strict';

require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const assert = require('node:assert/strict');
process.env._TLS_STRICT = '1';
const imageProxy = require('../backend/routes/finanzas');
assert.equal(require('../backend/lib/http').REJECT_UNAUTHORIZED, true);

const { _isPrivateAddress, _isPrivateHost } = imageProxy._test;

for (const address of [
    '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '198.18.0.1', '::1', 'fc00::1',
    'fe80::1', '::ffff:127.0.0.1',
]) assert.equal(_isPrivateAddress(address), true, `${address} debe bloquearse`);

assert.equal(_isPrivateAddress('8.8.8.8'), false);
assert.equal(_isPrivateHost('localhost'), true);
assert.equal(_isPrivateHost('127.0.0.1'), true);
assert.equal(_isPrivateHost('images.example.com'), false);

console.log('Security tests: OK');
