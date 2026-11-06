'use strict';

const { normalizeForIntent } = require('../ai/conversation-context');
const STATES = [
    ['AGS','Aguascalientes','ags'], ['BCN','Baja California','bc|bcn'], ['BCS','Baja California Sur','bcs'],
    ['CAM','Campeche','camp|cam'], ['CHP','Chiapas','chis|chp'], ['CHH','Chihuahua','chih|chh'],
    ['CMX','Ciudad de México','df|cdmx|cmx'], ['COA','Coahuila','coah|coa'], ['COL','Colima','col'],
    ['DUR','Durango','dur|dgo'], ['GUA','Guanajuato','gto|gua'], ['GRO','Guerrero','gro'], ['HID','Hidalgo','hgo|hid'],
    ['JAL','Jalisco','jal'], ['MEX','Estado de México','mex'], ['MIC','Michoacán','mich|mic'], ['MOR','Morelos','mor'],
    ['NAY','Nayarit','nay'], ['NLE','Nuevo León','nl|nle'], ['OAX','Oaxaca','oax'], ['PUE','Puebla','pue'],
    ['QUE','Querétaro','qro|que'], ['ROO','Quintana Roo','qroo|roo|qr'], ['SLP','San Luis Potosí','slp'],
    ['SIN','Sinaloa','sin'], ['SON','Sonora','son'], ['TAB','Tabasco','tab'], ['TAM','Tamaulipas','tamps|tam'],
    ['TLA','Tlaxcala','tlax|tla'], ['VER','Veracruz','ver'], ['YUC','Yucatán','yuc'], ['ZAC','Zacatecas','zac'],
].map(([code,name,prefix])=>({code,name,prefix,normalized:normalizeForIntent(name)}));
const CITY_STATES = [
    ['monterrey','NLE'],['guadalajara','JAL'],['cdmx','CMX'],['cholula','PUE'],['teziutlan','PUE'],
    ['toluca','MEX'],['tijuana','BCN'],['mexicali','BCN'],['ensenada','BCN'],['cancun','ROO'],['chetumal','ROO'],
    ['hermosillo','SON'],['ciudad obregon','SON'],['culiacan','SIN'],['mazatlan','SIN'],['los mochis','SIN'],
    ['saltillo','COA'],['torreon','COA'],['monclova','COA'],['ciudad juarez','CHH'],['delicias','CHH'],
    ['villahermosa','TAB'],['tuxtla gutierrez','CHP'],['tapachula','CHP'],['pachuca','HID'],['tulancingo','HID'],
    ['morelia','MIC'],['uruapan','MIC'],['zamora','MIC'],['celaya','GUA'],['irapuato','GUA'],['salamanca','GUA'],
    ['cuernavaca','MOR'],['cuautla','MOR'],['tepic','NAY'],['puerto vallarta','JAL'],['zapopan','JAL'],
    ['reynosa','TAM'],['matamoros','TAM'],['nuevo laredo','TAM'],['ciudad victoria','TAM'],
    ['xalapa','VER'],['coatzacoalcos','VER'],['orizaba','VER'],['boca del rio','VER'],
    ['acapulco','GRO'],['chilpancingo','GRO'],['zihuatanejo','GRO'],['playa del carmen','ROO'],
    ['huamantla','TLA'],['apizaco','TLA'],['fresnillo','ZAC'],['san juan del rio','QUE'],
];
const AMBIGUOUS_CITIES = [
    { name:'Mérida', key:'merida', stateCode:'YUC', alternatives:['Yucatán, México','España','Venezuela'] },
    { name:'León', key:'leon', stateCode:'GUA', alternatives:['Guanajuato, México','España','Nicaragua'] },
    { name:'Córdoba', key:'cordoba', stateCode:'VER', alternatives:['Veracruz, México','Argentina','España','Colombia'] },
];
function mentionsCity(text,city) { return new RegExp((city.key === 'leon' ? '(?<!nuevo )' : '')+'\\b'+city.key+'\\b').test(text); }
function foreignCountry(text) { return /\b(?:espana|argentina|colombia|venezuela|nicaragua|peru|brasil|estados unidos)\b/.test(text) && !/\bmexico\b/.test(text); }
function ambiguousMexicoCities(message) {
    const text = normalizeForIntent(message);
    return AMBIGUOUS_CITIES.filter(city=>mentionsCity(text,city)
        && !/\bmexico\b/.test(text) && !STATES.some(state=>new RegExp('\\b'+state.normalized+'\\b').test(text))
        && !foreignCountry(text));
}
function requestedMexicoCities(message, mexicoContext = false) {
    const text = normalizeForIntent(message);
    if (foreignCountry(text)) return [];
    const definite = CITY_STATES.filter(([city])=>new RegExp('\\b'+city+'\\b').test(text))
        .map(([city,stateCode])=>({name:city === 'cdmx' ? 'CDMX' : city[0].toUpperCase()+city.slice(1),stateCode}));
    for (const city of AMBIGUOUS_CITIES) if (mentionsCity(text,city)
        && (mexicoContext || /\bmexico\b/.test(text) || STATES.some(state=>new RegExp('\\b'+state.normalized+'\\b').test(text)))) definite.push({name:city.name,stateCode:city.stateCode});
    return definite;
}
function requestedMexicoStates(message, mexicoContext = false) {
    const text = normalizeForIntent(message);
    if (foreignCountry(text)) return [];
    if (/\b(?:todos (?:los )?estados|cada estado|por estado|32 (?:estados|entidades))\b/.test(text)) return STATES.map(state=>state.code);
    const matches = STATES.filter(state => new RegExp('\\b'+state.normalized+'\\b').test(text)
        && !(state.code === 'BCN' && /\bbaja california sur\b/.test(text))).map(state=>state.code);
    for (const city of requestedMexicoCities(message, mexicoContext)) matches.push(city.stateCode);
    return [...new Set(matches)];
}
function stateFromMarket(market) {
    const text = normalizeForIntent(market);
    const prefix = text.split(':')[0].replace(/\./g,'').trim();
    const abbreviation = text.match(/^([a-z.]{2,8})(?=\s|:)/)?.[1].replace(/\./g,'');
    return [...STATES].sort((a,b)=>b.normalized.length-a.normalized.length).find(state=>state.normalized===prefix
        || text.startsWith(state.normalized+' ') || new RegExp('^(?:'+state.prefix+')$').test(prefix)
        || abbreviation && new RegExp('^(?:'+state.prefix+')$').test(abbreviation)) || null;
}
function stateName(code) { return STATES.find(state=>state.code===code)?.name || code; }
module.exports = { STATES, CITY_STATES, ambiguousMexicoCities, requestedMexicoStates, requestedMexicoCities, stateFromMarket, stateName };
