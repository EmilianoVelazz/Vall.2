'use strict';
const { normalizeForIntent } = require('./conversation-context');
// Índice conceptual local: agrupa sinónimos del negocio en español/inglés.
// No usa embeddings externos ni envía consultas/documentos a otra API.
const CONCEPTS = [
    ['pork','cerdo','cerdos','porcino','porcina','porcinos','porcicultura','swine','pig','pigs','hog','hogs'],
    ['beef','res','bovino','bovina','bovinos','vacuno','cattle','bovine'],
    ['poultry','pollo','pollos','avicola','aves','chicken','broiler'],
    ['eggs','egg','huevo','huevos','ovoproductos','ponedoras','laying'],
    ['trade','comercio','importacion','importaciones','importar','exportacion','exportaciones','exportar','imports','exports'],
    ['tariff','tariffs','arancel','aranceles','impuesto','impuestos','gravamen','aduana','aduanas','customs','duty','duties'],
    ['health','sanidad','sanitario','sanitaria','salud','enfermedad','disease','outbreak','brote','brotes','epizootia'],
    ['avian influenza','influenza aviar','gripe aviar','h5n1','h5n8'],
    ['african swine fever','peste porcina africana','ppa','asf'],
    ['logistics','logistica','flete','freight','transporte','transport','shipping','shipment','embarque'],
    ['cold chain','cadena de frio','refrigeracion','refrigerado','congelado','frozen','chilled','cold storage'],
    ['profit','margin','margen','margenes','rentabilidad','ganancia','utilidad'],
    ['price','prices','precio','precios','cotizacion','cotizaciones','quotation'],
    ['supply','oferta','abasto','abastecimiento','produccion','production'],
    ['demand','demanda','consumo','consumption','consumidor','consumers'],
    ['agreement','treaty','tratado','tratados','acuerdo','acuerdos','tmec','usmca'],
];
function concepts(value) {
    const text=' '+normalizeForIntent(value).replace(/[^\p{L}\p{N}\s]/gu,' ')+' ';
    const result = new Set(CONCEPTS.map((aliases,index)=>aliases.some(alias=>text.includes(' '+alias+' ')) ? index : -1).filter(index=>index >= 0));
    if (result.has(8)) { result.add(0); result.add(6); }
    if (result.has(7)) { result.add(2); result.add(6); }
    return result;
}
function conceptualSimilarity(query,document) {
    const a=concepts(query),b=concepts(document);
    const overlap=[...a].filter(concept=>b.has(concept)).length;
    return a.size && b.size ? overlap/Math.sqrt(a.size*b.size) : 0;
}
class SemanticSearch {
    available() { return true; }
    async rank(message,rows) {
        return rows.map(row=>({...row,semantic_score:conceptualSimilarity(message,`${row.title || ''} ${row.heading_path || ''} ${row.tags || ''} ${row.content || ''}`),retrieval_mode:'hybrid_conceptual'}));
    }
}
module.exports = { SemanticSearch, conceptualSimilarity, concepts };
