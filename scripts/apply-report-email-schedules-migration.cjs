'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const {connectDatabase}=require('../backend/lib/database-connection');

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

const MIGRATIONS=['010_report_email_schedules.sql','013_report_email_schedule_preferences.sql','015_mexico_report_schedules.sql'];
async function applyScheduleMigrations({connect=connectDatabase}={}) {
    const db = await connect();
    if(!db) throw Error('Falta configurar la conexión de la base de datos.');
    try {
        await db.query('BEGIN');
        for(const file of MIGRATIONS) await db.query(await fs.readFile(path.resolve(__dirname,'../backend/db/migrations',file),'utf8'));
        await db.query('COMMIT');
        return {migrated:true,migrations:MIGRATIONS};
    } catch(error) {await db.query('ROLLBACK').catch(()=>{});throw error;}
    finally {await db.end();}
}
if(require.main===module) applyScheduleMigrations().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error('[report-email-schedules] Migración falló:',error.code || error.message);process.exitCode=1;});
module.exports={applyScheduleMigrations};
