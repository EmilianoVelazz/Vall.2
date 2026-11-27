const FIELDS = {
  usdMxn: [0.01, 1000],
  cornUsdTon: [0.01, 100000],
  soymealUsdTon: [0.01, 100000],
  otherFeedMxnKg: [0, 10000],
  cornSharePct: [0, 100],
  soySharePct: [0, 100],
  feedConversionKg: [0.01, 100],
  operatingCostMxnKg: [0, 100000],
  volumeKg: [0.01, 1e9],
  fxShockPct: [-90, 300],
  cornShockPct: [-90, 300],
  soyShockPct: [-90, 300],
};

const VALID_INGREDIENT_UNITS = new Set(['USD/t', 'MXN/kg']);

export function calculateFeedCostScenarios(input = {}) {
  const cornUnit = input.cornUnit || 'USD/t';
  const soyUnit = input.soyUnit || 'USD/t';

  if (!VALID_INGREDIENT_UNITS.has(cornUnit) || !VALID_INGREDIENT_UNITS.has(soyUnit)) {
    return { available: false, reason: 'Unidad de insumo no soportada (usa USD/t o MXN/kg).' };
  }

  const values = {};
  for (const [field, [min, max]] of Object.entries(FIELDS)) {
    const raw = input[field];
    if (
      raw == null ||
      typeof raw === 'boolean' ||
      typeof raw === 'object' ||
      (typeof raw === 'string' && !/^-?\d+(?:\.\d+)?$/.test(raw.trim()))
    ) {
      return { available: false, field, reason: 'Completa los supuestos con números y sus unidades.' };
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      return { available: false, field, reason: 'Revisa el rango permitido de los supuestos.' };
    }
    values[field] = value;
  }

  const cornShare = values.cornSharePct / 100;
  const soyShare = values.soySharePct / 100;
  if (cornShare + soyShare > 1 + 1e-12) {
    return {
      available: false,
      field: 'soySharePct',
      reason: 'Las participaciones de maíz y soya no pueden sumar más de 100%.',
    };
  }

  const calculate = (label, fx = 0, maize = 0, meal = 0) => {
    const usdMxn = values.usdMxn * (1 + fx / 100);
    const cornMxnKg =
      cornUnit === 'MXN/kg'
        ? values.cornUsdTon * (1 + maize / 100)
        : (values.cornUsdTon * (1 + maize / 100) * usdMxn) / 1000;
    const soyMxnKg =
      soyUnit === 'MXN/kg'
        ? values.soymealUsdTon * (1 + meal / 100)
        : (values.soymealUsdTon * (1 + meal / 100) * usdMxn) / 1000;
    const feedMxnKg =
      cornMxnKg * cornShare +
      soyMxnKg * soyShare +
      values.otherFeedMxnKg * Math.max(0, 1 - cornShare - soyShare);
    const costPerKg = feedMxnKg * values.feedConversionKg + values.operatingCostMxnKg;

    return {
      label,
      fxPct: fx,
      cornPct: maize,
      soyPct: meal,
      usdMxn,
      feedMxnKg,
      costPerKg,
      totalCost: costPerKg * values.volumeKg,
    };
  };

  const base = calculate('Caso base');
  if (base.costPerKg <= 0) {
    return { available: false, reason: 'El costo del caso base debe ser mayor que cero.' };
  }

  const rows = [
    base,
    calculate('Sólo dólar', values.fxShockPct),
    calculate('Sólo maíz', 0, values.cornShockPct),
    calculate('Sólo soya', 0, 0, values.soyShockPct),
    calculate('Combinado', values.fxShockPct, values.cornShockPct, values.soyShockPct),
  ];

  return {
    available: true,
    assumptions: { ...values, cornUnit, soyUnit },
    otherSharePct: Math.max(0, 100 - values.cornSharePct - values.soySharePct),
    unit: 'MXN/kg de peso ganado',
    rows: rows.map((row) => ({
      ...row,
      deltaPerKg: row.costPerKg - base.costPerKg,
      deltaTotal: row.totalCost - base.totalCost,
      deltaPct: (row.costPerKg / base.costPerKg - 1) * 100,
    })),
  };
}
