import { Link } from 'react-router-dom';
import site from '../../../shared/public-site.json';
import Overview from './PublicOverview.jsx';
import Experience from './PublicExperience.jsx';
import './PublicSite.css';
export function PublicLinks(){return <nav className="public-links" aria-label="Conoce VALLNews">{Object.entries(site.pages).filter(([route])=>route!=='/').map(([route,page])=><Link key={route} to={route}>{page.label}</Link>)}</nav>;}
export function PublicOverview({moving}){return <Overview moving={moving}><PublicLinks /></Overview>;}
export default function PublicPage({route}){return <Experience route={route}><PublicLinks /></Experience>;}
export function NotFound(){return <div className="public-page"><main className="public-width public-hero"><p className="public-eyebrow">VALLNEWS · 404</p><h1>No encontramos esta página.</h1><p>Revisa la dirección o vuelve al inicio para conocer nuestras herramientas.</p><Link className="public-login" to="/">Volver al inicio</Link></main></div>;}
