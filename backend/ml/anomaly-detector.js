'use strict';

// Detección estadística y aprendizaje no supervisado real (Node.js puro, determinista):
// - MAD (Median Absolute Deviation) con escala consistente 1.4826
// - Isolation Forest (Liu et al. 2008) con PRNG mulberry32 reproducible
// - Clustering K-Means++ de regímenes de volatilidad y retornos

const mean = values => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
const stdDev = (values, avg = mean(values)) => {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
};
const round = (value, digits = 4) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

function mulberry32(seed = 20261120) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function median(sorted) {
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function robustMadZScores(values) {
    const clean = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    if (!clean.length) return { median: null, mad: null, scores: [] };
    const sorted = [...clean].sort((a, b) => a - b);
    const med = median(sorted);
    const absDevs = clean.map(v => Math.abs(v - med)).sort((a, b) => a - b);
    let mad = 1.4826 * median(absDevs);
    if (mad < 1e-9) {
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        mad = Math.max(0.7413 * (q3 - q1), stdDev(clean, mean(clean)), 1e-6);
    }
    const scores = clean.map(v => round((v - med) / mad, 3));
    return { median: round(med, 4), mad: round(mad, 4), scores };
}

function harmonicC(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const h = Math.log(n - 1) + 0.5772156649;
    return 2 * h - (2 * (n - 1)) / n;
}

function buildIsoTree(points, depth, heightLimit, dims, rand) {
    if (depth >= heightLimit || points.length <= 1) {
        return { external: true, size: points.length };
    }
    const splitCandidates = Array.from({ length: dims }, (_, d) => d);
    const attr = splitCandidates[Math.floor(rand() * dims)];
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const pt of points) {
        if (pt[attr] < minVal) minVal = pt[attr];
        if (pt[attr] > maxVal) maxVal = pt[attr];
    }
    if (!Number.isFinite(minVal) || maxVal - minVal <= 1e-12) {
        return { external: true, size: points.length };
    }
    const splitVal = minVal + rand() * (maxVal - minVal);
    const left = [];
    const right = [];
    for (const pt of points) {
        if (pt[attr] < splitVal) left.push(pt);
        else right.push(pt);
    }
    if (!left.length || !right.length) {
        return { external: true, size: points.length };
    }
    return {
        external: false,
        attr,
        splitVal,
        left: buildIsoTree(left, depth + 1, heightLimit, dims, rand),
        right: buildIsoTree(right, depth + 1, heightLimit, dims, rand),
    };
}

function pathLength(point, node, depth = 0) {
    if (!node || node.external) return depth + harmonicC(node?.size || 1);
    return point[node.attr] < node.splitVal
        ? pathLength(point, node.left, depth + 1)
        : pathLength(point, node.right, depth + 1);
}

class IsolationForest {
    constructor({ nTrees = 64, sampleSize = 64, seed = 20261120 } = {}) {
        this.nTrees = Math.max(16, nTrees);
        this.sampleSize = Math.max(8, sampleSize);
        this.seed = seed;
        this.trees = [];
        this.trainedSampleSize = 0;
        this.dims = 0;
    }

    fit(vectors) {
        const clean = (Array.isArray(vectors) ? vectors : [])
            .filter(row => Array.isArray(row) && row.length && row.every(Number.isFinite));
        if (clean.length < 4) {
            this.trees = [];
            return this;
        }
        this.dims = clean[0].length;
        const rand = mulberry32(this.seed);
        const subSize = Math.min(this.sampleSize, clean.length);
        const heightLimit = Math.ceil(Math.log2(subSize));
        this.trainedSampleSize = subSize;
        this.trees = [];

        for (let t = 0; t < this.nTrees; t++) {
            const sample = [];
            const indices = clean.map((_, i) => i);
            for (let s = 0; s < subSize; s++) {
                const pick = s + Math.floor(rand() * (indices.length - s));
                [indices[s], indices[pick]] = [indices[pick], indices[s]];
                sample.push(clean[indices[s]]);
            }
            this.trees.push(buildIsoTree(sample, 0, heightLimit, this.dims, rand));
        }
        return this;
    }

    score(vectors) {
        if (!this.trees.length || this.trainedSampleSize < 2) return [];
        const cNorm = harmonicC(this.trainedSampleSize) || 1;
        return (Array.isArray(vectors) ? vectors : []).map(vec => {
            if (!Array.isArray(vec) || vec.length !== this.dims) return 0;
            const avgPath = mean(this.trees.map(tree => pathLength(vec, tree, 0)));
            return round(Math.pow(2, -avgPath / cNorm), 4);
        });
    }
}

function sqDist(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        s += d * d;
    }
    return s;
}

function clusterMarketRegimes(points, { k = 3, window = 10, seed = 20261120 } = {}) {
    const clean = (Array.isArray(points) ? points : [])
        .map(p => ({ date: String(p?.date || ''), value: Number(p?.value) }))
        .filter(p => Number.isFinite(p.value) && p.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (clean.length < window + 12) return null;

    const rawFeatures = [];
    for (let i = window; i < clean.length; i++) {
        const slice = clean.slice(i - window, i + 1);
        const rets = [];
        for (let j = 1; j < slice.length; j++) {
            rets.push((slice[j].value - slice[j - 1].value) / slice[j - 1].value);
        }
        const winVals = slice.slice(1).map(s => s.value);
        const m = mean(winVals);
        const sd = stdDev(winVals, m) || 1e-6;
        const rollRet = (clean[i].value - clean[i - window].value) / clean[i - window].value;
        const rollVol = stdDev(rets);
        const z = (clean[i].value - m) / sd;
        rawFeatures.push({ date: clean[i].date, vec: [rollRet, rollVol, z] });
    }

    const cols = 3;
    const fMeans = Array.from({ length: cols }, (_, c) => mean(rawFeatures.map(r => r.vec[c])));
    const fScales = Array.from({ length: cols }, (_, c) => Math.max(stdDev(rawFeatures.map(r => r.vec[c]), fMeans[c]), 1e-6));
    const normVecs = rawFeatures.map(r => r.vec.map((v, c) => (v - fMeans[c]) / fScales[c]));

    const numClusters = Math.min(k, normVecs.length);
    const rand = mulberry32(seed);
    // K-Means++ inicialización determinista
    const centroids = [normVecs[Math.floor(rand() * normVecs.length)]];
    while (centroids.length < numClusters) {
        const dists = normVecs.map(v => Math.min(...centroids.map(c => sqDist(v, c))));
        const total = dists.reduce((s, d) => s + d, 0) || 1;
        let target = rand() * total;
        let chosen = normVecs.at(-1);
        for (let i = 0; i < dists.length; i++) {
            target -= dists[i];
            if (target <= 0) { chosen = normVecs[i]; break; }
        }
        centroids.push([...chosen]);
    }

    let assignments = new Array(normVecs.length).fill(0);
    for (let iter = 0; iter < 25; iter++) {
        let changed = false;
        assignments = normVecs.map((v, idx) => {
            let bestC = 0;
            let bestD = Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const d = sqDist(v, centroids[c]);
                if (d < bestD) { bestD = d; bestC = c; }
            }
            if (assignments[idx] !== bestC) changed = true;
            return bestC;
        });
        for (let c = 0; c < centroids.length; c++) {
            const members = normVecs.filter((_, idx) => assignments[idx] === c);
            if (!members.length) continue;
            for (let d = 0; d < cols; d++) {
                centroids[c][d] = mean(members.map(m => m[d]));
            }
        }
        if (!changed) break;
    }

    // Ordenar centroides por volatilidad original ascendente (col 1) para etiquetas semánticas consistentes
    const volOrder = centroids
        .map((c, idx) => ({ idx, rawVol: c[1] * fScales[1] + fMeans[1], rawRet: c[0] * fScales[0] + fMeans[0] }))
        .sort((a, b) => a.rawVol - b.rawVol);

    const semanticNames = numClusters === 3
        ? ['Calma / Compresión', 'Tendencia Ordenada', 'Estrés / Choque de Volatilidad']
        : volOrder.map((_, idx) => `Régimen ${idx + 1}`);
    const labelByCluster = new Map(volOrder.map((item, rank) => [item.idx, semanticNames[rank]]));

    const counts = {};
    for (const a of assignments) {
        const lbl = labelByCluster.get(a);
        counts[lbl] = (counts[lbl] || 0) + 1;
    }
    const lastIdx = assignments.length - 1;
    const currentCluster = assignments[lastIdx];
    const previousCluster = assignments[Math.max(0, lastIdx - window)];
    const currentRegime = labelByCluster.get(currentCluster);
    const previousRegime = labelByCluster.get(previousCluster);

    return {
        method: 'kmeans_pp_regimes_v1',
        window,
        observations: rawFeatures.length,
        currentRegime,
        previousRegime,
        regimeShift: currentRegime !== previousRegime,
        centroidDistance: round(Math.sqrt(sqDist(normVecs[lastIdx], centroids[currentCluster])), 3),
        counts,
        clusters: volOrder.map((item, rank) => ({
            label: semanticNames[rank],
            avgVolatilityPct: round(item.rawVol * 100, 3),
            avgReturnPct: round(item.rawRet * 100, 2),
            observations: counts[semanticNames[rank]] || 0,
        })),
    };
}

function analyzeMarketAnomalies(rawData = {}) {
    const anomalies = [];
    const regimes = [];

    // 1. Análisis regional no supervisado sobre SNIIM (cerdo, pollo, res, huevo)
    const sniim = rawData?.sniim || {};
    const speciesVectors = [];
    const speciesNames = ['cerdo', 'res', 'pollo', 'huevo'];
    for (const sp of speciesNames) {
        const entry = sniim[sp];
        if (!entry || typeof entry !== 'object') continue;
        const vals = ['norte', 'centro', 'sur'].map(reg => Number(entry[reg])).filter(v => Number.isFinite(v) && v > 0);
        if (vals.length < 2) continue;
        const spread = Math.max(...vals) - Math.min(...vals);
        const avgVal = mean(vals);
        const relSpread = avgVal > 0 ? spread / avgVal : 0;
        const madStats = robustMadZScores(vals);
        speciesVectors.push({
            metric: `sniim.${sp}`,
            vec: [avgVal, spread, relSpread],
            vals,
            regions: ['norte', 'centro', 'sur'].filter(reg => Number.isFinite(Number(entry[reg]))),
            madScores: madStats.scores,
        });
    }

    if (speciesVectors.length >= 4) {
        const forest = new IsolationForest({ nTrees: 48, sampleSize: speciesVectors.length }).fit(speciesVectors.map(s => s.vec));
        const isoScores = forest.score(speciesVectors.map(s => s.vec));
        speciesVectors.forEach((item, idx) => {
            const maxMad = Math.max(0, ...item.madScores.map(Math.abs));
            const iso = isoScores[idx] ?? 0;
            if (maxMad >= 2.8 || iso >= 0.65) {
                anomalies.push({
                    metric: item.metric,
                    type: 'regional_dispersion',
                    isolationScore: iso,
                    maxRobustZ: round(maxMad, 2),
                    severity: iso >= 0.72 || maxMad >= 3.5 ? 'warning' : 'info',
                    detail: `Dispersión regional inusual entre plazas (${item.regions.join('/')}) con z-MAD=${round(maxMad, 2)} e Isolation=${iso}.`,
                });
            }
        });
    }

    // 2. Detección MAD + Isolation Forest + K-Means sobre series en commodities
    const commodities = rawData?.commodities || {};
    for (const [key, item] of Object.entries(commodities)) {
        const rows = Array.isArray(item?.series) ? item.series
            : Array.isArray(item?.data?.data) ? item.data.data
            : Array.isArray(item?.data) ? item.data
            : null;
        if (!rows || rows.length < 18) continue;
        const cleanRows = rows
            .map(r => ({ date: String(r?.date || '').slice(0, 10), value: Number(r?.value) }))
            .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.value) && r.value > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (cleanRows.length < 18) continue;

        const returns = [];
        for (let i = 1; i < cleanRows.length; i++) {
            returns.push((cleanRows[i].value - cleanRows[i - 1].value) / cleanRows[i - 1].value);
        }
        const madRet = robustMadZScores(returns);
        const latestRet = returns.at(-1);
        const latestZ = madRet.scores.at(-1) ?? 0;
        const vectors = returns.slice(1).map((r, idx) => [r, Math.abs(r - returns[idx])]);
        const forest = new IsolationForest({ nTrees: 48, sampleSize: Math.min(48, vectors.length) }).fit(vectors);
        const isoScores = forest.score(vectors);
        const latestIso = isoScores.at(-1) ?? 0;

        if (Math.abs(latestZ) >= 2.8 || latestIso >= 0.62) {
            anomalies.push({
                metric: `commodity.${key}`,
                type: 'series_shock',
                date: cleanRows.at(-1).date,
                isolationScore: latestIso,
                robustZ: latestZ,
                returnPct: round(latestRet * 100, 2),
                severity: Math.abs(latestZ) >= 3.5 || latestIso >= 0.7 ? 'warning' : 'info',
                detail: `${key} (${cleanRows.at(-1).date}): variación ${round(latestRet * 100, 2)}% (z-MAD=${latestZ}, Isolation=${latestIso}).`,
            });
        }

        const clustered = clusterMarketRegimes(cleanRows);
        if (clustered) {
            regimes.push({
                symbol: key,
                cutoff: cleanRows.at(-1).date,
                currentRegime: clustered.currentRegime,
                previousRegime: clustered.previousRegime,
                regimeShift: clustered.regimeShift,
                centroidDistance: clustered.centroidDistance,
            });
        }
    }

    return {
        method: 'isolation_forest+robust_mad+kmeans_pp',
        evaluatedAt: new Date().toISOString(),
        anomalyCount: anomalies.length,
        regimeCount: regimes.length,
        anomalies,
        regimes,
    };
}

module.exports = {
    robustMadZScores,
    IsolationForest,
    clusterMarketRegimes,
    analyzeMarketAnomalies,
};
