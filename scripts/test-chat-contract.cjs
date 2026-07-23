'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const assert = require('node:assert/strict');
const chatRouter = require('../backend/routes/chat');

const fromMessage = chatRouter.structuredInput({ message: '  Hola VALL AI  ' });
const fromPrompt = chatRouter.structuredInput({ prompt: '  Analiza mercados  ' });
const fromQuery = chatRouter.structuredInput({ query: '  Panorama global  ' });

assert.equal(fromMessage.message, 'Hola VALL AI');
assert.equal(fromPrompt.message, 'Analiza mercados');
assert.equal(fromQuery.message, 'Panorama global');
assert.equal(chatRouter.structuredInput({}).message, '');
assert.equal(chatRouter.structuredInput({ message: 'Respuesta breve', mode: 'technical', tier: 'pro' }).mode, 'auto');
assert.equal(chatRouter.structuredInput({ message: 'Respuesta breve', mode: 'technical', tier: 'pro' }).tier, 'flash');
assert.equal(chatRouter.structuredInput({ message: 'Crea un reporte detallado con riesgos y escenarios' }).tier, 'pro');
assert.equal(chatRouter.hashUser({ id: 'usuario-1' }), chatRouter.hashUser({ id: 'usuario-1' }));
assert.notEqual(chatRouter.hashUser({ id: 'usuario-1' }), chatRouter.hashUser({ id: 'usuario-2' }));
assert.equal(chatRouter.hashUser(null), null);

console.log('Chat request contract: OK');
