'use strict';
// Local configuration only. Never prints or backs up the signing key.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),dotenv=require('dotenv');
async function main(){
 const file=path.resolve(__dirname,'../backend/.env');if((await fs.lstat(file)).isSymbolicLink())throw Error('El archivo de entorno no debe ser un enlace.');
 const original=await fs.readFile(file),text=original.toString('utf8'),value=dotenv.parse(text).JWT_SECRET;
 if(value && Buffer.byteLength(value)>=32){console.log('JWT_SECRET local ya cumple el mínimo; no se modificó.');return;}
 const generated=crypto.randomBytes(64).toString('base64url'),line='JWT_SECRET='+generated;
 const updated=/^(?:export\s+)?JWT_SECRET\s*=/m.test(text)?text.replace(/^(?:export\s+)?JWT_SECRET\s*=.*$/m,line):text.replace(/\s*$/,'')+'\n'+line+'\n';
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(temporary,updated,{flag:'wx',mode:0o600});if(!(await fs.readFile(file)).equals(original))throw Error('El archivo cambió durante la operación. Reintenta.');await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
 console.log('JWT_SECRET local rotado con 64 bytes aleatorios; valor no mostrado.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
