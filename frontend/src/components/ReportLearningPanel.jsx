import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {reportJsonRequest} from '../lib/reportRequest.js';

const Icon=({name})=><i className={`fas ${name}`} aria-hidden="true" />;
export default function ReportLearningPanel({account,disabled}) {
 const [context,setContext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef(null);
 const currentAccount=useRef(account);currentAccount.current=account;
 const sync=useCallback(async (body,previousContext)=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;const owner=account;
  setBusy(true);setError('');setNotice('');
  try {
   const payload=await reportJsonRequest('/api/user-reports/learning',{credentials:'include',cache:'no-store',signal:controller.signal,
    ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})},{timeoutMs:12000,errorMessage:'No pudimos recuperar tus intereses. Tu informe sigue disponible.'});
   if(!payload.data || Array.isArray(payload.data) || typeof payload.data.historyEnabled!=='boolean') throw Error('No pudimos recuperar tus intereses. Puedes reintentar.');
   if(!controller.signal.aborted&&currentAccount.current===owner) {setContext(payload.data);if(body) setNotice(body.reset ? 'Intereses reiniciados. Sólo se tomarán en cuenta las consultas nuevas; tu historial se conserva.':typeof body.providerEnabled==='boolean' ? 'Preferencia guardada. Genera una nueva edición para aplicar este cambio.':'Preferencia guardada.');}
  } catch(cause) {if(!controller.signal.aborted&&currentAccount.current===owner) {if(previousContext) setContext(previousContext);setError(cause.message);}}
  finally {if(request.current===controller) {request.current=null;setBusy(false);}}
 },[account]);
 useEffect(()=>{
  setContext(null);setError('');setNotice('');
  if(account) void sync();else setBusy(false);
  return ()=>{request.current?.abort();request.current=null;};
 },[account,sync]);
 const interests=context?.interests || [];
 const groups=[['product','Productos','fa-box'],['places','Mercados y plazas','fa-location-dot'],['topic','Temas de negocio','fa-chart-line']]
  .map(([key,label,icon])=>({key,label,icon,items:interests.filter(item=>key==='places' ? ['market','region'].includes(item.kind):item.kind===key)})).filter(group=>group.items.length);
 const available=context && context.status!=='unavailable';
 const status=busy ? 'Actualizando':context?.status==='unavailable' ? 'No disponible':context?.providerEnabled ? 'Activo en IA':'Por activar';
 return <section className="erh-learning" aria-label="Intereses de ORION">
  <header><div><span className="erh-learning-emblem"><Icon name="fa-compass" /></span><div><small>PERSONALIZACIÓN</small><h4>Tu perfil de intereses</h4></div></div><span className={context?.providerEnabled ? 'is-active':''}>{status}</span></header>
  <p>Orienta la lectura con tu negocio y los temas que consultas en ORION.</p>
  {available && <>
   <label className="erh-learning-toggle"><input type="checkbox" checked={context.providerEnabled===true} disabled={busy||disabled} onChange={event=>{const providerEnabled=event.target.checked;setContext({...context,providerEnabled});void sync({providerEnabled},context);}} />Personalizar mis informes con este perfil</label>
   <p className="erh-learning-consent">Al activar, Google Gemini recibe estos temas y tu actividad y moneda declaradas para orientar nuevas ediciones y entregas con IA.</p>
   {interests.length>0 && <p className="erh-learning-preview">{interests.slice(0,3).map(item=>item.label).join(' · ')}{interests.length>3 && <span>+{interests.length-3} temas</span>}</p>}
   <details className="erh-learning-details" key={account}>
    <summary><span><Icon name="fa-sliders" /> Revisar intereses y ajustes</span><small>{interests.length} {interests.length===1 ? 'tema':'temas'}</small><Icon name="fa-chevron-down" /></summary>
    <div className="erh-learning-detail-body">
     <label className="erh-learning-toggle"><input type="checkbox" checked={context.historyEnabled} disabled={busy||disabled} onChange={event=>{const enabled=event.target.checked;setContext({...context,historyEnabled:enabled});void sync({enabled},context);}} />Detectar intereses de mis consultas</label>
     {groups.length ? <div role="group" aria-label="Temas detectados">{groups.map(group=><section className="erh-learning-group" key={group.key} aria-label={group.label}>
      <h5><Icon name={group.icon} />{group.label}<span>{group.items.length}</span></h5>
      <ul>{group.items.map(item=><li className={item.source==='profile' ? 'is-declared':'is-learned'} key={item.kind+':'+item.id}><span>{item.label}</span><small>{item.source==='profile' ? 'Tu perfil':'Consultas recurrentes'}</small></li>)}</ul>
     </section>)}</div> : <p className="erh-learning-empty">{context.historyEnabled ? 'Aún no hay temas recurrentes. Dos consultas diferentes sobre un tema permiten identificarlo.':'La detección de intereses está desactivada.'}</p>}
     <div className="erh-learning-actions"><button type="button" disabled={busy||disabled} onClick={()=>void sync()}><Icon name="fa-arrows-rotate" /> Actualizar intereses</button><button className="erh-learning-reset" type="button" disabled={busy||disabled} onClick={()=>void sync({reset:true})}>Reiniciar intereses</button></div>
     <p className="erh-learning-note">Reiniciar conserva las conversaciones y toma en cuenta sólo las consultas nuevas. Tu encargo y los controles del informe tienen prioridad.</p>
     <Link to="/configuracion">Revisar mi perfil de negocio <Icon name="fa-arrow-right" /></Link>
    </div>
   </details>
  </>}
  {busy && <p role="status"><Icon name="fa-spinner fa-spin" /> Actualizando tu perfil…</p>}
  {context?.status==='partial' && <p role="status">Se muestra tu perfil declarado. El historial no está disponible en este momento.</p>}
  {context?.status==='unavailable' && <p role="status">No pudimos cargar tus intereses. <button type="button" disabled={busy||disabled} onClick={()=>void sync()}>Reintentar</button></p>}
  {error && <p role="alert" className="erh-learning-error"><Icon name="fa-circle-exclamation" /> {error} <button type="button" disabled={busy||disabled} onClick={()=>void sync()}>Reintentar</button></p>}
  {notice && <p role="status" className="erh-learning-notice">{notice}</p>}
  <p className="erh-learning-privacy"><Icon name="fa-shield-halved" /> Los mensajes completos permanecen en tu historial.</p>
 </section>;
}
