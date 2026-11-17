'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env.local'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
const {connectDatabase}=require('../backend/lib/database-connection');
async function main(){
 const file=path.resolve(__dirname,'../backend/db/migrations/020_session_revocations.sql'),sql=await fs.readFile(file,'utf8');
 if(!process.argv.includes('--apply')){console.log('Migración 020 preparada: tabla privada, índice de vencimiento y RLS. Usa --apply con conexión PostgreSQL del despliegue para activarla.');return;}
 const database=await connectDatabase();if(!database)throw Error('Se requiere una conexión PostgreSQL administrativa para aplicar la migración 020.');
 try{await database.query(sql);console.log('Migración 020 aplicada.');}finally{await database.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
