'use strict';
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../../.env.local'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {createExecutiveReportStore}=require('./executive-report-store');
module.exports=createExecutiveReportStore({table:'market_executive_reports',keys:["overview","grains","energy_metals","proteins","market_news"],timeoutMs:12000});
