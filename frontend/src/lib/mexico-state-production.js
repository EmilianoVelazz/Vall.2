/*
 * Producción estatal de México.
 *
 * Granos: Cierre de la Producción Agrícola 2025 de la DGSIAP. Los volúmenes
 * municipales, ciclos y modalidades se agregaron por entidad y cultivo.
 * Metales/minería: tabla 6.5 del Anuario Estadístico de la Minería Mexicana
 * 2024, edición 2025, elaborado por el Servicio Geológico Mexicano.
 *
 * No se mezclan estas cifras con precios de futuros: aquí se muestran
 * toneladas producidas y valor minero estatal, cada uno con su propio periodo.
 */

import production from '../../../shared/mexico-state-production.json' with { type: 'json' };
export const { GRAIN_SOURCE, STATE_GRAIN_PRODUCTION, MINING_SOURCE, STATE_MINING_PRODUCTION } = production;
