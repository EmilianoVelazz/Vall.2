import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './OrionModelSelector.css';

const MODELS = [
  { id: 'nebula', name: 'Nebula', tag: 'Rápido y básico', description: 'Prioriza la velocidad para preguntas sencillas y resúmenes breves.' },
  { id: 'cirius', name: 'Cirius', tag: 'Razonamiento medio', description: 'Equilibra rapidez y profundidad para el análisis cotidiano.' },
  { id: 'pulsar', name: 'ORION Pulsar', tag: 'Máximo razonamiento', description: 'Prioriza el análisis profundo para consultas complejas. Puede tardar más.' },
];
const valid = value => MODELS.some(model => model.id === value);

export default function OrionModelSelector() {
  const { user } = useAuth();
  const key = `vn_orion_model_${encodeURIComponent(user || 'account')}`;
  const [model, setModel] = useState(() => {
    try { const saved = localStorage.getItem(key); return valid(saved) ? saved : 'cirius'; }
    catch { return 'cirius'; }
  });
  const [status, setStatus] = useState('');
  const [menu, setMenu] = useState(null);
  const trigger = useRef(null);
  const menuRef = useRef(null);
  const edited = useRef(false);
  const saves = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    fetch('/api/profile', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null).then(payload => {
        const remote = payload?.profile?.preferences?.orionModel;
        if (!alive.current || edited.current || !valid(remote)) return;
        setModel(remote);
        try { localStorage.setItem(key, remote); } catch { /* unavailable storage */ }
      }).catch(() => {});
    return () => { alive.current = false; controller.abort(); };
  }, [key]);
  useEffect(() => { window.dispatchEvent(new Event('orion:model-change')); }, [model]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
    const dismiss = event => {
      if (!menuRef.current?.contains(event.target) && !trigger.current?.contains(event.target)) setMenu(null);
    };
    const resize = () => setMenu(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', resize); };
  }, [menu]);
  function openMenu() {
    if (menu) { setMenu(null); return; }
    const bounds = trigger.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const below = window.innerHeight - bounds.bottom - 12;
    setMenu({ width, left: Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12)),
      ...(below >= 300 ? { top: bounds.bottom + 8, maxHeight: below - 8 } : { bottom: window.innerHeight - bounds.top + 8, maxHeight: bounds.top - 20 }) });
  }
  function menuKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); setMenu(null); trigger.current.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const options = [...menuRef.current.querySelectorAll('[role="menuitemradio"]')];
      const index = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  }
  function choose(value) {
    if (!valid(value) || document.getElementById('vaiModelSelect')?.disabled) return;
    setMenu(null); trigger.current?.focus();
    const version = ++saveVersion.current;
    edited.current = true; setModel(value); setStatus('Guardando preferencia…');
    try { localStorage.setItem(key, value); } catch { /* preference still applies to this page */ }
    // Serialize saves so a slower earlier response cannot replace the latest choice.
    saves.current = saves.current.catch(() => {}).then(async () => {
      const response = await fetch('/api/profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: { orionModel: value } }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error('save');
    }).then(() => { if (alive.current && version === saveVersion.current) setStatus('Preferencia guardada'); })
      .catch(() => { if (alive.current && version === saveVersion.current) setStatus('Selección aplicada aquí; no se pudo sincronizar el perfil.'); });
  }
  const selected = MODELS.find(item => item.id === model);
  return <div className="om-selector">
    <select id="vaiModelSelect" value={model} onChange={event => choose(event.target.value)} hidden aria-hidden="true" tabIndex={-1}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <button ref={trigger} id="vaiModelTrigger" type="button" className="om-trigger" aria-label={`Modelo de ORION: ${selected.name}`} aria-haspopup="menu" aria-expanded={!!menu} aria-controls={menu ? 'orionModelMenu' : undefined} title={selected.description} onClick={openMenu} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); } }}><span>{selected.name}</span><i className="fas fa-chevron-down" aria-hidden="true" /></button>
    <span className="om-status" role="status">{status}</span>
    {menu && createPortal(<div ref={menuRef} id="orionModelMenu" className="om-menu" role="menu" aria-label="Modelos de ORION" style={menu} onKeyDown={menuKey} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setMenu(null); }}><p className="om-menu-title">Elige tu modelo</p>{MODELS.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={model === item.id} onClick={() => choose(item.id)}><i className={`fas ${model === item.id ? 'fa-check' : 'fa-star'}`} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.tag}</small><span>{item.description}</span></span></button>)}</div>, document.body)}
  </div>;
}
