'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
process.env.VALL_AUTH_EMAIL='admin@seed.example.invalid';
process.env.APP_PROFILE_SEED_JSON=JSON.stringify(Array.from({length:4},(_,i)=>({email:`account${i}@seed.example.invalid`,password:'must-not-replace-existing'})));
const accounts=new Map([[process.env.VALL_AUTH_EMAIL,'admin'],...JSON.parse(process.env.APP_PROFILE_SEED_JSON).map((u,i)=>[u.email,`account-${i}`])]);
let ended=false,mutations=0;
const db={query:async(sql,values)=>{
    if(/^(INSERT|UPDATE|DELETE)/i.test(sql)){mutations++;throw Error('No debe reescribir cuentas existentes');}
    if(sql.startsWith('SELECT id'))return {rows:accounts.has(values[0])?[{id:accounts.get(values[0])}]:[]};
    if(sql.startsWith('SELECT role'))return {rows:[{role:'admin',total:1},{role:'user',total:4}]};
    return {rows:[]};
},end:async()=>{ended=true;}};
const original=Module._load;
Module._load=function(name,parent,main){
    if(name==='../backend/lib/database-connection'&&parent.filename===require.resolve('./seed-app-profiles.cjs'))return {connectDatabase:async()=>db};
    return original.call(this,name,parent,main);
};
try{require('./seed-app-profiles.cjs');}finally{Module._load=original;}
(async()=>{
    const deadline=Date.now()+3000;
    while(!ended){if(Date.now()>deadline)throw Error('La semilla no terminó');await new Promise(resolve=>setImmediate(resolve));}
    assert.equal(mutations,0);assert.equal(accounts.size,5);assert(!process.exitCode);
    console.log('Semilla de perfiles: conserva 4 cuentas y administrador sin reescribir contraseñas ni roles. OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
