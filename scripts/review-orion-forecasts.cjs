'use strict';
require('dotenv').config({path:require('node:path').join(__dirname,'../backend/.env'),quiet:true});
require('../backend/ml/forecast-review-job').runForecastReview().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error('No se pudo revisar el seguimiento:',error.code || error.name);process.exitCode=1;});
