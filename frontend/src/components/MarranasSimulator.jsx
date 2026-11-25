import { useEffect, useMemo, useState } from 'react';

function fmtMoney(val, digits = 2) {
  if (!Number.isFinite(Number(val))) return '—';
  return Number(val).toLocaleString('es-MX', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toMxnPerKg(rawValue, unit = '', currency = '', usdMxn = 19.2) {
  const val = Number(rawValue);
  if (!Number.isFinite(val) || val <= 0) return { mxnKg: 0, converted: false, factorLabel: 'MXN/kg' };
  const u = String(unit || '').toLowerCase();
  const c = String(currency || '').toUpperCase();
  const fx = Math.max(1, Number(usdMxn) || 19.2);
  if (c === 'MXN' || /\bmxn\b/.test(u)) return { mxnKg: val, converted: false, factorLabel: 'MXN/kg directo' };
  if (/us[¢c]\s*\/\s*lb/i.test(u) || (c === 'US¢' && /lb/i.test(u))) {
    return { mxnKg: (val / 100 / 0.45359237) * fx, converted: true, factorLabel: 'US¢/lb → MXN/kg' };
  }
  if (/cwt|100\s*lb/i.test(u)) {
    return { mxnKg: (val / 45.359237) * fx, converted: true, factorLabel: 'USD/cwt (100 lb) → MXN/kg' };
  }
  if (/\/\s*lb\b/i.test(u)) {
    return { mxnKg: (val / 0.45359237) * fx, converted: true, factorLabel: 'USD/lb → MXN/kg' };
  }
  if (/eur/i.test(u) || c === 'EUR') {
    const perKgEur = /100\s*kg/i.test(u) ? val / 100 : val;
    return { mxnKg: perKgEur * (fx * 1.09), converted: true, factorLabel: `${/100\s*kg/i.test(u) ? 'EUR/100kg' : 'EUR/kg'} → MXN/kg` };
  }
  if (/brl/i.test(u) || c === 'BRL') {
    const perKgBrl = /arroba|15\s*kg/i.test(u) ? val / 15 : val;
    return { mxnKg: perKgBrl * (fx / 5.85), converted: true, factorLabel: `${/arroba/i.test(u) ? 'BRL/arroba' : 'BRL/kg'} → MXN/kg` };
  }
  if (/usd/i.test(u) || c === 'USD') {
    return { mxnKg: val * fx, converted: true, factorLabel: 'USD/kg → MXN/kg' };
  }
  return { mxnKg: val, converted: false, factorLabel: unit || 'u.' };
}

export default function MarranasSimulator({ forecasts = [], activeSpecies = 'all', horizon = '1m', onOpenInOrion }) {
  // Prefer Mexican MXN/kg series first for practical plant-cost calculation, while allowing any market
  const selectable = useMemo(() => {
    const valid = (Array.isArray(forecasts) ? forecasts : []).filter((f) => f?.available && f.primaryForecast && f.lastValue > 0);
    const bySpecies = activeSpecies && activeSpecies !== 'all'
      ? valid.filter((f) => f.species === activeSpecies)
      : valid;
    const pool = bySpecies.length ? bySpecies : valid;
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
  const [fxShockPct, setFxShockPct] = useState(0);
  const [inventoryDays, setInventoryDays] = useState(15);
  const [feedShockPct, setFeedShockPct] = useState(0);
  const [salePrice, setSalePrice] = useState('');

  const selected = useMemo(() => {
    if (!selectable.length) return null;
    return selectable.find((item) => item.symbol === symbol) || selectable[0];
  }, [selectable, symbol]);

  useEffect(() => {
    if (selected && selected.symbol !== symbol) {
      setSymbol(selected.symbol);
      const isImport = selected.region !== 'MX' && selected.currency !== 'MXN';
      const baseMxn = toMxnPerKg(selected.lastValue, selected.unit, selected.currency, usdMxn).mxnKg;
      const suggested = Number(((baseMxn + (isImport ? 4.5 : 2.5)) * 1.14).toFixed(2));
      setSalePrice(String(suggested));
      setFreightPerKg(isImport ? 4.5 : 2.5);
      setTariffPct(isImport ? 5 : 0);
    }
  }, [selected, symbol, usdMxn]);

  const activeHorizon = useMemo(() => {
    if (!selected) return null;
    const list = Array.isArray(selected.horizons) ? selected.horizons : [];
    return list.find((h) => h.code === horizon) || selected.primaryForecast;
  }, [selected, horizon]);

  const scenarios = useMemo(() => {
    if (!selected || !activeHorizon) return null;
    const vol = Math.max(1, Number(volumeKg) || 1);
    const freight = Math.max(0, Number(freightPerKg) || 0);
    const shrink = Math.min(45, Math.max(0, Number(shrinkagePct) || 0)) / 100;
    const tariff = Math.min(50, Math.max(0, Number(tariffPct) || 0)) / 100;
    const fxBase = Math.max(1, Number(usdMxn) || 19.2);
    const fxEffective = fxBase * (1 + (Number(fxShockPct) || 0) / 100);
    const days = Math.min(180, Math.max(0, Number(inventoryDays) || 0));
    // Costo financiero estimado con referencia TIIE ~6.6% anual
    const financingFactor = (0.066 * days) / 365;
    // Sensibilidad de ración (maíz + pasta de soya ~65% del costo de producción)
    const feedAdjFactor = 1 + ((Number(feedShockPct) || 0) / 100) * 0.65;
    const netFactor = Math.max(0.55, 1 - shrink);
    const spotConv = toMxnPerKg(selected.lastValue, selected.unit, selected.currency, fxEffective);
    const sell = Math.max(0.01, Number(salePrice) || spotConv.mxnKg * 1.14);

    const calc = (name, tag, rawRefPrice) => {
      const conv = toMxnPerKg(rawRefPrice, selected.unit, selected.currency, fxEffective);
      const baseMxnKg = conv.mxnKg * feedAdjFactor;
      const tariffCost = baseMxnKg * tariff;
      const landedBeforeFin = baseMxnKg + tariffCost + freight;
      const finCost = landedBeforeFin * financingFactor;
      const landed = landedBeforeFin + finCost;
      const costPerSellable = landed / netFactor;
      const totalBatchCost = landed * vol;
      const sellableUnits = vol * netFactor;
      const grossMarginPerUnit = sell - costPerSellable;
      const grossMarginPct = (grossMarginPerUnit / sell) * 100;
      const netProfit = grossMarginPerUnit * sellableUnits;
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
      cashFlowDeltaBase: base.totalBatchCost - spot.totalBatchCost,
      cashFlowDeltaStress: stressP90.totalBatchCost - spot.totalBatchCost,
      currency: 'MXN',
      unit: 'MXN/kg',
      rawUnit: selected.unit || '',
      factorLabel: spotConv.factorLabel,
      fxEffective,
    };
  }, [selected, activeHorizon, volumeKg, freightPerKg, shrinkagePct, tariffPct, usdMxn, fxShockPct, inventoryDays, feedShockPct, salePrice]);

  if (!selected || !scenarios) return null;

  return (
    <div className="mp-sim-box" aria-label="Simulador de Márgenes y Costo de Ración ORION ML">
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
                  feedShockPct: Number(feedShockPct) || 0,
                  salePrice: Number(salePrice) || 0,
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
          <span>USD/MXN base</span>
          <input
            type="number"
            min="10"
            max="40"
            step="0.1"
            value={usdMxn}
            onChange={(e) => setUsdMxn(e.target.value)}
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
          <span>Días inventario (TIIE)</span>
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
          <span>Choque Maíz/Soya (±%)</span>
          <input
            type="number"
            min="-30"
            max="40"
            step="1"
            value={feedShockPct}
            onChange={(e) => setFeedShockPct(e.target.value)}
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

      <div className="mp-sim-grid">
        {[scenarios.spot, scenarios.base, scenarios.lowP80, scenarios.stressP90].map((sc) => {
          const marginPos = sc.grossMarginPct >= 0;
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
                  {sc.grossMarginPct > 0 ? '+' : ''}{fmtMoney(sc.grossMarginPct, 1)}% ({fmtMoney(sc.grossMarginPerUnit)})
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
    </div>
  );
}
