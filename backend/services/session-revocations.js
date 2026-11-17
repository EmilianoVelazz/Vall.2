'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {connectDatabase}=require('../lib/database-connection');
const {serverSupabase}=require('../lib/supabase-connection');
const DIGEST=/^[a-f0-9]{64}$/;
function sessionIdentity(claims){
 if(!Number.isInteger(claims?.iat) || !claims.sub)throw Error('Sesión sin fecha de emisión válida.');
 const expires=Math.min(Number.isInteger(claims.exp)?claims.exp:claims.iat+28800,claims.iat+28800);
 const digest=crypto.createHash('sha256').update(JSON.stringify([claims.sub,claims.jti || null,claims.iat,expires])).digest('hex');
 return {digest,expiresAt:expires*1000};
}
function createSessionRevocations({mode=process.env.VALL_SESSION_REVOCATION_STORE || (process.env.NODE_ENV==='test'?'memory':process.env.VERCEL?'database':'disk'),directory=process.env.VALL_SESSION_STORAGE_DIR || path.join(__dirname,'../cache/session-revocations'),now=Date.now,connect=connectDatabase,rest=serverSupabase,maxRecords=10000}={}){
 const root=path.resolve(directory),memory=new Map();
 if(!['disk','database','memory'].includes(mode))throw Error('Almacén de revocación no válido.');
 if(mode==='memory' && process.env.NODE_ENV!=='test')throw Error('La revocación en memoria sólo se admite en pruebas.');
 const validate=item=>{if(!DIGEST.test(item?.digest || '') || !Number.isFinite(item.expiresAt))throw Error('Identidad de sesión no válida.');};
 async function database(work,sql){
  let db;try{db=await connect();if(db)return await sql(db);}catch{ /* A private REST connection also supports shared serverless instances. */ }finally{await db?.end().catch(()=>{});}
  return work(rest());
 }
 return {
  async isRevoked(item){
   validate(item);
   if(mode==='memory')return (memory.get(item.digest) || 0)>now();
   if(mode==='disk'){
    try{const file=path.join(root,item.digest+'.json');if((await fs.stat(file)).size>256)throw Error('Registro de sesión inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(!Number.isFinite(record.expiresAt))throw Error('Registro de sesión inválido.');return record.expiresAt>now();}catch(error){if(error.code==='ENOENT')return false;throw error;}
   }
   return database(async client=>{const {data,error}=await client.from('app_session_revocations').select('digest').eq('digest',item.digest).gt('expires_at',new Date(now()).toISOString()).maybeSingle();if(error)throw error;return Boolean(data);},async db=>(await db.query('SELECT digest FROM public.app_session_revocations WHERE digest=$1 AND expires_at>$2',[item.digest,new Date(now()).toISOString()])).rows.length>0);
  },
  async revoke(item){
   validate(item);if(item.expiresAt<=now())return;
   if(mode==='memory'){for(const [key,expires]of memory)if(expires<=now())memory.delete(key);if(memory.size>=maxRecords && !memory.has(item.digest))throw Error('Almacén de sesiones ocupado.');memory.set(item.digest,item.expiresAt);return;}
   if(mode==='disk'){
    await fs.mkdir(root,{recursive:true,mode:0o700});let count=0;
    for await(const entry of await fs.opendir(root)){if(!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name))continue;const file=path.join(root,entry.name);try{const record=JSON.parse(await fs.readFile(file,'utf8'));if(Number.isFinite(record.expiresAt) && record.expiresAt<=now()){await fs.unlink(file);continue;}}catch(error){if(error.code==='ENOENT')continue;}count++;}
    if(count>=maxRecords && !await this.isRevoked(item))throw Error('Almacén de sesiones ocupado.');
    const target=path.join(root,item.digest+'.json'),temporary=target+'.'+crypto.randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,JSON.stringify({expiresAt:item.expiresAt}),{flag:'wx',mode:0o600});try{await fs.rename(temporary,target);}catch(error){if(!['EEXIST','EPERM','EACCES'].includes(error.code) || !await this.isRevoked(item))throw error;}}finally{await fs.unlink(temporary).catch(()=>{});}return;
   }
   const timestamp=new Date(now()).toISOString(),expiry=new Date(item.expiresAt).toISOString();
   await database(async client=>{const cleaned=await client.from('app_session_revocations').delete().lte('expires_at',timestamp);if(cleaned.error)throw cleaned.error;const {error}=await client.from('app_session_revocations').upsert({digest:item.digest,expires_at:expiry},{onConflict:'digest',ignoreDuplicates:true});if(error)throw error;},async db=>{await db.query('DELETE FROM public.app_session_revocations WHERE expires_at<=$1',[timestamp]);await db.query('INSERT INTO public.app_session_revocations(digest,expires_at) VALUES($1,$2) ON CONFLICT(digest) DO NOTHING',[item.digest,expiry]);});
  },
 };
}
module.exports={sessionIdentity,createSessionRevocations,sessionRevocations:createSessionRevocations()};
