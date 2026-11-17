'use strict';
const express=require('express');
const {verifyToken}=require('./auth');
const {buildMorningBrief}=require('../services/morning-brief-service');

function createMorningBriefRouter({authenticate=verifyToken,build=buildMorningBrief}={}) {
    const router=express.Router();
    router.get('/morning-brief',authenticate,async(req,res)=>{
        res.set('Cache-Control','private, no-store');
        try {res.json({success:true,data:await build(),accountEmail:req.user.email});}
        catch {res.status(503).json({success:false,error:'No hay un briefing disponible con datos publicados. Puedes volver a intentarlo.'});}
    });
    return router;
}

module.exports={createMorningBriefRouter,router:createMorningBriefRouter()};
