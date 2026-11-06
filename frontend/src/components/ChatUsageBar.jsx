import {useCallback,useEffect,useState} from 'react';
import './ChatUsageBar.css';
export default function ChatUsageBar(){
 const [usage,setUsage]=useState(null),[error,setError]=useState('');
 const load=useCallback(async(signal)=>{try{const response=await fetch('/api/chat-usage',{credentials:'include',cache:'no-store',signal}),body=await response.json();if(!response.ok || !body.success)throw Error(body.error || 'No se pudo consultar el saldo.');if(!signal?.aborted){setUsage(body.usage);setError('');}}catch(failure){if(failure.name!=='AbortError' && !signal?.aborted)setError('No pudimos consultar tu saldo de chat. Los informes siguen disponibles.');}},[]);
 useEffect(()=>{const controller=new AbortController(),refresh=()=>void load(controller.signal);refresh();window.addEventListener('vall:chat-usage-refresh',refresh);return()=>{controller.abort();window.removeEventListener('vall:chat-usage-refresh',refresh);};},[load]);
 if(error)return <aside className="vai-chat-usage" role="status"><p>{error} <button type="button" onClick={()=>void load()}>Reintentar</button></p></aside>;
 if(!usage)return null;
 if(usage.exempt)return <aside className="vai-chat-usage"><p>Administrador · chat sin límite de créditos.</p></aside>;
 const label={month:'Mes',week:'Semana',five_hours:'Cada 5 horas'},stamp=value=>new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'});
 return <aside className="vai-chat-usage" aria-label="Uso de créditos del chat"><div className="vai-credit-windows">{usage.windows.map(item=><section className="vai-credit-window" key={item.kind}><div><strong>{label[item.kind]}</strong><span>{Math.max(0,item.remainingMxn).toFixed(2)+' de '+item.limitMxn.toFixed(2)+' MXN disponibles'}</span></div><progress aria-label={label[item.kind]} max={item.limitMicros} value={Math.min(item.limitMicros,item.usedMicros+item.reservedMicros)} /><small>Recarga: {stamp(item.resetsAt)}</small></section>)}</div>{usage.blocked && <p className="vai-credit-alert" role="alert">No tienes créditos de chat disponibles. Se recargan el {stamp(usage.resetsAt)} (CDMX).</p>}<p>Los informes no consumen este saldo.</p></aside>;
}
