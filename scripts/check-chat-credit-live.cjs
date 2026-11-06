'use strict';
// One deliberately tiny provider response, charged only to a disposable ledger.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'backend/.env',quiet:true});
const {connectDatabase}=require('../backend/lib/database-connection');
const {withChatCredits}=require('../backend/lib/chat-credit-context');
const {chatCredits}=require('../backend/services/chat-credits');
const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
(async()=>{
    const db=await connectDatabase();assert(db);const id=crypto.randomUUID(),email=`quota-live-${id}@example.invalid`;
    try{
        await db.query('INSERT INTO public.app_profiles(id,email,display_name,training_opt_in) VALUES($1,$2,$3,false)',[id,email,'Prueba temporal de conexión de créditos']);
        const provider=new GeminiProvider();provider.modelsForTier=()=>['gemini-2.5-flash'];
        await withChatCredits(chatCredits.meter({sub:id,email,role:'user'}),()=>provider.generate({prompt:'Responde únicamente: verificado.',systemInstruction:'Responde en español.',maxOutputTokens:128,timeoutMs:15000}));
        const state=await chatCredits.status({sub:id,email,role:'user'});
        const result=await db.query('SELECT status,input_tokens,output_tokens,thinking_tokens,billed_micros FROM public.chat_credit_reservations WHERE profile_id=$1',[id]);
        assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,'settled');assert(Number(result.rows[0].input_tokens)>0);assert(Number(result.rows[0].output_tokens)>0);
        assert(state.windows.every(window=>window.usedMicros>0 && window.reservedMicros===0));
        console.log(JSON.stringify({liveProvider:true,model:'gemini-2.5-flash',countReserveGenerateSettle:true,status:result.rows[0].status,testCreditsMxn:Number(result.rows[0].billed_micros)/1e6,realUserCharges:0}));
    }finally{
        await db.query('BEGIN');
        try{
            for(const table of ['chat_credit_reservations','chat_credit_windows','chat_credit_accounts'])await db.query(`DELETE FROM public.${table} WHERE profile_id=$1`,[id]);
            await db.query('DELETE FROM public.app_profiles WHERE id=$1 AND email=$2 AND password_hash IS NULL',[id,email]);await db.query('COMMIT');
        }catch(error){await db.query('ROLLBACK');console.error('[credit-live-cleanup]',error.code || error.name);process.exitCode=1;}finally{await db.end();}
    }
})().catch(error=>{console.error('[credit-live-check]',error.code || error.status || error.name);process.exitCode=1;});
