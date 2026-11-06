'use strict';
require('dotenv').config({path:require('node:path').resolve(__dirname,'../backend/.env'),quiet:true});
const {reconcileCalendarTimes}=require('../backend/services/report-email-schedule-store');
const {reportMailStatus,mailAutomationEnabled}=require('../backend/services/report-mailer');
(async()=>{
    const result=await reconcileCalendarTimes({dryRun:!process.argv.includes('--repair')});
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),timeZone:'America/Mexico_City',mail:reportMailStatus(),automaticEnabled:mailAutomationEnabled(),cronSecretConfigured:!!process.env.CRON_SECRET,...result},null,2));
})().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
