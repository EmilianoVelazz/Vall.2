import useIdioma from '../lib/idioma.js';
import {reportText} from '../lib/reportLocale.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import { lazy, Suspense, useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

const ExecutiveReportsHub = lazy(() => import('../components/ExecutiveReportsHub.jsx'));
const AnnualReportsLibrary = lazy(() => import('../components/AnnualReportsLibrary.jsx'));
const ReportAnnexes = lazy(() => import('../components/ReportAnnexes.jsx'));
const DailyReportHistory = lazy(() => import('../components/DailyReportHistory.jsx'));
import usePageStyles from '../lib/usePageStyles.js';
import { DARK_PILOT, ESQUELETO } from '../lib/hojasComunes.js';
import './Inicio.css';
import './Informes.css';
import refreshPolicy from '../../../shared/report-refresh-policy.json';
import exportFormats from '../../../shared/report-export-options.json';
import reportLibrary from '../../../shared/report-library.json';

const HOJAS = [...ESQUELETO, DARK_PILOT];

export default function Informes() {
  usePageStyles(HOJAS);
  const [language]=useIdioma(),t=reportText(language);
  const dailyHours=refreshPolicy.dailyHours.map(hour=>String(hour).padStart(2,'0')+':00').join(' · '),weekday=new Intl.DateTimeFormat(t.locale,{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2023,0,1+refreshPolicy.markets.weekday))),years=reportLibrary.years.toSorted((a,b)=>a-b);
  const auth=useAuth();
  const accountEmail=typeof auth?.user==='string' ? auth.user.trim().toLowerCase() : '';
  const [section,setSection]=useState(()=>{const value=new URLSearchParams(window.location.search).get('seccion');return ['libreria','anexos','historial'].includes(value) ? value : 'diarios';});
  const [visited,setVisited]=useState(()=>new Set([section])),[annexReport,setAnnexReport]=useState(null),[annexOwner,setAnnexOwner]=useState(''),[libraryYear,setLibraryYear]=useState(null);
  const selectSection=value=>{setSection(value);setVisited(current=>new Set([...current,value]));const url=new URL(window.location.href);if(value==='diarios')url.searchParams.delete('seccion');else url.searchParams.set('seccion',value);window.history.replaceState(window.history.state,'',url);};
  const showAnnex=report=>{setAnnexOwner(accountEmail);setAnnexReport({...report,collection:report.baseReport?.collection || report.collection});selectSection('anexos');};

  useEffect(() => {
    document.documentElement.classList.add('vn-dark-pilot');
    document.body.classList.add('vn-dark-pilot', 'vn-dark-inicio', 'vn-dark-informes');
    return () => {
      document.documentElement.classList.remove('vn-dark-pilot');
      document.body.classList.remove('vn-dark-pilot', 'vn-dark-inicio', 'vn-dark-informes');
    };
  }, []);
  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <main className="in-main informes-main notranslate" translate="no" lang={language}>
        <header className="informes-hero">
          <div className="informes-hero-copy">
            <span className="informes-kicker">
              <i className="fas fa-file-lines" aria-hidden="true" /> {t("Centro de informes")}
            </span>
            <h1>{t('Informes a tu medida.')}</h1>
            <p>
              {t("Elige un reporte base de Finanzas, Mercados o México, define tu enfoque y genera un informe con ORION. Revisa tu edición y guárdala en Mis informes.")}
            </p>
          </div>

          <div className="informes-hero-meta" aria-label={t('Características de los informes')}>
            <span><i className="fas fa-clock" aria-hidden="true" /><small>{t('Cortes de datos')}</small><strong>{dailyHours} · CDMX</strong><small>{t('Finanzas y México')}</small></span>
            <span><i className="fas fa-calendar-week" aria-hidden="true" /><small>{t('Mercados · semanal')}</small><strong>{weekday} {String(refreshPolicy.markets.hour).padStart(2,'0')}:00 · CDMX</strong></span>
            <span><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /><small>{t('Personalización')}</small><strong>{t('Con ORION')}</strong></span>
            <span><i className="fas fa-file-export" aria-hidden="true" /><small>{t('Salidas')}</small><strong>{exportFormats.map(item=>item.value==='xlsx' ? 'Excel' : item.label).join(' · ')}</strong></span>
          </div>
        </header>

        <nav className="reports-page-nav" aria-label={t('Secciones del centro de informes')}>{[['diarios','fa-file-lines','Informes diarios','Últimas sesiones de mercado'],['libreria','fa-book-open','Librería',t('Ediciones anuales')+' '+years[0]+'–'+years.at(-1)],['anexos','fa-paperclip','Anexos','Fuentes, tablas y metodología'],['historial','fa-clock-rotate-left','Historial diario','Ediciones por fecha y corte']].map(([id,icon,label,note])=><button key={id} type="button" aria-current={section===id ? 'page' : undefined} onClick={()=>selectSection(id)}><i className={'fas '+icon} aria-hidden="true" /><span><strong>{t(label)}</strong><small>{t(note)}</small></span></button>)}</nav>
        <Suspense fallback={<div className="erh-loading" role="status"><i className="fas fa-spinner fa-spin" aria-hidden="true" />{t('Cargando sección de informes…')}</div>}>
          {visited.has('diarios') && <div style={{display:section==='diarios' ? undefined : 'none'}}><ExecutiveReportsHub onAnnex={showAnnex} /></div>}
          {visited.has('libreria') && <div style={{display:section==='libreria' ? undefined : 'none'}}><AnnualReportsLibrary accountEmail={accountEmail} requestedYear={libraryYear} onAnnex={showAnnex} /></div>}
          {visited.has('anexos') && <div style={{display:section==='anexos' ? undefined : 'none'}}><ReportAnnexes accountEmail={accountEmail} initialReport={annexOwner===accountEmail ? annexReport : null} onAnnual={year=>{setLibraryYear({year,request:Date.now()});selectSection('libreria');}} /></div>}
          {visited.has('historial') && <div style={{display:section==='historial' ? undefined : 'none'}}><DailyReportHistory accountEmail={accountEmail} onAnnex={showAnnex} /></div>}
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
