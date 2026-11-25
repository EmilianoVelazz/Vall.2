'use strict';
if (process.argv.includes('--offline')) process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../backend/.env'), quiet: true });
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env.local'), quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();

const { GeminiProvider } = require('../backend/ai/providers/gemini-provider');
const { buildDefaultKnowledgeCorpus, indexKnowledgeDocuments, getVectorIndexStats } = require('../backend/ai/vector-knowledge');

async function main() {
    const offlineOnly = process.argv.includes('--offline');
    const provider = !offlineOnly && process.env.GEMINI_API_KEY ? new GeminiProvider() : null;
    const corpus = buildDefaultKnowledgeCorpus();
    const result = await indexKnowledgeDocuments(corpus, {
        provider,
        persistSupabase: !offlineOnly,
        generateEmbeddings: Boolean(provider),
    });
    const stats = getVectorIndexStats();
    console.log(JSON.stringify({ success: true, offlineOnly, ...result, stats }, null, 2));
}

main().catch(error => {
    console.error('Error indexando conocimiento vectorial:', error?.message || error);
    process.exitCode = 1;
});
