'use strict';
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../../.env.local'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {createExecutiveReportStore}=require('./executive-report-store');
module.exports=createExecutiveReportStore({table:'finance_executive_reports',keys:["equities","bonds","fx","daily_news","overview"]});
