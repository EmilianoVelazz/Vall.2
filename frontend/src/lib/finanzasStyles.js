// Una sola lista para la pantalla y su precarga; evita versiones y capas obsoletas.
import { DARK_PILOT, ESQUELETO } from './hojasComunes.js';

export const HOJAS_FINANZAS = [
  ...ESQUELETO,
  '/assets/css/finanzas-redesign-v2.css?v=2.8',
  '/assets/css/finanzas-debt-premium.css?v=3.1',
  '/assets/css/finanzas-favro.css?v=84',
  '/assets/css/finanzas-premium.css?v=116',
  '/assets/css/daily-news-favro.css?v=23',
  '/assets/css/sectors-board.css?v=3',
  '/assets/css/finanzas-world-map.css?v=13',
  '/assets/css/finanzas-bond-map.css?v=1',
  '/assets/css/finanzas-currency-map.css?v=3',
  '/assets/css/finanzas-responsive-v3.css?v=10',
  /* Apartado Divisas. Son 1.646 líneas para el banco de trabajo cambiario
     (.fx-history-*, .fx-market-search-*) y sin ellas ese panel se queda con el
     marcado desnudo: tabla sin formato, sin las pastillas de periodo ni el
     comparador. */
  '/assets/css/finanzas-fx-workspace.css?v=15',
  /* Tema general de Finanzas. Daily News añade debajo una capa estrictamente
     acotada para que su dirección editorial no herede los colores del tablero. */
  DARK_PILOT,
  '/assets/css/daily-news-editorial.css?v=14',
  '/assets/css/daily-news-coverage-window.css?v=1',
  '/assets/css/daily-news-story-index.css?v=2',
  '/assets/css/finanzas-fx-evolution.css?v=1',
  '/assets/css/finanzas-equity-analyzer.css?v=7',
  '/assets/css/finanzas-bonos-harmony.css?v=6',
  '/assets/css/finanzas-divisas-harmony.css?v=6',
  '/assets/css/finanzas-daily-harmony.css?v=3',
  /* Capa final: la portada Mercados define la paleta común para cada vista. */
  '/assets/css/finanzas-market-theme.css?v=28',
];
