import { useMemo, useState } from 'react';
import {
  consumoPersonaDe, paisesConConsumo, ANIO, FUENTE,
} from '../lib/proteinas-mapa.js';
import { nombreEs } from '../lib/paises-es.js';

/*
 * «Lo que come una persona»: el reparto anual de carne y huevo de un habitante
 * del país que se elija.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El resto de Proteínas habla en millones de toneladas. Esa es la unidad del
 * mercado y no la de ninguna persona: 143 Mt de pollo no se pueden contrastar
 * con nada que nadie haya visto. La FAO publica la misma serie en kilos por
 * habitante y año, y esa cifra sí se puede comparar con la compra de la semana.
 *
 * ── El dónut, y por qué aquí sí ────────────────────────────────────────────
 * Un dónut solo vale para parte-de-un-todo de un vistazo y con pocos tramos.
 * Es exactamente este caso: cuatro proteínas que suman el plato entero, y la
 * pregunta es «de qué está hecho», no «cuál es mayor que cuál» —para eso están
 * los kilos al lado, que es la vista de tabla del mismo dato.
 *
 * ── El color va con la PROTEÍNA, nunca con su tamaño ───────────────────────
 * Los tramos se dibujan en el orden fijo de PROTEINAS (cerdo, pollo, res,
 * huevo) y cada una tiene su color clavado. Ordenarlos por tamaño repintaría el
 * dónut en cada cambio de país: el cerdo dejaría de ser azul en cuanto otro
 * país lo tuviera en otra posición, y quien hubiera aprendido el color estaría
 * leyendo mal el siguiente.
 *
 * Ese orden fijo es además lo que hace segura la paleta. Los cuatro tonos son
 * los cuatro primeros de la guía de visualización, escalonados para fondo
 * oscuro, y validados contra la superficie real de este panel (#1d2837) con
 * `scripts/validate_palette.js`: los cuatro pares que se tocan en el anillo
 * pasan (el peor, aqua↔amarillo, ΔE 8.4 en protanopía) y el par flojo
 * —amarillo↔naranja, ΔE 4.8— queda ENFRENTADO en el anillo, sin tocarse nunca.
 * Si se reordenan los tramos hay que volver a pasar el validador.
 */

/* Hex y no tokens `--mk-*`: estos cuatro son una paleta de datos validada como
   conjunto, no colores de la piel de la sección. Mezclarlos con los tokens
   invitaría a «armonizarlos» con el resto y eso rompe la validación. */
const COLOR = {
  cerdo: '#3987e5',
  pollo: '#d95926',
  res: '#199e70',
  huevo: '#c98500',
};

const R = 62;          // radio de la línea media del anillo
const GROSOR = 24;
const C = 2 * Math.PI * R;
/* Separador de 2px entre tramos, en unidades de circunferencia. Es un HUECO al
   color del fondo, no un borde: un contorno alrededor de cada tramo engorda el
   anillo y ensucia el color. */
const HUECO = 2;

const fmt = (v, d = 1) => v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function ConsumoPersona() {
  const [pais, setPais] = useState('Mexico');
  const [tocado, setTocado] = useState(null);

  const paises = useMemo(() => paisesConConsumo(), []);
  const datos = useMemo(() => consumoPersonaDe(pais), [pais]);

  /* Los tramos, con su desplazamiento acumulado. Se calculan aquí y no al
     pintar para que el acumulado no dependa del orden de render. */
  const tramos = useMemo(() => {
    if (!datos) return [];
    let acumulado = 0;
    return datos.filas.map((f) => {
      const largo = (f.pct / 100) * C;
      const t = { ...f, largo, offset: acumulado, medio: acumulado + largo / 2 };
      acumulado += largo;
      return t;
    });
  }, [datos]);

  if (!datos) {
    return (
      <section className="cp-panel" aria-labelledby="cp-t">
        <h3 id="cp-t">Lo que come una persona</h3>
        <p className="cp-vacio">La FAO no publica consumo por habitante para este país.</p>
      </section>
    );
  }

  const foco = tocado ? datos.filas.find((f) => f.clave === tocado) : null;

  return (
    <section className="cp-panel" aria-labelledby="cp-t">
      <header className="cp-head">
        <div>
          <span className="cp-kicker">
            <i className="fas fa-person" aria-hidden="true" /> Consumo por habitante
          </span>
          <h3 id="cp-t">Lo que come una persona en un año</h3>
        </div>

        {/* El selector va ARRIBA y fuera de la gráfica: es lo que decide todo lo
            que hay debajo, así que tiene que verse antes de leer nada. Un
            <select> nativo y no una lista propia — son ciento y pico países, y
            el nativo ya trae búsqueda por teclado, teclado completo y el
            desplegable a pantalla completa en el móvil. */}
        <label className="cp-selector mkt-pais-sel">
          <span>País</span>
          <select value={pais} onChange={(e) => { setPais(e.target.value); setTocado(null); }}>
            <option value="MUNDO">Mundo (media)</option>
            {paises.map((p) => (
              <option key={p.ne} value={p.ne}>{p.nombre}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="cp-cuerpo">
        {/* ── La silueta ───────────────────────────────────────────────────
            Dice de quién se habla sin una palabra: todo el panel está en «por
            persona» y el resto de la sección en millones de toneladas. */}
        <div className="cp-persona">
          <svg viewBox="0 0 40 96" aria-hidden="true" focusable="false">
            <circle cx="20" cy="11" r="9" />
            <path d="M20 23c-7.2 0-12 4.2-12 10.5V57c0 2 1.5 3.5 3.4 3.5h.6l.9 30c.1 2.5 2 4.5 4.4 4.5h5.4c2.4 0 4.3-2 4.4-4.5l.9-30h.6c1.9 0 3.4-1.5 3.4-3.5V33.5C32 27.2 27.2 23 20 23Z" />
          </svg>
          <div className="cp-total">
            <strong>{fmt(datos.total, 1)}<em>kg</em></strong>
            <span>al año de carne y huevo</span>
            <b>{fmt(datos.gramosDia, 0)} g al día</b>
          </div>
        </div>

        {/* ── El dónut ─────────────────────────────────────────────────────── */}
        <div className="cp-grafica">
          <svg viewBox="0 0 170 170" role="img" aria-label={`Reparto del consumo anual por habitante en ${pais === 'MUNDO' ? 'el mundo' : nombreEs(pais)}: ${datos.filas.map((f) => `${f.nombre} ${fmt(f.kg)} kilos`).join(', ')}`}>
            <g transform="translate(85 85) rotate(-90)">
              {/* El carril: sin él, un país con un solo tramo parece un anillo
                  roto en vez de uno lleno. */}
              <circle className="cp-carril" r={R} fill="none" strokeWidth={GROSOR} />
              {tramos.map((t) => (
                <circle
                  key={t.clave}
                  r={R}
                  fill="none"
                  stroke={COLOR[t.clave]}
                  strokeWidth={GROSOR}
                  /* El hueco se resta del tramo, no se añade: sumándolo, los
                     tramos se solapan y el último monta sobre el primero. */
                  strokeDasharray={`${Math.max(t.largo - HUECO, 0.5)} ${C - Math.max(t.largo - HUECO, 0.5)}`}
                  strokeDashoffset={-t.offset}
                  className={`cp-tramo${tocado && tocado !== t.clave ? ' es-apagado' : ''}`}
                  onMouseEnter={() => setTocado(t.clave)}
                  onMouseLeave={() => setTocado(null)}
                />
              ))}
            </g>

            {/* El centro es el sitio natural donde mira el ojo en un anillo, así
                que ahí va lo que se está señalando — y el total cuando no se
                señala nada. El texto va en tinta, nunca en el color del tramo:
                el color ya lo lleva el propio anillo. */}
            <g className="cp-centro" textAnchor="middle">
              {foco ? (
                <>
                  <text x="85" y="79" className="cp-centro-cifra">{fmt(foco.kg, 1)}</text>
                  <text x="85" y="94" className="cp-centro-lbl">kg de {foco.nombre.toLowerCase()}</text>
                  <text x="85" y="108" className="cp-centro-pct">{fmt(foco.pct, 0)}% del total</text>
                </>
              ) : (
                <>
                  <text x="85" y="82" className="cp-centro-cifra">{fmt(datos.total, 1)}</text>
                  <text x="85" y="97" className="cp-centro-lbl">kg al año</text>
                </>
              )}
            </g>
          </svg>
        </div>

        {/* ── El desglose ──────────────────────────────────────────────────
            Es a la vez la leyenda y la vista de tabla: cada proteína con su
            color, sus kilos y su parte. Sin esto, el reparto solo se podría
            leer por el color del anillo, que es justo lo que no puede pasar. */}
        <ul className="cp-desglose">
          {datos.filas.map((f) => (
            <li
              key={f.clave}
              className={tocado && tocado !== f.clave ? 'es-apagado' : undefined}
              onMouseEnter={() => setTocado(f.clave)}
              onMouseLeave={() => setTocado(null)}
            >
              <i style={{ background: COLOR[f.clave] }} aria-hidden="true" />
              <span>{f.nombre}</span>
              <strong>{fmt(f.kg, 1)}<em>kg</em></strong>
              <b>{fmt(f.pct, 0)}%</b>
            </li>
          ))}
        </ul>
      </div>

      <p className="cp-pie">
        <i className="fas fa-circle-info" aria-hidden="true" />
        {pais === 'MUNDO'
          ? `Media mundial de ${ANIO}.`
          : `${nombreEs(pais)}, ${ANIO}: ${fmt(datos.total, 1)} kg al año frente a los ${fmt(datos.mundo, 1)} kg de la media mundial (${datos.vsMundo >= 0 ? '+' : ''}${fmt(datos.vsMundo, 0)}%). Lo que más pesa en el plato es ${datos.mayor.nombre.toLowerCase()}.`}
        {' '}Suministro alimentario por habitante según {FUENTE}; es lo que llega al consumidor, antes del desperdicio en casa. Los años estimados del mapa no traen esta cifra, así que este recuadro va siempre de {ANIO}.
      </p>
    </section>
  );
}
