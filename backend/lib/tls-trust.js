'use strict';

const tls = require('node:tls');
let defaults;
let systemTrustConfigured = false;

function trustedCertificates(extraPem = '') {
    if (!defaults) {
        const roots = typeof tls.getCACertificates === 'function'
            ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')]
            : [...tls.rootCertificates];
        defaults = [...new Set(roots)];
    }
    return extraPem ? [...defaults, extraPem.replace(/\\n/g, '\n')] : defaults;
}

// Native fetch does not use https.globalAgent (including ssl-root-cas).
// Trust the OS certificate store as well as Node's existing CA bundle without
// disabling certificate or hostname verification. Older runtimes retain their
// existing defaults; this API is available on current Node 22/24 and newer.
function configureSystemTrust() {
    if (systemTrustConfigured) return true;
    if (typeof tls.setDefaultCACertificates !== 'function' || typeof tls.getCACertificates !== 'function') return false;
    tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
    systemTrustConfigured = true;
    return true;
}

module.exports = { trustedCertificates, configureSystemTrust };
