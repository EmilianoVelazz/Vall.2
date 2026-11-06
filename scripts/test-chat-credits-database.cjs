'use strict';
// Isolated profile, no password and no real-user charges. Every record created
// below is removed by its random UUID, even when a verification fails.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'backend/.env',quiet:true});
const {connectDatabase}=require('../backend/lib/database-connection');
const {serverSupabase}=require('../backend/lib/supabase-connection');
(async()=>{
    const db=await connectDatabase();assert(db,'Private database connection required');
    const id=crypto.randomUUID(),peers=[];
    try{
        const permissions=await db.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated FROM pg_class c WHERE c.oid=ANY(ARRAY['public.chat_credit_accounts'::regclass,'public.chat_credit_windows'::regclass,'public.chat_credit_reservations'::regclass])");
        assert.equal(permissions.rows.length,3);assert(permissions.rows.every(row=>row.relrowsecurity && !row.anon && !row.authenticated));
        const functions=await db.query("SELECT p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1)",[['vall_chat_credit_state','vall_chat_credit_reserve','vall_chat_credit_settle']]);
        assert.equal(functions.rows.length,3);assert(functions.rows.every(row=>!row.prosecdef && !row.anon && !row.authenticated && row.service));
        await db.query('INSERT INTO public.app_profiles(id,email,display_name,training_opt_in) VALUES($1,$2,$3,false)',[id,`quota-test-${id}@example.invalid`,'Prueba temporal de créditos']);
        const state=async()=> (await db.query('SELECT public.vall_chat_credit_state($1) AS value',[id])).rows[0].value;
        let initial=await state();assert.equal(initial.windows[0].limitMicros,200000000);assert.equal(initial.windows[1].startsAt,null);assert.equal(initial.windows[2].startsAt,null);
        const initialRest=await serverSupabase().rpc('vall_chat_credit_state',{target_id:id,activate:false}).abortSignal(AbortSignal.timeout(8000));
        assert(!initialRest.error,'Private REST RPC connection must work');assert.equal(initialRest.data.windows[0].limitMicros,200000000);
        const amount=Math.floor(initial.windows[2].remainingMicros*.8),requests=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
        for(let i=0;i<3;i++)peers.push(await connectDatabase());
        const outcomes=await Promise.all(peers.map((peer,index)=>peer.query('SELECT public.vall_chat_credit_reserve($1,$2,$3,$4) AS value',[id,requests[index],amount,'gemini-2.5-flash'])));
        assert.equal(outcomes.filter(result=>result.rows[0].value.allowed).length,1,'Only one simultaneous request may reserve 80% of the five-hour cap');
        const winner=requests[outcomes.findIndex(result=>result.rows[0].value.allowed)];
        const replay=await db.query('SELECT public.vall_chat_credit_reserve($1,$2,$3,$4) AS value',[id,winner,amount,'gemini-2.5-flash']);assert(replay.rows[0].value.allowed);
        assert.equal((await state()).windows[2].reservedMicros,amount,'Reservation retries do not reserve twice');
        const billed=12345,usage={inputTokens:123,outputTokens:45,thinkingTokens:6,pricingVersion:'fixture'};
        for(let i=0;i<2;i++)await db.query('SELECT public.vall_chat_credit_settle($1,$2,$3,$4::jsonb,false)',[id,winner,billed,JSON.stringify(usage)]);
        const settled=await state();assert(settled.windows.every(window=>window.usedMicros===billed && window.reservedMicros===0 && window.inputTokens===123));
        const session=settled.windows.find(window=>window.kind==='five_hours'),weekly=settled.windows.find(window=>window.kind==='week');
        assert.equal(Date.parse(session.resetsAt)-Date.parse(session.startsAt),5*3600000);
        assert.equal(Date.parse(weekly.resetsAt)-Date.parse(weekly.startsAt),7*86400000);
        const pending=crypto.randomUUID();await db.query('SELECT public.vall_chat_credit_reserve($1,$2,10000,$3)',[id,pending,'gemini-2.5-flash']);
        await db.query("UPDATE public.chat_credit_reservations SET expires_at=now()-interval '1 minute' WHERE id=$1 AND profile_id=$2",[pending,id]);
        const expired=await state();assert(expired.windows.every(window=>window.usedMicros===billed+10000 && window.reservedMicros===0));
        const log=await db.query('SELECT status,billed_micros FROM public.chat_credit_reservations WHERE id=$1',[pending]);assert.equal(log.rows[0].status,'estimated');
        await db.query("UPDATE public.chat_credit_windows SET starts_at=now()-interval '6 hours',resets_at=now()-interval '1 hour' WHERE profile_id=$1 AND kind='five_hours'",[id]);
        const refill=await state();assert.equal(refill.windows[2].usedMicros,0);assert.equal(refill.windows[2].startsAt,null);assert.equal(refill.windows[0].usedMicros,billed+10000);
        await db.query("UPDATE public.chat_credit_windows SET starts_at=now()-interval '8 days',resets_at=now()-interval '1 day' WHERE profile_id=$1 AND kind='week'",[id]);
        const weekRefill=await state();assert.equal(weekRefill.windows[1].usedMicros,0);assert.equal(weekRefill.windows[0].usedMicros,billed+10000);
        await db.query("UPDATE public.chat_credit_windows SET starts_at=now()-interval '1 year',resets_at=now()-interval '1 hour' WHERE profile_id=$1 AND kind='month'",[id]);
        const monthRefill=await state();assert(monthRefill.windows.every(window=>window.usedMicros===0));assert.equal(monthRefill.windows[0].remainingMicros,200000000);
        console.log(JSON.stringify({privateTables:3,privateRpcs:3,postgres:true,rest:true,concurrency:true,idempotency:true,expiry:true,refills:['five_hours','week','month'],realUserCharges:0}));
    }finally{
        for(const peer of peers)await peer.end();
        await db.query('BEGIN');
        try{
            for(const table of ['chat_credit_reservations','chat_credit_windows','chat_credit_accounts'])await db.query(`DELETE FROM public.${table} WHERE profile_id=$1`,[id]);
            await db.query("DELETE FROM public.app_profiles WHERE id=$1 AND email=$2 AND password_hash IS NULL",[id,`quota-test-${id}@example.invalid`]);
            await db.query('COMMIT');
        }catch(error){await db.query('ROLLBACK');console.error('[chat-credit-db-cleanup]',error.code || error.name);process.exitCode=1;}finally{await db.end();}
    }
})().catch(error=>{console.error('[chat-credit-db-test]',error.code || error.name);process.exitCode=1;});
