'use strict';
const {hasBearerSecret}=require('./request-security');
const {reportHealth}=require('../../shared/report-health.mjs');
function createReportRefreshHandler({finance,markets,mexico,deliver,review,getSecret=()=>process.env.CRON_SECRET,logger=console}){
 return async(req,res)=>{
  if(!hasBearerSecret(req,getSecret()))return res.status(401).json({success:false,error:'No autorizado.'});
  try{
   const refreshOnly=req.path==='/api/executive-reports/refresh-content' || req.query.refreshOnly==='1';
   const [finanzas,mercados,nacional]=await Promise.all([finance(),markets({force:refreshOnly && req.query.forceMarkets==='1'}),mexico()]);
   if(!refreshOnly)await Promise.resolve().then(deliver).catch(()=>logger.warn('[report-email-schedules] No se procesaron los envíos tras el corte.'));
   const forecastReview=refreshOnly ? {status:'skipped',reason:'report_refresh_only'} : await review().catch(()=>({checked:0,failed:1,status:'unavailable'}));
   const news=mercados.reports.find(item=>item.key==='market_news'),production=nacional.reports.find(item=>item.key==='mx_production');
   res.json({success:true,generatedAt:new Date().toISOString(),reports:{finanzas:finanzas.reports.length,mercados:mercados.reports.length,mexico:nacional.reports.length},forecastReview,
    reportContent:{marketNews:{count:news?.marketNews?.length || 0,status:news?.newsStatus || 'unavailable',generatedAt:news?.generatedAt},
     mexicoProduction:production ? {state:reportHealth(production).state,periods:reportHealth(production).periodLabel || '',generatedAt:production.generatedAt} : null}});
  }catch{logger.error('[executive-reports] No se pudo completar la actualización.');res.status(502).json({success:false,error:'No se pudieron actualizar los informes programados.'});}
 };
}
module.exports={createReportRefreshHandler};
