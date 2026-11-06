'use strict';
const fs=require('node:fs');
require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'backend/.env',quiet:true});
const {connectDatabase}=require('../backend/lib/database-connection');
(async()=>{const db=await connectDatabase();if(!db)throw Error('DB_NOT_CONFIGURED');try{
    await db.query(fs.readFileSync('backend/db/migrations/018_chat_credits.sql','utf8'));
    const result=await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('public.chat_credit_accounts'::regclass,'public.chat_credit_windows'::regclass,'public.chat_credit_reservations'::regclass)");
    console.log(JSON.stringify({migrated:result.rows.length===3,privateRls:result.rows.every(row=>row.relrowsecurity)}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}})().catch(error=>{console.error('[chat-credits-migration]',error.code || 'MIGRATION_FAILED');process.exitCode=1;});
