import {useEffect,useRef,useState} from 'react';
import {verifyReportOwner} from './reportRequest.js';
import {requestReportFile} from './reportPdf.js';
import {reportDownloadName} from '../../../shared/report-download-name.mjs';
import {saveReportBlob} from './reportLibrary.js';
import {reportCsv} from './reportCsv.js';
export function useReportExport(report,accountEmail,language,title,options={}){
 const request=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{request.current?.abort();request.current=null;setBusy(false);setError('');return ()=>{request.current?.abort();request.current=null;};},[report,accountEmail,language]);
 const download=async format=>{
  if(!report || !accountEmail || request.current || !['pdf','csv','xlsx'].includes(format))return;
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{
   await verifyReportOwner(accountEmail,controller.signal);
   const blob=format==='csv' && options.csvData ? new Blob([reportCsv(options.csvData.report,{t:options.csvData.t,extraTables:options.csvData.tables})],{type:'text/csv;charset=utf-8'}) : await requestReportFile(report,report.title,report.summary || '',format,fetch,{signal:controller.signal,language,expectedOwner:accountEmail});
   await verifyReportOwner(accountEmail,controller.signal);
   if(!controller.signal.aborted && request.current===controller)saveReportBlob(blob,reportDownloadName(report,format,{language,title}));
  }catch(issue){if(!controller.signal.aborted && request.current===controller)setError(issue.message);}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 };
 return {download,busy,error};
}
