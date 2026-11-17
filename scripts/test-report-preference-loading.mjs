import assert from 'node:assert/strict';
import {createReportPreferenceStore} from '../frontend/src/lib/reportPreferenceStore.js';
const owner='fast-preferences@example.invalid',entries=new Map(),key=`vallnews:report-edition:v1:${encodeURIComponent(owner)}`;
const storage={getItem:name=>entries.get(name),setItem:(name,value)=>entries.set(name,value)};
entries.set(key,JSON.stringify({preferences:{customTitle:'Edición guardada'},pending:false}));
let release;const calls=[];
const store=createReportPreferenceStore({verifiedEmail:owner,storage,retryDelays:[],request:(path,options)=>{calls.push({path,headers:options.headers});return new Promise(resolve=>{release=resolve;});}});
const loading=store.load();assert.equal(store.getState().ready,true);assert.equal(store.getState().email,owner);assert.equal(store.getState().preferences.customTitle,'Edición guardada');assert.deepEqual(calls.map(item=>item.path),['/api/profile']);assert.equal(calls[0].headers['X-VALL-Account'],owner);
release({ok:true,status:200,json:async()=>({success:true,profile:{email:owner,preferences:{executiveReports:{customTitle:'Edición sincronizada'}}}})});await loading;assert.equal(store.getState().preferences.customTitle,'Edición sincronizada');store.dispose();
const another=createReportPreferenceStore({verifiedEmail:'another@example.invalid',storage,retryDelays:[],request:async()=>({ok:false,status:503,json:async()=>({success:false})})});await another.load();assert.notEqual(another.getState().preferences.customTitle,'Edición sincronizada');assert.equal(another.getState().email,'another@example.invalid');another.dispose();
for(const status of [401,409]){const invalid=createReportPreferenceStore({verifiedEmail:owner,storage,retryDelays:[],request:async()=>({ok:false,status,json:async()=>({success:false})})});await invalid.load();assert.equal(invalid.getState().ready,false);assert.equal(invalid.getState().status,'session-error');invalid.dispose();}
const slow=createReportPreferenceStore({verifiedEmail:'timeout@example.invalid',readTimeoutMs:25,retryDelays:[],request:(path,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
const keepAlive=setTimeout(()=>{},500);const start=Date.now();await slow.load();clearTimeout(keepAlive);assert(Date.now()-start<500);assert.equal(slow.getState().ready,true);assert.equal(slow.getState().email,'timeout@example.invalid');assert.equal(slow.getState().status,'load-error');slow.dispose();
console.log('Preferences: verified-account cache hydrates immediately, remote settings synchronize, no duplicate identity request, bounded outage wait, account isolation and 401/409 rejection passed.');
