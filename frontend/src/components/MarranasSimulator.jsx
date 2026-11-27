import { useEffect, useMemo, useState } from 'react';
import {priceToMxnKg} from '../../../shared/price-unit-conversion.mjs';

function fmtMoney(val, digits = 2) {
  if (val==null || val==='' || !Number.isFinite(Number(val))) return '—';
  return Number(val).toLocaleString('es-MX', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toMxnPerKg(rawValue, unit = '', currency = '', usdMxn = 19.2, eurMxn = 20.8) {
  return {
    mxnKg: priceToMxnKg(rawValue, unit, currency, usdMxn, { eurMxn }),
    factorLabel: unit + ' → MXN/kg; misma etapa comercial',
  };
}

export default function MarranasSimulator({ forecasts = [], activeSpecies = 'all', horizon = '1m', onOpenInOrion }) {
  // Prefer Mexican MXN/kg series first for practical plant-cost calculation, while allowing any market
  const selectable = useMemo(() => {
    const valid = (Array.isArray(forecasts) ? forecasts : []).filter(
      (f) => f?.available && f.primaryForecast && priceToMxnKg(f.lastValue, f.unit, f.currency, 19.2, { eurMxn: 20.8 }) > 0
    );
    const bySpecies = activeSpecies && activeSpecies !== 'all'
      ? valid.filter((f) => f.species === activeSpecies)
      : valid;
    const pool = bySpecies;
    return [...pool].sort((a, b) => {
      const aMx = a.region === 'MX' ? 0 : 1;
      const bMx = b.region === 'MX' ? 0 : 1;
      if (aMx !== bMx) return aMx - bMx;
      return (b.observations || 0) - (a.observations || 0);
    });
  }, [forecasts, activeSpecies]);

  const [symbol, setSymbol] = useState('');
  const [volumeKg, setVolumeKg] = useState(10000);
  const [freightPerKg, setFreightPerKg] = useState(2.5);
  const [shrinkagePct, setShrinkagePct] = useState(4);
  const [tariffPct, setTariffPct] = useState(0);
  const [usdMxn, setUsdMxn] = useState(19.2);
  const [eurMxn, setEurMxn] = useState(20.8);
  const [fxShockPct, setFxShockPct] = useState(0);
  const [inventoryDays, setInventoryDays] = useState(15);
  const [annualFinancingPct,setAnnualFinancingPct]=useState(0);
  const [salePrice, setSalePrice] = useState('');

  const selected = useMemo(() => {
    if (!selectable.length) return null;
    return selectable.find((item) => item.symbol === symbol) || selectable[0];
  }, [selectable, symbol]);

  useEffect(() => {
    if (selected && selected.symbol !== symbol) {
      setSymbol(selected.symbol);
      const isImport = selected.region !== 'MX' && selected.currency !== 'MXN';
      setSalePrice('');
      setFreightPerKg(isImport ? 4.5 : 2.5);
      setTariffPct(0);
    }
  }, [selected, symbol, usdMxn]);

  const activeHorizon = useMemo(() => {
    if (!selected) return null;
    const list = Array.isArray(selected.horizons) ? selected.horizons : [];
    return list.find((h) => h.code === horizon) || selected.primaryForecast;
  }, [selected, horizon]);

  const scenarios = useMemo(() => {
    if (!selected || !activeHorizon) return null;
    const valid=(value,min,max)=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max;
    if(![[volumeKg,1,1e9],[freightPerKg,0,1e4],[shrinkagePct,0,40],[tariffPct,0,50],[usdMxn,.01,1000],[eurMxn,.01,1000],[fxShockPct,-25,25],[inventoryDays,0,180],[annualFinancingPct,0,100]].every(args=>valid(...args)) || (salePrice!==''&&!valid(salePrice,.01,1e6)))return {invalid:true};
    const vol = Math.max(1, Number(volumeKg) || 1);
    const freight = Math.max(0, Number(freightPerKg) || 0);
    const shrink = Math.min(45, Math.max(0, Number(shrinkagePct) || 0)) / 100;
    const tariff = Math.min(50, Math.max(0, Number(tariffPct) || 0)) / 100;
    const fxBase = Number(usdMxn);
    const eurBase = Number(eurMxn);
    const fxMultiplier = 1 + (Number(fxShockPct) || 0) / 100;
    const fxEffective = fxBase * fxMultiplier;
    const eurEffective = eurBase * fxMultiplier;
    const isEurSeries = String(selected.currency || '').toUpperCase() === 'EUR' || /\beur\b|€/i.test(selected.unit || '');
    const days = Math.min(180, Math.max(0, Number(inventoryDays) || 0));
    const financingFactor = (Math.max(0,Number(annualFinancingPct)||0)/100 * days) / 365;
    const netFactor = Math.max(0.55, 1 - shrink);
    const spotConv = toMxnPerKg(selected.lastValue, selected.unit, selected.currency, fxEffective, eurEffective);
    const sell = Number(salePrice)>0 ? Number(salePrice) : null;

    const calc = (name, tag, rawRefPrice) => {
      const conv = toMxnPerKg(rawRefPrice, selected.unit, selected.currency, fxEffective, eurEffective);
      if(conv.mxnKg==null)return {name,tag,refPrice:null,costPerSellable:null,totalBatchCost:null,grossMarginPerUnit:null,grossMarginPct:null,netProfit:null};
      const baseMxnKg = conv.mxnKg;
      const tariffCost = baseMxnKg * tariff;
      const landedBeforeFin = baseMxnKg + tariffCost + freight;
      const finCost = landedBeforeFin * financingFactor;
      const landed = landedBeforeFin + finCost;
      const costPerSellable = landed / netFactor;
      const totalBatchCost = landed * vol;
      const sellableUnits = vol * netFactor;
      const grossMarginPerUnit = sell==null ? null : sell - costPerSellable;
      const grossMarginPct = sell==null ? null : (grossMarginPerUnit / sell) * 100;
      const netProfit = sell==null ? null : grossMarginPerUnit * sellableUnits;
      return {
        name,
        tag,
        rawRefPrice,
        refPrice: baseMxnKg,
        costPerSellable,
        totalBatchCost,
        grossMarginPerUnit,
        grossMarginPct,
        netProfit,
      };
    };

    const spot = calc('Corte Actual (Spot)', 'spot', selected.lastValue);
    const base = calc(`Objetivo ORION ML (${activeHorizon.horizonLabel})`, 'base', activeHorizon.projectedValue);
    const lowP80 = calc('Escenario Favorable (Piso P80)', 'low', activeHorizon.low80);
    const stressP90 = calc('Escenario Estrés Alcista (Techo P90)', 'stress', activeHorizon.high90);

    return {
      spot,
      base,
      lowP80,
      stressP90,
      cashFlowDeltaBase: base.totalBatchCost==null?null:base.totalBatchCost - spot.totalBatchCost,
      cashFlowDeltaStress: stressP90.totalBatchCost==null?null:stressP90.totalBatchCost - spot.totalBatchCost,
      currency: 'MXN',
      unit: 'MXN/kg',
      rawUnit: selected.unit || '',
      factorLabel: spotConv.factorLabel,
      fxEffective: isEurSeries ? eurEffective : fxEffective,
      fxCurrencyLabel: isEurSeries ? 'EUR/MXN' : 'USD/MXN',
    };
  }, [selected, activeHorizon, volumeKg, freightPerKg, shrinkagePct, tariffPct, usdMxn, eurMxn, fxShockPct, inventoryDays, annualFinancingPct, salePrice]);

  if (!selected || !scenarios) return <p className="vn-tool-notice">No hay una referencia de esta especie con conversión verificable de MXN, USD o EUR por peso. Los pronósticos de otras monedas conservan su unidad en la tabla; no se convierten con una paridad supuesta.</p>;

  return (
    <div className="mp-sim-box" aria-label="Simulador de costo y margen ORION ML">
      <div className="mp-sim-head">
        <div>
          <span className="mp-sim-kicker">
            <i className="fas fa-calculator" /> SIMULADOR DE COSTO PUESTO EN PLANTA Y MARGEN · CONECTADO A ORION ML
          </span>
          <h3>Escenario Base vs Estrés Conformal P90 ({activeHorizon.horizonLabel})</h3>
        </div>
        <div className="mp-sim-formula">
          Base: <code>{scenarios.factorLabel}</code> · FX efectivo: <code>${fmtMoney(scenarios.fxEffective)} MXN</code>
          {typeof onOpenInOrion === 'function' && (
            <button
              type="button"
              disabled={scenarios.invalid}
              className="mp-orion-cta sm"
              style={{ marginLeft: '10px' }}
              onClick={() => onOpenInOrion({
                kind: 'simulator',
                row: selected,
                horizon: activeHorizon,
                simulation: {
                  volumeKg: Number(volumeKg) || 0,
                  freightPerUnit: Number(freightPerKg) || 0,
                  shrinkagePct: Number(shrinkagePct) || 0,
                  tariffPct: Number(tariffPct) || 0,
                  usdMxn: Number(scenarios.fxEffective) || 19.2,
                  fxShockPct: Number(fxShockPct) || 0,
                  inventoryDays: Number(inventoryDays) || 0,
                  annualFinancingPct:Number(annualFinancingPct)||0,
                  salePrice: salePrice===''?null:Number(salePrice),
                  scenarios,
                },
              })}
              title="Enviar este escenario simulado al chat de ORION para evaluar compras y cobertura"
            >
              <i className="fas fa-comments" /> Analizar en ORION
            </button>
          )}
        </div>
      </div>

      <div className="mp-sim-controls">
        <label className="mp-sim-field wide">
          <span>Mercado / Plaza de referencia</span>
          <select value={selected.symbol} onChange={(e) => setSymbol(e.target.value)}>
            {selectable.slice(0, 45).map((item) => (
              <option key={item.symbol} value={item.symbol}>
                [{item.region}] {item.label} ({fmtMoney(item.lastValue)} {item.unit})
              </option>
            ))}
          </select>
        </label>

        <label className="mp-sim-field">
          <span>Volumen del lote (kg)</span>
          <input
            type="number"
            min="100"
            step="500"
            value={volumeKg}
            onChange={(e) => setVolumeKg(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Flete y maniobra (MXN/kg)</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={freightPerKg}
            onChange={(e) => setFreightPerKg(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Merma / pérdida (%)</span>
          <input
            type="number"
            min="0"
            max="40"
            step="0.5"
            value={shrinkagePct}
            onChange={(e) => setShrinkagePct(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Arancel / internación (%)</span>
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={tariffPct}
            onChange={(e) => setTariffPct(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>USD/MXN supuesto editable</span>
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.1"
            value={usdMxn}
            onChange={(e) => setUsdMxn(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>EUR/MXN supuesto editable</span>
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.1"
            value={eurMxn}
            onChange={(e) => setEurMxn(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Choque FX (±%)</span>
          <input
            type="number"
            min="-25"
            max="25"
            step="1"
            value={fxShockPct}
            onChange={(e) => setFxShockPct(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Días de financiamiento</span>
          <input
            type="number"
            min="0"
            max="180"
            step="5"
            value={inventoryDays}
            onChange={(e) => setInventoryDays(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Tasa anual supuesta (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={annualFinancingPct}
            onChange={(e) => setAnnualFinancingPct(e.target.value)}
          />
        </label>

        <label className="mp-sim-field">
          <span>Precio venta objetivo (MXN/kg)</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </label>
      </div>

      {scenarios.invalid?<p role="status">Completa los supuestos con valores dentro de los límites indicados para calcular el escenario.</p>:<><p className="mp-sim-note">Los valores iniciales de costos y dólar son ejemplos editables. La conversión conserva la etapa de la referencia (vivo, canal o corte); no los hace equivalentes.</p><div className="mp-sim-grid">
        {[scenarios.spot, scenarios.base, scenarios.lowP80, scenarios.stressP90].map((sc) => {
          const marginPos = sc.grossMarginPct!=null && sc.grossMarginPct >= 0;
          return (
            <div className={`mp-sim-card ${sc.tag}`} key={sc.tag}>
              <div className="mp-sim-card-title">{sc.name}</div>
              <div className="mp-sim-card-price">
                Ref: <b>{fmtMoney(sc.refPrice)}</b> <small>{scenarios.unit}</small>
              </div>
              <div className="mp-sim-card-row">
                <span>Costo vendible:</span>
                <b>{fmtMoney(sc.costPerSellable)} {scenarios.currency}</b>
              </div>
              <div className="mp-sim-card-row">
                <span>Margen bruto:</span>
                <b className={marginPos ? 'pos' : 'neg'}>
                  {sc.grossMarginPct==null?'Indica precio de venta':`${sc.grossMarginPct>0?'+':''}${fmtMoney(sc.grossMarginPct,1)}% (${fmtMoney(sc.grossMarginPerUnit)})`}
                </b>
              </div>
              <div className="mp-sim-card-row">
                <span>Costo total lote:</span>
                <b>{fmtMoney(sc.totalBatchCost, 0)} {scenarios.currency}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mp-sim-summary">
        <span>
          <i className="fas fa-shield-halved" /> Impacto estimado en caja del lote vs Spot:{' '}
          <b>
            Base ORION ML {scenarios.cashFlowDeltaBase >= 0 ? '+' : ''}{fmtMoney(scenarios.cashFlowDeltaBase, 0)} {scenarios.currency}
          </b>
          {' · '}
          <b className="stress-txt">
            Estrés P90 {scenarios.cashFlowDeltaStress >= 0 ? '+' : ''}{fmtMoney(scenarios.cashFlowDeltaStress, 0)} {scenarios.currency}
          </b>
        </span>
        <span className="mp-sim-note">
          Cálculo aritmético sobre bandas Conformal P80/P90 de ORION ML; validar cotización en firme con proveedor antes de comprar.
        </span>
      </div>
      </>}
    </div>
  );
}
