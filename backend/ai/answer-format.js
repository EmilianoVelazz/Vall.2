'use strict';
const {normalizeForIntent}=require('./conversation-context');
function answerWordCount(text){return String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word)).length;}
// One source of truth: prompt, audience guidance and local calculations agree.
function responseLength(message){
 const text=normalizeForIntent(message);
 const words=text.match(/\b(menos de|maximo|hasta|no mas de|en)\s+(\d{1,4})\s+palabras\b/);
 const sentences=text.match(/\b(?:en|solo)\s+(una|1|dos|2|tres|3)\s+(?:frases?|oraciones?)\b|\buna sola (?:frase|oracion)\b/);
 const maxWords=words?Math.max(1,Number(words[2])-(words[1]==='menos de'?1:0)):null;
 const maxSentences=sentences?({una:1,dos:2,tres:3}[sentences[1]] || Number(sentences[1]) || 1):null;
 const brief=Boolean(maxSentences || maxWords && maxWords<=180 || /\b(?:breve|rapido|solo dime|resumen corto)\b/.test(text));
 const guidance=maxWords?`Entrega toda la respuesta en un máximo de ${maxWords} palabras; este límite prevalece sobre la extensión habitual. Responde todas las partes sin introducciones ni relleno.`
  :maxSentences?`Responde en ${maxSentences===1?'una sola oración':`un máximo de ${maxSentences} oraciones`}, sin encabezados ni tablas. Conserva el resultado y su límite esencial; no amplíes a un informe.`
   :brief?'Responde brevemente, sin extensión mínima y con un máximo de 120 palabras de análisis. Incluye únicamente la conclusión, su fundamento decisivo y el límite material.':'';
 return {maxWords,maxSentences,brief,explicit:Boolean(words || sentences),guidance};
}
module.exports={responseLength,answerWordCount};
