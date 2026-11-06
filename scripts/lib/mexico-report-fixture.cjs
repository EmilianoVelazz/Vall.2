'use strict';
const time=new Date('2026-10-12T18:00:00Z');
const input={
    macro:{indicators:[{id:'gdp_growth',label:'Crecimiento real del PIB',value:1.5,period:'2025',series:[{period:'2022',value:-1},{period:'2024',value:0},{period:'2025',value:1.5}],unit:'%',source:'Banco Mundial',url:'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=MX'}]},
    bmv:{bmv:[{symbol:'BIMBO',name:'Bimbo',price:70,currency:'MXN',type:'stock',previousPrice:69,change_pct:1.45,observedAt:'2026-10-12T17:00:00Z',sourceUrl:'https://finance.yahoo.com/quote/BIMBOA.MX/'},{symbol:'USD/MXN',name:'Tipo de cambio',price:20,currency:'MXN',type:'currency',observedAt:'2026-10-12T17:00:00Z',sourceUrl:'https://finance.yahoo.com/quote/USDMXN=X/'}]},
    proteins:{prices:{pork:{unit:'MXN/kg vivo',level:'Ganado en pie',states:[{state:'Puebla',price:38,date:'2026-10-11',markets:['Referencia estatal'],cadence:'daily'}]},beef:{unit:'MXN/kg vivo',level:'Ganado en pie',states:[{state:'Puebla',price:90,date:'2026-10-01',cadence:'monthly',level:'Canal en rastro',sourceUrl:'https://www.economia-sniim.gob.mx/'}]},chicken:{unit:'MXN/kg',level:'Mayoreo',states:[{state:'Jalisco',price:40,date:'2026-10-10',source:'Gemini + Google Search',sourceUrls:['https://example.org/evidencia-local'],level:'Pollo entero · mayoreo',cadence:'weekly-ai'}]},egg:{unit:'MXN/kg',level:'Mayoreo',states:[]}}}
};
module.exports={time,input};
