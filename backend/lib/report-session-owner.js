'use strict';
function ensureReportOwner(req) {
    const expected=req.body?.expectedOwner;
    if(expected!=null && (typeof expected!=='string' || expected.trim().toLowerCase()!==String(req.user?.email||'').trim().toLowerCase())) throw Object.assign(Error('La sesión cambió de cuenta. Recarga la cuenta; el borrador permanece en su pestaña original.'),{status:409,code:'REPORT_ACCOUNT_CHANGED'});
}
function reportOwnerBinding(req,res,next) {
    try {ensureReportOwner(req);next();}
    catch(error) {res.status(error.status).json({success:false,error:error.message,code:error.code});}
}
module.exports={ensureReportOwner,reportOwnerBinding};
