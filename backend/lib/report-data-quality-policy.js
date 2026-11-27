'use strict';
const {reportHealth}=require('../../shared/report-health.mjs');

function normalizeDataQualityPolicy(value) {
    return value==='block' ? 'block' : 'warn';
}

function reportHealthSummary(report,now) {
    const health=reportHealth(report,now);
    const references=health.references.filter(item=>['missing','stale','preserved'].includes(item.status));
    const clean=value=>typeof value==='string' ? value.replace(/[\x00-\x1f\x7f]+/g,' ').slice(0,160) : '';
    return {
        state:health.state,label:health.label,asOf:health.asOf,generatedAt:health.generatedAt,coverage:health.coverage,
        issueCount:references.length,
        references:references.slice(0,12).map(item=>({
            label:clean(item.label),source:clean(item.source),unit:clean(item.unit),date:clean(item.date),status:item.status,
        })),
    };
}

function reportHealthBlocksDelivery(health) {
    return !['updated','historical'].includes(health.state);
}

module.exports={normalizeDataQualityPolicy,reportHealthSummary,reportHealthBlocksDelivery};
