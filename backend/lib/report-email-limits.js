'use strict';
const rateLimit=require('express-rate-limit');

function createReportEmailLimits({keyGenerator,windowMs=60*60*1000,maxAttempts=30,maxDeliveries=6,maxSchedules=20}={}) {
    const limit=(max,message,skipFailedRequests=false)=>rateLimit({windowMs,max,keyGenerator,skipFailedRequests,standardHeaders:true,legacyHeaders:false,
        handler:(req,res)=>{
            const reset=new Date(req.rateLimit?.resetTime).getTime();
            const retryAfterSeconds=Math.max(1,Math.ceil(((Number.isFinite(reset) ? reset : Date.now()+windowMs)-Date.now())/1000));
            res.setHeader('Retry-After',String(retryAfterSeconds));
            res.status(429).json({success:false,code:'REPORT_EMAIL_RATE_LIMIT',error:message,retryAfterSeconds});
        },
    });
    // Failed preparation does not consume the delivery quota. All attempts
    // retain a separate bound; changing a schedule does not send an email.
    return {
        attempts:limit(maxAttempts,'Hay demasiados intentos de envío. Espera antes de volver a intentarlo.'),
        deliveries:limit(maxDeliveries,'Alcanzaste el límite de envíos por correo. Espera antes de volver a intentarlo.',true),
        schedules:limit(maxSchedules,'Alcanzaste el límite de cambios de programación. Espera antes de volver a intentarlo.'),
    };
}
module.exports={createReportEmailLimits};
