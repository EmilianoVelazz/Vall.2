const MAX_EDITION_BYTES = 512_000;
const MAX_EDITION_ARTICLES = 250;

export async function requestNewsEdition(url, { timeoutMs = 22_000, fetcher = fetch, signal } = {}) {
  if (signal?.aborted) throw new Error('cancelled');
  const controller = new AbortController();
  const onAbort = () => controller.abort(new Error('cancelled'));
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error('timeout'));
      reject(new Error('timeout'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetcher(url, { credentials: 'include', cache: 'no-store', signal: controller.signal }),
      timeoutPromise,
    ]);
    if (!response || !response.ok) {
      const status = response?.status;
      throw new Error(status === 401 || status === 403 ? 'auth' : 'source');
    }
    const text = await Promise.race([response.text(), timeoutPromise]);
    if (typeof text !== 'string' || text.length > MAX_EDITION_BYTES) {
      throw new Error('source');
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('source');
    }
    if (!payload?.success || !Array.isArray(payload.data?.noticias) || payload.data.noticias.length > MAX_EDITION_ARTICLES) {
      throw new Error('source');
    }
    return payload;
  } catch (error) {
    if (signal?.aborted || error?.message === 'cancelled') throw new Error('cancelled');
    if (error?.message === 'timeout' || error?.name === 'AbortError') throw new Error('timeout');
    if (error?.message === 'auth') throw error;
    throw new Error('source');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
