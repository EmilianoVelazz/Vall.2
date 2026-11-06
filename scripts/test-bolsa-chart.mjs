import assert from 'node:assert/strict';
import { priceGeometry, chartDate, chartNumber } from '../frontend/src/lib/bolsaChart.js';

const fx = priceGeometry([{time:'2026-10-05',close:1.1421},{time:'2026-10-06',close:1.1484}],320,320);
assert.equal(fx.rows.length,2);
assert.ok(fx.ceiling - fx.floor < .01, 'El rango de divisas conserva sus variaciones pequeñas');
assert.ok(Math.abs(fx.y(1.1421) - fx.y(1.1484)) > 100, 'La gráfica de divisas no queda aplastada');
assert.equal(chartNumber(1.1421),'1.1421');
assert.equal(chartNumber(6911.26),'6,911.26');
const single = priceGeometry([{close:50,open:null,high:null,low:null}],280,260);
assert.equal(single.rows[0].open,50);
assert.equal(single.rows[0].hasOpen,false);
assert.ok(Number.isFinite(single.x(0)) && Number.isFinite(single.y(50)));
assert.ok(single.x(0) > 0 && single.x(0) < single.width-single.pad.right);
assert.equal(priceGeometry([{close:null},{close:''},{close:NaN}]),null);
assert.equal(priceGeometry([{close:0}]).rows[0].close,0);
assert.match(chartDate('2026-10-05'),/05.*oct/);
assert.match(chartDate(Date.UTC(2026,9,5,14,30)/1000,true),/14:30/);
assert.equal(chartDate(Date.UTC(2026,9,5,14,30)/1000,true,false,true),'14:30');
assert.equal(chartDate('incorrecto'),'Fecha no disponible');
for(const width of [180,220,280,320,768,1200]) {
  const plot=priceGeometry([{close:7000,high:7050,low:6980},{close:7020,high:7070,low:6990}],width,420);
  assert.ok(plot.plotWidth>0);
  assert.ok(plot.x(1)<=plot.width-plot.pad.right);
  assert.ok(plot.y(7000)>=plot.pad.top&&plot.y(7000)<=plot.height-plot.pad.bottom);
}
console.log('Bolsa: escalas, datos incompletos, fechas UTC y geometría responsive correctos.');
