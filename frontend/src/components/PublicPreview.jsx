import { useState } from 'react';
import PublicIcon from './PublicIcon.jsx';

const previews = {
  report: { label: 'UNA EDICIÓN. UNA PERSPECTIVA.', tabs: ['Finanzas', 'Mercados', 'México'] },
  finance: { label: 'EL PULSO DE LOS MERCADOS', tabs: ['Bolsas', 'Bonos', 'Divisas'] },
  markets: { label: 'DEL ORIGEN AL CONTEXTO', tabs: ['Granos', 'Porcino', 'Materias primas'] },
  mexico: { label: 'UNA MIRADA LOCAL. UN MUNDO CONECTADO.', tabs: ['Bolsa', 'Producción', 'Contexto'] },
  orion: { label: 'UNA PREGUNTA ABRE EL CAMINO', tabs: ['Investiga', 'Relaciona', 'Prepara'] },
  method: { label: 'EL CRITERIO EMPIEZA EN LA EVIDENCIA', tabs: ['Fuente', 'Fecha', 'Unidad'] },
  access: { label: 'TU PRÓXIMA PERSPECTIVA', tabs: ['Ya tengo cuenta', 'Necesito acceso'] },
};

function ReportPreview({ active }) {
  return <div className="pp-report-scene" aria-hidden="true">
    <div className="pp-report-sheet pp-report-back" />
    <div className="pp-report-sheet pp-report-front" data-loop>
      <div className="pp-report-brand">VALL<span>News</span><small>UNA PERSPECTIVA GLOBAL</small></div>
      <span className="pp-report-edition">EDICIÓN ILUSTRATIVA</span>
      <strong>{['Panorama financiero.', 'Mercados productivos.', 'La perspectiva de México.'][active]}</strong>
      <div className="pp-report-rule" /><div className="pp-report-lines"><i /><i /><i /></div>
      <svg viewBox="0 0 250 95" fill="none"><path d="M0 75H250M0 40H250" stroke="#d9e2ed" /><path className="pp-draw-line" d={['M0 70Q25 25 50 48T100 39T150 28T200 32T250 12', 'M0 60Q30 40 60 54T120 28T180 44T250 19', 'M0 72Q25 65 50 48T110 60T170 27T250 17'][active]} stroke="#2a527b" strokeWidth="2" pathLength="1" data-loop /></svg>
      <div className="pp-report-bottom"><span>Datos · Contexto · Fuentes</span><span>01</span></div>
      <div className="pp-report-watermark">VALLNews</div>
    </div>
  </div>;
}

function FinancePreview({ active }) {
  const lines = ['M25 210C65 210 55 140 95 165S155 75 192 119S260 100 287 82S340 93 390 38', 'M25 95C75 65 79 141 120 112S178 161 218 133S293 165 330 141S365 147 390 117', 'M25 167C65 135 70 162 105 126S172 157 205 111S257 123 293 84S349 112 390 67'];
  return <div className="pp-finance-scene" aria-hidden="true">
    <div className="pp-finance-heading"><span>{['BOLSAS', 'BONOS', 'DIVISAS'][active]}</span><span className="pp-signal"><i /> PERSPECTIVA</span></div>
    <svg viewBox="0 0 420 260" fill="none">
      {[45, 95, 145, 195, 235].map(y => <path key={y} d={`M25 ${y}H395`} stroke="currentColor" opacity=".12" strokeDasharray="2 5" />)}
      <path d="M25 195Q100 150 165 163T280 118T390 95" stroke="currentColor" opacity=".2" strokeDasharray="5 6" />
      <path className="pp-draw-line" key={active} d={lines[active]} stroke="currentColor" strokeWidth="2.5" pathLength="1" data-loop />
      <path d="M25 20V235H395" stroke="currentColor" opacity=".15" />
      <circle cx="390" cy={[38, 117, 67][active]} r="5" fill="currentColor" /><circle className="pp-pulse" cx="390" cy={[38, 117, 67][active]} r="11" stroke="currentColor" data-loop />
    </svg>
    <div className="pp-finance-legend"><span><i /> Evolución ilustrativa</span><span>Compara. Relaciona. Comprende.</span></div>
  </div>;
}

function MarketsPreview({ active }) {
  const names = [['Producción', 'Comercio', 'Referencias'], ['Origen', 'Demanda', 'Mercado'], ['Oferta', 'Intercambio', 'Contexto']][active];
  return <div className="pp-chain-scene" aria-hidden="true">
    <svg className="pp-chain-paths" viewBox="0 0 420 300" fill="none"><path d="M90 65C90 120 330 80 330 150S90 200 90 245" stroke="currentColor" opacity=".2" /><path className="pp-flow" d="M90 65C90 120 330 80 330 150S90 200 90 245" stroke="currentColor" strokeWidth="2" data-loop /></svg>
    {names.map((name, i) => <div key={name} className={`pp-chain-step pp-chain-step-${i}`}><PublicIcon kind={i === 0 ? 'markets' : i === 1 ? 'finance' : 'report'} /><div><small>0{i + 1}</small><strong>{name}</strong></div><span>↗</span></div>)}
  </div>;
}

function MexicoPreview({ active }) {
  const labels = ['Referencias financieras', 'Mercados productivos', 'Panorama internacional'];
  return <div className="pp-mexico-scene" aria-hidden="true">
    <svg viewBox="0 0 420 300" fill="none">
      <ellipse className="pp-orbit" cx="210" cy="148" rx="158" ry="95" stroke="currentColor" strokeDasharray="2 8" data-loop />
      <circle cx="210" cy="148" r="64" stroke="currentColor" opacity=".25" />
      <path d="M210 148Q100 15 47 75M210 148Q345 20 374 100M210 148Q310 260 355 246" stroke="currentColor" opacity=".25" />
      <path className="pp-flow" d={['M210 148Q100 15 47 75', 'M210 148Q310 260 355 246', 'M210 148Q345 20 374 100'][active]} stroke="currentColor" strokeWidth="2" data-loop />
      <circle cx="47" cy="75" r="5" fill="currentColor" /><circle cx="374" cy="100" r="5" fill="currentColor" /><circle cx="355" cy="246" r="5" fill="currentColor" />
      <text x="47" y="53" textAnchor="middle">América</text><text x="374" y="78" textAnchor="middle">Europa</text><text x="355" y="276" textAnchor="middle">Mercados</text>
    </svg>
    <div className="pp-mexico-center"><PublicIcon kind="mexico" /><strong>México</strong></div>
    <div className="pp-scene-caption">{labels[active]}</div>
  </div>;
}

function OrionPreview({ active }) {
  const prompts = ['Parte de una pregunta concreta.', 'Encuentra relaciones con contexto.', 'Organiza una perspectiva que puedas revisar.'];
  return <div className="pp-orion-scene" aria-hidden="true">
    <svg viewBox="0 0 420 260" fill="none"><circle className="pp-orbit" cx="210" cy="120" r="92" stroke="currentColor" strokeDasharray="2 9" data-loop /><path d="m91 173 94-135 135 83-229 52Z" stroke="currentColor" opacity=".3" /><path className="pp-flow" d="m91 173 94-135 135 83-229 52Z" stroke="currentColor" strokeWidth="2" data-loop />{[[91,173],[185,38],[320,121]].map(([x,y],i)=><g key={x}><circle cx={x} cy={y} r={active === i ? 5 : 3} fill="currentColor" /><circle className={active === i ? 'pp-pulse' : ''} cx={x} cy={y} r="11" stroke="currentColor" opacity={active === i ? .6 : .15} data-loop={active === i ? 'true' : undefined} /></g>)}</svg>
    <strong className="pp-orion-name">ORION<span>NUESTRA INTELIGENCIA. TU PERSPECTIVA.</span></strong>
    <div className="pp-orion-prompt"><span>↳</span><p key={active}>{prompts[active]}</p><i /></div>
  </div>;
}

function MethodPreview({ active }) {
  const items = [['Fuente', '¿De dónde viene el dato?'], ['Fecha', '¿A qué corte pertenece?'], ['Unidad', '¿Qué estás comparando?']];
  return <div className="pp-method-scene" aria-hidden="true"><div className="pp-method-heading"><PublicIcon kind="method" /><span>UNA LECTURA REVISABLE</span></div>{items.map(([name, question], i) => <div className="pp-method-row" data-selected={i === active ? 'true' : 'false'} key={name}><span>{i < active ? '✓' : `0${i + 1}`}</span><div><strong>{name}</strong><p>{question}</p></div><i className={i === active ? 'pp-pulse' : undefined} data-loop={i === active ? 'true' : undefined} /></div>)}</div>;
}

function AccessPreview({ active }) {
  return <div className="pp-access-scene" aria-hidden="true"><div className="pp-access-icon"><PublicIcon kind="access" /><span className="pp-access-orbit" data-loop /></div><strong>{active === 0 ? 'Tu cuenta. Tu perspectiva.' : 'Empieza en tu organización.'}</strong><p>{active === 0 ? 'Entra a tus herramientas y continúa explorando.' : 'Solicita acceso al administrador de tu organización.'}</p><div className="pp-access-steps"><span>Organización</span><i /><span>Tu cuenta</span><i /><span>VALLNews</span></div></div>;
}

const scenes = { report: ReportPreview, finance: FinancePreview, markets: MarketsPreview, mexico: MexicoPreview, orion: OrionPreview, method: MethodPreview, access: AccessPreview };

export default function PublicPreview({ kind, moving }) {
  const [active, setActive] = useState(0);
  const preview = previews[kind], Scene = scenes[kind];
  return <figure className="public-experience-visual" data-motion={moving ? 'true' : 'false'} aria-label={`Exploración ilustrativa: ${preview.tabs[active]}`}>
    <div className="pp-preview-top"><span><i /> {preview.label}</span><small>VALLNEWS</small></div>
    <div className="pp-preview-scene"><Scene active={active} /></div>
    <div className="pp-preview-tabs" role="group" aria-label="Explorar esta perspectiva">{preview.tabs.map((tab, i) => <button type="button" key={tab} aria-pressed={active === i} onClick={() => setActive(i)}>{tab}</button>)}</div>
    <figcaption>Vista ilustrativa{kind === 'finance' ? ' · Sin cotizaciones en tiempo real' : ' · Explora cada perspectiva'}</figcaption>
  </figure>;
}
