'use strict';
const express=require('express');
const {verifyToken}=require('./auth');
const {reportHistory}=require('../services/report-history-store');
const collections=require('../../shared/report-collections.json');
function createReportHistoryRouter({store=reportHistory,authenticate=verifyToken}={}){
    let seeded;
    const router=express.Router();router.use(authenticate,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
    router.get('/report-history',async(req,res)=>{
        const {area,key,date}=req.query;
        if(area && !['finance','markets','mexico'].includes(area) || key && !(area && collections[area].reportKeys.includes(key)) || date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date))return res.status(400).json({success:false,error:'Revisa la familia, el informe y la fecha.'});
        try{
            if(store.seedCurrent)await (seeded ||= Promise.resolve().then(()=>store.seedCurrent()).catch(error=>{seeded=undefined;throw error;}));
            if((req.query.cursor || req.query.limit) && store.listPage){const page=await store.listPage({area,key,date,cursor:req.query.cursor,limit:req.query.limit});return res.json({success:true,...page});}
            res.json({success:true,data:await store.list({area,key,date})});
        }catch(error){res.status(error.status===400 ? 400 : 503).json({success:false,error:error.status===400 ? error.message : 'No se pudo consultar el historial.'});}
    });
    router.get('/report-history/:id',async(req,res)=>{try{const item=await store.get(req.params.id);if(!item)return res.status(404).json({success:false,error:'La edición no está disponible.'});res.json({success:true,data:item.report});}catch(error){res.status(error.status || 503).json({success:false,error:error.status===400?error.message:'No se pudo abrir la edición.'});}});
    return router;
}
module.exports={createReportHistoryRouter};
