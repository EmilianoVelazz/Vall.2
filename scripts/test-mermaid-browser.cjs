'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const {createFixtureServer}=require('./lib/mermaid-security-fixture.cjs');
async function main(){
 const server=createFixtureServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.getByText('5/5 comprobaciones correctas',{exact:true}).waitFor();assert.deepEqual(errors,[]);const folder=path.resolve(__dirname,'../output/seguridad-corregida-20261110');await fs.mkdir(folder,{recursive:true});await page.screenshot({path:path.join(folder,'mermaid-seguridad.png'),fullPage:true});await fs.writeFile(path.join(folder,'mermaid-browser.json'),JSON.stringify({diagrams:5,errors,strictMode:true,package:require('mermaid/package.json').version},null,2));console.log('Mermaid browser: five diagrams, formulas, hostile HTML and executable links passed.');}
 finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
