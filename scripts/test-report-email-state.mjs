import assert from 'node:assert/strict';
import {reportEmailState} from '../frontend/src/lib/reportEmailState.js';
const ready={active:{key:'equities'},accountEmail:'fixture@example.invalid',recipientValid:true,mailStatus:{configured:true}};
assert.equal(reportEmailState(ready).disabled,false);
assert.deepEqual(reportEmailState({...ready,localizationError:'Preview failed'}),{code:'preview_failed',disabled:false},'La vista previa fallida permite reintentar el envío con validación del servidor');
for(const key of ['pdfPreviewLoading','downloadingPdf','downloadingData']) assert.deepEqual(reportEmailState({...ready,[key]:true}),{code:'busy',disabled:true},'Evita una colisión con '+key);
for(const [changes,code] of [[{sendingEmail:true},'sending'],[{schedulingEmail:true},'busy'],[{accountEmail:''},'session'],[{sessionChanged:true},'session'],[{active:null},'report'],[{recipientValid:false},'recipient'],[{mailStatusLoading:true},'checking'],[{mailStatus:{configured:false}},'configuration'],[{localizingReport:true},'preparing'],[{aiEditorProps:{pending:true}},'preparing'],[{aiEditorProps:{generating:true}},'preparing']]) {
 const state=reportEmailState({...ready,localizationError:'Preview failed',...changes});assert.equal(state.code,code);assert.equal(state.disabled,true,'La recuperación no omite '+code);
}
console.log('Report email state: OK · reintento independiente, preparación, sesión, destinatario, configuración y exclusión de operaciones simultáneas');
