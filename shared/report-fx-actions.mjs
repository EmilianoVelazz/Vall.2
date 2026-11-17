export const FX_TREASURY_COLORS={DXY:'#444b53','USD/MXN':'#53745f','USD/BRL':'#b18152','USD/CAD':'#83708f'};
export function fxCostTone(value){return !Number.isFinite(value) ? 'unavailable' : Math.abs(value)<.005 ? 'neutral' : value>0 ? 'adverse' : 'favorable';}
export function fxSourceCaption(item){let source=String(item.source || 'Fuente del corte');try{if(new URL(item.url).hostname.endsWith('marketscreener.com') && !/MarketScreener/i.test(source))source+=' / MarketScreener';}catch{/* No new URL is generated here. */}return 'Fuente: '+source+' ('+String(item.publishedAt || '').slice(0,10)+')';}
export function fxFollowup(reference,risk){
 const {code,periods}=reference,day=periods.day?.value,month=periods.month?.value,up=Number.isFinite(day) && day>=.005,down=Number.isFinite(day) && day<=-.005;
 if(code==='MXN')return up ? 'USD más caro: revisar pagos y cobertura vigente' : 'Conciliar cobros USD antes de cubrir pagos';
 if(code==='BRL')return (risk?.volatility>=15 || Math.abs(day || 0)>=1) ? 'Volatilidad alta: cotizar NDF hasta 30D' : 'Conciliar flujos BRL; comparar spot y NDF';
 if(code==='CAD')return Number.isFinite(month) && Math.abs(month)<1 && risk && risk.volatility<10 ? 'Rango estable: validar cobertura natural' : 'Compensar cobros CAD antes de comprar USD';
 if(code==='EUR')return down ? 'Euro más barato en USD: cotizar compras' : up ? 'Euro encarece en USD: escalonar pagos' : 'Calendarizar compras EUR y fondeo USD';
 if(code==='GBP')return up ? 'Libra más cara: revisar presupuesto en USD' : 'Separar vencimientos GBP de pagos EUR';
 if(code==='CNY')return Number.isFinite(month) && Math.abs(month)<1 ? 'Mantener flujo CNY; confirmar tipo liquidable' : 'Revisar pagos CNY y condiciones de conversión';
 if(code==='JPY')return up ? 'Pagos USD desde JPY: revisar vencimientos' : 'Validar cobros JPY y compensación de pagos';
 const actions={CHF:'Separar reservas CHF de pagos operativos',SEK:'Alinear pagos SEK con facturas suecas',NOK:'Contrastar cobros NOK y necesidades USD',DKK:'Verificar facturas DKK y cruce con EUR',PLN:'Programar compras PLN por vencimiento',CZK:'Separar pagos CZK de presupuesto EUR',HUF:'Escalonar necesidades HUF confirmadas',RON:'Compensar cobros RON antes de convertir',TRY:'Acotar plazo al flujo TRY confirmado',ISK:'Confirmar liquidez y spread en ISK',AUD:'Calendarizar compras AUD y fondeo USD',NZD:'Compensar ingresos NZD antes de cubrir',INR:'Confirmar liquidación INR y plazo bancario',KRW:'Alinear compras KRW con órdenes firmes',SGD:'Compensar cobros y pagos en SGD',HKD:'Confirmar cuotas HKD y fondos USD',THB:'Escalonar compras THB contra facturas',IDR:'Validar monto IDR y costo ejecutable',MYR:'Alinear cobros MYR con pagos previstos',PHP:'Revisar referencia PHP y presupuesto',ILS:'Separar obligaciones ILS y USD por fecha',ZAR:'Revisar vencimientos ZAR y margen bancario'};
 if(actions[code])return actions[code];
 return 'Confirmar moneda y vencimiento de la obligación';
}
export function fxHedgeProposal(references,cutoff){
 const items=references.filter(item=>['MXN','BRL'].includes(item.code)).map(item=>({code:item.code,heading:item.label+' · exposición y vencimientos',body:item.code==='MXN' ? 'Conciliar cobros y pagos confirmados en USD por fecha. Descontar la cobertura existente antes de solicitar precios bancarios para el flujo neto pendiente.' : 'Comparar cotización spot y NDF para las fechas de pago confirmadas en BRL; contrastar costo, liquidez y contraparte.',spot:item.last.value,date:item.last.date}));
 return {title:'Decisión de tesorería · flujo neto y vencimientos',items,note:'Porcentaje, plazo y nivel objetivo requieren exposición neta, contratos y límites aprobados por la empresa. No se fijan automáticamente a partir de la cotización del corte '+String(cutoff).slice(0,10)+'.',stress:null};
}
