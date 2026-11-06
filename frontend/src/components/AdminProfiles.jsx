import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import './AdminProfiles.css';

const date = value => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registro';
export default function AdminProfiles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const resetForm = useRef(null);
  useEffect(() => { if (selected) resetForm.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    apiGet('/api/admin/profiles', { signal: controller.signal }).then(({ ok, data }) => {
      if (!ok || !data.success) throw Error(data.error || 'No se pudieron cargar los perfiles.');
      setRows(data.profiles || []);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  function select(row) { setSelected(row); setPassword(''); setConfirmation(''); setError(''); setNotice(''); }
  async function save(event) {
    event.preventDefault();
    if (saving || !selected) return;
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) return setError('Usa al menos 8 caracteres y hasta 72 bytes.');
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    setSaving(true); setError(''); setNotice('');
    try {
      const { ok, data } = await apiPost(`/api/admin/profiles/${selected.id}/password`, { newPassword: password });
      if (!ok || !data.success) throw Error(data.error || 'No se pudo confirmar el cambio.');
      setNotice(`Contraseña actualizada para ${selected.email}. Ya puede iniciar sesión con su nueva contraseña.`);
      setSelected(null); setPassword(''); setConfirmation(''); setRevision(value => value + 1);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  return <section className="ap-profiles" aria-label="Gestión de perfiles">
    <div className="ap-intro"><div><h3>Cuentas de la plataforma</h3><p>Consulta los perfiles guardados y restablece el acceso de una cuenta.</p></div><button className="ac-btn ac-btn-secondary" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Actualizar</button></div>
    {loading && <p role="status">Consultando perfiles…</p>}
    {error && <p className="ap-error" role="alert">{error}</p>}
    {notice && <p className="ap-notice" role="status">{notice}</p>}
    {!loading && !rows.length && !error && <p>No hay perfiles disponibles.</p>}
    {!!rows.length && <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabla de perfiles"><table><caption>{rows.length} cuentas guardadas</caption><thead><tr><th scope="col">Perfil</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col">Contraseña</th><th scope="col">Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <th scope="row"><strong>{row.display_name || row.email}</strong><span>{row.email}</span><small>{row.role === 'admin' ? 'Administrador' : 'Usuario'}</small></th>
      <td data-label="Estado">{row.active ? 'Activo' : 'Inactivo'}</td><td data-label="Último acceso">{date(row.last_login_at)}</td><td data-label="Contraseña">{row.role === 'admin' ? 'Configuración del despliegue' : row.password_changed_at ? `Actualizada: ${date(row.password_changed_at)}` : 'Credencial existente'}</td>
      <td data-label="Acción">{row.role === 'user' ? <button className="ac-btn ac-btn-secondary" disabled={saving} onClick={() => select(row)}>Restablecer acceso</button> : <span>Acceso principal</span>}</td>
    </tr>)}</tbody></table></div>}
    {selected && <form ref={resetForm} className="ap-reset" onSubmit={save} aria-label={`Restablecer acceso de ${selected.email}`}>
      <h3>Restablecer acceso</h3><p>{selected.email}</p><p>La contraseña actual se conservará hasta que guardes la nueva. Esta acción no elimina el perfil ni sus informes.</p>
      <label className="ac-field">Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} disabled={saving} /></label>
      <label className="ac-field">Confirmar nueva contraseña<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={saving} /></label>
      <div className="ap-actions"><button className="ac-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar nueva contraseña'}</button><button className="ac-btn ac-btn-secondary" type="button" disabled={saving} onClick={() => select(null)}>Cancelar</button></div>
    </form>}
  </section>;
}
