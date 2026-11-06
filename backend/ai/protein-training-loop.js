'use strict';

// Ciclo de investigación para el apartado global de proteínas. No hace fine
// tuning del modelo base: crea propuestas rastreables a evidencia para que el
// producto pueda revisarlas antes de mostrarlas como análisis editorial en la parte editorila se puede analizar
// los datos aydsentes importantes de cada piunto
// .
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local'), quiet: true });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GeminiProvider } = require('./providers/gemini-provider');
const { gatherProteinEvidence } = require('./protein-training-sources');

const DEFAULT_MINUTES = 40;
const INTERVAL_MS = 4 * 60 * 1000;
const EVIDENCE_REFRESH_MS = 10 * 60 * 1000;
const CACHE_DIR = path.resolve(__dirname, '../cache');
const PROPOSALS_FILE = path.join(CACHE_DIR, 'protein-research-proposals.json');
const SNAPSHOTS_FILE = path.join(CACHE_DIR, 'protein-source-snapshots.json');
const SUMMARY_FILE = path.join(CACHE_DIR, 'protein-training-summary.json');

const TOPICS = [
    { species: 'cerdo', focus: 'Oferta mundial, comercio, costos de alimentación y riesgo de peste porcina africana.' },
    { species: 'pollo', focus: 'Oferta mundial, demanda, alimento balanceado y riesgo de influenza aviar altamente patógena.' },
    { species: 'res', focus: 'Oferta mundial, consumo minorista, ciclo ganadero y sensibilidad a granos.' },
    { species: 'huevo', focus: 'Oferta, precios minoristas, costos de alimento y efecto de influenza aviar.' },
    { species: 'acuicultura', focus: 'Cobertura de datos, proteína acuática y límites: no inferir cifras sin FishStat u otra fuente explícita.' },
];

const SYSTEM_PROMPT = `Eres Proyecto Loopus, el sistema de aprendizaje de VALL AI especializado en el mercado mundial de proteínas.
Trabaja sólo con la evidencia estructurada proporcionada. No inventes precios,
producción, comercio, países, causalidades o fechas. Distingue siempre entre
observado, estimado y proyección. No conviertas una alerta sanitaria en impacto
de precio sin evidencia adicional. Devuelve únicamente JSON estricto:
{
  "proposals": [{
    "species": "cerdo|pollo|res|huevo|acuicultura",
    "title": "máximo 100 caracteres",
    "insight": "máximo 420 caracteres y lenguaje prudente",
    "evidence_source_ids": ["ids presentes en la evidencia"],
    "confidence_score": 0
  }],
  "data_gaps": ["brechas concretas de información o cobertura"]
}
Máximo 2 propuestas. Si la evidencia no respalda una conclusión, devuelve una
lista vacía de proposals y describe la brecha.`;

function durationMs() {
    const minutes = Number(process.env.VALL_PROTEIN_TRAINING_MINUTES || DEFAULT_MINUTES);
    return Math.round((Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES) * 60 * 1000);
}

function readJson(file, fallback) {
    try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return data ?? fallback; } catch { return fallback; }
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function cleanText(value, max) { return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function normalizeProposals(raw, evidence, topic, runId) {
    const allowedSources = new Set(evidence.snapshots.map(snapshot => snapshot.source_id));
    return (Array.isArray(raw?.proposals) ? raw.proposals : []).slice(0, 2).map(proposal => {
        const sourceIds = Array.isArray(proposal?.evidence_source_ids)
            ? [...new Set(proposal.evidence_source_ids.map(String).filter(id => allowedSources.has(id)))].slice(0, 4) : [];
        const snapshotHashes = sourceIds.map(sourceId => evidence.snapshots.find(snapshot => snapshot.source_id === sourceId)?.snapshot_hash).filter(Boolean);
        const species = TOPICS.some(item => item.species === proposal?.species) ? proposal.species : topic.species;
        const title = cleanText(proposal?.title, 100);
        const insight = cleanText(proposal?.insight, 420);
        const score = Math.min(100, Math.max(0, Number(proposal?.confidence_score) || 0));
        return {
            proposal_id: hash({ species, title, insight, sourceIds }), training_run_id: runId, species, title, insight,
            evidence_source_ids: sourceIds, evidence_snapshot_hashes: snapshotHashes, confidence_score: score, status: 'pending_human_review',
            created_at: new Date().toISOString(),
        };
    }).filter(item => item.title && item.insight && item.evidence_source_ids.length > 0);
}

function evidenceForPrompt(evidence) {
    return {
        collected_at: evidence.collected_at,
        sources: evidence.snapshots.map(snapshot => ({
            source_id: snapshot.source_id, source_name: snapshot.source_name, source_url: snapshot.source_url,
            data_type: snapshot.data_type, is_forecast: snapshot.is_forecast, data_vintage: snapshot.data_vintage,
            payload: snapshot.payload,
        })),
        unavailable_sources: evidence.failures,
        catalog: evidence.source_catalog,
    };
}

async function runProteinTrainingLoop() {
    if (process.env.VALL_PROTEIN_TRAINING_ENABLED !== 'true') {
        throw new Error('Entrenamiento de proteínas desactivado. Define VALL_PROTEIN_TRAINING_ENABLED=true para ejecutarlo.');
    }
    const ai = new GeminiProvider();
    if (!ai.isConfigured()) throw new Error('Gemini no está configurado.');

    const startedAt = Date.now();
    const endAt = startedAt + durationMs();
    const runId = `protein-${new Date(startedAt).toISOString()}-${crypto.randomUUID()}`;
    let attempts = 0;
    let failures = 0;
    let savedCount = 0;
    let evidence = null;
    let evidenceAt = 0;
    const loadedProposals = readJson(PROPOSALS_FILE, []);
    const loadedSnapshots = readJson(SNAPSHOTS_FILE, []);
    const allProposals = Array.isArray(loadedProposals) ? loadedProposals : [];
    const allSnapshots = Array.isArray(loadedSnapshots) ? loadedSnapshots : [];
    console.log(`[Protein-Training] Inicio: ${new Date(startedAt).toISOString()} · duración: ${Math.round(durationMs() / 60000)} minutos.`);

    while (Date.now() < endAt) {
        const topic = TOPICS[attempts % TOPICS.length];
        attempts += 1;
        try {
            if (!evidence || Date.now() - evidenceAt >= EVIDENCE_REFRESH_MS) {
                evidence = await gatherProteinEvidence();
                evidenceAt = Date.now();
                evidence.snapshots = evidence.snapshots.map(snapshot => ({
                    ...snapshot,
                    snapshot_hash: hash({ source_id: snapshot.source_id, retrieved_at: snapshot.retrieved_at, payload: snapshot.payload }),
                }));
                allSnapshots.push(...evidence.snapshots.map(snapshot => ({ ...snapshot, training_run_id: runId })));
                writeJson(SNAPSHOTS_FILE, allSnapshots.slice(-500));
            }
            const response = await ai.generate({
                prompt: `FOCO: ${topic.species}. ${topic.focus}\n\nEVIDENCIA VERSIONADA:\n${JSON.stringify(evidenceForPrompt(evidence))}`,
                systemInstruction: SYSTEM_PROMPT,
                tier: 'flash',
                json: true,
            });
            const output = JSON.parse(response.text);
            const proposals = normalizeProposals(output, evidence, topic, runId);
            allProposals.push(...proposals);
            writeJson(PROPOSALS_FILE, allProposals.slice(-500));
            savedCount += proposals.length;
            console.log(`[Protein-Training] ${topic.species}: ${proposals.length} propuestas con evidencia.`);
        } catch (error) {
            failures += 1;
            console.warn(`[Protein-Training] ${topic.species}: ${error.code || error.message}`);
        }
        const remaining = endAt - Date.now();
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(INTERVAL_MS, remaining)));
    }

    const summary = {
        training_run_id: runId, status: 'completed', started_at: new Date(startedAt).toISOString(), ended_at: new Date().toISOString(),
        duration_minutes: Math.round(durationMs() / 60000), attempts, failures, proposals_created: savedCount,
        evidence_sources: [...new Set((evidence?.snapshots || []).map(item => item.source_id))],
        notice: 'Las propuestas requieren revisión humana; las observaciones conservan fuente, fecha y tipo de dato.',
    };
    writeJson(SUMMARY_FILE, summary);
    console.log(`[Protein-Training] Completado. Intentos: ${attempts}; propuestas: ${savedCount}; fallos: ${failures}.`);
    return summary;
}

if (require.main === module) runProteinTrainingLoop().catch(error => { console.error('[Protein-Training] Error crítico:', error.message); process.exitCode = 1; });

module.exports = { runProteinTrainingLoop, durationMs, normalizeProposals };
