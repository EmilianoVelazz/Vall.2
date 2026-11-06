/* Mapa mundial de equivalencias monetarias. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const cleanups = [];
    let mounted = false;
    let drag = null;
    let hoverCloseTimer = null;
    const state = { rates:{}, comparison:null, countries:[], base:'USD', selected:'', filter:'all', zoom:1, inverted:false };
    const NAME_ALIASES = {
        'United States of America':'United States of America','United Kingdom':'United Kingdom of Great Britain and Northern Ireland','Russia':'Russian Federation','South Korea':'Korea (Republic of)',
        'North Korea':"Korea (Democratic People's Republic of)",'Czechia':'Czech Republic','Czech Republic':'Czech Republic',
        'Dem. Rep. Congo':'Congo (Democratic Republic of the)','Dominican Rep.':'Dominican Republic','Central African Rep.':'Central African Republic',
        'Eq. Guinea':'Equatorial Guinea','eSwatini':'Swaziland','Bosnia and Herz.':'Bosnia and Herzegovina',
        'Macedonia':'North Macedonia','S. Sudan':'South Sudan','Solomon Is.':'Solomon Islands',
        'W. Sahara':'Western Sahara','Côte d’Ivoire':'Ivory Coast',"Côte d'Ivoire":'Ivory Coast','Ivory Coast':'Ivory Coast',
        'United Republic of Tanzania':'Tanzania, United Republic of','Tanzania':'Tanzania, United Republic of','The Bahamas':'Bahamas','Bahamas':'Bahamas',
        'Falkland Is.':'Falkland Islands (Malvinas)','Timor-Leste':'Timor-Leste','Vatican':'Vatican City',
        'Iran':'Iran (Islamic Republic of)','Syria':'Syrian Arab Republic','Bolivia':'Bolivia (Plurinational State of)','Venezuela':'Venezuela (Bolivarian Republic of)','Moldova':'Moldova (Republic of)','Palestine':'Palestine, State of','Laos':"Lao People's Democratic Republic",'Brunei':'Brunei Darussalam','Kosovo':'Republic of Kosovo',
    };
    const FALLBACK = {
        'United States of America':['Estados Unidos','USD'],Mexico:['México','MXN'],Canada:['Canadá','CAD'],Colombia:['Colombia','COP'],Brazil:['Brasil','BRL'],Argentina:['Argentina','ARS'],Chile:['Chile','CLP'],Peru:['Perú','PEN'],
        'United Kingdom':['Reino Unido','GBP'],France:['Francia','EUR'],Germany:['Alemania','EUR'],Spain:['España','EUR'],Italy:['Italia','EUR'],Portugal:['Portugal','EUR'],Netherlands:['Países Bajos','EUR'],Belgium:['Bélgica','EUR'],Ireland:['Irlanda','EUR'],Austria:['Austria','EUR'],Finland:['Finlandia','EUR'],Greece:['Grecia','EUR'],
        Switzerland:['Suiza','CHF'],Norway:['Noruega','NOK'],Sweden:['Suecia','SEK'],Denmark:['Dinamarca','DKK'],Poland:['Polonia','PLN'],Russia:['Rusia','RUB'],Turkey:['Turquía','TRY'],
        China:['China','CNY'],Japan:['Japón','JPY'],'South Korea':['Corea del Sur','KRW'],India:['India','INR'],Indonesia:['Indonesia','IDR'],Malaysia:['Malasia','MYR'],Thailand:['Tailandia','THB'],Philippines:['Filipinas','PHP'],Vietnam:['Vietnam','VND'],Singapore:['Singapur','SGD'],Australia:['Australia','AUD'],'New Zealand':['Nueva Zelanda','NZD'],
        'South Africa':['Sudáfrica','ZAR'],Egypt:['Egipto','EGP'],Nigeria:['Nigeria','NGN'],Morocco:['Marruecos','MAD'],'Saudi Arabia':['Arabia Saudita','SAR'],'United Arab Emirates':['Emiratos Árabes Unidos','AED'],Israel:['Israel','ILS'],Qatar:['Catar','QAR'],Kuwait:['Kuwait','KWD'],
    };
    // Última referencia conocida del mismo proveedor diario. Sólo se usa para
    // que el mapa siga siendo explorable si la red falla; una respuesta en vivo
    // sustituye inmediatamente estos valores.
    const FALLBACK_RATES = {USD:1,MXN:17.060491,CAD:1.393222,COP:3131.993848,BRL:5.161053,ARS:1492.5477,CLP:913.709515,PEN:3.371041,GBP:.740511,EUR:.867027,CHF:.812728,NOK:9.48981,SEK:9.563154,DKK:6.470217,PLN:3.731369,RUB:82.744352,TRY:47.780731,CNY:6.756905,JPY:159.290909,KRW:1416.765449,INR:95.412039,IDR:17872.581694,MYR:4.085732,THB:33.080528,PHP:61.249268,VND:26016.726333,SGD:1.279831,AUD:1.415551,NZD:1.706012,ZAR:16.139767,EGP:50.212831,NGN:1360.25328,MAD:9.299136,SAR:3.75,AED:3.6725,ILS:2.98417,QAR:3.64,KWD:.308491};
    const FALLBACK_REGIONS = {
        Americas:new Set(['United States of America','Mexico','Canada','Colombia','Brazil','Argentina','Chile','Peru']),
        Europe:new Set(['United Kingdom','France','Germany','Spain','Italy','Portugal','Netherlands','Belgium','Ireland','Austria','Finland','Greece','Switzerland','Norway','Sweden','Denmark','Poland','Russia']),
        Asia:new Set(['Turkey','China','Japan','South Korea','India','Indonesia','Malaysia','Thailand','Philippines','Vietnam','Singapore','Saudi Arabia','United Arab Emirates','Israel','Qatar','Kuwait']),
        Oceania:new Set(['Australia','New Zealand']),
        Africa:new Set(['South Africa','Egypt','Nigeria','Morocco']),
    };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const excludedCountry = () => false;
    const excludedCurrency = () => false;
    const regionKey = value => value === 'Americas' ? 'americas' : value === 'Europe' ? 'europe' : value === 'Asia' || value === 'Oceania' ? 'asia' : value === 'Africa' ? 'africa' : 'other';
    const format = (value, code) => Number(value).toLocaleString('es-MX',{maximumFractionDigits:value < .01 ? 6 : value < 1 ? 4 : value < 100 ? 4 : 2}) + ` ${code}`;
    const spanishCountryName = country => {try{return new Intl.DisplayNames(['es'],{type:'region'}).of(country.code)||country.spanishName||country.name;}catch{return country.spanishName||country.name;}};

    function fallbackCountries(){return Object.entries(FALLBACK).map(([name,[spanishName,code]])=>({name,officialName:name,spanishName,region:Object.entries(FALLBACK_REGIONS).find(([,names])=>names.has(name))?.[0]||'',currencies:[{code,name:code,symbol:code}]})).filter(country=>!excludedCountry(country));}

    function catalog() {
        const byName = new Map();
        state.countries.forEach(country => {
            [country.name,country.officialName,country.spanishName].forEach(name => name && byName.set(norm(name),country));
        });
        const map = window.VN_WORLD_MAP;
        const result = new Map();
        [...(map?.paises || []), ...Object.entries(map?.suplementos || {}).map(([ne,v])=>({ne,d:v.d}))].forEach(geo => {
            const lookup = NAME_ALIASES[geo.ne] || geo.ne;
            let country = byName.get(norm(lookup));
            if (!country && FALLBACK[geo.ne]) {
                const [name,code] = FALLBACK[geo.ne];
                country = { name:geo.ne, spanishName:name, region:'', currencies:[{code,name:code,symbol:code}] };
            }
            const currency = country?.currencies?.find(item => Number.isFinite(+state.rates[item.code]));
            if (country && currency) result.set(geo.ne,{...country,ne:geo.ne,d:geo.d,currency,regionKey:regionKey(country.region)});
        });
        return result;
    }

    function rateFor(item) {
        const base = +state.rates[state.base], target = +state.rates[item.currency.code];
        if (!(base > 0 && target > 0)) return null;
        return state.inverted ? base / target : target / base;
    }
    function movementFor(item) {
        const current=state.comparison?.currentRates, previous=state.comparison?.previousRates;
        const code=item?.currency?.code, base=state.base;
        const currentTarget=+current?.[code], previousTarget=+previous?.[code], currentBase=+current?.[base], previousBase=+previous?.[base];
        if (!(currentTarget>0&&previousTarget>0&&currentBase>0&&previousBase>0)) return null;
        return ((currentBase/currentTarget)/(previousBase/previousTarget)-1)*100;
    }
    function movementState(item) {
        const move=movementFor(item);
        if (!Number.isFinite(move)||Math.abs(move)<.005) return {move:null,key:'flat',color:'#536d75',label:'Sin variación disponible'};
        return move>0
            ? {move,key:'up',color:'#3f9b75',label:`Se fortalece frente a ${state.base}`}
            : {move,key:'down',color:'#b45d6b',label:`Se debilita frente a ${state.base}`};
    }
    function visible(item) { return state.filter === 'all' || item.regionKey === state.filter; }
    function selectedItem(items=catalog()) { return items.get(state.selected) || null; }
    function centerFor(ne) { return window.VN_WORLD_MAP?.centros?.[ne] || window.VN_WORLD_MAP?.suplementos?.[ne]?.centro || null; }

    function renderSelectors(items) {
        const picker=$('fcm-country'), base=$('fcm-base');
        if (picker) {
            picker.innerHTML='<option value="">Elegir país…</option>'+[...items.values()].sort((a,b)=>a.spanishName.localeCompare(b.spanishName,'es')).map(item=>`<option value="${esc(item.ne)}">${esc(item.spanishName)} · ${esc(item.currency.code)}</option>`).join('');
            picker.value=state.selected;
        }
        if (base) {
            const currencies=new Map();
            state.countries.flatMap(c=>c.currencies||[]).forEach(c=>{if(!excludedCurrency(c)&&Number.isFinite(+state.rates[c.code])) currencies.set(c.code,c);});
            base.innerHTML=[...currencies.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('');
            base.value=state.base;
        }
    }
    function updateConverter(item) {
        const fromCode=$('fcm-from-code'),toCode=$('fcm-to-code'),fromValue=$('fcm-from-value'),toValue=$('fcm-to-value');
        if (!item) {
            if(fromCode)fromCode.textContent=state.base;if(fromValue)fromValue.textContent='1';if(toCode)toCode.textContent='Selecciona un país';if(toValue)toValue.textContent='—';return;
        }
        const rate=rateFor(item), from=state.inverted?item.currency.code:state.base, to=state.inverted?state.base:item.currency.code;
        if(fromCode)fromCode.textContent=from;if(fromValue)fromValue.textContent='1';if(toCode)toCode.textContent=`${item.spanishName} · ${to}`;if(toValue)toValue.textContent=rate?format(rate,to):'—';
    }
    function updateStatus(items) {
        const shown=[...items.values()].filter(visible).length;
        const status=$('fcm-filter-status');
        if(status) status.textContent=`${state.filter==='all'?'Vista global':({americas:'Américas',europe:'Europa',asia:'Asia–Pacífico',africa:'África'}[state.filter])} · ${shown} de ${items.size} países`;
        const colorBase=$('fcm-color-base');
        if(colorBase){const tracked=[...items.values()].filter(item=>Number.isFinite(movementFor(item))).length;colorBase.textContent=`Cambio diario frente a ${state.base} · ${tracked} mercados comparables`;}
        document.querySelectorAll('[data-fcm-filter]').forEach(btn=>{const active=btn.dataset.fcmFilter===state.filter;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));});
    }
    function render() {
        const map=window.VN_WORLD_MAP, canvas=$('fcm-map-canvas'); if(!map||!canvas)return;
        const items=catalog();
        const paths=[...(map.paises||[]),...Object.entries(map.suplementos||{}).map(([ne,v])=>({ne,d:v.d}))].map(geo=>{
            const item=items.get(geo.ne); if(!item)return `<path class="fcm-country" d="${geo.d}" aria-hidden="true"></path>`;
            const filtered=!visible(item),rate=rateFor(item),movement=movementState(item);
            return `<path class="fcm-country has-rate is-${movement.key}${filtered?' is-filtered':''}" d="${geo.d}" data-fcm-country="${esc(geo.ne)}" style="--fcm-fill:${movement.color}" role="button" tabindex="${filtered?'-1':'0'}" aria-hidden="${filtered}" aria-label="${esc(item.spanishName)}, ${esc(movement.label)}, 1 ${esc(state.inverted?item.currency.code:state.base)} equivale a ${esc(format(rate,state.inverted?state.base:item.currency.code))}"></path>`;
        }).join('');
        const markers=[...items.values()].map(item=>{const c=centerFor(item.ne);if(!c)return'';const filtered=!visible(item),movement=movementState(item);return `<g class="fcm-marker is-${movement.key}${filtered?' is-filtered':''}" data-fcm-country="${esc(item.ne)}" transform="translate(${c.x} ${c.y})" role="button" tabindex="${filtered?'-1':'0'}" aria-hidden="${filtered}"><circle class="fcm-marker-halo" r="9"></circle><circle class="fcm-marker-dot" r="4" style="--fcm-fill:${movement.color}"></circle></g>`;}).join('');
        canvas.innerHTML=`<svg class="fcm-svg" viewBox="0 0 ${map.ancho} ${map.alto}" role="img" aria-label="Mapa mundial de equivalencias con base ${esc(state.base)}"><g>${paths}</g><g>${markers}</g></svg>`;
        renderSelectors(items);updateStatus(items);updateConverter(selectedItem(items));canvas.style.setProperty('--fbm-zoom',state.zoom);
        const empty=$('fcm-map-empty');if(empty)empty.hidden=items.size>0;
    }
    function showTip(ne,node,force=false) {
        const item=catalog().get(ne),tip=$('fcm-hover-tip'),wrap=$('fcm-map-wrap');if(!item||!tip||!node)return;
        document.querySelectorAll('#fcm-map-canvas .is-previewed').forEach(n=>n.classList.remove('is-previewed'));
        document.querySelectorAll(`#fcm-map-canvas [data-fcm-country="${CSS.escape(ne)}"]`).forEach(n=>n.classList.add('is-previewed'));
        const rate=rateFor(item),from=state.inverted?item.currency.code:state.base,to=state.inverted?state.base:item.currency.code,movement=movementState(item);
        const moveText=Number.isFinite(movement.move)?`${movement.move>=0?'+':''}${movement.move.toFixed(2)}% · ${movement.label}`:movement.label;
        tip.innerHTML=`<header class="fbm-tip-head"><span class="fbm-hover-flag"><i class="fas fa-coins"></i></span><div><small>${esc(item.currency.name)}</small><strong>${esc(item.spanishName)}</strong></div><button type="button" class="fcm-tip-close fbm-tip-close" aria-label="Cerrar"><i class="fas fa-xmark"></i></button></header><div class="fcm-rate-line"><span>Equivalencia de referencia</span><strong>1 ${esc(from)} = ${esc(format(rate,to))}</strong><em>${esc(from)} / ${esc(to)}</em></div><div class="fcm-move-line is-${movement.key}"><i class="fas ${movement.key==='up'?'fa-arrow-trend-up':movement.key==='down'?'fa-arrow-trend-down':'fa-minus'}"></i><span>${esc(moveText)}</span></div><div class="fcm-tip-meta"><span>Moneda oficial <strong>${esc(item.currency.code)} · ${esc(item.currency.symbol)}</strong></span><span>Comparación <strong>${esc(state.comparison?.previousDate||'cierre previo')} → ${esc(state.comparison?.currentDate||'actual')}</strong></span></div>`;
        tip.hidden=false;
        const r=node.getBoundingClientRect(),w=wrap.getBoundingClientRect(),t=tip.getBoundingClientRect();tip.style.left=`${Math.max(8,Math.min(w.width-t.width-8,r.left-w.left+r.width/2+14))}px`;tip.style.top=`${Math.max(8,Math.min(w.height-t.height-8,r.top-w.top+r.height/2-t.height/2))}px`;
    }
    function hideTip(force=false){if(hoverCloseTimer){clearTimeout(hoverCloseTimer);hoverCloseTimer=null;}const tip=$('fcm-hover-tip');if(!tip)return;tip.hidden=true;tip.classList.remove('is-pinned');document.querySelectorAll('#fcm-map-canvas .is-previewed').forEach(n=>n.classList.remove('is-previewed'));}
    function scheduleTipClose(){if(hoverCloseTimer)clearTimeout(hoverCloseTimer);hoverCloseTimer=setTimeout(()=>hideTip(),55);}
    function select(ne,node){state.selected=ne;$('fcm-country').value=ne;document.querySelectorAll('#fcm-map-canvas [data-fcm-country]').forEach(n=>n.classList.toggle('is-selected',n.dataset.fcmCountry===ne));updateConverter(selectedItem());showTip(ne,node);}
    function zoom(action){const stage=$('fcm-map-stage'),canvas=$('fcm-map-canvas');if(!stage||!canvas)return;state.zoom=action==='in'?Math.min(2,+(state.zoom+.2).toFixed(1)):action==='out'?Math.max(1,+(state.zoom-.2).toFixed(1)):1;canvas.style.setProperty('--fbm-zoom',state.zoom);$('fcm-zoom-value').textContent=`${Math.round(state.zoom*100)}%`;document.querySelector('[data-fcm-zoom="out"]')?.toggleAttribute('disabled',state.zoom<=1);document.querySelector('[data-fcm-zoom="in"]')?.toggleAttribute('disabled',state.zoom>=2);if(action==='reset')stage.scrollTo({left:0,top:0,behavior:'smooth'});}
    async function loadDailyComparison(){
        let board=[];
        for(let attempt=0;attempt<16;attempt+=1){
            board=Array.isArray(window._internationalFxBoard)?window._internationalFxBoard:[];
            if(board.length)break;
            await new Promise(resolve=>setTimeout(resolve,250));
        }
        const currentRates={USD:1},previousRates={USD:1};
        board.forEach(item=>{
            const [base,quote]=String(item.label||'').split('/'),price=+item.price,pct=+item.pct;
            if(!(price>0&&Number.isFinite(pct)))return;
            const previousPrice=price/(1+pct/100);
            if(base==='USD'){currentRates[quote]=price;previousRates[quote]=previousPrice;}
            else if(quote==='USD'){currentRates[base]=1/price;previousRates[base]=1/previousPrice;}
        });
        const today=new Date(),previous=new Date(today);previous.setDate(previous.getDate()-1);
        return Object.keys(currentRates).length>1?{source:'Mesa cambiaria VALLNews',currentDate:today.toISOString().slice(0,10),previousDate:previous.toISOString().slice(0,10),currentRates,previousRates}:null;
    }
    async function load(){
        try {
            const countryRequest=fetch('/api/country-currencies')
                .then(response=>{if(!response.ok)throw Error(response.status);return response.json();})
                .catch(()=>({countries:state.countries.length?state.countries:fallbackCountries()}));
            const [rates,countries]=await Promise.all([
                fetch('/api/exchange-rates').then(response=>{if(!response.ok)throw Error(response.status);return response.json();}).catch(()=>({rates:state.rates})),
                countryRequest,
            ]);
            state.rates=rates.rates||{};
            state.countries=(countries.countries||[])
                .filter(country=>!excludedCountry(country))
                .map(country=>({...country,spanishName:spanishCountryName(country),currencies:(country.currencies||[]).filter(currency=>!excludedCurrency(currency))}))
                .filter(country=>country.currencies.length);
            state.comparison=rates.comparison||await loadDailyComparison();
            const status=$('fcm-status');
            if(status){status.className='fcm-status fbm-status is-ready';status.innerHTML=`<i class="fas fa-signal"></i> ${Object.keys(state.rates).length-1} monedas · actualización diaria`;}
            render();
        } catch(error) {
            const status=$('fcm-status');
            if(status){status.className='fcm-status fbm-status is-partial';status.innerHTML='<i class="fas fa-shield-halved"></i> Cobertura de respaldo disponible';}
            console.warn('Mapa de divisas:',error);
        }
    }
    function mount(){if(mounted||!$('currency-world-map'))return;mounted=true;state.rates={...FALLBACK_RATES,...(window.VN_WORLD_FX_FALLBACK?.rates||{})};state.countries=(window.VN_WORLD_CURRENCIES||fallbackCountries()).filter(country=>!excludedCountry(country)).map(country=>({...country,spanishName:spanishCountryName(country),currencies:(country.currencies||[]).filter(currency=>!excludedCurrency(currency))})).filter(country=>country.currencies.length);render();const root=$('currency-world-map');const click=e=>{const zoomBtn=e.target.closest('[data-fcm-zoom]');if(zoomBtn){zoom(zoomBtn.dataset.fcmZoom);return;}const filter=e.target.closest('[data-fcm-filter]');if(filter){state.filter=filter.dataset.fcmFilter;state.selected='';hideTip(true);render();return;}if(e.target.closest('#fcm-invert')){state.inverted=!state.inverted;hideTip(true);render();return;}const target=e.target.closest('[data-fcm-country]:not(.is-filtered)');if(target)select(target.dataset.fcmCountry,target);else if(e.target.closest('#fcm-map-stage'))hideTip(true);};const change=e=>{if(e.target.id==='fcm-base'){state.base=e.target.value;state.inverted=false;hideTip(true);render();}if(e.target.id==='fcm-country'&&e.target.value){const node=document.querySelector(`#fcm-map-canvas [data-fcm-country="${CSS.escape(e.target.value)}"]`);select(e.target.value,node);}};const over=e=>{if(hoverCloseTimer){clearTimeout(hoverCloseTimer);hoverCloseTimer=null;}const target=e.target.closest('[data-fcm-country]:not(.is-filtered)');if(target)showTip(target.dataset.fcmCountry,target);};const out=e=>{const country=e.target.closest('[data-fcm-country]:not(.is-filtered)');if(!country)return;const nextCountry=e.relatedTarget?.closest?.('[data-fcm-country]:not(.is-filtered)');if(nextCountry?.dataset.fcmCountry===country.dataset.fcmCountry)return;scheduleTipClose();};const moveHover=e=>{const tip=$('fcm-hover-tip');if(!tip||tip.hidden)return;if(!e.target.closest('[data-fcm-country]:not(.is-filtered)'))scheduleTipClose();};const focusout=e=>{if(!e.relatedTarget?.closest?.('#currency-world-map'))scheduleTipClose();};const leave=()=>scheduleTipClose();root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('mouseover',over);root.addEventListener('mouseout',out);root.addEventListener('mousemove',moveHover);root.addEventListener('focusout',focusout);root.addEventListener('mouseleave',leave);cleanups.push(()=>root.removeEventListener('click',click),()=>root.removeEventListener('change',change),()=>root.removeEventListener('mouseover',over),()=>root.removeEventListener('mouseout',out),()=>root.removeEventListener('mousemove',moveHover),()=>root.removeEventListener('focusout',focusout),()=>root.removeEventListener('mouseleave',leave));const stage=$('fcm-map-stage');if(stage){const down=e=>{if(e.pointerType==='mouse'&&e.button===0)drag={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};};const move=e=>{if(!drag)return;stage.scrollLeft=drag.left-(e.clientX-drag.x);stage.scrollTop=drag.top-(e.clientY-drag.y);stage.classList.add('is-dragging','has-interacted');};const up=()=>{drag=null;stage.classList.remove('is-dragging');};stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);window.addEventListener('pointerup',up);cleanups.push(()=>stage.removeEventListener('pointerdown',down),()=>stage.removeEventListener('pointermove',move),()=>window.removeEventListener('pointerup',up));}load();}
    function unmount(){cleanups.splice(0).forEach(fn=>fn());if(hoverCloseTimer)clearTimeout(hoverCloseTimer);hoverCloseTimer=null;mounted=false;drag=null;}
    window.VNCurrencyMap={montar:mount,desmontar:unmount};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
