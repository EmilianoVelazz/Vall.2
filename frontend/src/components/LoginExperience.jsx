import { useEffect, useId, useRef, useState } from 'react';
import { animate, createScope, stagger, svg } from 'animejs';
import ConstelacionOrion from './ConstelacionOrion.jsx';
import { useAnimatedContent, useShowcasePointer } from '../lib/useShowcaseInteraction.js';

const PERSPECTIVAS = [
  { name: 'Mercados', title: 'Cada movimiento tiene un contexto.', text: 'Conecta bolsas, divisas y noticias para entender el panorama financiero.', note: 'ECONOMÍA / UNA VISIÓN GLOBAL' },
  { name: 'Proteínas', title: 'Una perspectiva desde el origen.', text: 'Explora la producción, el comercio y las conexiones del mercado de proteínas.', note: 'PRODUCCIÓN / CONEXIONES QUE IMPORTAN' },
  { name: 'ORION', title: 'Tu siguiente idea empieza con una pregunta.', text: 'Investiga, relaciona información y construye tu perspectiva con nuestro asistente.', note: 'ORION / INTELIGENCIA QUE CONECTA' },
];

function useExperienceMotion(root, moving) {
  useEffect(() => {
    if (!moving) return undefined;
    const element = root.current;
    let observer;
    let visibility;
    const scope = createScope({ root }).add(() => {
      animate('.lx-sphere', { opacity: [0, 1], scale: [.9, 1], duration: 1600, ease: 'out(4)' });
      animate(svg.createDrawable('.lx-market-line', 0, 1), { draw: ['0 0', '0 1'], duration: 2200, ease: 'inOut(3)' });
      const loops = [
        animate('.lx-satellite', { rotate: [0, 360], duration: 46000, loop: true, ease: 'linear' }),
        animate('.lx-node', { opacity: [.35, 1], duration: 2100, delay: stagger(160), alternate: true, loop: true, ease: 'inOutSine' }),
      ];
      let visible = true;
      const sync = () => loops.forEach(loop => { if (visible && !document.hidden) loop.resume(); else loop.pause(); });
      observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
      observer.observe(element);
      visibility = sync;
      document.addEventListener('visibilitychange', visibility);
      sync();
    });
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      scope.revert();
      element.querySelectorAll('.lx-market-line').forEach(path => ['draw', 'pathLength', 'stroke-dasharray', 'stroke-dashoffset'].forEach(attribute => path.removeAttribute(attribute)));
    };
  }, [root, moving]);
}

export default function LoginExperience() {
  const root = useRef(null);
  const id = useId().replace(/:/g, '');
  const [selected, setSelected] = useState(0);
  const [moving, setMoving] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMoving(!preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useExperienceMotion(root, moving);
  useShowcasePointer(root, moving);
  const copy = useAnimatedContent(selected, moving);
  const current = PERSPECTIVAS[copy.displayed];

  return <section className="lx-experience" ref={root} aria-labelledby="lx-headline" data-view={selected}>
    <div className="lx-intro">
      <p className="lx-eyebrow"><span /> INTELIGENCIA ECONÓMICA</p>
      <h2 id="lx-headline">El mundo, desde<br /><span>otra perspectiva.</span></h2>
    </div>
    <div className="lx-visual" data-pointer-surface aria-hidden="true">
      <div className="lx-sphere" data-pointer-layer>
        <div className="lx-sphere-light" />
        <svg viewBox="0 0 600 500" fill="none" className="lx-map" aria-hidden="true">
          <defs>
            <radialGradient id={`${id}-planet`} cx=".29" cy=".24" r=".88"><stop stopColor="#265eaa" stopOpacity=".3" /><stop offset=".5" stopColor="#12305b" stopOpacity=".45" /><stop offset="1" stopColor="#08182f" stopOpacity=".95" /></radialGradient>
            <linearGradient id={`${id}-edge`} x1="130" y1="80" x2="460" y2="430" gradientUnits="userSpaceOnUse"><stop stopColor="#a6ceff" /><stop offset=".4" stopColor="#80b7f6" stopOpacity=".42" /><stop offset="1" stopColor="#5483c4" stopOpacity=".04" /></linearGradient>
            <linearGradient id={`${id}-line`} x1="145" y1="350" x2="445" y2="185" gradientUnits="userSpaceOnUse"><stop stopColor="#619ef1" stopOpacity=".3" /><stop offset="1" stopColor="#d3e9ff" /></linearGradient>
            <clipPath id={`${id}-clip`}><circle cx="300" cy="250" r="174" /></clipPath>
          </defs>
          <path d="M300 25v13M300 462v13M65 250h13M522 250h13" stroke="#a7cafa" strokeOpacity=".4" />
          <circle cx="300" cy="250" r="213" stroke="#91baff" strokeOpacity=".12" strokeDasharray="1 9" />
          <circle cx="300" cy="250" r="195" stroke="#91baff" strokeOpacity=".08" />
          <circle cx="300" cy="250" r="174" fill={`url(#${id}-planet)`} stroke={`url(#${id}-edge)`} strokeWidth="1.2" />
          <g clipPath={`url(#${id}-clip)`} stroke="#7caef0" strokeWidth=".65" className="lx-meridians">
            {[-65, -35, 0, 35, 65].map(angle => <ellipse key={angle} cx="300" cy="250" rx="67" ry="174" transform={`rotate(${angle} 300 250)`} />)}
            {[149, 198, 250, 302, 351].map((y, index) => <ellipse key={y} cx="300" cy={y} rx={index === 0 || index === 4 ? 141 : 174} ry="28" transform="rotate(-22 300 250)" />)}
          </g>
          <g className="lx-market-view" data-active={selected === 0}>
            <path d="M145 325H455M150 280H450M163 235H437M191 190H409" stroke="#9dc4ff" strokeOpacity=".12" strokeDasharray="2 5" />
            <path className="lx-market-line" d="M151 331 178 320 204 334 230 287 255 299 285 252 307 264 334 220 359 240 389 206 414 218 443 172" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M151 331 178 320 204 334 230 287 255 299 285 252 307 264 334 220 359 240 389 206 414 218 443 172V348H151Z" fill="#76adff" fillOpacity=".035" />
            <circle className="lx-node" cx="443" cy="172" r="4" fill="#daecff" /><circle cx="443" cy="172" r="10" stroke="#a6cdff" strokeOpacity=".3" />
          </g>
          <g className="lx-protein-view" data-active={selected === 1}>
            <path d="M184 298Q226 188 300 225T419 193M184 298Q324 387 419 193M300 225Q360 296 358 335" stroke="#a9d0ff" strokeOpacity=".7" strokeWidth="1.5" />
            {[[184, 298], [300, 225], [419, 193], [358, 335]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="18" fill="#0c2444" stroke="#8ab9f9" strokeOpacity=".5" /><circle className="lx-node" cx={x} cy={y} r="4" fill="#c4e0ff" /></g>)}
            <g fill="#b1cbef" fontSize="9" letterSpacing="2"><text x="156" y="337">ORIGEN</text><text x="265" y="194">COMERCIO</text><text x="387" y="164">MERCADO</text></g>
          </g>
          <g className="lx-satellite"><ellipse cx="300" cy="250" rx="241" ry="91" transform="rotate(-29 300 250)" stroke="#b3d5ff" strokeOpacity=".3" /><circle cx="511" cy="134" r="3" fill="#d6eaff" /></g>
        </svg>
        <div className="lx-orion-view" data-active={selected === 2}><ConstelacionOrion label="Constelación de ORION" /><span>ORION</span></div>
        <span className="lx-coordinate lx-coordinate-a">VN / GLOBAL</span><span className="lx-coordinate lx-coordinate-b">UNA NUEVA MIRADA ↗</span>
      </div>
      <span className="lx-visual-note">{PERSPECTIVAS[selected].note}</span>
    </div>
    <div className="lx-story">
      <div className="lx-perspectives" role="group" aria-label="Explorar VALLNews">
        <span className="lx-selection" style={{ transform: `translateX(${selected * 100}%)` }} aria-hidden="true" />
        {PERSPECTIVAS.map((item, index) => <button key={item.name} type="button" onClick={() => setSelected(index)} aria-pressed={selected === index}><span>0{index + 1}</span>{item.name}</button>)}
      </div>
      <div className="lx-story-copy" ref={copy.panel} aria-live="polite"><h3>{current.title}</h3><p>{current.text}</p></div>
    </div>
  </section>;
}
