import {useMemo,useState} from 'react';
import {reportTableView} from '../lib/reportTableView.js';
export default function ReportAnnexTable({table,query,t}){
 const [column,setColumn]=useState(-1),[direction,setDirection]=useState('asc');
 const rows=useMemo(()=>reportTableView(table,{query,column,direction,locale:t.locale}),[table,query,column,direction,t.locale]);
 if(!rows.length)return null;
 return <article className="reports-annex-table"><h4>{table.title}</h4>{table.note && <p>{table.note}</p>}
  <div className="reports-table-controls"><label>{t('Ordenar filas')}<select aria-label={t('Ordenar filas')+' · '+table.title} value={column} onChange={event=>setColumn(Number(event.target.value))}><option value={-1}>{t('Orden original')}</option>{table.columns.map((label,index)=><option value={index} key={index}>{label}</option>)}</select></label><label>{t('Dirección')}<select aria-label={t('Dirección')+' · '+table.title} value={direction} disabled={column<0} onChange={event=>setDirection(event.target.value)}><option value="asc">{t('Ascendente')}</option><option value="desc">{t('Descendente')}</option></select></label><button type="button" disabled={column<0} onClick={()=>{setColumn(-1);setDirection('asc');}}>{t('Restaurar orden original')}</button><span>{rows.length} / {table.rows.length} {t('filas')}</span></div>
  <div role="region" tabIndex={0} aria-label={table.title}><table><thead><tr>{table.columns.map((label,index)=><th key={index} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,col)=>col===0 ? <th key={col} scope="row">{cell}</th> : <td key={col}>{cell}</td>)}</tr>)}</tbody></table></div>
 </article>;
}
