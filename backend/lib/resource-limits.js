'use strict';

const express = require('express');
const net = require('node:net');
const { ipKeyGenerator } = require('express-rate-limit');

function clientIp(req, env = process.env) {
    // Solo en el runtime de producción de Vercel: esta cabecera la genera su
    // ingress. En localhost no confiar en X-Forwarded-For enviado por clientes.
    const forwarded = req.headers?.['x-vercel-forwarded-for'];
    if (env.VERCEL && env.NODE_ENV === 'production' && typeof forwarded === 'string' && net.isIP(forwarded)) return forwarded;
    return req.ip;
}
function anonymousKey(req) { return `ip:${ipKeyGenerator(clientIp(req))}`; }

function accountKey(req) {
    const id = req.user?.sub || req.user?.id;
    return id ? `user:${id}` : anonymousKey(req);
}

// Admisión inmediata: evita colas sin límite y conserva el cupo hasta que el
// trabajo termina, aunque el cliente cierre la conexión antes de recibirlo.
function createWorkGate({ maxActive = 12, maxPerUser = 2 } = {}) {
    let active = 0;
    const owners = new Map();
    function acquire(req, res) {
        const owner = accountKey(req);
        const count = owners.get(owner) || 0;
        if (count >= maxPerUser || active >= maxActive) {
            res.set('Retry-After', '5');
            res.status(count >= maxPerUser ? 429 : 503).json({ success: false, error: 'Hay solicitudes en curso. Intenta en unos segundos.' });
            return null;
        }
        active++;
        owners.set(owner, count + 1);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            active--;
            const remaining = owners.get(owner) - 1;
            if (remaining) owners.set(owner, remaining); else owners.delete(owner);
        };
    }
    const wrap = handler => async (req, res, next) => {
        const release = acquire(req, res);
        if (!release) return;
        try { await handler(req, res, next); } catch (error) { next(error); }
        finally { release(); }
    };
    return { acquire, wrap, snapshot: () => ({ active, owners: owners.size, maxActive, maxPerUser }) };
}

const bodyGate = createWorkGate({ maxActive: 8, maxPerUser: 2 });
function boundedJson(options) {
    const parser = express.json(options);
    return (req, res, next) => {
        const release = bodyGate.acquire(req, res);
        if (!release) return;
        parser(req, res, error => { release(); next(error); });
    };
}

module.exports = { clientIp, anonymousKey, accountKey, createWorkGate, boundedJson };
