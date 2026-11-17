'use strict';
// Local visual fixture only. No database, passwords, provider calls or mail.
const express=require('express'),cookieParser=require('cookie-parser'),path=require('node:path');
const app=express(),root=path.resolve(__dirname,'../..');
app.use(cookieParser());app.use(express.json());
const identity=req=>req.cookies.vall_credit_fixture==='admin' ? {email:'admin@vall.com',role:'admin'} : {email:'chat@example.invalid',role:'user'};
app.get('/api/verify-token',(req,res)=>res.json({success:true,email:identity(req).email}));
app.get('/api/profile',(req,res)=>res.json({success:true,profile:{...identity(req),preferences:{orionModel:'cirius'}}}));
app.get('/api/chat-usage',(_req,res)=>res.json({success:true,usage:{enabled:false,exempt:true,blocked:false,windows:[],realtimeVoice:true}}));
app.post('/api/ai-insight-stream',(req,res)=>{
    const text='Respuesta de prueba sin cupos internos.';
    res.type('text/event-stream');res.write('data: '+JSON.stringify({text})+'\n\n');res.end('data: '+JSON.stringify({done:true,finalText:text,model:'fixture',tier:'flash',mode:'normal'})+'\n\n');
});
app.use('/api',(_req,res)=>res.json({success:true,data:[],conversations:[]}));
app.use('/assets',express.static(path.join(root,'assets')));
app.get(['/orion','/orion/'],(req,res)=>{if(['user','admin'].includes(req.query.mode))res.cookie('vall_credit_fixture',req.query.mode,{sameSite:'lax'});res.sendFile(path.join(root,'dist/index.html'));});
app.use(express.static(path.join(root,'dist')));
const server=app.listen(Number(process.env.VALL_CREDIT_UI_PORT)||0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/orion?mode=available`,fixture:true})));
process.on('SIGTERM',()=>server.close());
