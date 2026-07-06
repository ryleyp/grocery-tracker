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
    .trim();
}

function cleanName(raw) {
  return raw
    .replace(/\b\d{4,}\b/g, ' ')          // long SKU/UPC numbers
    .replace(/[^A-Za-z0-9%&'\- ]/g, ' ')  // OCR junk characters
    .replace(/\b\d+([.,]\d+)?\s*(ea|pk|pkg|ct|oz|ounces?|lb|lbs|ibs?|pounds?|kg|g|ml|l|gal|gallons?|qt|quarts?|pt|pints?|fl|liters?|litres?)\b/gi, ' ') // "2.5 lb", "8oz"
    .replace(/\b(ea|pk|pkg|ct|oz|ounces?|lb|lbs|ibs?|pounds?|kg|g|ml|l|gal|gallons?|qt|quarts?|pt|pints?|fl|liters?|litres?)\b/gi, ' ')                 // bare units
    .replace(/\s+\d+([.,]\d+)?\s*$/, ' ')                                                  // trailing lone number
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(str) {
  const n = parseFloat(str.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Turn raw OCR text (paper receipt or order-app screenshot) into candidate
// grocery items with guessed location, shelf life, and price. Callers show
// these for user review.
export function parseReceiptText(text) {
  const items = [];
  const seen = new Set();
  const lines = text.split('\n').map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 4) continue;
    if (SKIP_RE.test(line)) continue;
    if (QTY_LINE_RE.test(line)) continue;
    if (PRICE_ONLY_RE.test(line)) continue;

    let nameRaw = null;
    let price = null;
    const priceMatch = line.match(PRICE_RE);
    if (priceMatch) {
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
        continue;
      }
    }

    const name = cleanName(nameRaw);
    if (name.length < 3) continue;
    if ((name.match(/[a-zA-Z]/g) || []).length < 3) continue;

    const guess = guessFood(name);
    // Gibberish filter: vowel-less lines are usually OCR noise, unless
    // they match a known food abbreviation (e.g. "BNLS CHKN BRST").
    if (!guess.matched && !/[aeiouy]/i.test(name)) continue;

    const pretty = titleCase(name);
    const key = pretty.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name: pretty,
      location: guess.location,
      days: guess.days,
      emoji: guess.emoji,
      matched: guess.matched,
      price,
    });
  }

  return items;
}
