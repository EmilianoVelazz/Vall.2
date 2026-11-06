'use strict';
const express=require('express');
const {verifyToken}=require('./auth');
const {mexicoReports}=require('../services/mexico-executive-reports');
const {nextReportRefreshAt}=require('../lib/report-schedule');
function createMexicoReportsRouter({service=mexicoReports,authenticate=verifyToken}={}) {
    const router=express.Router();
    router.get('/mexico-executive-reports',authenticate,async(req,res)=>{
        res.set('Cache-Control','private, no-store');
        try {
            const snapshot=require('../lib/report-panorama').composeMexicoPanorama(await service.get());
            res.json({success:true,data:snapshot.reports,generatedAt:snapshot.generatedAt,nextRefreshAt:nextReportRefreshAt().toISOString(),persistence:snapshot.persistence,sourceErrors:snapshot.sourceErrors,refreshing:snapshot.refreshing===true});
        } catch {res.status(503).json({success:false,error:'No se pudieron cargar los informes de México. Puedes volver a intentarlo.'});}
    });
    return router;
}
module.exports={createMexicoReportsRouter,router:createMexicoReportsRouter()};
