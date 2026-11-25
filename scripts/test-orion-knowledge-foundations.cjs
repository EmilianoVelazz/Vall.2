'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{performance}=require('node:perf_hooks');
const {indexKnowledgeDocuments,hybridSearch,buildDefaultKnowledgeCorpus}=require('../backend/ai/vector-knowledge');
const {knowledgeDecision,isPublicRule}=require('../backend/ai/knowledge-policy');
const {RagRetriever}=require('../backend/ai/rag-retriever');
const {calculateMargin}=require('../backend/ai/commercial-calculator');
const {buildSftDataset}=require('../backend/ai/sft-dataset-builder');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orion-foundations-')),file=path.join(root,'index.json'),results=[];
 const doc={doc_key:'public:corn',source_kind:'report',domain:'both',title:'Maíz México',content:'Referencia pública de maíz, unidad USD por tonelada, corte 2026-09-25.',quality_score:90,as_of_date:'2026-09-25',metadata:{visibility:'public',approved_for_retrieval:true,source:'Synthetic public fixture'}};
 const check=(id,question,condition)=>{assert(condition,id);results.push({id,question,passed:true});};
 try{
  assert(!isPublicRule({public_retrieval:true,owner_id:'another-account'}));
  assert(!isPublicRule({source:{public_retrieval:true,user_key_hash:'private-account'}}));
  assert(!isPublicRule({status:'approved'}));
  assert(isPublicRule({status:'approved',source:{public_retrieval:true}}));
  const legacy=new RagRetriever();
  legacy.getSupabase=()=>{throw Error('Legacy private rules must never be fetched');};
  legacy.safeQuery=()=>{throw Error('Legacy private rules must never be fetched');};
  assert.deepEqual(await legacy.retrieveNeuralRules('maíz México'),[]);
  const invalid=[{metadata:{}},{metadata:{...doc.metadata,visibility:'private'}},{metadata:{...doc.metadata,owner_id:'other-user'}},{metadata:{...doc.metadata,ownerEmail:'other@example.invalid'}},{owner_email:'other@example.invalid'},{userEdition:true},{as_of_date:'2099-01-01'},{as_of_date:'2026-02-30'},{as_of_date:null},{quality_score:NaN},{quality_score:59},{domain:'unknown'},{source_kind:'unknown'},{doc_key:'exemplar:bench:answer'},{metadata:{...doc.metadata,origin:'benchmark_control'}},{metadata:{...doc.metadata,origin:'positive_user_feedback'}},{doc_key:'exemplar:feedback:private'},{metadata:{...doc.metadata,user_key_hash:'secret'}},{metadata:{...doc.metadata,approved_for_retrieval:false}},{metadata:{...doc.metadata,tenant_id:'other-tenant'}}];
  for(const [i,patch]of invalid.entries()){
   const hostile={...doc,...patch,content:'SECRET_OTHER_ACCOUNT_'+i};
   check('policy-'+i,'¿Puede recuperarse evidencia privada, futura, inválida o no aprobada?',!knowledgeDecision(hostile).allowed);
   await fs.writeFile(file,JSON.stringify({version:1,docs:[doc,hostile]}));const search=await hybridSearch('Maíz México',{cacheFile:file,allowRemote:false});
   check('retrieval-isolation-'+i,'¿La búsqueda real excluye el documento bloqueado antes de construir contexto?',search.results.length===1&&!JSON.stringify(search).includes('SECRET_OTHER_ACCOUNT'));
  }
  let embedCalls=0;const provider={embed:async()=>{embedCalls++;return [1,0,0,0];}};
  await fs.writeFile(file,JSON.stringify({docs:[]}));const first=await indexKnowledgeDocuments([doc,...invalid.map(p=>({...doc,...p}))],{provider,cacheFile:file,persistSupabase:false});check('index-gate','¿Se rechaza evidencia no autorizada antes de enviar texto al proveedor?',first.indexedCount===1&&first.rejectedCount===20&&embedCalls===1);
  await indexKnowledgeDocuments([doc],{provider,cacheFile:file,persistSupabase:false});check('embedding-reuse','¿Un documento sin cambios evita volver a generar embeddings?',embedCalls===1);
  await indexKnowledgeDocuments([{...doc,metadata:{...doc.metadata,embedding_model:'new-test-model'}}],{provider,cacheFile:file,persistSupabase:false});check('embedding-model-change','¿Cambiar modelo invalida el embedding anterior?',embedCalls===2);
  const index=JSON.parse(await fs.readFile(file));check('provenance','¿La evidencia guarda una huella de contenido?',/^[a-f0-9]{64}$/.test(index.docs[0].metadata.content_sha256));
  check('no-evaluation-leak','¿El corpus base excluye preguntas de evaluación y conversaciones privadas?',buildDefaultKnowledgeCorpus().every(row=>!/^exemplar:(bench|feedback):/.test(row.doc_key)&&knowledgeDecision(row).allowed));
  const training=buildSftDataset({includeBenchmarks:true,includeFeedback:true,cacheFiles:{feedbackFile:path.join(root,'missing.json')}});check('sft-separation','¿El conjunto de entrenamiento excluye el banco de evaluación?',!training.jsonl.includes('benchmark_control')&&training.policy.heldOutBenchmarksExcluded);
  for(let i=1;i<=30;i++){
   const input={purchasedKg:1000+i*100,buyPricePerKg:10+i,sellPricePerKg:20+i,shrinkFraction:(i%10)/100,freight:i*100,currency:'MXN'};
   const r=calculateMargin(input),sold=BigInt(input.purchasedKg)*BigInt(100-i%10)/100n,cost=BigInt(input.purchasedKg)*BigInt(input.buyPricePerKg*100)+BigInt(input.freight*100),revenue=sold*BigInt(input.sellPricePerKg*100),expected=Number(revenue-cost)/100;
   check('calculation-'+i,'¿El margen calculado por ORION coincide con una referencia independiente en centavos?',r.available&&Math.abs(r.profit-expected)<1e-7);
  }
  const base={purchasedKg:1000,buyPricePerKg:10,sellPricePerKg:20,shrinkFraction:0,currency:'MXN'};
  for(const [i,patch]of [{mixedCurrencies:true},{requiresTransformation:true},{shrinkFraction:1},{shrinkFraction:-1},{currency:null},{purchasedKg:0},{buyPricePerKg:Infinity},{freight:null},{freight:-1},{incoterm:'CIF',freight:10}].entries())check('calculation-reject-'+i,'¿ORION se abstiene ante unidades, moneda o costos insuficientes?',!calculateMargin({...base,...patch}).available);
  const products=['maíz','soya','trigo','cobre'],countries=['México','Brasil','Argentina'];
  const corpus=products.flatMap((product,i)=>countries.map((country,j)=>({...doc,doc_key:`public:${i}:${j}`,title:product+' '+country,content:`Cotización pública de ${product} en ${country}; referencia exclusiva de esta plaza.`,metadata:{...doc.metadata,source:'Fixture market bulletin'}})));
  await indexKnowledgeDocuments(corpus,{cacheFile:file,persistSupabase:false,generateEmbeddings:false});
  for(let i=0;i<14;i++){const product=products[i%4],country=countries[i%3],query=product+' '+country,r=await hybridSearch(query,{cacheFile:file,allowRemote:false,limit:1});check('rank-'+i,'¿La recuperación prioriza la referencia solicitada por producto y país?',r.results[0]?.title===query);}
  assert.equal(results.length,100);
  const timings=[];for(let i=0;i<20;i++){const start=performance.now();await hybridSearch('maíz México',{cacheFile:file,allowRemote:false,limit:4});timings.push(performance.now()-start);}timings.sort((a,b)=>a-b);
  const proof={scope:'Local pipeline regression; not an LLM accuracy estimate',checks:results.length,passed:results.filter(r=>r.passed).length,publicFixtureDocuments:corpus.length,queryTimingMs:{p50:timings[9],p95:timings[18]},privateTraining:false,externalProviderCalls:0,results};const out=path.resolve('output/orion-intelligence-20261120');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'foundations.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,results:undefined}));
 }finally{const resolved=path.resolve(root);assert(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('orion-foundations-'));await fs.rm(resolved,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
