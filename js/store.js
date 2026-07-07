const KEY = 'grocery-tracker-items-v1';
const PKEY = 'grocery-tracker-purchases-v1';
const UKEY = 'grocery-tracker-usage-v1';
const SKEY = 'grocery-tracker-shopping-v1';

export function loadItems() {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function saveItems(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// Purchase log: one entry per priced item ever added, kept even after the
// item is used or tossed, so monthly spend history survives.
export function loadPurchases() {
  try {
    const raw = localStorage.getItem(PKEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePurchases(purchases) {
  localStorage.setItem(PKEY, JSON.stringify(purchases));
}

// Usage log: one entry each time an item leaves the inventory, recording
// whether it was used up or wasted (tossed). Powers the waste breakdown.
export function loadUsage() {
  try {
    const raw = localStorage.getItem(UKEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveUsage(usage) {
  localStorage.setItem(UKEY, JSON.stringify(usage));
}

// Shopping list: things to buy next trip.
export function loadShopping() {
  try {
    const raw = localStorage.getItem(SKEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveShopping(shopping) {
  localStorage.setItem(SKEY, JSON.stringify(shopping));
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
