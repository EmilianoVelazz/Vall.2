import { enlaceSeguro } from './noticias.js';

export const MAX_SAVED_NEWS = 80;

function normalizeOwner(owner) {
  return typeof owner === 'string' && owner.trim() ? owner.trim().toLowerCase() : '';
}

export function newsLibraryKey(owner) {
  const normalized = normalizeOwner(owner);
  return normalized ? `vn_news_library:v1:${encodeURIComponent(normalized)}` : '';
}

function validSavedArticle(article) {
  if (!article || typeof article !== 'object') return null;
  const url = enlaceSeguro(article.url || article.id);
  const title = typeof article.title === 'string' ? article.title.trim() : '';
  if (!url || !title) return null;
  return { ...article, id: article.id && enlaceSeguro(article.id) ? article.id : url, url, title };
}

const MEMORY_MESSAGE = 'Tu navegador no permite guardar los cambios. Se conservan mientras permanezcas en Noticias.';
const CORRUPT_MESSAGE = 'No se pudo leer tu lista guardada. Puedes seguir consultando noticias.';

export function createNewsLibrary({ owner, storage } = {}) {
  const normalizedOwner = normalizeOwner(owner);
  const key = newsLibraryKey(normalizedOwner);
  let resolvedStorage = storage;
  let storageBlocked = false;
  if (resolvedStorage === undefined) {
    try {
      resolvedStorage = typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      resolvedStorage = null;
      storageBlocked = true;
    }
  }
  let articles = [];
  let status = !normalizedOwner ? 'signed_out' : storageBlocked ? 'memory' : 'ready';
  let message = storageBlocked && normalizedOwner ? MEMORY_MESSAGE : '';

  function mergeArticles(primary, secondary) {
    const map = new Map();
    for (const item of [...secondary, ...primary]) {
      const valid = validSavedArticle(item);
      if (valid && !map.has(valid.id)) map.set(valid.id, valid);
    }
    return [...map.values()].slice(0, MAX_SAVED_NEWS);
  }

  function readFromStorage() {
    if (!normalizedOwner) { status = 'signed_out'; return []; }
    if (!resolvedStorage || typeof resolvedStorage.getItem !== 'function') {
      status = 'memory';
      message = MEMORY_MESSAGE;
      return articles;
    }
    let raw = null;
    try {
      raw = resolvedStorage.getItem(key);
    } catch {
      status = 'memory';
      message = MEMORY_MESSAGE;
      return articles;
    }
    if (!raw) {
      if (status === 'unavailable') { status = 'ready'; message = ''; }
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      status = 'unavailable';
      message = CORRUPT_MESSAGE;
      return [];
    }
    if (!parsed || typeof parsed !== 'object' || normalizeOwner(parsed.owner) !== normalizedOwner || !Array.isArray(parsed.articles)) {
      return [];
    }
    if (status === 'unavailable') { status = 'ready'; message = ''; }
    return mergeArticles(parsed.articles, []);
  }

  function writeToStorage(nextArticles) {
    if (!normalizedOwner) return false;
    if (!resolvedStorage || typeof resolvedStorage.setItem !== 'function') {
      status = 'memory';
      message = MEMORY_MESSAGE;
      return false;
    }
    try {
      resolvedStorage.setItem(key, JSON.stringify({
        version: 1,
        owner: normalizedOwner,
        updatedAt: new Date().toISOString(),
        articles: nextArticles,
      }));
      if (status !== 'ready') status = 'ready';
      return true;
    } catch {
      status = 'memory';
      message = MEMORY_MESSAGE;
      return false;
    }
  }

  if (normalizedOwner && !storageBlocked) {
    articles = readFromStorage();
  }

  return {
    getSnapshot() {
      return { articles: [...articles], status, message };
    },
    retry() {
      if (!normalizedOwner) return this.getSnapshot();
      try { resolvedStorage?.removeItem?.(key); } catch { /* ignore */ }
      status = 'ready';
      message = '';
      articles = readFromStorage();
      return this.getSnapshot();
    },
    sync({ replace = false } = {}) {
      if (!normalizedOwner) return this.getSnapshot();
      const stored = readFromStorage();
      articles = replace && status === 'ready' ? stored : mergeArticles(articles, stored);
      if (!replace && status === 'ready') writeToStorage(articles);
      return this.getSnapshot();
    },
    setSaved(article, shouldSave) {
      if (!normalizedOwner) return this.getSnapshot();
      const stored = readFromStorage();
      articles = mergeArticles(articles, stored);
      const valid = validSavedArticle(article);
      const targetId = valid?.id || (typeof article?.id === 'string' ? article.id : '');
      if (!shouldSave) {
        if (targetId) articles = articles.filter(item => item.id !== targetId && item.url !== targetId);
        if (message.includes('hasta 80')) message = '';
        writeToStorage(articles);
        return this.getSnapshot();
      }
      if (!valid) return this.getSnapshot();
      if (articles.some(item => item.id === valid.id)) {
        writeToStorage(articles);
        return this.getSnapshot();
      }
      if (articles.length >= MAX_SAVED_NEWS) {
        message = `Puedes guardar hasta ${MAX_SAVED_NEWS} noticias en tu navegador.`;
        return this.getSnapshot();
      }
      articles = [...articles, valid];
      writeToStorage(articles);
      return this.getSnapshot();
    },
  };
}
