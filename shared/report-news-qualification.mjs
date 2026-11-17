const fold=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const industry=/\b(?:agro(?!informacion)\w*|agricultur\w*|ganad\w*|pecuari\w*|porcin\w*|cerd\w*|bovin\w*|vacuno\w*|avicol\w*|pork|beef|cattle|poultry|pollo|huevo|egg\w*|carne|meat|granos?|grain\w*|maiz|corn|trigo|wheat|soya|soybean\w*|forraj\w*|feed|food|aliment\w*|fertiliz\w*|aceites?|oil|oilseed\w*|petroleo|crude|energia|energy|combustib\w*|fuel|gas|metales|metals|acero|steel|mineri\w*|mining)\b/;
export function marketStoryTopic(item){
 const title=fold(item?.originalTitle || item?.title),description=fold(item?.description || item?.summary),text=title+' '+description;
 if(!title)return null;
 const sector=industry.test(text);
 // A mention of human healthcare or an agricultural association is not an animal-health event.
 if(/\b(?:influenza aviar|avian (?:flu|influenza)|fiebre (?:aftosa|porcina)|african swine|peste porcina|newcastle|zoonos\w*|bioseguridad|animal disease|brote\w*|outbreak\w*|cuarentena|quarantine)\b/.test(text) && /\b(?:aviar|aves?|birds?|porcin\w*|swine|ganad\w*|cattle|poultry|cerd\w*|pollo|animal\w*|pecuari\w*)\b/.test(text))return 'health';
 if(/\b(?:sanidad animal|sanidad vegetal|sanidad pecuaria|sanidad avicola|animal health|plant health|phytosanitary|fitosanitari\w*|senasica|aphis)\b/.test(text) && sector)return 'health';
 if(/\b(?:huelga|strike|bloqueo|blockade|interrupcion|disruption|cierre|closed|servicios minimos)\b/.test(title) && /\b(?:transporte|transport\w*|puertos?|ports?|ferrocarril|rail\w*|camiones|trucks?|vuelos|flights?|logistica|logistics|rutas?|routes?|fletes?|freight)\b/.test(text))return 'trade';
 if(/\b(?:irpf|iva|vat|impuestos?|tax\w*|fiscal\w*|modulos|subsidios?|subsid\w*|ayudas|support payments)\b/.test(title))return sector ? 'policy' : null;
 if(/\b(?:fusion\w*|adquisicion\w*|merger\w*|acquisition\w*|compra de|absorcion|takeover)\b/.test(title))return sector ? /aceite|olive oil|deoleo|dcoop|acesur/.test(text) ? 'food_oils' : 'corporate' : null;
 if(/\b(?:sequ[ií]a|lluvia\w*|drought|flood\w*|inundaci\w*|helad\w*|frost|huracan|hurricane)\b/.test(title))return sector ? 'weather' : null;
 if(!sector && !/\b(?:arancel\w*|tariffs?|shipping|freight|logistic\w*|puertos?|ports?)\b/.test(title))return null;
 if(/\b(?:arancel\w*|tariffs?|export\w*|import\w*|shipping|freight|fletes?|logistic\w*|puertos?|ports?|sancion\w*|sanction\w*)\b/.test(title))return 'trade';
 if(/\b(?:aceite de oliva|olive oil|aceites vegetales|vegetable oils?|deoleo|dcoop|acesur|processed food|alimentos procesados)\b/.test(title))return 'food_oils';
 if(/\b(?:granos?|grain\w*|cosech\w*|crop\w*|maiz|corn|trigo|wheat|soya|soybean\w*|forraj\w*|feed|alimento|fertiliz\w*)\b/.test(title))return 'crop';
 if(/\b(?:livestock|ganad\w*|cattle|pork|porcin\w*|cerd\w*|beef|vacun\w*|poultry|chicken|pollo|huevo|eggs?|fish|pescad\w*|salmon|protein\w*|pecuari\w*)\b/.test(title))return 'livestock';
 if(/\b(?:petroleo|oil|crude|gas|energy|energia|fuel|combustib\w*|refiner\w*|copper|cobre|oro|gold|metals?|metales|acero|steel|alumin\w*)\b/.test(title))return 'energy';
 return null;
}

// A dated publication can support context; it never proves a price reaction by itself.
export function financialEvent(item,{kind='equities'}={}){
 const title=fold(item?.originalTitle || item?.title),text=title+' '+fold(item?.description);
 if(!title || /science and practice|communication.*experience|experiencia.*comunicacion|historia de|anniversary|aniversario|seminar|seminario|workshop|taller|call for|podcast|entrevista|interview|opinion|preview|previa|podria|could|may cut|se espera|expected to|antes de.*resultados/.test(title))return null;
 if(/\b(?:recortara|reducira|elevara|subira|aumentara|mantendra|publicara|reportara|anunciara|will)\b/.test(title))return null;
 if(kind==='bonds' && /\b(?:niquel|nickel|cobre|copper|oro|gold|metal\w*|petroleo|oil)\b/.test(title.split(/\b(?:por|porque|tras|ante|as|after|amid)\b/)[0]))return null;
 const outcome=/\b(?:recorta(?:n|ron)?|recorto|reduce(?:n)?|redujo|redujeron|eleva(?:n|ron)?|elevo|sube(?:n)?|subio|subieron|aumenta(?:n|ron)?|aumento|mantiene(?:n)?|mantuvo|mantuvieron|cuts?|raises?|raised|hikes?|holds?|held|unchanged|publica(?:n|ron)?|publico|publishes|published|reports?|reported|reporta(?:n|ron)?|reporto|registra(?:n|ron)?|registro|alcanza(?:n|ron)?|alcanzo|supera(?:n|ron)?|supero|beat\w*|rose|fell|cae(?:n)?|cayo|cayeron|baja(?:n|ron)?|bajo|anuncia(?:n|ron)?|anuncio|announces?|announced)\b/;
 const institution=/\b(?:fed|fomc|banxico|bce|ecb|reserva federal|federal reserve|banco central|central bank|bank of england|boe)\b/;
 const main=title.split(/\b(?:por|porque|tras|ante|as|after|amid)\b/)[0];
 let eventType='';
 if(institution.test(main) && /\b(?:tasas?|rates?|interes|interest|monetar\w*)\b/.test(main) && outcome.test(main))eventType='policy';
 else if(/\b(?:inflacion|inflation|cpi|pce|nominas|payrolls?|empleo|employment|desempleo|unemployment|pib|gdp)\b/.test(main) && outcome.test(main))eventType='macro';
 else if(/\b(?:subasta|auction)\b/.test(title) && /\b(?:treasury|tesoro|bonos|bonds?|deuda|debt)\b/.test(text) && outcome.test(text))eventType='auction';
 else if(kind==='equities' && /\b(?:earnings|resultados|beneficios|profits?|revenue|utilidades)\b/.test(main) && outcome.test(main))eventType='earnings';
 else if(/\b(?:arancel\w*|tariffs?|prohibicion de exportar|export ban)\b/.test(title) && /\b(?:aprueba|impone|anuncia|entra en vigor|imposes?|approves?|announces?|effective)\b/.test(title))eventType='trade';
 return eventType ? {...item,eventType,causality:'unproven'} : null;
}
