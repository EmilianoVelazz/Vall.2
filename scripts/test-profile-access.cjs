'use strict';
// Cuatro cuentas ficticias: no usa datos, credenciales ni conexiones reales.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const express=require('express');
const cookieParser=require('cookie-parser');
process.env.JWT_SECRET='test-profile-access-only';process.env.VERCEL='1';
process.env.VALL_AUTH_EMAIL='admin@example.invalid';process.env.VALL_AUTH_PASSWORD=bcrypt.hashSync('Admin-fixture-92',4);
const store=require('../backend/services/user-profile-store');
const users=Array.from({length:4},(_,i)=>({id:crypto.randomUUID(),email:`profile${i}@example.invalid`,role:'user',active:true,
    passwordHash:bcrypt.hashSync(`Fixture-${i}-2026`,4),credentialVersion:0,displayName:`Perfil ${i}`,preferences:{own:i}}));
const admin={id:crypto.randomUUID(),email:process.env.VALL_AUTH_EMAIL,role:'admin',active:true,displayName:'Admin',preferences:{}};
const originalHashes=users.map(u=>u.passwordHash);
let updates=0,down=false;
store.findByEmail=async email=>[admin,...users].find(u=>u.email===email)||null;
store.findById=async id=>{if(down)throw Error('Simulated outage');return [admin,...users].find(u=>u.id===id)||null;};
store.upsertAdmin=async()=>admin;store.markLogin=async()=>{};
store.listProfiles=async()=>[admin,...users].map(u=>({id:u.id,email:u.email,role:u.role,active:u.active}));
store.updatePassword=async(id,hash)=>{const u=users.find(u=>u.id===id);assert(u);assert(!hash.includes('Replacement'));u.passwordHash=hash;updates++;return ++u.credentialVersion;};
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',require('../backend/routes/auth').router);
const server=app.listen(0,'127.0.0.1');
(async()=>{
    if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const call=(path,body,cookie)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const login=async(email,password)=>{const r=await call('/login',{email,password});assert.equal(r.status,200);const b=await r.json();assert.equal(b.success,true);assert(!b.token);assert(!JSON.stringify(b).includes('password'));assert.match(r.headers.get('set-cookie'),/HttpOnly/);return r.headers.get('set-cookie').split(';')[0];};
    const cookies=[];
    for(let i=0;i<4;i++){
        const cookie=await login(` ${users[i].email.toUpperCase()} `,`Fixture-${i}-2026`);cookies.push(cookie);
        assert.equal((await call('/verify-token',null,cookie)).status,200);
        const response=await call('/profile',null,cookie);assert.equal(response.status,200);const b=await response.json();assert.equal(b.profile.email,users[i].email);assert.equal(b.profile.preferences.own,i);
    }
    const adminCookie=await login(admin.email,'Admin-fixture-92');
    assert.equal((await call('/admin/profiles')).status,401);
    assert.equal((await call('/admin/profiles',null,cookies[0])).status,403);
    const listing=await call('/admin/profiles',null,adminCookie);assert.equal(listing.status,200);const body=await listing.json();assert.equal(body.profiles.length,5);assert(!JSON.stringify(body).includes('passwordHash'));
    const reset=`/admin/profiles/${users[0].id}/password`;
    assert.equal((await call(reset,{newPassword:'Replacement-2026'},cookies[1])).status,403);assert.equal(updates,0);
    assert.equal((await call(reset,{newPassword:'short'},adminCookie)).status,400);
    assert.equal((await call(reset,{newPassword:'界'.repeat(30)},adminCookie)).status,400);
    assert.equal((await call(`/admin/profiles/${admin.id}/password`,{newPassword:'Replacement-2026'},adminCookie)).status,409);
    assert.equal((await call(reset,{newPassword:'Replacement-2026'},adminCookie)).status,200);assert.equal(updates,1);
    assert.equal((await call('/verify-token',null,cookies[0])).status,401,'La sesión anterior de la cuenta restablecida se rechaza');
    assert.equal((await call('/login',{email:users[0].email,password:'Fixture-0-2026'})).status,401);
    const fresh=await login(users[0].email,'Replacement-2026');assert.equal((await call('/verify-token',null,fresh)).status,200);
    for(let i=1;i<4;i++){assert.equal(users[i].passwordHash,originalHashes[i]);assert.equal((await call('/verify-token',null,cookies[i])).status,200);}
    down=true;assert.equal((await call('/verify-token',null,fresh)).status,503);down=false;
    const changed=await call('/change-password',{currentPassword:'Replacement-2026',newPassword:'Self-change-2026'},fresh);assert.equal(changed.status,200);
    const renewed=changed.headers.get('set-cookie').split(';')[0];assert.equal((await call('/verify-token',null,renewed)).status,200);assert.equal((await call('/verify-token',null,fresh)).status,401);
    assert.equal((await call('/login',{email:users[0].email,password:'incorrect'})).status,401);
    console.log('Perfiles: 4 accesos, aislamiento, gestión exclusiva de administrador, restablecimiento, revocación y cambio propio OK. Sin tocar cuentas reales.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.closeAllConnections();server.close();});
