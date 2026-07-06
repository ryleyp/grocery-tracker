import { FOOD_DB, DEFAULT_GUESS } from './foodData.js';

// Lines that are clearly not grocery items (totals, payment, store noise).
const SKIP_RE = /subtotal|sub total|total|tax|change|cash|tender|visa|debit|credit|mastercard|amex|balance|thank|welcome|receipt|cashier|clerk|register|savings|you saved|coupon|discount|member|rewards|loyal|points|approved|auth|account|card|payment|refund|phone|tel[:.]|www\.|http|\.com|store\s*#|order|invoice|lane|trans|terminal|barcode|survey|return policy|items? sold|qty|price|amount|date|time|street|blvd|ave |suite/i;

// A price at the end of the line, e.g. "4.99", "4,99", "$4.99 F", "2.50 T"
const PRICE_RE = /[-$]?\s*(\d{1,4}[.,]\d{2})\s*[a-zA-Z*]{0,2}\s*$/;

// Quantity/weight-only lines, e.g. "2 @ 3.99", "1.24 lb @ 0.99/lb"
const QTY_LINE_RE = /^\s*\d+([.,]\d+)?\s*(@|x|ea|lb|kg|oz|\/)/i;

export function guessFood(name) {
  const n = ' ' + name.toLowerCase() + ' ';
  for (const entry of FOOD_DB) {
    for (const kw of entry.keywords) {
      if (n.includes(kw)) {
        return { location: entry.location, days: entry.days, matched: true };
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
    .replace(/\b\d*(ea|pk|pkg|ct|oz|lb|lbs|kg|g|ml|l|gal|qt|pt|fl)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Turn raw OCR text into candidate grocery items with guessed
// location + shelf life. Callers show these for user review.
export function parseReceiptText(text) {
  const items = [];
  const seen = new Set();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.length < 4) continue;
    if (SKIP_RE.test(line)) continue;
    if (QTY_LINE_RE.test(line)) continue;

    const priceMatch = line.match(PRICE_RE);
    if (!priceMatch) continue; // item lines on receipts carry a price

    const name = cleanName(line.slice(0, priceMatch.index));
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
    items.push({ name: pretty, location: guess.location, days: guess.days, matched: guess.matched });
  }

  return items;
}
