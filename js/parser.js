import { FOOD_DB, DEFAULT_GUESS } from './foodData.js';

// Lines that are clearly not grocery items: totals, payment, store noise,
// and order-app chrome (fees, tips, delivery). Short ambiguous words use
// \b so they don't swallow real foods (tenderloin, cashews, dates...).
const SKIP_RE = /subtotal|sub total|\btotal\b|\btax(es)?\b|\bchange\b|\bcash\b|\btender(ed)?\b|visa|debit|credit|mastercard|amex|balance|thank|welcome|receipt|cashier|clerk|register|savings|you saved|coupon|discount|member|rewards|loyal|points|approved|\bauth\b|account|\bcard\b|payment|refund|phone|tel[:.]|www\.|http|\.com|store\s*#|\border\b|invoice|\blane\b|\btrans(action)?\b|terminal|barcode|survey|return policy|items? sold|\bqty\b|\bprice\b|\bamount\b|\bdate\b|\btime\b|street|\bblvd\b|\bave\b|suite|delivery|\bfees?\b|\btip\b|estimated|pickup|substitut|unavailable|checkout|promo|\bebt\b|\bsnap\b/i;

// A price at the end of a line, e.g. "4.99", "$4.99", "4.99 F"
const PRICE_RE = /[-$]?\s*(\d{1,4}[.,]\d{2})\s*[a-zA-Z*]{0,2}\s*$/;

// A line that is ONLY a price (order-app screenshots put prices on
// their own line under the product name)
const PRICE_ONLY_RE = /^\s*[-$]?\s*\d{1,4}[.,]\d{2}\s*$/;

// Quantity/weight-only lines, e.g. "2 @ 3.99", "1.24 lb @ 0.99/lb",
// "2 x $1.50", "Qty 1"
const QTY_LINE_RE = /^\s*(qty\b|\d+([.,]\d+)?\s*(@|x|ea|lb|kg|oz|\/))/i;
const ORDER_QTY_PRICE_RE = /\$\s*\d{1,4}[.,]\d{2}.*(?:\/\s*[a-z]+|\bea\b|\blb\b|\bx\s*\d+|\bqty\b).*\$\s*\d{1,4}[.,]\d{2}/i;
const APP_CATEGORY_RE = /^(everyday essentials|frozen food|bakery\s*&\s*bread|beverages|fruit\s*&\s*vegetables|dairy|meat|seafood|pantry|snacks)$/i;
const APP_CHROME_RE = /^(order details|add all to cart|payment summary|out of stock|only\s+\d+\s+of\b|here'?s your delivery|subject to availability|delivery time|got up to|all\s+\d+|[0-9: ]+all|[0-9: ]+s\s+\d+%?)$/i;
const PRODUCT_START_RE = /\b(H-?\s*E-?\s*B|Hellmann'?s|Kerrygold|Cap'?n|Lactaid|Reddi|Yoplait|Claussen|Yakult|Whataburger|Nesquik|Blue Bell|Joy|Nestle|Michelina'?s|V8|Jade Leaf|Real|Re[aá]l)\b/i;
const KNOWN_PRODUCT_LOOKAHEAD = /^(?:[A-Za-z]{1,6}\s+){1,3}(?=(?:H-?\s*E-?\s*B|Hellmann'?s|Kerrygold|Cap'?n|Lactaid|Reddi|Yoplait|Claussen|Yakult|Whataburger|Nesquik|Blue Bell|Joy|Nestle|Michelina'?s|V8|Jade Leaf|Real|Re[aá]l)\b)/i;
const SIZE_HINT_RE = /\b\d+([.,]\d+)?\s*(oz|ct|pk|cans?|bottles?|lbs?|lb|gal|qt|pt)\b/i;

export function guessFood(name) {
  const n = ' ' + name.toLowerCase() + ' ';
  for (const entry of FOOD_DB) {
    for (const kw of entry.keywords) {
      if (n.includes(kw)) {
        return { location: entry.location, days: entry.days, emoji: entry.emoji, matched: true };
      }
    }
  }
  return { ...DEFAULT_GUESS, matched: false };
}

export function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/'S\b/g, "'s")
    .replace(/Cap'N\b/g, "Cap'n")
    .replace(/\bBbq\b/g, 'BBQ')
    .trim();
}

function cleanName(raw) {
  return raw
    .replace(/^[^A-Za-z]+(?=[A-Za-z])/, ' ')
    .replace(/^[A-Za-z]{1,3}\s+(?=H-?\s*E-?\s*B\b)/i, ' ')
    .replace(/\b(?:Q\)|Vv|Gs|wow)\b/gi, ' ')
    .replace(/\b(?!V8\b)[A-Za-z]+\d+[A-Za-z0-9]*\b/gi, ' ')
    .replace(/\([^)]*\d+[^)]*\)\s*$/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')          // long SKU/UPC numbers
    .replace(/[^A-Za-z0-9%&'\- ]/g, ' ')  // OCR junk characters
    .replace(/^\s+/, '')
    .replace(/\bFrech\b/gi, 'Fresh')
    .replace(/\bAva\b/gi, 'Avg')
    .replace(/^(?:(?:Ss|We)\s+){1,2}(?=Fresh\b)/i, ' ')
    .replace(KNOWN_PRODUCT_LOOKAHEAD, ' ')
    .replace(/\b(?:Fe|Fs|Be|Ee|Ivr)\s+(?=[A-Z])/gi, ' ')
    .replace(/^(?:Fe|Fs|Be|Ee|Ivr|A)\s+(?=[A-Z])/i, ' ')
    .replace(/^[A-Za-z]{1,3}\s+(?=H-?\s*E-?\s*B\b)/i, ' ')
    .replace(/\b(Sp|Avg)\b/gi, ' ')
    .replace(/\b\d+([.,]\d+)?\s*(ea|pk|pkg|ct|oz|ounces?|lb|lbs|ibs?|pounds?|kg|g|ml|l|gal|gallons?|qt|quarts?|pt|pints?|fl|liters?|litres?)\b/gi, ' ') // "2.5 lb", "8oz"
    .replace(/\b(ea|pk|pkg|ct|oz|ounces?|lb|lbs|ibs?|pounds?|kg|g|ml|l|gal|gallons?|qt|quarts?|pt|pints?|fl|liters?|litres?)\b/gi, ' ')                 // bare units
    .replace(/\b(qty|x\s*\d+|eax?\s*\d*)\b/gi, ' ')
    .replace(/\b(Sae|Wowes|Ococ|Rt|Ok)\b.*$/i, ' ')
    .replace(/\b\d+\s+(?=Meal|Sausage|Cheese|Freezer|Sliced|Peppermint|Original|Shrimp|Peanut|Cans)\b/gi, ' ')
    .replace(/\s+(?:\d+\s*){1,3}[& ]*$/g, ' ')
    .replace(/\s+\d+([.,]\d+)?\s*$/, ' ')                                                  // trailing lone number
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(str) {
  const n = parseFloat(str.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function pricesInLine(line) {
  return [...line.matchAll(/\$\s*(\d{1,4}[.,]\d{2})/g)].map((m) => parsePrice(m[1])).filter(Boolean);
}

function normalizeNameKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isSkipLine(line) {
  return SKIP_RE.test(line) || APP_CATEGORY_RE.test(line) || APP_CHROME_RE.test(line);
}

function hasEnoughLetters(line) {
  return (line.match(/[a-zA-Z]/g) || []).length >= 3;
}

function isLikelyProductStart(line) {
  if (!hasEnoughLetters(line) || isSkipLine(line)) return false;
  const normalized = line.replace(/[^A-Za-z0-9&'\- ]/g, ' ');
  if (PRODUCT_START_RE.test(normalized)) return true;
  return SIZE_HINT_RE.test(normalized) && /[A-Z][a-z]/.test(normalized);
}

function isLikelyContinuation(line) {
  if (!hasEnoughLetters(line) || isSkipLine(line)) return false;
  if (PRICE_ONLY_RE.test(line) || ORDER_QTY_PRICE_RE.test(line) || QTY_LINE_RE.test(line)) return false;
  const words = line.match(/[A-Za-z]{3,}/g) || [];
  if (!SIZE_HINT_RE.test(line) && words.length < 2) return false;
  return line.length <= 90;
}

function addParsedItem(items, seen, nameRaw, price = null) {
  const name = cleanName(nameRaw);
  if (name.length < 3) return;
  if ((name.match(/[a-zA-Z]/g) || []).length < 3) return;

  const guess = guessFood(name);
  // Gibberish filter: vowel-less lines are usually OCR noise, unless
  // they match a known food abbreviation (e.g. "BNLS CHKN BRST").
  if (!guess.matched && !/[aeiouy]/i.test(name)) return;

  const pretty = titleCase(name);
  const key = normalizeNameKey(pretty);
  if (!key) return;

  const existingIndex = seen.get(key);
  if (existingIndex !== undefined) {
    if (!items[existingIndex].price && price) items[existingIndex].price = price;
    return;
  }

  seen.set(key, items.length);
  items.push({
    name: pretty,
    location: guess.location,
    days: guess.days,
    emoji: guess.emoji,
    matched: guess.matched,
    price,
  });
}

// Turn raw OCR text (paper receipt or order-app screenshot) into candidate
// grocery items with guessed location, shelf life, and price. Callers show
// these for user review.
export function parseReceiptText(text) {
  const items = [];
  const seen = new Map();
  const lines = text.split('\n').map((l) => l.trim());
  let pendingNameLines = [];

  function commitPending(price = null) {
    if (!pendingNameLines.length) return;
    addParsedItem(items, seen, pendingNameLines.join(' '), price);
    pendingNameLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 4) continue;

    if (ORDER_QTY_PRICE_RE.test(line)) {
      const prices = pricesInLine(line);
      commitPending(prices[prices.length - 1] || null);
      continue;
    }

    if (PRICE_ONLY_RE.test(line)) {
      const priceOnly = line.match(/(\d{1,4}[.,]\d{2})/);
      commitPending(priceOnly ? parsePrice(priceOnly[1]) : null);
      continue;
    }

    if (APP_CHROME_RE.test(line)) {
      if (/out of stock/i.test(line)) pendingNameLines = [];
      continue;
    }

    if (APP_CATEGORY_RE.test(line) || SKIP_RE.test(line)) {
      commitPending();
      continue;
    }

    if (QTY_LINE_RE.test(line)) continue;

    let nameRaw = null;
    let price = null;
    const priceMatch = line.match(PRICE_RE);
    let nextContentLine = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]) {
        if (!/\$/.test(lines[j]) && !hasEnoughLetters(lines[j])) continue;
        nextContentLine = lines[j];
        break;
      }
    }
    if (priceMatch && !ORDER_QTY_PRICE_RE.test(nextContentLine)) {
      // receipt style: "WHOLE MILK GAL   3.48"
      nameRaw = line.slice(0, priceMatch.index);
      price = parsePrice(priceMatch[1]);
    } else {
      // order-app style: product name, then (maybe a qty line, then) a
      // price-only line
      let j = i + 1;
      while (j < lines.length && (!lines[j] || QTY_LINE_RE.test(lines[j]))) j++;
      if (j < lines.length && PRICE_ONLY_RE.test(lines[j])) {
        nameRaw = line;
        price = parsePrice(lines[j].match(/(\d{1,4}[.,]\d{2})/)[1]);
      } else {
        if (pendingNameLines.length && isLikelyContinuation(line) && !PRODUCT_START_RE.test(line)) {
          pendingNameLines.push(line);
        } else if (isLikelyProductStart(line)) {
          commitPending();
          pendingNameLines.push(line);
        }
        continue;
      }
    }

    pendingNameLines = [];
    addParsedItem(items, seen, nameRaw, price);
  }

  commitPending();
  return items;
}
