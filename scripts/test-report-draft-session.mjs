import assert from 'node:assert/strict';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {writeReportDraft,readReportDraft,discardReportDraft} from '../frontend/src/lib/reportDraftSession.js';

const owner='ana@example.invalid',entries=new Map(),storage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
const draft=createReportDraft(null,null,{}),record={...draft,report:draft.report,material:draft.report,instructions:'Pedido que no quiero perder',tone:'professional',overrides:[],saveIntent:null};
assert(writeReportDraft(storage,owner,record));assert.equal(readReportDraft(storage,owner).record.instructions,record.instructions);
assert.equal(readReportDraft(storage,'otra@example.invalid').record,null);
const rawKey=[...entries.keys()][0],original=entries.get(rawKey);
for(const report of [
 {...draft.report,summary:{text:'No es texto'}},
 {...draft.report,metrics:[{label:'Referencia',value:{}}]},
 {...draft.report,tables:[{title:'Detalle',columns:['Valor'],rows:[[{precio:40}]]}]},
 {...draft.report,visuals:[{title:'Serie',series:[{label:'Referencia',points:[null]}]}]},
 {...draft.report,aiEdition:{instructions:{pedido:'No es texto'}}},
]) {
 entries.set(rawKey,JSON.stringify({...JSON.parse(original),report}));assert.equal(readReportDraft(storage,owner).record,null,'No recuperar contenido anidado inválido');
}
for(const change of [{owner:'otra@example.invalid'},{creationId:'../archivo'},{preferences:{...draft.preferences,sections:null}},{overrides:['__proto__']},{report:{...draft.report,visuals:{}}},{report:{...draft.report,metrics:[null]}},{report:{...draft.report,watchlist:[{}]}},{saveIntent:{creationId:crypto.randomUUID(),report:draft.report}}]) {
 entries.set(rawKey,JSON.stringify({...JSON.parse(original),...change}));assert.equal(readReportDraft(storage,owner).record,null,'No recuperar un registro corrupto');assert.equal(entries.has(rawKey),false);
}
entries.set(rawKey,'{incompleto');assert.equal(readReportDraft(storage,owner).record,null);
assert.equal(readReportDraft({getItem:()=>{throw Error('Bloqueado');}},owner).status,'unavailable');
assert.equal(writeReportDraft({setItem:()=>{throw Error('Quota');}},owner,record),false);
assert.equal(writeReportDraft(storage,owner,{...record,instructions:'x'.repeat(4001)}),false);
const attempt={...record,saveIntent:{creationId:record.creationId,report:record.report}};assert(writeReportDraft(storage,owner,attempt));assert.equal(readReportDraft(storage,owner).record.saveIntent.creationId,record.creationId);
discardReportDraft(storage,owner);assert.equal(readReportDraft(storage,owner).record,null);
console.log('Report draft session: OK · recuperación, aislamiento por cuenta, corrupción, almacenamiento bloqueado, cuota, límites e intento de guardado conservado');
