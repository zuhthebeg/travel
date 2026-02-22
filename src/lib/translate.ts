/**
 * Client-side translation service
 * Uses /api/translate (Gemini Flash-Lite) with localStorage caching
 */

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';
const CACHE_KEY = 'travly_translations';
const CACHE_MAX = 500; // Max cached translations

interface CacheEntry {
  text: string;
  lang: string;
  translated: string;
  ts: number;
}

function getCache(): CacheEntry[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setCache(entries: CacheEntry[]) {
  // Keep only most recent entries
  const trimmed = entries.slice(-CACHE_MAX);
  localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
}

function getCached(text: string, lang: string): string | null {
  const cache = getCache();
  const entry = cache.find(e => e.text === text && e.lang === lang);
  return entry?.translated || null;
}

function addToCache(items: { text: string; lang: string; translated: string }[]) {
  const cache = getCache();
  const now = Date.now();
  for (const item of items) {
    // Remove existing entry for same text+lang
    const idx = cache.findIndex(e => e.text === item.text && e.lang === item.lang);
    if (idx !== -1) cache.splice(idx, 1);
    cache.push({ ...item, ts: now });
  }
  setCache(cache);
}

/**
 * Translate an array of texts to the target language.
 * Returns translated strings in same order.
 * Uses cache first, only sends uncached texts to API.
 */
export async function translateTexts(
  texts: string[],
  targetLang: string
): Promise<string[]> {
  if (!texts.length) return [];

  // Check cache first
  const results: (string | null)[] = texts.map(t => getCached(t, targetLang));
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (results[i] === null && texts[i]?.trim()) {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  }

  // All cached
  if (uncachedTexts.length === 0) {
    return results.map((r, i) => r || texts[i]);
  }

  // Batch API call (max 20 per request)
  const batches: string[][] = [];
  for (let i = 0; i < uncachedTexts.length; i += 20) {
    batches.push(uncachedTexts.slice(i, i + 20));
  }

  let allTranslated: string[] = [];
  for (const batch of batches) {
    const res = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch, targetLang }),
    });

    if (!res.ok) {
      console.error('Translation failed:', res.status);
      // Return originals for failed batch
      allTranslated.push(...batch);
      continue;
    }

    const data = await res.json() as { translations: string[] };
    allTranslated.push(...data.translations);
  }

  // Update cache and results
  const cacheItems: { text: string; lang: string; translated: string }[] = [];
  for (let i = 0; i < uncachedIndices.length; i++) {
    const translated = allTranslated[i] || uncachedTexts[i];
    results[uncachedIndices[i]] = translated;
    cacheItems.push({
      text: uncachedTexts[i],
      lang: targetLang,
      translated,
    });
  }
  addToCache(cacheItems);

  return results.map((r, i) => r || texts[i]);
}

/**
 * Translate a single text string.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  const [result] = await translateTexts([text], targetLang);
  return result;
}
