'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('./auth');
const { ReportReaderAgent } = require('../ai/report-reader-agent');
const { accountKey, createWorkGate, boundedJson } = require('../lib/resource-limits');

function createReportReaderRouter({ agent = new ReportReaderAgent(), authenticate = verifyToken } = {}) {
    const router = express.Router();
    const readLimiter = rateLimit({
        keyGenerator: accountKey,
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Demasiadas consultas al lector de informes. Espera un momento.' },
    });
    const readWork = createWorkGate({ maxActive: 8, maxPerUser: 2 }).wrap;

    router.use('/report-reader', authenticate, (req, res, next) => {
        res.set('Cache-Control', 'private, no-store');
        next();
    });

    router.get('/report-reader/catalog', readLimiter, async (req, res) => {
        try {
            const catalog = await agent.catalog();
            res.json({ success: true, ...catalog, accountEmail: req.user?.email });
        } catch (error) {
            const status = Number.isInteger(error?.status) ? error.status : 503;
            res.status(status).json({ success: false, error: status < 500 ? error.message : 'No se pudo cargar el catálogo de informes.' });
        }
    });

    router.post('/report-reader/read', readLimiter, boundedJson({ limit: '32kb' }), readWork(async (req, res) => {
        const controller = new AbortController();
        const abort = () => { if (!res.writableFinished) controller.abort(); };
        req.on('aborted', abort);
        res.on('close', abort);
        try {
            const { collection, key, historyId, userReportId, analysisPeriod, question } = req.body || {};
            if (question != null && (typeof question !== 'string' || question.length > 1000)) {
                return res.status(400).json({ success: false, error: 'La pregunta debe ser texto de hasta 1000 caracteres.' });
            }
            const result = await agent.read({
                collection,
                key,
                historyId,
                userReportId,
                ownerEmail: req.user?.email,
                analysisPeriod,
                question,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) {
                res.json({ success: true, ...result, accountEmail: req.user?.email });
            }
        } catch (error) {
            if (controller.signal.aborted) return;
            const status = Number.isInteger(error?.status) ? error.status : 503;
            res.status(status).json({
                success: false,
                error: status < 500 ? error.message : 'No se pudo leer el informe solicitado.',
            });
        } finally {
            req.off('aborted', abort);
            res.off('close', abort);
        }
    }));

    return router;
}

module.exports = { createReportReaderRouter, router: createReportReaderRouter() };
