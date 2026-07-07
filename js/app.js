import { loadItems, saveItems, loadPurchases, savePurchases, newId } from './store.js';
import { parseReceiptText, guessFood } from './parser.js';
import { recognizeReceipt } from './ocr.js';
import { applyProductInfo, enrichItemsWithProductInfo, lookupProductInfo, productInfoLabel } from './productInfo.js';
import { BUILD_BRANCH, BUILD_SHA, BUILD_TIME } from './version.js';

const LOCATIONS = {
  fridge: { label: 'Fridge', emoji: '🧊', empty: 'Your fridge is empty!' },
  freezer: { label: 'Freezer', emoji: '❄️', empty: 'Nothing chilling in here!' },
  pantry: { label: 'Pantry', emoji: '🥫', empty: 'The pantry is bare!' },
};

const CATEGORY_RULES = [
  {
    title: 'Produce',
    keywords: ['apple', 'spinach', 'lettuce', 'romaine', 'kale', 'salad', 'berry', 'berries', 'grape', 'orange', 'lemon', 'lime', 'broccoli', 'carrot', 'celery', 'cucumber', 'pepper', 'zucchini', 'squash', 'mushroom', 'asparagus', 'corn', 'cilantro', 'parsley', 'basil', 'avocado', 'peach', 'plum', 'pear', 'mango', 'kiwi', 'melon'],
  },
  {
    title: 'Dairy',
    keywords: ['milk', 'yogurt', 'yoghurt', 'cream', 'cheese', 'butter', 'egg', 'tofu'],
  },
  {
    title: 'Meat & Seafood',
    keywords: ['beef', 'steak', 'chicken', 'pork', 'turkey', 'salmon', 'tilapia', 'shrimp', 'fish', 'bacon', 'sausage', 'ham', 'deli'],
  },
  {
    title: 'Prepared',
    keywords: ['hummus', 'salsa', 'guacamole', 'dip', 'dough', 'juice', 'lemonade'],
  },
  {
    title: 'Condiments',
    keywords: ['mayo', 'ketchup', 'mustard', 'relish', 'sauce', 'dressing', 'jam', 'jelly', 'pickle', 'olive', 'kimchi'],
  },
];

const DEMO_CATEGORIES = [
  {
    title: 'Produce',
    badgeText: 'Expires: 2 days',
    tone: 'danger',
    items: [
      { name: 'Apples', meta: '(6)', emoji: '🍎', demo: true },
      { name: 'Spinach', meta: '(1 bag)', emoji: '🥬', demo: true },
    ],
  },
  {
    title: 'Dairy',
    badgeText: 'Expires: 2 days',
    tone: 'warning',
    items: [
      { name: 'Milk', meta: '(1 gal)', emoji: '🥛', demo: true },
      { name: 'Yogurt', meta: '(3)', emoji: '🥣', demo: true },
    ],
  },
];

const SOON_DAYS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPO = 'ryleyp/grocery-tracker';
const GITHUB_MAIN_COMMIT = `https://api.github.com/repos/${REPO}/commits/main`;
const REFRESH_SNAPSHOT_KEY = 'grocery-tracker-refresh-snapshot-v1';

let items = loadItems();
let purchases = loadPurchases();
let currentTab = 'home';
let editingId = null; // null = adding new
let editingProductInfo = null;

const $ = (id) => document.getElementById(id);

// ---------- date helpers ----------

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validDate(date) {
  return DATE_RE.test(date || '');
}

function purchaseDate(item) {
  if (validDate(item.purchasedAt)) return item.purchasedAt;
  if (validDate(item.addedAt)) return item.addedAt;
  return todayStr();
}

function shortDate(date) {
  if (!validDate(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysLeft(expiresAt) {
  const [y, m, d] = expiresAt.split('-').map(Number);
  const exp = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exp - today) / 86400000);
}

function expiryStatus(item) {
  const left = daysLeft(item.expiresAt);
  if (left < 0) return 'expired';
  if (left <= SOON_DAYS) return 'soon';
  return 'ok';
}

function expiryText(item) {
  const left = daysLeft(item.expiresAt);
  if (left < 0) return left === -1 ? 'Expired yesterday — toss it! 🙊' : `Expired ${-left} days ago — toss it! 🙊`;
  if (left === 0) return 'Use it today! 🍽️';
  if (left === 1) return 'Use by tomorrow';
  if (left <= SOON_DAYS) return `Only ${left} days left`;
  return `Happy for ${left} more days`;
}

function itemEmoji(item) {
  return item.emoji || guessFood(item.name).emoji;
}

function itemCategory(item) {
  const name = ` ${item.name.toLowerCase()} `;
  const rule = CATEGORY_RULES.find((category) =>
    category.keywords.some((keyword) => name.includes(keyword))
  );
  if (rule) return rule.title;
  if (item.location === 'freezer') return 'Frozen';
  if (item.location === 'pantry') return 'Pantry';
  return 'Other';
}

function compactDaysLabel(left) {
  if (left < 0) return 'Expired';
  if (left === 0) return 'Expires: today';
  if (left === 1) return 'Expires: 1 day';
  return `Expires: ${left} days`;
}

function badgeTone(left) {
  if (left <= 2) return 'danger';
  if (left <= 5) return 'warning';
  return 'good';
}

function dashboardMeta(item) {
  const left = daysLeft(item.expiresAt);
  if (left < 0) return '(expired)';
  if (left === 0) return '(today)';
  if (left === 1) return '(1 day)';
  return `(${left} days)`;
}

function fmtMoney(n) {
  return '$' + n.toFixed(2);
}

function daysUntil(date) {
  return validDate(date) ? Math.max(0, daysLeft(date)) : 7;
}

function sanitizeProductInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const suggestion = raw.suggestion && Object.hasOwn(LOCATIONS, raw.suggestion.location)
    ? {
        location: raw.suggestion.location,
        days: Number.isFinite(Number(raw.suggestion.days)) ? Math.max(1, Math.round(Number(raw.suggestion.days))) : 7,
        emoji: typeof raw.suggestion.emoji === 'string' ? raw.suggestion.emoji : LOCATIONS[raw.suggestion.location].emoji,
        confidence: Number.isFinite(Number(raw.suggestion.confidence)) ? Number(raw.suggestion.confidence) : 0,
      }
    : null;

  return {
    source: typeof raw.source === 'string' ? raw.source.slice(0, 40) : 'Open Food Facts',
    query: typeof raw.query === 'string' ? raw.query.slice(0, 120) : '',
    productName: typeof raw.productName === 'string' ? raw.productName.slice(0, 120) : '',
    brand: typeof raw.brand === 'string' ? raw.brand.slice(0, 80) : '',
    category: typeof raw.category === 'string' ? raw.category.slice(0, 120) : '',
    quantity: typeof raw.quantity === 'string' ? raw.quantity.slice(0, 60) : '',
    suggestion,
    matchedAt: typeof raw.matchedAt === 'string' ? raw.matchedAt : new Date().toISOString(),
  };
}

function productInfoNote(result, note) {
  if (!result) return note;
  if (result.matched) {
    return `${note} Product info matched ${result.matched} item${result.matched === 1 ? '' : 's'} online.`;
  }
  if (result.unavailable) {
    return `${note} Online product info was unavailable, so local categories were used.`;
  }
  return note;
}

// Keep the purchase log in step with an item: create/update the entry
// when the item has a price, drop it if the price is cleared.
function syncPurchase(item) {
  const idx = purchases.findIndex((p) => p.id === item.id);
  if (item.price > 0) {
    const entry = { id: item.id, date: purchaseDate(item), name: item.name, price: item.price };
    if (idx >= 0) purchases[idx] = { ...purchases[idx], ...entry };
    else purchases.push(entry);
  } else if (idx >= 0) {
    purchases.splice(idx, 1);
  }
  savePurchases(purchases);
}

// ---------- rendering ----------

function persist() {
  saveItems(items);
}

function render() {
  $('dashboard').classList.toggle('hidden', currentTab !== 'home');
  $('inventory').classList.toggle('hidden', currentTab !== 'list');
  $('spend').classList.toggle('hidden', currentTab !== 'spend');
  $('settings').classList.toggle('hidden', currentTab !== 'settings');

  if (currentTab === 'home') renderDashboard();
  if (currentTab === 'list') renderInventoryList();
  if (currentTab === 'spend') renderSpend();

  const expired = items.filter((i) => expiryStatus(i) === 'expired');
  const chip = $('alert-chip');
  chip.classList.toggle('hidden', expired.length === 0);
  if (expired.length) chip.textContent = `${expired.length} to toss`;

  const homeBadge = document.querySelector('[data-badge="home"]');
  if (homeBadge) {
    homeBadge.textContent = expired.length;
    homeBadge.classList.toggle('hidden', expired.length === 0);
  }

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === currentTab)
  );
}

function renderDashboard() {
  const dashboardItems = items
    .slice()
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name));

  const cards = dashboardItems.length ? dashboardCardsFor(dashboardItems) : DEMO_CATEGORIES;
  const stack = $('category-cards');
  stack.innerHTML = '';
  for (const card of cards) stack.appendChild(categoryCard(card));

  renderExpiringSoon();
}

function dashboardCardsFor(list) {
  const groups = new Map();
  for (const item of list) {
    const title = itemCategory(item);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(item);
  }

  const orderedTitles = [
    ...CATEGORY_RULES.map((rule) => rule.title),
    'Frozen',
    'Pantry',
    'Other',
  ];

  return [...groups.entries()]
    .sort((a, b) => {
      const ai = orderedTitles.indexOf(a[0]);
      const bi = orderedTitles.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
    })
    .map(([title, group]) => {
      const minLeft = Math.min(...group.map((item) => daysLeft(item.expiresAt)));
      return {
        title,
        badgeText: compactDaysLabel(minLeft),
        tone: badgeTone(minLeft),
        items: group.slice(0, 5).map((item) => ({
          id: item.id,
          name: item.name,
          meta: dashboardMeta(item),
          emoji: itemEmoji(item),
        })),
        extra: Math.max(0, group.length - 5),
      };
    });
}

function categoryCard(card) {
  const article = document.createElement('article');
  article.className = 'category-card';

  const head = document.createElement('div');
  head.className = 'category-card-head';
  const title = document.createElement('h2');
  title.className = 'category-title';
  title.textContent = card.title;
  const badge = document.createElement('span');
  badge.className = `expiry-badge ${card.tone}`;
  badge.textContent = card.badgeText;
  head.append(title, badge);

  const row = document.createElement('div');
  row.className = 'dashboard-items';
  for (const item of card.items) row.appendChild(dashboardItem(item));
  if (card.extra > 0) {
    row.appendChild(dashboardItem({
      name: `${card.extra} more`,
      meta: '',
      emoji: '＋',
      demo: true,
    }));
  }

  article.append(head, row);
  return article;
}

function dashboardItem(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dashboard-item';
  btn.disabled = item.demo || !item.id;
  if (item.id) btn.addEventListener('click', () => openEdit(item.id));

  const icon = document.createElement('span');
  icon.className = 'dashboard-item-icon';
  icon.textContent = item.emoji;
  const name = document.createElement('span');
  name.className = 'dashboard-item-name';
  name.textContent = item.name;
  const meta = document.createElement('span');
  meta.className = 'dashboard-item-meta';
  meta.textContent = item.meta;
  btn.append(icon, name, meta);
  return btn;
}

function renderExpiringSoon() {
  const urgent = items
    .filter((item) => daysLeft(item.expiresAt) <= SOON_DAYS)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name))
    .slice(0, 4);

  const list = $('expiring-list');
  list.innerHTML = '';
  if (!urgent.length) {
    const li = document.createElement('li');
    li.className = 'expiring-empty';
    li.textContent = 'Nothing urgent right now.';
    list.appendChild(li);
    return;
  }

  for (const item of urgent) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'expiring-card';
    btn.addEventListener('click', () => openEdit(item.id));

    const icon = document.createElement('span');
    icon.className = 'expiring-icon';
    icon.textContent = itemEmoji(item);
    const main = document.createElement('span');
    main.className = 'expiring-main';
    const name = document.createElement('span');
    name.className = 'expiring-name';
    name.textContent = item.name;
    const meta = document.createElement('span');
    meta.className = 'expiring-meta';
    meta.textContent = `${LOCATIONS[item.location].label} · ${expiryText(item)}`;
    main.append(name, meta);
    btn.append(icon, main);
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function renderInventoryList() {
  $('section-title').textContent = 'Grocery List';
  $('empty-emoji').textContent = '🛒';
  $('empty-text').textContent = 'Nothing in here yet.';

  const list = items
    .slice()
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.location.localeCompare(b.location) || a.name.localeCompare(b.name));

  $('section-count').textContent = list.length ? `${list.length} item${list.length === 1 ? '' : 's'}` : '';
  $('section-count').classList.toggle('hidden', !list.length);
  $('empty-state').classList.toggle('hidden', list.length > 0);

  const ul = $('item-list');
  ul.innerHTML = '';
  for (const item of list) ul.appendChild(itemCard(item));
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function renderSpend() {
  const byMonth = new Map();
  for (const p of purchases) {
    const k = p.date.slice(0, 7);
    const e = byMonth.get(k) || { total: 0, count: 0 };
    e.total += p.price;
    e.count++;
    byMonth.set(k, e);
  }

  const nowKey = todayStr().slice(0, 7);
  const cur = byMonth.get(nowKey) || { total: 0, count: 0 };
  $('spend-amount').textContent = fmtMoney(cur.total);
  $('spend-sub').textContent = cur.count
    ? `${cur.count} item${cur.count === 1 ? '' : 's'} · ${monthLabel(nowKey)}`
    : `Nothing tracked yet in ${monthLabel(nowKey)} — scan a receipt! 🧾`;

  const past = [...byMonth.entries()]
    .filter(([k]) => k !== nowKey)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);
  const max = Math.max(cur.total, ...past.map(([, v]) => v.total), 0.01);

  const ul = $('month-list');
  ul.innerHTML = '';
  for (const [key, { total, count }] of past) {
    const li = document.createElement('li');
    li.className = 'month-row';
    const top = document.createElement('div');
    top.className = 'month-top';
    const label = document.createElement('span');
    label.textContent = monthLabel(key);
    const amt = document.createElement('span');
    amt.textContent = `${fmtMoney(total)} · ${count} item${count === 1 ? '' : 's'}`;
    top.append(label, amt);
    const track = document.createElement('div');
    track.className = 'month-bar-track';
    const bar = document.createElement('div');
    bar.className = 'month-bar';
    bar.style.width = `${Math.max(3, Math.round((total / max) * 100))}%`;
    track.appendChild(bar);
    li.append(top, track);
    ul.appendChild(li);
  }
}

function itemCard(item, { tossOnly = false } = {}) {
  const li = document.createElement('li');
  const status = expiryStatus(item);
  li.className = `item-card ${status}`;

  const bubble = document.createElement('div');
  bubble.className = 'item-emoji';
  bubble.textContent = itemEmoji(item);

  const main = document.createElement('div');
  main.className = 'item-main';
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = item.name;
  const exp = document.createElement('div');
  exp.className = `item-expiry ${status}`;
  const locPrefix = currentTab === 'list' ? `${LOCATIONS[item.location].emoji} ${LOCATIONS[item.location].label} · ` : '';
  exp.textContent = tossOnly
    ? `${LOCATIONS[item.location].emoji} ${LOCATIONS[item.location].label} · ${expiryText(item)}`
    : locPrefix + expiryText(item) + (item.price > 0 ? ` · ${fmtMoney(item.price)} · bought ${shortDate(purchaseDate(item))}` : '');
  main.append(name, exp);
  if (!tossOnly) main.addEventListener('click', () => openEdit(item.id));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item-btn' + (status === 'expired' ? ' toss' : '');
  btn.textContent = tossOnly ? '✓' : status === 'expired' ? '🗑️ Toss' : '✓ Used';
  btn.addEventListener('click', () => {
    items = items.filter((i) => i.id !== item.id);
    persist();
    render();
    if (tossOnly) renderTossList();
  });

  li.append(bubble, main, btn);
  return li;
}

// ---------- add / edit modal ----------

function defaultAddLocation() {
  return Object.hasOwn(LOCATIONS, currentTab) ? currentTab : 'fridge';
}

function openEdit(id) {
  editingId = id || null;
  const item = id ? items.find((i) => i.id === id) : null;
  editingProductInfo = sanitizeProductInfo(item?.productInfo);
  $('edit-title').textContent = item ? 'Edit item' : 'Add item';
  $('edit-name').value = item ? item.name : '';
  $('edit-location').value = item ? item.location : defaultAddLocation();
  $('edit-expires').value = item ? item.expiresAt : addDays(7);
  $('edit-purchased').value = item ? purchaseDate(item) : todayStr();
  $('edit-price').value = item && item.price > 0 ? item.price.toFixed(2) : '';
  $('edit-info-status').textContent = editingProductInfo ? productInfoLabel(editingProductInfo) : '';
  $('btn-edit-delete').classList.toggle('hidden', !item);
  $('edit-backdrop').classList.remove('hidden');
  if (!item) $('edit-name').focus();
}

function closeEdit() {
  $('edit-backdrop').classList.add('hidden');
  editingId = null;
  editingProductInfo = null;
}

$('btn-edit-save').addEventListener('click', () => {
  const name = $('edit-name').value.trim();
  if (!name) {
    $('edit-name').focus();
    return;
  }
  const location = $('edit-location').value;
  const expiresAt = $('edit-expires').value || addDays(7);
  const purchasedAt = $('edit-purchased').value || todayStr();
  const priceVal = parseFloat($('edit-price').value);
  const price = Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null;

  let item;
  if (editingId) {
    item = items.find((i) => i.id === editingId);
    Object.assign(item, { name, location, expiresAt, purchasedAt, price, productInfo: editingProductInfo });
  } else {
    item = { id: newId(), name, location, expiresAt, addedAt: todayStr(), purchasedAt, price, productInfo: editingProductInfo };
    items.push(item);
  }
  syncPurchase(item);
  persist();
  if (currentTab !== 'list') currentTab = 'home';
  closeEdit();
  render();
});

$('btn-edit-cancel').addEventListener('click', closeEdit);
$('btn-edit-delete').addEventListener('click', () => {
  items = items.filter((i) => i.id !== editingId);
  persist();
  closeEdit();
  render();
});

// Suggest expiry/location as the user types a new item's name
$('edit-name').addEventListener('input', () => {
  editingProductInfo = null;
  $('edit-info-status').textContent = '';
  if (editingId) return;
  const guess = guessFood($('edit-name').value);
  if (guess.matched) {
    $('edit-location').value = guess.location;
    $('edit-expires').value = addDays(guess.days);
  }
});

$('btn-edit-lookup').addEventListener('click', async () => {
  const name = $('edit-name').value.trim();
  if (!name) {
    $('edit-name').focus();
    return;
  }

  const btn = $('btn-edit-lookup');
  btn.disabled = true;
  $('edit-info-status').textContent = 'Checking product info...';

  const result = await lookupProductInfo(name);
  if (result.unavailable) {
    $('edit-info-status').textContent = 'Product info is unavailable right now.';
    btn.disabled = false;
    return;
  }
  if (!result.info) {
    $('edit-info-status').textContent = 'No product match found.';
    btn.disabled = false;
    return;
  }

  const current = {
    name,
    location: $('edit-location').value,
    days: daysUntil($('edit-expires').value),
    matched: false,
  };
  const applied = applyProductInfo(current, result.info).item;
  editingProductInfo = sanitizeProductInfo(applied.productInfo);
  if (applied.productMatched) {
    $('edit-location').value = applied.location;
    $('edit-expires').value = addDays(applied.days);
  }
  $('edit-info-status').textContent = productInfoLabel(editingProductInfo);
  btn.disabled = false;
});

// ---------- add sheet ----------

function openAddSheet() {
  $('sheet-backdrop').classList.remove('hidden');
}

$('fab').addEventListener('click', openAddSheet);
$('btn-expiring-add').addEventListener('click', openAddSheet);
$('btn-sheet-cancel').addEventListener('click', () => $('sheet-backdrop').classList.add('hidden'));
$('sheet-backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

$('btn-manual').addEventListener('click', () => {
  $('sheet-backdrop').classList.add('hidden');
  openEdit(null);
});

$('btn-scan').addEventListener('click', () => {
  $('sheet-backdrop').classList.add('hidden');
  $('receipt-input').value = '';
  $('receipt-input').click();
});

$('btn-upload').addEventListener('click', () => {
  $('sheet-backdrop').classList.add('hidden');
  $('upload-input').value = '';
  $('upload-input').click();
});

// ---------- GitHub update check ----------

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '';
}

function showUpdateStatus(title, message, canRefresh = false) {
  $('update-title').textContent = title;
  $('update-message').textContent = message;
  const refreshBtn = $('btn-update-refresh');
  refreshBtn.classList.toggle('hidden', !canRefresh);
  refreshBtn.disabled = !canRefresh;
  $('update-backdrop').classList.remove('hidden');
}

async function clearAppCaches() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('grocery-tracker-')).map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.update().catch(() => {})));
  }
}

function saveRefreshSnapshot() {
  try {
    sessionStorage.setItem(
      REFRESH_SNAPSHOT_KEY,
      JSON.stringify({
        items,
        purchases,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // The regular localStorage copy is still the source of truth.
  }
}

function restoreRefreshSnapshotIfNeeded() {
  let snapshot = null;
  try {
    snapshot = JSON.parse(sessionStorage.getItem(REFRESH_SNAPSHOT_KEY) || 'null');
  } catch {
    snapshot = null;
  }

  try {
    sessionStorage.removeItem(REFRESH_SNAPSHOT_KEY);
  } catch {}

  if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.purchases)) return;
  if (items.length || !snapshot.items.length) return;

  items = snapshot.items;
  purchases = snapshot.purchases;
  persist();
  savePurchases(purchases);
}

function setUpdateRowBusy(isBusy) {
  const btn = $('btn-update');
  const action = btn.querySelector('.settings-action');
  btn.disabled = isBusy;
  if (action) action.textContent = isBusy ? '…' : '↻';
}

$('btn-update').addEventListener('click', async () => {
  setUpdateRowBusy(true);
  showUpdateStatus('Checking for updates', 'Looking at GitHub for the newest version.');

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    }

    const res = await fetch(GITHUB_MAIN_COMMIT, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('GitHub did not return an update status.');
    const latest = await res.json();
    const latestSha = latest.sha || '';

    if (BUILD_SHA && BUILD_SHA !== 'dev' && latestSha && latestSha !== BUILD_SHA) {
      showUpdateStatus(
        'Update available',
        `GitHub has ${shortSha(latestSha)}. This app is running ${shortSha(BUILD_SHA)}. Update to load the newest app code. Your groceries stay saved on this device.`,
        true
      );
    } else if (BUILD_SHA === 'dev') {
      showUpdateStatus(
        'GitHub is reachable',
        `Latest on GitHub is ${shortSha(latestSha)}. This local copy does not have deployed version metadata.`
      );
    } else {
      const built = BUILD_TIME ? ` Built ${shortDate(BUILD_TIME.slice(0, 10))}.` : '';
      showUpdateStatus('You are up to date', `Running ${shortSha(BUILD_SHA)} from ${BUILD_BRANCH || 'main'}.${built}`);
    }
  } catch (err) {
    showUpdateStatus('Could not check GitHub', err.message || 'Try again when you have a connection.');
  } finally {
    setUpdateRowBusy(false);
  }
});

$('btn-update-close').addEventListener('click', () => $('update-backdrop').classList.add('hidden'));

$('btn-update-refresh').addEventListener('click', async () => {
  $('btn-update-refresh').disabled = true;
  showUpdateStatus('Updating app', 'Refreshing the app code only. Your grocery list and spending history will stay saved.');
  saveRefreshSnapshot();
  await clearAppCaches();
  window.location.reload();
});

// ---------- scan & review ----------

function mergeParsedItems(parsed) {
  const out = [];
  const normalized = [];

  function keyFor(name) {
    return name
      .toLowerCase()
      .replace(/\bh-e-b\b/g, ' ')
      .replace(/\bavg\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function overlaps(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const min = Math.min(a.length, b.length);
    return min >= 14 && (a.includes(b) || b.includes(a));
  }

  function score(item) {
    let total = 0;
    if (item.price > 0) total += 100;
    if (item.name.includes('H-E-B')) total += 8;
    if (item.matched) total += 4;
    total += Math.min(item.name.length, 80) / 10;
    return total;
  }

  for (const item of parsed) {
    const key = keyFor(item.name);
    const existingIndex = normalized.findIndex((existing) => overlaps(existing, key));
    if (existingIndex >= 0) {
      if (score(item) > score(out[existingIndex])) {
        out[existingIndex] = item;
        normalized[existingIndex] = key;
      }
      continue;
    }
    normalized.push(key);
    out.push(item);
  }
  return out;
}

async function handleScanFiles(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  $('scan-backdrop').classList.remove('hidden');
  $('scan-progress').classList.remove('hidden');
  $('scan-review').classList.add('hidden');
  $('scan-error').classList.add('hidden');
  $('progress-bar').style.width = '0%';
  $('scan-status').textContent = 'Reading your receipt…';

  const parsed = [];
  const failed = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    $('scan-status').textContent = files.length === 1
      ? 'Reading your receipt…'
      : `Reading image ${i + 1} of ${files.length}…`;
    try {
      const text = await recognizeReceipt(file, (p) => {
        const overall = ((i + p) / files.length) * 100;
        $('progress-bar').style.width = `${Math.round(overall)}%`;
      });
      parsed.push(...parseReceiptText(text));
      $('progress-bar').style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
    } catch (err) {
      failed.push(file.name || `image ${i + 1}`);
    }
  }

  let merged = mergeParsedItems(parsed);
  if (!merged.length) {
    const msg = failed.length
      ? "We couldn't read enough text from those images. Try brighter screenshots, crop to the receipt/order list, or add items manually."
      : files.length > 1
        ? "We couldn't find any items in those images. Try brighter screenshots, crop to the receipt/order list, or add items manually."
        : "We couldn't find any items on that image. Try a clearer, well-lit shot — or add items manually.";
    showScanError(msg);
    return;
  }

  let productResult = null;
  if (navigator.onLine !== false) {
    $('scan-status').textContent = 'Checking product info...';
    productResult = await enrichItemsWithProductInfo(merged, {
      onProgress: ({ checked }) => {
        $('scan-status').textContent = checked
          ? `Checking product info (${checked})...`
          : 'Checking product info...';
      },
    });
    merged = productResult.items;
  }

  const note = files.length > 1
    ? `Found ${merged.length} possible item${merged.length === 1 ? '' : 's'} across ${files.length} image${files.length === 1 ? '' : 's'}. Fix anything that looks off before saving${failed.length ? `; ${failed.length} image${failed.length === 1 ? '' : 's'} could not be read.` : '.'}`
    : 'Uncheck anything that is not food. Fix names, spots, dates, and prices as needed.';
  showReview(merged, productInfoNote(productResult, note));
}

$('receipt-input').addEventListener('change', handleScanFiles);
$('upload-input').addEventListener('change', handleScanFiles);

function showScanError(msg) {
  $('scan-progress').classList.add('hidden');
  $('scan-review').classList.add('hidden');
  $('scan-error').classList.remove('hidden');
  $('scan-error-msg').textContent = msg;
}

function closeScan() {
  $('scan-backdrop').classList.add('hidden');
}

function setRowProductInfo(row, info, el) {
  const safeInfo = sanitizeProductInfo(info);
  if (safeInfo) {
    row.dataset.productInfo = JSON.stringify(safeInfo);
    el.textContent = productInfoLabel(safeInfo);
  } else {
    row.dataset.productInfo = '';
    el.textContent = '';
  }
  el.classList.toggle('hidden', !safeInfo);
}

function rowProductInfo(row) {
  try {
    return sanitizeProductInfo(JSON.parse(row.dataset.productInfo || 'null'));
  } catch {
    return null;
  }
}

function reviewRow({ name = '', location = 'pantry', days = 7, price = null, purchasedAt = todayStr(), checked = true, productInfo = null } = {}) {
  const li = document.createElement('li');
  li.className = 'review-row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.addEventListener('change', () => li.classList.toggle('excluded', !cb.checked));

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'review-name';
  nameInput.value = name;
  nameInput.placeholder = 'Item name';

  const meta = document.createElement('div');
  meta.className = 'review-meta';

  const sel = document.createElement('select');
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${loc.emoji} ${loc.label}`;
    sel.appendChild(opt);
  }
  sel.value = location;

  const expiresInput = document.createElement('input');
  expiresInput.type = 'date';
  expiresInput.className = 'review-expires';
  expiresInput.setAttribute('aria-label', 'Use or toss by');
  expiresInput.value = addDays(days);

  const purchasedInput = document.createElement('input');
  purchasedInput.type = 'date';
  purchasedInput.className = 'review-purchased';
  purchasedInput.setAttribute('aria-label', 'Bought on');
  purchasedInput.value = validDate(purchasedAt) ? purchasedAt : todayStr();

  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.step = '0.01';
  priceInput.min = '0';
  priceInput.inputMode = 'decimal';
  priceInput.placeholder = '$';
  priceInput.className = 'review-price';
  priceInput.setAttribute('aria-label', 'Price');
  if (price > 0) priceInput.value = price.toFixed(2);

  const info = document.createElement('div');
  info.className = 'review-info hidden';
  setRowProductInfo(li, productInfo, info);

  nameInput.addEventListener('input', () => {
    if (rowProductInfo(li)) setRowProductInfo(li, null, info);
  });

  // Re-guess when the user corrects an OCR'd name
  nameInput.addEventListener('change', () => {
    const guess = guessFood(nameInput.value);
    if (guess.matched) {
      sel.value = guess.location;
      expiresInput.value = addDays(guess.days);
    }
  });

  meta.append(sel, expiresInput, purchasedInput, priceInput);
  li.append(cb, nameInput, meta, info);
  return li;
}

function showReview(parsed, note = 'Review the auto-sorted items, then fix anything that looks off before saving.') {
  const ul = $('review-list');
  ul.innerHTML = '';
  for (const p of parsed) ul.appendChild(reviewRow(p));
  $('scan-review-note').textContent = note;
  $('scan-progress').classList.add('hidden');
  $('scan-review').classList.remove('hidden');
}

function currentReviewItems() {
  return [...$('review-list').querySelectorAll('.review-row')].map((row) => {
    const name = row.querySelector('.review-name').value.trim();
    const location = row.querySelector('select').value;
    const expiresAt = row.querySelector('.review-expires').value;
    const purchasedAt = row.querySelector('.review-purchased').value || todayStr();
    const priceVal = parseFloat(row.querySelector('.review-price').value);
    return {
      name,
      location,
      days: daysUntil(expiresAt),
      price: Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null,
      purchasedAt,
      checked: row.querySelector('input[type="checkbox"]').checked,
      productInfo: rowProductInfo(row),
      matched: false,
    };
  });
}

$('btn-review-add-row').addEventListener('click', () => {
  $('review-list').appendChild(reviewRow({ checked: true }));
});

$('btn-review-lookup').addEventListener('click', async () => {
  const current = currentReviewItems().filter((item) => item.name);
  if (!current.length) return;

  const btn = $('btn-review-lookup');
  btn.disabled = true;
  btn.textContent = 'Checking product info...';
  const result = await enrichItemsWithProductInfo(current, {
    onProgress: ({ checked }) => {
      btn.textContent = checked ? `Checking product info (${checked})...` : 'Checking product info...';
    },
  });
  btn.disabled = false;
  btn.textContent = '🔎 Look up product info';
  showReview(result.items, productInfoNote(result, 'Review the product matches, then fix anything that looks off before saving.'));
});

$('btn-review-cancel').addEventListener('click', closeScan);
$('btn-error-close').addEventListener('click', closeScan);
$('btn-error-manual').addEventListener('click', () => {
  closeScan();
  openEdit(null);
});

$('btn-review-save').addEventListener('click', () => {
  const rows = $('review-list').querySelectorAll('.review-row');
  let added = 0;
  for (const row of rows) {
    if (!row.querySelector('input[type="checkbox"]').checked) continue;
    const name = row.querySelector('.review-name').value.trim();
    if (!name) continue;
    const location = row.querySelector('select').value;
    const expiresAt = row.querySelector('.review-expires').value || addDays(7);
    const purchasedAt = row.querySelector('.review-purchased').value || todayStr();
    const priceVal = parseFloat(row.querySelector('.review-price').value);
    const price = Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null;
    const item = { id: newId(), name, location, expiresAt, addedAt: todayStr(), purchasedAt, price, productInfo: rowProductInfo(row) };
    items.push(item);
    syncPurchase(item);
    added++;
  }
  if (added) {
    persist();
    currentTab = 'home';
  }
  closeScan();
  render();
});

// ---------- toss list ----------

function renderTossList() {
  const expired = items
    .filter((i) => expiryStatus(i) === 'expired')
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const ul = $('toss-list');
  ul.innerHTML = '';
  for (const item of expired) ul.appendChild(itemCard(item, { tossOnly: true }));
  if (!expired.length) $('toss-backdrop').classList.add('hidden');
}

$('alert-chip').addEventListener('click', () => {
  renderTossList();
  $('toss-backdrop').classList.remove('hidden');
});

$('btn-toss-close').addEventListener('click', () => $('toss-backdrop').classList.add('hidden'));

$('btn-toss-all').addEventListener('click', () => {
  items = items.filter((i) => expiryStatus(i) !== 'expired');
  persist();
  $('toss-backdrop').classList.add('hidden');
  render();
});

// ---------- backup: export & import ----------

const BACKUP_VERSION = 1;
let pendingImport = null;

$('btn-backup').addEventListener('click', () => $('backup-backdrop').classList.remove('hidden'));
$('btn-backup-cancel').addEventListener('click', () => $('backup-backdrop').classList.add('hidden'));
$('btn-spend').addEventListener('click', () => {
  currentTab = 'spend';
  render();
});

$('btn-export').addEventListener('click', () => {
  const payload = {
    app: 'grocery-tracker',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items,
    purchases,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grocery-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  $('backup-backdrop').classList.add('hidden');
});

$('btn-import').addEventListener('click', () => {
  $('import-input').value = '';
  $('import-input').click();
});

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const price = Number(r.price);
    const addedAt = validDate(r.addedAt) ? r.addedAt : todayStr();
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name: r.name.trim().slice(0, 80),
      location: Object.hasOwn(LOCATIONS, r.location) ? r.location : 'pantry',
      expiresAt: validDate(r.expiresAt) ? r.expiresAt : addDays(7),
      addedAt,
      purchasedAt: validDate(r.purchasedAt) ? r.purchasedAt : addedAt,
      price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
      productInfo: sanitizeProductInfo(r.productInfo),
    });
  }
  return out;
}

function sanitizePurchases(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      date: validDate(r.date) ? r.date : todayStr(),
      name: r.name.trim().slice(0, 80),
      price: Math.round(price * 100) / 100,
    });
  }
  return out;
}

$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $('backup-backdrop').classList.add('hidden');
  let imported = [];
  let importedPurchases = [];
  let exportedAt = null;
  try {
    const data = JSON.parse(await file.text());
    exportedAt = typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 10) : null;
    imported = sanitizeItems(Array.isArray(data) ? data : data.items);
    importedPurchases = sanitizePurchases(Array.isArray(data) ? [] : data.purchases);
  } catch {
    imported = [];
  }
  if (!imported.length && !importedPurchases.length) {
    $('import-summary').textContent = "That file doesn't look like a Grocery Tracker backup — no items found in it.";
    $('btn-import-merge').classList.add('hidden');
    $('btn-import-replace').classList.add('hidden');
  } else {
    $('import-summary').textContent =
      `Found ${imported.length} item${imported.length === 1 ? '' : 's'}` +
      (exportedAt ? ` from a backup saved ${exportedAt}.` : '.') +
      ` Merge them into your current list (${items.length} item${items.length === 1 ? '' : 's'}), or replace it entirely?`;
    $('btn-import-merge').classList.remove('hidden');
    $('btn-import-replace').classList.remove('hidden');
  }
  pendingImport = { items: imported, purchases: importedPurchases };
  $('import-backdrop').classList.remove('hidden');
});

function finishImport(mergedItems, mergedPurchases) {
  items = mergedItems;
  purchases = mergedPurchases;
  persist();
  savePurchases(purchases);
  pendingImport = null;
  $('import-backdrop').classList.add('hidden');
  render();
}

$('btn-import-merge').addEventListener('click', () => {
  if (!pendingImport) return;
  const have = new Set(items.map((i) => i.id));
  const dupes = new Set(items.map((i) => `${i.name.toLowerCase()}|${i.location}|${i.expiresAt}`));
  const mergedItems = items.concat(
    pendingImport.items.filter(
      (i) => !have.has(i.id) && !dupes.has(`${i.name.toLowerCase()}|${i.location}|${i.expiresAt}`)
    )
  );
  const havePurchases = new Set(purchases.map((p) => p.id));
  const mergedPurchases = purchases.concat(pendingImport.purchases.filter((p) => !havePurchases.has(p.id)));
  finishImport(mergedItems, mergedPurchases);
});

$('btn-import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  finishImport(pendingImport.items, pendingImport.purchases);
});

$('btn-import-cancel').addEventListener('click', () => {
  pendingImport = null;
  $('import-backdrop').classList.add('hidden');
});

// ---------- tabs ----------

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'scan') {
      openAddSheet();
      return;
    }
    currentTab = tab.dataset.tab;
    render();
  })
);

// Close modals when tapping the dimmed backdrop
for (const id of ['edit-backdrop', 'scan-backdrop', 'toss-backdrop', 'backup-backdrop', 'import-backdrop', 'update-backdrop']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === e.currentTarget && id !== 'scan-backdrop') e.currentTarget.classList.add('hidden');
  });
}

// ---------- boot ----------

restoreRefreshSnapshotIfNeeded();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
