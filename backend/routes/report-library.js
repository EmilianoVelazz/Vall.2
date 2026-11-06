'use strict';
const express=require('express');
const {verifyToken}=require('./auth');
const {annualLibrary}=require('../services/annual-report-library');
const catalog=require('../../shared/report-library.json');
const router=express.Router();
router.get('/report-library',verifyToken,(req,res)=>res.json({success:true,years:catalog.years,reports:catalog.reports,total:catalog.years.length*Object.values(catalog.reports).reduce((sum,reports)=>sum+Object.keys(reports).length,0)}));
router.get('/annual-reports',verifyToken,async(req,res)=>{
    if(!/^202[2-5]$/.test(String(req.query.year || '')))return res.status(400).json({success:false,error:'Selecciona 2022, 2023, 2024 o 2025.'});
    const year=Number(req.query.year);
    try {const library=await annualLibrary.get();res.json({success:true,year,data:library.years[year],generatedAt:library.generatedAt});}
    catch {res.status(503).json({success:false,error:'No se pudo preparar la librería histórica. Puedes volver a intentarlo.'});}
});
module.exports=router;
