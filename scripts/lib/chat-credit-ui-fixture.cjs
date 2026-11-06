'use strict';
// Local visual fixture only. No database, passwords, provider calls or mail.
const express=require('express'),cookieParser=require('cookie-parser'),path=require('node:path');
const app=express(),root=path.resolve(__dirname,'../..');
app.use(cookieParser());app.use(express.json());
const blocked=req=>req.cookies.vall_credit_fixture==='blocked';
app.get('/api/verify-token',(_req,res)=>res.json({success:true,email:'creditos@example.invalid'}));
app.get('/api/profile',(_req,res)=>res.json({success:true,profile:{email:'creditos@example.invalid',preferences:{orionModel:'cirius'},role:'user'}}));
app.get('/api/chat-usage',(req,res)=>{
    const windows=[['month',200,125,'2026-11-01T06:00:00Z'],['week',200*7/31,20,new Date(Date.now()+7*86400000).toISOString()],['five_hours',200*5/(31*24),.9,new Date(Date.now()+5*3600000).toISOString()]].map(([kind,limitMxn,usedMxn,resetsAt])=>{
        if(blocked(req) && kind==='five_hours')usedMxn=limitMxn;
        return {kind,limitMxn,usedMxn,remainingMxn:limitMxn-usedMxn,reservedMxn:0,limitMicros:Math.floor(limitMxn*1e6),usedMicros:Math.floor(usedMxn*1e6),reservedMicros:0,remainingMicros:Math.floor((limitMxn-usedMxn)*1e6),resetsAt,inputTokens:40000,outputTokens:12000,thinkingTokens:8000};
    });
    res.json({success:true,usage:{exempt:false,blocked:blocked(req),realtimeVoice:false,currency:'MXN',mxnPerUsd:20,windows,resetsAt:blocked(req) ? windows[2].resetsAt : null}});
});
app.post('/api/ai-insight-stream',(req,res)=>{
    if(blocked(req) || req.cookies.vall_credit_fixture==='server-blocked')return res.status(429).json({success:false,code:'CHAT_CREDITS_EXHAUSTED',error:'No tienes créditos disponibles. Tu cupo se recarga el '+new Date(Date.now()+5*3600000).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})+' (Ciudad de México). Los informes siguen disponibles.'});
    res.type('text/event-stream');res.write('data: '+JSON.stringify({text:'Respuesta de prueba visual. No se consumieron créditos reales.'})+'\n\n');res.end('data: '+JSON.stringify({done:true,finalText:'Respuesta de prueba visual. No se consumieron créditos reales.',model:'fixture',tier:'flash',mode:'normal'})+'\n\n');
});
app.use('/api',(_req,res)=>res.json({success:true,data:[],conversations:[]}));
app.use('/assets',express.static(path.join(root,'assets')));
app.use(express.static(path.join(root,'dist')));
app.get('/orion',(req,res)=>{if(['blocked','available','server-blocked'].includes(req.query.mode))res.cookie('vall_credit_fixture',req.query.mode,{sameSite:'lax'});res.sendFile(path.join(root,'dist/index.html'));});
const server=app.listen(Number(process.env.VALL_CREDIT_UI_PORT)||0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/orion?mode=available`,fixture:true})));
process.on('SIGTERM',()=>server.close());
