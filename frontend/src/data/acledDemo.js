/*
 * Conjunto de eventos de demostración del mapa de riesgos.
 *
 * ACLED no permite llamadas directas desde el navegador (bloquea por CORS) y la
 * clave normalmente no está configurada, así que en la práctica esto es lo que
 * se ve casi siempre. Va etiquetado como demo en la interfaz: el usuario ve un
 * aviso explícito de que no son eventos en vivo.
 *
 * Estaba incrustado dentro del <script> de pages/geopolitica.html. Aquí es un
 * módulo de datos aparte para que el componente del mapa quede legible.
 */
const acledDemo = [
  // ── Estados Unidos ─────────────────────────────────────────────────────────
  { latitude: '38.90', longitude: '-77.04', event_type: 'Strategic developments', country: 'Estados Unidos', location: 'Washington D.C.', event_date: '2026-06-10', fatalities: '0', notes: 'Nuevos aranceles a importaciones de acero y semiconductores; tensiones con aliados comerciales en el G7 y negociaciones paralelas con China.', category: 'politico' },
  { latitude: '40.71', longitude: '-74.01', event_type: 'Protests', country: 'Estados Unidos', location: 'Nueva York', event_date: '2026-06-09', fatalities: '0', notes: 'Manifestaciones en Wall Street contra medidas de política monetaria restrictiva y recortes en gasto social.', category: 'economico' },

  // ── Conflicto armado ───────────────────────────────────────────────────────
  { latitude: '50.45', longitude: '30.52', event_type: 'Battles', country: 'Ucrania', location: 'Kyiv', event_date: '2026-06-10', fatalities: '8', notes: 'Combates en área metropolitana.', category: 'armado' },
  { latitude: '49.99', longitude: '36.23', event_type: 'Explosions/Remote violence', country: 'Ucrania', location: 'Járkiv', event_date: '2026-06-10', fatalities: '3', notes: 'Impacto de misiles en zona residencial.', category: 'armado' },
  { latitude: '47.10', longitude: '37.54', event_type: 'Battles', country: 'Ucrania', location: 'Mariúpol', event_date: '2026-06-09', fatalities: '14', notes: 'Enfrentamientos en línea de contacto.', category: 'armado' },
  { latitude: '31.77', longitude: '35.21', event_type: 'Explosions/Remote violence', country: 'Israel', location: 'Jerusalén', event_date: '2026-06-09', fatalities: '2', notes: 'Intercambio de fuego en zona fronteriza.', category: 'armado' },
  { latitude: '33.51', longitude: '36.29', event_type: 'Battles', country: 'Siria', location: 'Damasco', event_date: '2026-06-09', fatalities: '5', notes: 'Enfrentamientos entre facciones armadas.', category: 'armado' },
  { latitude: '15.55', longitude: '32.53', event_type: 'Battles', country: 'Sudán', location: 'Jartum', event_date: '2026-06-09', fatalities: '21', notes: 'Combates intensos en la capital sudanesa.', category: 'armado' },
  { latitude: '12.36', longitude: '43.14', event_type: 'Explosions/Remote violence', country: 'Yemen', location: 'Adén', event_date: '2026-06-08', fatalities: '6', notes: 'Ataque con misiles contra infraestructura portuaria.', category: 'armado' },
  { latitude: '9.05', longitude: '7.49', event_type: 'Violence against civilians', country: 'Nigeria', location: 'Abuja', event_date: '2026-06-07', fatalities: '12', notes: 'Ataque de grupos armados a comunidad rural del norte.', category: 'armado' },
  { latitude: '4.36', longitude: '18.55', event_type: 'Battles', country: 'RCA', location: 'Bangui', event_date: '2026-06-07', fatalities: '7', notes: 'Enfrentamientos entre grupos armados.', category: 'armado' },
  { latitude: '4.71', longitude: '-74.07', event_type: 'Battles', country: 'Colombia', location: 'Bogotá', event_date: '2026-06-09', fatalities: '3', notes: 'Combates con grupos armados irregulares.', category: 'armado' },

  // ── Unrest social ──────────────────────────────────────────────────────────
  { latitude: '-1.29', longitude: '36.82', event_type: 'Riots', country: 'Kenia', location: 'Nairobi', event_date: '2026-06-08', fatalities: '1', notes: 'Disturbios tras protestas por subida de impuestos.', category: 'social' },
  { latitude: '28.63', longitude: '77.21', event_type: 'Riots', country: 'India', location: 'Nueva Delhi', event_date: '2026-06-07', fatalities: '2', notes: 'Disturbios comunitarios en barrios periféricos.', category: 'social' },
  { latitude: '35.69', longitude: '51.39', event_type: 'Protests', country: 'Irán', location: 'Teherán', event_date: '2026-06-09', fatalities: '0', notes: 'Protestas sociales por derechos civiles y libertades individuales.', category: 'social' },
  { latitude: '-33.45', longitude: '-70.67', event_type: 'Protests', country: 'Chile', location: 'Santiago', event_date: '2026-06-08', fatalities: '0', notes: 'Movilización estudiantil y sindical por reforma educativa.', category: 'social' },
  { latitude: '-0.23', longitude: '-78.52', event_type: 'Protests', country: 'Ecuador', location: 'Quito', event_date: '2026-06-07', fatalities: '0', notes: 'Protesta indígena por derechos territoriales y consulta previa.', category: 'social' },
  { latitude: '55.75', longitude: '37.62', event_type: 'Protests', country: 'Rusia', location: 'Moscú', event_date: '2026-06-08', fatalities: '0', notes: 'Manifestaciones antibelicistas disueltas por fuerzas de seguridad.', category: 'social' },
  { latitude: '-26.32', longitude: '31.13', event_type: 'Riots', country: 'Suazilandia', location: 'Mbabane', event_date: '2026-06-05', fatalities: '3', notes: 'Disturbios por demanda de apertura democrática.', category: 'social' },

  // ── Eventos políticos ──────────────────────────────────────────────────────
  { latitude: '16.87', longitude: '96.17', event_type: 'Strategic developments', country: 'Myanmar', location: 'Naipyidó', event_date: '2026-06-10', fatalities: '0', notes: 'Junta militar emite decreto restringiendo libertad de prensa y acceso a internet.', category: 'politico' },
  { latitude: '10.48', longitude: '-66.86', event_type: 'Strategic developments', country: 'Venezuela', location: 'Caracas', event_date: '2026-06-09', fatalities: '0', notes: 'Crisis institucional por disputa electoral no resuelta; oposición denuncia fraude.', category: 'politico' },
  { latitude: '18.54', longitude: '-72.34', event_type: 'Strategic developments', country: 'Haití', location: 'Puerto Príncipe', event_date: '2026-06-08', fatalities: '0', notes: 'Colapso de autoridad estatal; pandillas controlan el 80% de la capital.', category: 'politico' },
  { latitude: '12.65', longitude: '-8.00', event_type: 'Strategic developments', country: 'Mali', location: 'Bamako', event_date: '2026-06-07', fatalities: '0', notes: 'Gobierno de transición amplía mandato sin consulta popular y expulsa misiones de la ONU.', category: 'politico' },
  { latitude: '53.90', longitude: '27.57', event_type: 'Strategic developments', country: 'Bielorrusia', location: 'Minsk', event_date: '2026-06-06', fatalities: '0', notes: 'Detención masiva de opositores políticos y periodistas independientes.', category: 'politico' },
  { latitude: '-12.05', longitude: '-77.04', event_type: 'Strategic developments', country: 'Perú', location: 'Lima', event_date: '2026-06-09', fatalities: '0', notes: 'Crisis de gobernabilidad: quinto gabinete ministerial en dos años de gobierno.', category: 'politico' },
  { latitude: '41.69', longitude: '44.83', event_type: 'Strategic developments', country: 'Georgia', location: 'Tiflis', event_date: '2026-06-08', fatalities: '0', notes: 'Protestas masivas por ley de influencia extranjera; crisis de orientación geopolítica UE vs Rusia.', category: 'politico' },

  // ── Crisis económicas ──────────────────────────────────────────────────────
  { latitude: '-34.60', longitude: '-58.38', event_type: 'Protests', country: 'Argentina', location: 'Buenos Aires', event_date: '2026-06-10', fatalities: '0', notes: 'Huelga general contra devaluación del peso y medidas de austeridad exigidas por el FMI.', category: 'economico' },
  { latitude: '37.97', longitude: '23.72', event_type: 'Protests', country: 'Grecia', location: 'Atenas', event_date: '2026-06-09', fatalities: '0', notes: 'Trabajadores en huelga contra nuevos recortes de pensiones y reformas laborales.', category: 'economico' },
  { latitude: '33.72', longitude: '73.04', event_type: 'Protests', country: 'Pakistán', location: 'Islamabad', event_date: '2026-06-08', fatalities: '0', notes: 'Protestas masivas contra el acuerdo con el FMI y el alza del precio del combustible.', category: 'economico' },
  { latitude: '48.86', longitude: '2.35', event_type: 'Protests', country: 'Francia', location: 'París', event_date: '2026-06-07', fatalities: '0', notes: 'Huelga de sindicatos contra reforma de pensiones; paralización parcial del transporte público.', category: 'economico' },
  { latitude: '6.92', longitude: '79.84', event_type: 'Strategic developments', country: 'Sri Lanka', location: 'Colombo', event_date: '2026-06-06', fatalities: '0', notes: 'Crisis de deuda soberana: negociación de reestructuración con acreedores internacionales.', category: 'economico' },
  { latitude: '39.93', longitude: '32.85', event_type: 'Protests', country: 'Turquía', location: 'Ankara', event_date: '2026-06-05', fatalities: '0', notes: 'Protestas por hiperinflación acumulada y desplome de la lira turca frente al dólar.', category: 'economico' },
  { latitude: '23.13', longitude: '113.26', event_type: 'Protests', country: 'China', location: 'Guangzhou', event_date: '2026-06-08', fatalities: '0', notes: 'Huelga de trabajadores fabriles por impago de salarios en zona industrial.', category: 'economico' },
  { latitude: '-9.43', longitude: '-75.54', event_type: 'Protests', country: 'Perú', location: 'Cusco', event_date: '2026-06-08', fatalities: '0', notes: 'Comunidades mineras bloquean operaciones de extracción de cobre por regalías insuficientes.', category: 'economico' },
  { latitude: '30.04', longitude: '31.24', event_type: 'Protests', country: 'Egipto', location: 'El Cairo', event_date: '2026-06-07', fatalities: '0', notes: 'Protestas por alza del precio del pan y recortes de subsidios alimentarios estatales.', category: 'economico' },
];

export default acledDemo;

/* País → fila de la tabla "Noticias por Región". */
export const REGION_POR_PAIS = {
  Ucrania: 'europa', Rusia: 'europa', Bielorrusia: 'europa', Georgia: 'europa',
  Francia: 'europa', Grecia: 'europa', Turquía: 'europa', Alemania: 'europa',
  España: 'europa', Italia: 'europa', Polonia: 'europa', 'Reino Unido': 'europa',
  China: 'asia', India: 'asia', Pakistán: 'asia', Myanmar: 'asia',
  'Sri Lanka': 'asia', Irán: 'asia', Afganistán: 'asia', Filipinas: 'asia',
  Indonesia: 'asia', Tailandia: 'asia', 'Corea del Norte': 'asia',
  Colombia: 'latam', Argentina: 'latam', Venezuela: 'latam', Ecuador: 'latam',
  Chile: 'latam', Perú: 'latam', Haití: 'latam', México: 'latam',
  Brasil: 'latam', Bolivia: 'latam', Guatemala: 'latam', Honduras: 'latam',
  Israel: 'global', Siria: 'global', Yemen: 'global', Egipto: 'global',
  Sudán: 'global', Irak: 'global', Libia: 'global', Nigeria: 'global',
  RCA: 'global', Kenia: 'global', Mali: 'global', Suazilandia: 'global',
  Etiopía: 'global', Somalia: 'global',
  'Estados Unidos': 'usa', USA: 'usa', Canadá: 'usa',
};

/* Palabras que delatan un evento de raíz económica dentro de las notas. */
const PALABRAS_ECON = [
  'econom', 'huelga', 'strike', 'sanction', 'sanción', 'aranceles', 'tariff',
  'inflaci', 'inflation', 'crisis', 'deuda', 'debt', 'fiscal', 'austerid', 'austerity',
  'wage', 'salario', 'desempleo', 'unemployment', 'imf', 'fmi', 'currency', 'divisa',
  'devaluac', 'devaluation', 'precio', 'price', 'combustible', 'fuel', 'pensión', 'pension',
];

export function categoriaDe(ev) {
  if (ev.category) return ev.category;            // los datos de demo la traen explícita
  const tipo = ev.event_type || '';
  if (tipo === 'Battles' || tipo === 'Explosions/Remote violence' || tipo === 'Violence against civilians') return 'armado';
  if (tipo === 'Riots') return 'social';
  const notas = (ev.notes || '').toLowerCase();
  const esEcon = PALABRAS_ECON.some((w) => notas.includes(w));
  if (tipo === 'Protests') return esEcon ? 'economico' : 'social';
  if (tipo === 'Strategic developments') return esEcon ? 'economico' : 'politico';
  return 'social';
}
