import './FinanceModuleCards.css';

const MODULOS = [
  {
    id: 'bolsa', titulo: 'Bolsa', categoria: 'Renta variable', numero: '01',
    descripcion: 'Sigue los índices y descubre qué mueve a las empresas y a los mercados del mundo.',
    referencia: 'S&P 500', unidad: 'puntos', accion: 'Explorar Bolsa',
    grafica: 'Evolución reciente', delta: true,
    imagen: '/assets/img/finance/bolsa.webp', ancho: 900, alto: 600,
  },
  {
    id: 'rendimientos', titulo: 'Bonos', categoria: 'Renta fija', numero: '02',
    descripcion: 'Pon las tasas en perspectiva. Compara deuda soberana, plazos y rendimientos.',
    referencia: 'US 10 años', unidad: 'rendimiento anual', accion: 'Explorar bonos',
    grafica: 'Curva por vencimiento',
    imagen: '/assets/img/finance/bonos.webp', ancho: 900, alto: 1125,
  },
  {
    id: 'divisas', titulo: 'Divisas', categoria: 'Mercado cambiario', numero: '03',
    descripcion: 'Conecta monedas y economías. Explora tipos de cambio y la fortaleza del dólar.',
    referencia: 'EUR / USD', unidad: 'USD por EUR', accion: 'Explorar divisas',
    grafica: 'Evolución del par', delta: true,
    imagen: '/assets/img/finance/divisas.webp', ancho: 900, alto: 600,
  },
];

function Simbolo({ modulo }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
      <circle className="fmc-symbol-orbit" cx="48" cy="48" r="39" stroke="currentColor" strokeOpacity=".2" />
      <circle cx="48" cy="48" r="30" stroke="currentColor" strokeOpacity=".12" />
      {modulo === 'bolsa' ? <>
        <path d="M29 58V46m13 12V34m13 24V40m13 18V27" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M25 68h48" stroke="currentColor" strokeOpacity=".5" strokeLinecap="round" />
      </> : modulo === 'rendimientos' ? <>
        <path d="m25 34 23-12 23 12H25Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M31 41v21m11-21v21m12-21v21m11-21v21M26 69h44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </> : <>
        <path d="M26 37h43l-9-9M70 59H27l9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="37" cy="59" r="12" fill="currentColor" fillOpacity=".07" />
        <circle cx="60" cy="37" r="12" fill="currentColor" fillOpacity=".07" />
      </>}
      <circle className="fmc-symbol-point" cx="48" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}

/** Conserva los destinos y los IDs que actualiza el motor financiero existente. */
export default function FinanceModuleCards() {
  return (
    <section className="ff-modules finance-module-cards" aria-label="Módulos financieros">
      {MODULOS.map(modulo => (
        <article key={modulo.id} className="ff-module ffm-card fmc-card" data-module={modulo.id} aria-labelledby={`fmc-title-${modulo.id}`}>
          <img className="fmc-photo" src={modulo.imagen} alt="" width={modulo.ancho} height={modulo.alto} decoding="async" draggable="false" />
          <div className="fmc-content">
            <div className="fmc-topline"><span>{modulo.categoria}</span><span className="fmc-number" aria-hidden="true">{modulo.numero} / 03</span></div>
            <header className="fmc-heading"><h2 id={`fmc-title-${modulo.id}`}>{modulo.titulo}</h2><div className="fmc-symbol"><Simbolo modulo={modulo.id} /></div></header>
            <p className="fmc-description">{modulo.descripcion}</p>
            <div className="fmc-reference">
              <div className="fmc-quote">
                <span className="fmc-reference-label">{modulo.referencia}</span>
                <div className="fmc-value"><strong id={`ff-tile-${modulo.id}`}>—</strong>{modulo.delta && <i id={`ff-tile-${modulo.id}-delta`} />}</div>
                <small className="fmc-unit">{modulo.unidad}</small>
              </div>
              <div className="fmc-chart"><div className="fmc-spark" aria-hidden="true"><canvas id={`ff-spark-${modulo.id}`} /></div><small>{modulo.grafica}</small></div>
            </div>
            <button className="fmc-link" type="button" data-open-module={modulo.id}><span>{modulo.accion}</span><span className="fmc-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span></button>
          </div>
        </article>
      ))}
    </section>
  );
}
