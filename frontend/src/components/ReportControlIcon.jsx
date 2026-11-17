const paths={
 previous:'m15 6-6 6 6 6',
 next:'m9 6 6 6-6 6',
 search:'m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 close:'m6 6 12 12 M6 18 18 6',
 expand:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5',
 compress:'M3 8h5V3 M16 3v5h5 M21 16h-5v5 M8 21v-5H3',
 download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
 more:'M4 12h.01 M12 12h.01 M20 12h.01',
 list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
 chevron:'m6 9 6 6 6-6',
 table:'M3 3h18v18H3z M3 9h18 M9 9v12',
 external:'M14 3h7v7 M21 3l-10 10 M10 3H3v18h18v-7',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
};
export default function ReportControlIcon({name}){
 return <svg className={'report-control-icon is-'+name} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==='more' ? 4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
