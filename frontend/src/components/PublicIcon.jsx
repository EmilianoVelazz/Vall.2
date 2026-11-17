export default function PublicIcon({ kind }) {
  const paths = {
    report: <><path d="M7 3h7l4 4v14H6V3h1Zm7 0v5h4M9 12h6M9 16h6" /></>,
    finance: <><path d="M4 19h16M7 15V9m5 6V5m5 10v-4M4 8l5-3 4 2 7-4" /></>,
    markets: <><path d="M12 21V8m0 8c-5 0-7-3-7-7 5 0 7 3 7 7Zm0-4c0-5 3-7 7-7 0 5-3 7-7 7ZM9 4l3-2 3 2" /></>,
    mexico: <><circle cx="12" cy="10" r="2.5" /><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /></>,
    orion: <><path d="m5 17 5-11 9 6-14 5Z" /><circle cx="5" cy="17" r="2" /><circle cx="10" cy="6" r="2" /><circle cx="19" cy="12" r="2" /></>,
    method: <><path d="m5 6 2 2 4-4m2 3h7M5 13l2 2 4-4m2 3h7M5 20l2 2 4-4m2 3h7" /></>,
    access: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-3a5 5 0 0 1 10 0v3m3-9h7m-3-3 3 3-3 3" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
