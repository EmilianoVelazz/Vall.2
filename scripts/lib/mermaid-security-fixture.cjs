'use strict';
// Servidor de prueba local: no carga perfiles, claves ni proveedores.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const bundle = path.resolve(__dirname, '../../assets/js/vendor/mermaid.min.js');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Verificación de Mermaid</title>
<style>body{font:16px system-ui;margin:32px;color:#23415a}article{padding:16px;border:1px solid #cad6df;margin-bottom:16px}svg{max-height:180px}</style>
<h1>Verificación de gráficas y seguridad</h1><p id="status">Ejecutando comprobaciones…</p><main></main>
<script src="/mermaid.min.js"></script><script>
(async()=>{
 const tests=[
  ['Flujo','flowchart LR\\n A[Datos] --> B[Informe]'],
  ['Secuencia','sequenceDiagram\\n Usuario->>Servidor: Consultar informe\\n Servidor-->>Usuario: Resultado'],
  ['Etiqueta HTML','flowchart LR\\n A["<img src=x onerror=window.fixtureExecuted=true>"] --> B[Seguro]'],
  ['Enlace ejecutable','flowchart LR\\n A[Seguro]\\n click A "javascript:window.fixtureExecuted=true"'],
  ['Fórmula','flowchart LR\\n A["$$x^2 + y^2$$"] --> B[Resultado]']
 ];
 window.fixtureExecuted=false; mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral'});
 let passed=0;
 for(let i=0;i<tests.length;i++){
  const [name,source]=tests[i],box=document.createElement('article');document.querySelector('main').append(box);
  const title=document.createElement('h2');title.textContent=name;box.append(title);
  try{const {svg}=await mermaid.render('fixture'+i,source);const graphic=document.createElement('div');graphic.innerHTML=svg;box.append(graphic);
   const unsafe=[...graphic.querySelectorAll('*')].some(el=>el.tagName.toLowerCase()==='script'||[...el.attributes].some(a=>/^on/i.test(a.name)||(['href','xlink:href'].includes(a.name)&&/^javascript:/i.test(a.value))));
   if(unsafe||window.fixtureExecuted)throw Error('Contenido ejecutable detectado');
   passed++;const p=document.createElement('p');p.textContent='Correcto: SVG generado sin contenido ejecutable.';box.append(p);
  }catch(error){const p=document.createElement('p');p.textContent='Fallo: '+error.message;box.append(p);}
 }
 document.querySelector('#status').textContent=passed+'/'+tests.length+' comprobaciones correctas';
})().catch(error=>document.querySelector('#status').textContent='Fallo: '+error.message);
</script></html>`;
http.createServer((req,res)=>{
 if(req.url==='/mermaid.min.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(bundle).pipe(res);}
 else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}
 else {res.writeHead(404);res.end();}
}).listen(5280,'127.0.0.1',()=>console.log('Prueba local: http://127.0.0.1:5280'));
