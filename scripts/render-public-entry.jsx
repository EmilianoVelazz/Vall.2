import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import Presentacion from '../frontend/src/pages/Presentacion.jsx';
import PublicPage,{NotFound} from '../frontend/src/components/PublicSite.jsx';
export function renderPublic(route){return renderToString(<StaticRouter location={route}>{route==='/'?<Presentacion/>:route==='/404'?<NotFound/>:<PublicPage route={route}/>}</StaticRouter>);}
