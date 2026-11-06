import useIdioma from '../lib/idioma.js';
import {reportText} from '../lib/reportLocale.jsx';
import {useReportPreferences} from '../lib/useReportPreferences.js';
import DailyReportHistory from '../components/DailyReportHistory.jsx';
import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import ExecutiveReportsHub from '../components/ExecutiveReportsHub.jsx';
import AnnualReportsLibrary from '../components/AnnualReportsLibrary.jsx';
import ReportAnnexes from '../components/ReportAnnexes.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { DARK_PILOT, ESQUELETO } from '../lib/hojasComunes.js';
import './Inicio.css';
import './Informes.css';

const HOJAS = [...ESQUELETO, DARK_PILOT];

export default function Informes() {
  usePageStyles(HOJAS);
  const [language]=useIdioma(),t=reportText(language);
  const {email:accountEmail}=useReportPreferences();
  const [section,setSection]=useState(()=>{const value=new URLSearchParams(window.location.search).get('seccion');return ['libreria','anexos','historial'].includes(value) ? value : 'diarios';});
  const [visited,setVisited]=useState(()=>new Set([section])),[annexReport,setAnnexReport]=useState(null),[libraryYear,setLibraryYear]=useState(null);
  const selectSection=value=>{setSection(value);setVisited(current=>new Set([...current,value]));const url=new URL(window.location.href);if(value==='diarios')url.searchParams.delete('seccion');else url.searchParams.set('seccion',value);window.history.replaceState(window.history.state,'',url);};
  const showAnnex=report=>{setAnnexReport({...report,collection:report.baseReport?.collection || report.collection});selectSection('anexos');};

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
            <span><i className="fas fa-clock" aria-hidden="true" /><small>{t('Cortes de datos')}</small><strong>06:00 · 14:00</strong></span>
            <span><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /><small>{t('Personalización')}</small><strong>{t('Con ORION')}</strong></span>
            <span><i className="fas fa-file-export" aria-hidden="true" /><small>{t('Salidas')}</small><strong>{t('PDF · CSV · Audio')}</strong></span>
          </div>
        </header>

        <nav className="reports-page-nav" aria-label={t('Secciones del centro de informes')}>{[['diarios','fa-file-lines','Informes diarios','Últimas sesiones de mercado'],['libreria','fa-book-open','Librería','Ediciones anuales 2022–2025'],['anexos','fa-paperclip','Anexos','Fuentes, tablas y metodología'],['historial','fa-clock-rotate-left','Historial diario','Ediciones por fecha y corte']].map(([id,icon,label,note])=><button key={id} type="button" aria-current={section===id ? 'page' : undefined} onClick={()=>selectSection(id)}><i className={'fas '+icon} aria-hidden="true" /><span><strong>{t(label)}</strong><small>{t(note)}</small></span></button>)}</nav>
        {visited.has('diarios') && <div style={{display:section==='diarios' ? undefined : 'none'}}><ExecutiveReportsHub onAnnex={showAnnex} /></div>}
        {visited.has('libreria') && <div style={{display:section==='libreria' ? undefined : 'none'}}><AnnualReportsLibrary accountEmail={accountEmail} requestedYear={libraryYear} onAnnex={showAnnex} /></div>}
        {visited.has('anexos') && <div style={{display:section==='anexos' ? undefined : 'none'}}><ReportAnnexes accountEmail={accountEmail} initialReport={annexReport} onAnnual={year=>{setLibraryYear({year,request:Date.now()});selectSection('libreria');}} /></div>}
        {visited.has('historial') && <div style={{display:section==='historial' ? undefined : 'none'}}><DailyReportHistory accountEmail={accountEmail} onAnnex={showAnnex} /></div>}
      </main>

      <Footer />
    </>
  );
}
