export const TEMAS_NOTICIAS = [
  { id: 'todos', label: 'Todas las noticias', icon: 'fa-newspaper' },
  { id: 'finanzas', label: 'Finanzas', icon: 'fa-building-columns' },
  { id: 'bolsas', label: 'Bolsas de valores', icon: 'fa-chart-line' },
  { id: 'cosechas', label: 'Agro y cosechas', icon: 'fa-wheat-awn' },
  { id: 'ganaderia', label: 'Ganadería', icon: 'fa-cow' },
  { id: 'materias', label: 'Materias primas', icon: 'fa-globe' },
];

export const FUENTES_NOTICIAS = [
  { id: 'finanzas', label: 'Finanzas globales', url: '/api/daily-news' },
  { id: 'mercados', label: 'Mercados y agro', url: '/api/daily-news-markets' },
  { id: 'mexico', label: 'Economía mexicana', url: '/api/mexico-daily-news' },
];

export const SUBTEMAS_NOTICIAS = [
  { id: 'tasas', label: 'Tasas e inflación', pattern: /\b(tasas?|rates?|inflacion|inflation|banxico|fed|bancos? centrales?|central bank)\b/ },
  { id: 'bonos', label: 'Bonos y deuda', pattern: /\b(bonos?|bonds?|deuda|debt|treasury|yield)\b/ },
  { id: 'divisas', label: 'Divisas', pattern: /\b(divisas?|currenc(?:y|ies)|forex|dolar|dollars?|yen|peso|euro)\b/ },
  { id: 'empresas', label: 'Empresas e inversión', pattern: /\b(empresas?|companies|business|inversion|investments?|investors?|revenue|earnings|profits?|acciones|stocks?)\b/ },
  { id: 'comercio', label: 'Comercio y exportaciones', pattern: /\b(comercio|trade|aranceles?|tariffs?|exportaciones|exports?|imports?|t-mec|nearshoring)\b/ },
  { id: 'maiz', label: 'Maíz', pattern: /\b(maiz|corn)\b/ },
  { id: 'trigo', label: 'Trigo', pattern: /\b(trigo|wheat)\b/ },
  { id: 'soya', label: 'Soya', pattern: /\b(soya|soja|soybeans?)\b/ },
  { id: 'cosechas', label: 'Cultivos y cosechas', pattern: /\b(cosechas?|cultivos?|harvests?|crops?|agricultura|agricolas?)\b/ },
  { id: 'cafe', label: 'Café', pattern: /\b(cafe|coffee|cafetalera?)\b/ },
  { id: 'bovino', label: 'Ganado bovino', pattern: /\b(bovin[oa]s?|vacuno|ganado|cattle|beef)\b/ },
  { id: 'porcino', label: 'Porcinos', pattern: /\b(porcin[oa]s?|cerdos?|hogs?|pork|sausage)\b/ },
  { id: 'avicola', label: 'Avicultura', pattern: /\b(avicultura|avicola|pollos?|huevos?|poultry|chicken|eggs?)\b/ },
  { id: 'lacteos', label: 'Lácteos', pattern: /\b(lacteos?|leche|dairy|milk)\b/ },
  { id: 'sanidad', label: 'Sanidad animal', pattern: /\b(sanidad|barrenador|infectados?|contaminacion|contamination|animal health|recall(?:ed)?)\b/ },
  { id: 'energia', label: 'Energía', pattern: /\b(energia|energy|petroleo|crudo|oil|crude|gas|wti|brent|pemex)\b/ },
  { id: 'metales', label: 'Metales', pattern: /\b(metales?|metals?|cobre|copper|oro|gold|plata|silver|aluminio|aluminum)\b/ },
  { id: 'logistica', label: 'Logística e insumos', pattern: /\b(logistica|logistics|shipping|fletes?|freight|fertilizantes?|fertilizers?|insumos|supply chain)\b/ },
];

export const PERIODOS_NOTICIAS = [
  { id: 'todos', label: 'Cualquier fecha' }, { id: 'today', label: 'Hoy · CDMX' },
  { id: '24h', label: 'Últimas 24 horas' }, { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' }, { id: 'custom', label: 'Elegir fechas' },
];

const dayFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Mexico_City' });
function diaCDMX(timestamp) { return dayFormatter.format(new Date(timestamp)); }

export function textoPlano(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function enlaceSeguro(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function imagenSegura(value) {
  const path = String(value || '');
  return path.startsWith('/api/img?u=') ? path : enlaceSeguro(path);
}

export function temaDeNoticia(article) {
  const category = textoPlano(article.category);
  const text = textoPlano(`${article.title || ''} ${article.description || ''}`);
  // La ganadería precede a los granos: un titular de alimento para ganado
  // puede mencionar ambos; debe poder encontrarse desde el filtro pecuario.
  if (category === 'ganaderia' || /\b(ganad[oa]|ganaderia|pecuari[oa]s?|bovin[oa]s?|porcin[oa]s?|avicultura|avicola|livestock|cattle|hog[s]?|poultry|beef|pork|dairy|leche|carne|pollo[s]?|huevo[s]?)\b/.test(text)) return 'ganaderia';
  if (['granos', 'cosechas', 'agro'].includes(category) || /\b(cosecha[s]?|cultivo[s]?|agricultura|agricola[s]?|agropecuari[oa]s?|maiz|trigo|soja|soya|grano[s]?|harvest[s]?|crop[s]?|wheat|soybeans?|corn|grain[s]?)\b/.test(text)) return 'cosechas';
  if (['bolsa', 'equities'].includes(category) || /\b(bolsa[s]?|bmv|nasdaq|acciones|bursatil|wall street|stock[s]?|equities|bourses|s&p|dow jones)\b/.test(text)) return 'bolsas';
  if (['energia', 'metales', 'logistica', 'commodities'].includes(category) || /\b(petroleo|crudo|cobre|oro|plata|fertilizante[s]?|commodities|crude|oil|copper|gold)\b/.test(text)) return 'materias';
  return 'finanzas';
}

export function normalizarNoticia(article, edition) {
  const url = enlaceSeguro(article?.url);
  const title = String(article?.title || '').trim();
  if (!url || !title) return null;
  const parsed = new URL(url);
  // Evita duplicar una noticia por etiquetas de seguimiento de los agregadores.
  const canonical = new URL(parsed);
  canonical.hash = '';
  for (const key of [...canonical.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) canonical.searchParams.delete(key);
  }
  const timestamp = Date.parse(article.publishedAt);
  const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  const description = String(article.description || '')
    .replace(/\s+La entrada[\s\S]+?aparece primero en\s+Agroinformacion\s*\.\s*$/i, '').trim();
  const text = textoPlano(`${title} ${description}`);
  const scopeText = text.replace(/\bnew mexico\b/g, '');
  const mexicoReference = /\b(mexico|mexican[oa]s?|banxico|bmv|inegi|sader|senasica|pemex|peso mexicano|cdmx|ciudad de mexico|aguascalientes|baja california|campeche|chiapas|chihuahua|coahuila|colima|durango|guanajuato|guerrero|hidalgo|jalisco|michoacan|morelos|nayarit|nuevo leon|oaxaca|puebla|queretaro|quintana roo|san luis potosi|sinaloa|sonora|tabasco|tamaulipas|tlaxcala|veracruz|yucatan|zacatecas|mazatlan)\b/.test(scopeText);
  const scope = edition === 'mexico' || mexicoReference ? 'mexico' : 'mundo';
  const topic = temaDeNoticia(article);
  // Los feeds generales incluyen salud, deportes y sucesos. La etiqueta
  // genérica «markets» del respaldo no prueba relevancia económica.
  const economic = /\b(finanzas?|financier[oa]s?|econom[yi]a?|economic|economics|economy|inflacion|inflation|bancos?|banks?|banking|credito|credit|deuda|debt|tasas?|rates?|banxico|fed|dolar|dollars?|currency|currencies|euro|yen|peso|bonos?|bonds?|treasury|yield|inversion|investments?|investors?|revenue|earnings|profits?|ventas|sales|exportaciones|imports?|exports?|aranceles?|tariffs?|comercio|trade|pib|gdp|empresas?|companies|business|empleo|jobs?|wages|manufacturing|industria|industrial|nearshoring)\b/.test(text);
  if (topic === 'finanzas' && !economic) return null;
  const comparable = value => textoPlano(value).replace(/[^a-z0-9]+/g, '');
  const summary = comparable(description) === comparable(title) ? '' : description;
  const insight = String(article.insight || '').trim();
  return {
    id: canonical.href,
    title,
    description: summary,
    insight: summary && comparable(summary).startsWith(comparable(insight)) ? '' : insight,
    source: String(article.source || parsed.hostname.replace(/^www\./, '')).trim(),
    url, publishedAt, timestamp: publishedAt ? timestamp : 0,
    image: imagenSegura(article.image), imageRaw: enlaceSeguro(article.imageRaw), scope, topic,
    topicLabel: TEMAS_NOTICIAS.find(item => item.id === topic)?.label || 'Finanzas',
    subtopics: SUBTEMAS_NOTICIAS.filter(item => item.pattern.test(text)).map(item => item.id),
    impact: ['alto', 'medio', 'bajo'].includes(article.impact) ? article.impact : null,
    edition,
  };
}

export function reunirNoticias(editions) {
  const byUrl = new Map();
  const byTitle = new Map();
  for (const edition of editions) {
    for (const raw of edition.articles || []) {
      const article = normalizarNoticia(raw, edition.id);
      if (!article) continue;
      const titleKey = textoPlano(article.title).replace(/[^a-z0-9]+/g, ' ').trim();
      const previous = byUrl.get(article.id) || byTitle.get(titleKey);
      if (previous) {
        if (!previous.image) previous.image = article.image;
        if (!previous.imageRaw) previous.imageRaw = article.imageRaw;
        if (!previous.description) previous.description = article.description;
        if (!previous.insight) previous.insight = article.insight;
        previous.subtopics = [...new Set([...previous.subtopics, ...article.subtopics])];
        if (!previous.timestamp && article.timestamp) {
          previous.timestamp = article.timestamp;
          previous.publishedAt = article.publishedAt;
        }
        if (article.scope === 'mexico') previous.scope = 'mexico';
        byUrl.set(article.id, previous);
        byTitle.set(titleKey, previous);
      } else {
        byUrl.set(article.id, article);
        byTitle.set(titleKey, article);
      }
    }
  }
  return [...new Set(byUrl.values())].sort((a, b) => b.timestamp - a.timestamp);
}

export function filtrarNoticias(articles, {
  scope = 'todos', topic = 'todos', query = '', subtopic = 'todos', source = 'todos',
  period = 'todos', from = '', until = '', impact = 'todos', withImage = false, withSummary = false,
} = {}, now = Date.now()) {
  const words = textoPlano(query).trim().split(/\s+/).filter(Boolean);
  const periods = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
  const dateMatches = article => {
    if (period === 'todos') return true;
    if (!article.timestamp || article.timestamp > now) return false;
    if (period === 'today') return diaCDMX(article.timestamp) === diaCDMX(now);
    if (period === 'custom') {
      if (from && until && from > until) return false;
      const day = diaCDMX(article.timestamp);
      return (!from || day >= from) && (!until || day <= until);
    }
    return !periods[period] || article.timestamp >= now - periods[period];
  };
  return articles.filter(article => (scope === 'todos' || article.scope === scope)
    && (topic === 'todos' || article.topic === topic)
    && (subtopic === 'todos' || article.subtopics?.includes(subtopic))
    && (source === 'todos' || textoPlano(article.source) === textoPlano(source))
    && (impact === 'todos' || article.impact === impact)
    && (!withImage || !!article.image) && (!withSummary || !!article.description)
    && dateMatches(article)
    && words.every(word => textoPlano(`${article.title} ${article.description} ${article.source} ${article.topicLabel}`).includes(word)));
}

export function destacarNoticias(articles, limit = 6) {
  if (limit <= 0) return [];
  const rank = { alto: 3, medio: 2, bajo: 1 };
  const ranked = [...articles].sort((a, b) => (rank[b.impact] || 0) - (rank[a.impact] || 0) || b.timestamp - a.timestamp);
  const selected = [];
  const topics = new Set();
  const scopes = new Set();
  for (const article of ranked) {
    if (!topics.has(article.topic) || !scopes.has(article.scope)) {
      selected.push(article); topics.add(article.topic); scopes.add(article.scope);
    }
    if (selected.length === limit) return selected;
  }
  for (const article of ranked) {
    if (!selected.includes(article)) selected.push(article);
    if (selected.length === limit) break;
  }
  return selected;
}

export function fechaNoticia(iso) {
  if (!iso) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));
}
