import assert from 'node:assert/strict';

const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
globalThis.document={documentElement:{lang:'es'},querySelector:()=>null,cookie:''};
globalThis.location={hostname:'localhost'};
globalThis.window={setTimeout:()=>0};
globalThis.fetch=async()=>new Response('{}');

// Vite can retain a mounted consumer while loading a new module revision.
// Both revisions must read the same preference, including blocked storage.
const header=await import('../frontend/src/lib/idioma.js?consumer=header');
const reports=await import('../frontend/src/lib/idioma.js?consumer=reports');
reports.fijarIdioma('es',{recargar:false});
header.fijarIdioma('en',{recargar:false});
assert.equal(header.leerIdioma(),'en');
assert.equal(reports.leerIdioma(),'en','La cabecera y los informes comparten el idioma entre revisiones del módulo');
document.documentElement.lang='es';
assert.equal(reports.leerIdioma(),'en','Google no cambia la elección de la app');
localStorage.setItem=()=>{throw Error('Storage blocked');};
reports.fijarIdioma('fr',{recargar:false});
assert.equal(header.leerIdioma(),'fr','La preferencia en memoria también es compartida');
console.log('Language singleton: OK · revisiones del módulo, reinicio del DOM y almacenamiento bloqueado');
