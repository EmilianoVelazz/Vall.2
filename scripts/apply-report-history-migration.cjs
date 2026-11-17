'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env.local'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
const {connectDatabase}=require('../backend/lib/database-connection');
async function main(){
    const sql=await fs.readFile(path.resolve(__dirname,'../backend/db/migrations/021_report_history_editions.sql'),'utf8');
    if(!process.argv.includes('--apply')){console.log('Migración 021 preparada: historial privado e inmutable. Usa --apply con la conexión PostgreSQL del despliegue para activarla.');return;}
    const database=await connectDatabase();if(!database)throw Error('Se requiere una conexión PostgreSQL administrativa para aplicar la migración 021.');
    try{await database.query(sql);console.log('Migración 021 aplicada.');}finally{await database.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
