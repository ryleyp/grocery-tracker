const CACHE_KEY = 'grocery-tracker-product-info-v1';
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_BARCODE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const HIT_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MISS_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_LOOKUP_LIMIT = 6;

const SIZE_RE = /\b\d+([.,]\d+)?\s*(oz|ounces?|fl\s*oz|ct|pk|pack|cans?|bottles?|lbs?|lb|g|kg|ml|l|gal|qt|pt)\b/gi;
const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'made', 'from', 'style', 'original']);

const CATEGORY_RULES = [
  { terms: ['ice-creams', 'ice creams', 'gelato', 'sorbets'], location: 'freezer', days: 60, emoji: '🍦', confidence: 6 },
  { terms: ['frozen-foods', 'frozen foods', 'frozen-meals', 'frozen meals', 'frozen-desserts'], location: 'freezer', days: 90, emoji: '❄️', confidence: 6 },
  { terms: ['seafood', 'fishes', 'fish', 'shrimps', 'shellfish'], location: 'fridge', days: 2, emoji: '🐟', confidence: 5 },
  { terms: ['poultries', 'poultry', 'chicken', 'turkey'], location: 'fridge', days: 2, emoji: '🍗', confidence: 5 },
  { terms: ['meats', 'beef', 'pork', 'sausages'], location: 'fridge', days: 3, emoji: '🥩', confidence: 5 },
  { terms: ['deli meats', 'lunch meats', 'ham', 'cold cuts'], location: 'fridge', days: 5, emoji: '🥪', confidence: 5 },
  { terms: ['yogurts', 'yogurt', 'fermented-milks'], location: 'fridge', days: 14, emoji: '🥣', confidence: 5 },
  { terms: ['milks', 'milk'], location: 'fridge', days: 7, emoji: '🥛', confidence: 5 },
  { terms: ['creamers', 'cream', 'whipped-cream'], location: 'fridge', days: 10, emoji: '🥛', confidence: 5 },
  { terms: ['cheeses', 'cheese'], location: 'fridge', days: 21, emoji: '🧀', confidence: 5 },
  { terms: ['butters', 'butter'], location: 'fridge', days: 60, emoji: '🧈', confidence: 5 },
  { terms: ['berries', 'strawberries', 'raspberries', 'blackberries'], location: 'fridge', days: 3, emoji: '🍓', confidence: 5 },
  { terms: ['fresh fruits', 'fruits', 'fresh vegetables', 'vegetables'], location: 'fridge', days: 7, emoji: '🥬', confidence: 4 },
  { terms: ['breakfast-cereals', 'breakfast cereals', 'cereals', 'granolas', 'oatmeals'], location: 'pantry', days: 180, emoji: '🥣', confidence: 5 },
  { terms: ['crisps', 'chips', 'snacks', 'crackers', 'popcorn'], location: 'pantry', days: 60, emoji: '🍿', confidence: 5 },
  { terms: ['pastas', 'pasta', 'rices', 'rice', 'noodles'], location: 'pantry', days: 365, emoji: '🍝', confidence: 5 },
  { terms: ['canned foods', 'canned-foods', 'canned vegetables', 'canned fish', 'canned meats'], location: 'pantry', days: 365, emoji: '🥫', confidence: 5 },
  { terms: ['cookies', 'biscuits', 'cereal-bars', 'bars'], location: 'pantry', days: 90, emoji: '🍪', confidence: 4 },
  { terms: ['breads', 'bread', 'bakery products', 'bakery'], location: 'pantry', days: 5, emoji: '🍞', confidence: 4 },
  { terms: ['sauces', 'ketchup', 'mustards', 'mayonnaises', 'dressings', 'pickles'], location: 'pantry', days: 180, emoji: '🫙', confidence: 4 },
  { terms: ['syrups', 'syrup', 'sweeteners', 'honey'], location: 'pantry', days: 730, emoji: '🍯', confidence: 5 },
  { terms: ['drink mixes', 'powdered drinks', 'powders'], location: 'pantry', days: 180, emoji: '🥤', confidence: 5 },
  { terms: ['beverages', 'soft drinks', 'waters', 'energy drinks'], location: 'pantry', days: 180, emoji: '🥤', confidence: 4 },
];

function loadCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The lookup is only a helper; the grocery list itself still works.
  }
}

function normalizeLookupName(name) {
  return name
    .toLowerCase()
    .replace(/\bh-?\s*e-?\s*b\b/g, 'h-e-b')
    .replace(SIZE_RE, ' ')
    .replace(/[^a-z0-9%'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupKey(name) {
  return normalizeLookupName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function queryFor(name) {
  const words = normalizeLookupName(name)
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .slice(0, 10);
  return words.join(' ');
}

function tokensFor(str) {
  return new Set(
    normalizeLookupName(str)
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function overlapScore(query, product) {
  const wanted = tokensFor(query);
  if (!wanted.size) return 0;
  const found = tokensFor(`${product.product_name || ''} ${product.brands || ''} ${product.categories || ''}`);
  let score = 0;
  for (const token of wanted) {
    if (found.has(token)) score += token.length >= 5 ? 2 : 1;
  }
  if (/h-e-b/i.test(query) && /h-?e-?b/i.test(`${product.product_name || ''} ${product.brands || ''}`)) score += 3;
  return score / wanted.size;
}

function categoryText(product) {
  return [
    product.categories,
    ...(Array.isArray(product.categories_tags) ? product.categories_tags : []),
    ...(Array.isArray(product.food_groups_tags) ? product.food_groups_tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_:]+/g, ' ');
}

function categorySuggestion(product) {
  const text = categoryText(product);
  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((term) => text.includes(term))) {
      return {
        location: rule.location,
        days: rule.days,
        emoji: rule.emoji,
        confidence: rule.confidence,
      };
    }
  }
  return null;
}

function bestProduct(products, query) {
  const scored = (Array.isArray(products) ? products : [])
    .filter((product) => product && product.product_name)
    .map((product) => ({ product, score: overlapScore(query, product) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 0.45 ? best.product : null;
}

function summarizeCategory(product) {
  if (typeof product.categories !== 'string') return '';
  return product.categories.split(',').map((part) => part.trim()).filter(Boolean)[0] || '';
}

function toProductInfo(product, query) {
  const suggestion = categorySuggestion(product);
  return {
    source: 'Open Food Facts',
    query,
    productName: product.product_name || '',
    brand: product.brands || '',
    category: summarizeCategory(product),
    quantity: product.quantity || '',
    suggestion,
    matchedAt: new Date().toISOString(),
  };
}

async function fetchProductInfo(name) {
  const query = queryFor(name);
  if (query.length < 3) return null;

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '3');
  url.searchParams.set('fields', 'product_name,brands,categories,categories_tags,food_groups_tags,quantity');

  const res = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error('Product info is unavailable');
    err.unavailable = true;
    throw err;
  }

  const data = await res.json();
  const product = bestProduct(data.products, query);
  return product ? toProductInfo(product, query) : null;
}

// Look a product up by its scanned barcode (UPC/EAN). Returns product info
// shaped like lookupProductInfo, plus the resolved productName so callers can
// prefill an item name. Falls back gracefully when offline or unmatched.
export async function lookupProductByBarcode(barcode) {
  if (typeof window === 'undefined' || !('fetch' in window)) return { info: null, unavailable: true };
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 6) return { info: null, unavailable: false };

  try {
    const url = `${OFF_BARCODE_URL}/${code}.json?fields=product_name,brands,categories,categories_tags,food_groups_tags,quantity`;
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const err = new Error('Product info is unavailable');
      err.unavailable = true;
      throw err;
    }
    const data = await res.json();
    if (data.status !== 1 || !data.product || !data.product.product_name) {
      return { info: null, unavailable: false, barcode: code };
    }
    const info = toProductInfo(data.product, `barcode:${code}`);
    return { info, unavailable: false, barcode: code, productName: data.product.product_name };
  } catch (err) {
    return { info: null, unavailable: Boolean(err.unavailable), barcode: code };
  }
}

export async function lookupProductInfo(name) {
  if (typeof window === 'undefined' || !('fetch' in window)) return { info: null, unavailable: true };

  const key = lookupKey(name);
  if (!key) return { info: null, unavailable: false };

  const now = Date.now();
  const cache = loadCache();
  const cached = cache[key];
  if (cached && now - cached.savedAt < (cached.info ? HIT_TTL_MS : MISS_TTL_MS)) {
    return { info: cached.info || null, unavailable: false, cached: true };
  }

  try {
    const info = await fetchProductInfo(name);
    cache[key] = { savedAt: now, info };
    saveCache(cache);
    return { info, unavailable: false, cached: false };
  } catch (err) {
    return { info: null, unavailable: Boolean(err.unavailable), cached: false };
  }
}

function shouldUseSuggestion(item, suggestion) {
  if (!suggestion) return false;
  if (!item.matched) return true;
  if (suggestion.location === 'freezer' && item.location !== 'freezer') return true;
  if (item.location === 'pantry' && suggestion.location !== 'pantry' && suggestion.confidence >= 5) return true;
  if (suggestion.location === item.location && Math.abs((item.days || 0) - suggestion.days) >= 14) return true;
  return false;
}

export function applyProductInfo(item, info) {
  if (!info) return { item, changed: false, matched: false };

  const next = { ...item, productInfo: info };
  let changed = false;

  if (shouldUseSuggestion(item, info.suggestion)) {
    next.location = info.suggestion.location;
    next.days = info.suggestion.days;
    next.emoji = info.suggestion.emoji;
    next.matched = true;
    next.productMatched = true;
    changed =
      item.location !== next.location ||
      item.days !== next.days ||
      item.emoji !== next.emoji ||
      item.matched !== next.matched;
  }

  return { item: next, changed, matched: true };
}

function lookupPriority(item, index) {
  let score = 1000 - index;
  if (!item.matched) score += 1000;
  if (/h-?e-?b|hellmann|kerrygold|lactaid|yoplait|claussen|whataburger|nesquik|blue bell|nestle|v8/i.test(item.name)) score += 250;
  if (/\bfrozen\b|\bmeal\b|\bdrink\b|\bmix\b|\bsauce\b|\bcereal\b|\bchips?\b|\bcheese\b|\byogurt\b|\bmilk\b/i.test(item.name)) score += 150;
  return score;
}

export async function enrichItemsWithProductInfo(items, { maxNetworkLookups = DEFAULT_LOOKUP_LIMIT, onProgress } = {}) {
  const next = items.map((item) => ({ ...item }));
  const order = next
    .map((item, index) => ({ item, index, priority: lookupPriority(item, index) }))
    .sort((a, b) => b.priority - a.priority);

  let checked = 0;
  let matched = 0;
  let changed = 0;
  let networkLookups = 0;
  let unavailable = false;

  for (const entry of order) {
    if (unavailable) break;
    if (!entry.item.name || entry.item.name.length < 3) continue;

    const result = await lookupProductInfo(entry.item.name);
    if (result.unavailable) {
      unavailable = true;
      break;
    }
    if (!result.cached) networkLookups++;

    checked++;
    if (result.info) {
      const applied = applyProductInfo(next[entry.index], result.info);
      next[entry.index] = applied.item;
      matched++;
      if (applied.changed) changed++;
    }
    onProgress?.({ checked, matched, changed, total: Math.min(order.length, maxNetworkLookups) });
    if (!result.cached && networkLookups >= maxNetworkLookups) break;
  }

  return { items: next, checked, matched, changed, unavailable };
}

export function productInfoLabel(info) {
  if (!info) return '';
  const name = info.brand || info.productName || 'Product info';
  const detail = info.category || info.quantity || '';
  return detail ? `${name} · ${detail}` : name;
}
