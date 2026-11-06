'use strict';
const express=require('express');
const {verifyToken}=require('./auth');
const {userReportStore}=require('../services/user-report-store');
const {userReportAgent}=require('../ai/user-report-agent');
const {reportLearning}=require('../services/report-learning');
const rateLimit=require('express-rate-limit');
const {accountKey,createWorkGate,boundedJson}=require('../lib/resource-limits');
const {ensureReportOwner:ensureOwner}=require('../lib/report-session-owner');
function createUserReportsRouter({store=userReportStore,authenticate=verifyToken,agent=userReportAgent,learning=reportLearning}={}) {
    const router=express.Router();
    const generationLimiter=rateLimit({keyGenerator:accountKey,windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{success:false,error:'Llegaste al límite de generaciones. Intenta de nuevo en unos minutos.'}});
    const generationWork=createWorkGate({maxActive:6,maxPerUser:1}).wrap;
    const learningLimiter=rateLimit({keyGenerator:accountKey,windowMs:60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:{success:false,error:'Espera un momento antes de actualizar tus intereses.'}});
    router.use('/user-reports',authenticate,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
    const owner=req=>req.user?.email;
    const fail=(error,res)=>res.status(error.status||503).json({success:false,error:error.status ? error.message : 'No se pudo acceder a tus informes. Tu borrador sigue disponible; intenta guardar de nuevo.',...(['REPORT_CREATION_CONFLICT','REPORT_CREATION_REMOVED','REPORT_ACCOUNT_CHANGED'].includes(error.code) ? {code:error.code} : {})});
    router.get('/user-reports/learning',learningLimiter,async(req,res)=>{res.json({success:true,data:await learning.load(req.user)});});
    router.post('/user-reports/learning',learningLimiter,express.json({limit:'2kb'}),async(req,res)=>{
        try {res.json({success:true,data:await learning.update(req.user,req.body||{})});} catch(error) {fail(error,res);}
    });
    router.post('/user-reports/generate',generationLimiter,boundedJson({limit:'4mb'}),generationWork(async(req,res)=>{
        const controller=new AbortController();
        const abort=()=>{if(!res.writableFinished) controller.abort();};
        req.on('aborted',abort);res.on('close',abort);
        try {
            ensureOwner(req);
            const userContext=await learning.load(req.user);
            if(controller.signal.aborted) return;
            const data=await agent.generate(req.body||{}, {signal:controller.signal,userContext});if(!controller.signal.aborted) res.json({success:true,data,accountEmail:owner(req)});
        }
        catch(error) {if(!controller.signal.aborted) fail(error,res);}
        finally {req.off('aborted',abort);res.off('close',abort);}
    }));
    router.get('/user-reports',async(req,res)=>{try {res.json({success:true,storage:store.storage,data:await store.list(owner(req)),accountEmail:owner(req)});} catch(error) {fail(error,res);}});
    router.get('/user-reports/:id',async(req,res)=>{try {const data=await store.get(owner(req),req.params.id);if(!data) return res.status(404).json({success:false,error:'No se encontró tu informe.'});res.json({success:true,storage:store.storage,data,accountEmail:owner(req)});} catch(error) {fail(error,res);}});
    router.post('/user-reports',express.json({limit:'4mb'}),async(req,res)=>{try {ensureOwner(req);const data=await store.save(owner(req),req.body||{});res.json({success:true,storage:store.storage,data,accountEmail:owner(req)});} catch(error) {fail(error,res);}});
    router.delete('/user-reports/:id',express.json({limit:'8kb'}),async(req,res)=>{
        try {ensureOwner(req);const data=await store.remove(owner(req),{id:req.params.id,version:req.body?.version});res.json({success:true,data});}
        catch(error) {if(error.code==='REPORT_ACCOUNT_CHANGED') fail(error,res);else res.status(error.status||503).json({success:false,error:error.status ? error.message : 'No se pudo confirmar la eliminación. Actualiza Mis informes antes de volver a intentar.'});}
    });
    return router;
}
module.exports=createUserReportsRouter();
module.exports.createUserReportsRouter=createUserReportsRouter;
