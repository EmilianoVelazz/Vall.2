'use strict';

// Ejecutar desde un monitor externo. Solo imprime códigos operativos, nunca cuentas ni respuestas completas.
async function checkOperations(baseUrl = process.env.VALLNEWS_MONITOR_URL || 'https://vallnews.com', {fetchImpl = fetch} = {}) {
    const base = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
        || (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))) {
        throw Error('invalid_monitor_url');
    }
    const result = {checkedAt: new Date().toISOString(), ok: false, issues: []};
    try {
        const response = await fetchImpl(new URL('/api/health?deep=1', base), {
            signal: AbortSignal.timeout(12000), redirect: 'error', headers: {Accept: 'application/json'},
        });
        if (!response.ok) result.issues.push('application:http_failure');
        else {
            const health = await response.json();
            const freshTimestamp = Number.isFinite(Date.parse(health.timestamp))
                && Math.abs(Date.now() - Date.parse(health.timestamp)) < 5 * 60000;
            if (!freshTimestamp || !health.checks?.config || !health.checks?.reports) result.issues.push('application:invalid_health');
            else {
                result.issues = (Array.isArray(health.degradedReasons) ? health.degradedReasons : [])
                    .map(code => /^[a-zA-Z.]+:[a-z_]+$/.test(String(code)) ? String(code) : 'application:unknown_failure');
                if (health.status !== 'ok' && !result.issues.length) result.issues.push('application:degraded');
                const config = health.checks.config;
                if (!config.geminiConfigured) result.issues.push('chat:not_configured');
                if (!config.postgresConfigured && !config.supabaseRestConfigured) result.issues.push('storage:not_configured');
                if (!config.backgroundJobsEnabled) result.issues.push('schedules:disabled');
            }
        }
    } catch { result.issues.push('application:unreachable_or_invalid_response'); }
    result.issues = [...new Set(result.issues)];
    result.ok = result.issues.length === 0;
    return result;
}
module.exports = {checkOperations};
if (require.main === module) checkOperations(process.argv[2]).then(result => {
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
}).catch(() => {console.error('invalid_monitor_configuration'); process.exitCode = 1;});
