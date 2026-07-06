import { loadItems, saveItems, loadPurchases, savePurchases, newId } from './store.js';
import { parseReceiptText, guessFood } from './parser.js';
import { recognizeReceipt } from './ocr.js';

const LOCATIONS = {
  fridge: { label: 'Fridge', emoji: '🧊', empty: 'Your fridge is empty!' },
  freezer: { label: 'Freezer', emoji: '❄️', empty: 'Nothing chilling in here!' },
  pantry: { label: 'Pantry', emoji: '🥫', empty: 'The pantry is bare!' },
};

const SOON_DAYS = 3;

let items = loadItems();
let purchases = loadPurchases();
let currentTab = 'fridge';
let editingId = null; // null = adding new

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

function fmtMoney(n) {
  return '$' + n.toFixed(2);
}

// Keep the purchase log in step with an item: create/update the entry
// when the item has a price, drop it if the price is cleared.
function syncPurchase(item) {
  const idx = purchases.findIndex((p) => p.id === item.id);
  if (item.price > 0) {
    const entry = { id: item.id, date: item.addedAt || todayStr(), name: item.name, price: item.price };
    if (idx >= 0) purchases[idx] = { ...purchases[idx], name: item.name, price: item.price };
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
  const isSpend = currentTab === 'spend';
  $('inventory').classList.toggle('hidden', isSpend);
  $('spend').classList.toggle('hidden', !isSpend);

  if (isSpend) {
    renderSpend();
  } else {
    const loc = LOCATIONS[currentTab];
    $('section-title').textContent = `${loc.emoji} ${loc.label}`;
    $('empty-emoji').textContent = loc.emoji;
    $('empty-text').textContent = loc.empty;

    const list = items
      .filter((i) => i.location === currentTab)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name));

    $('section-count').textContent = list.length ? `${list.length} item${list.length === 1 ? '' : 's'}` : '';
    $('section-count').classList.toggle('hidden', !list.length);
    $('empty-state').classList.toggle('hidden', list.length > 0);

    const ul = $('item-list');
    ul.innerHTML = '';
    for (const item of list) ul.appendChild(itemCard(item));
  }

  // Per-tab expired badges
  for (const key of Object.keys(LOCATIONS)) {
    const n = items.filter((i) => i.location === key && expiryStatus(i) === 'expired').length;
    const badge = document.querySelector(`[data-badge="${key}"]`);
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }

  // Global toss alert
  const expired = items.filter((i) => expiryStatus(i) === 'expired');
  const chip = $('alert-chip');
  chip.classList.toggle('hidden', expired.length === 0);
  if (expired.length) chip.textContent = `🗑️ ${expired.length} to toss`;

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === currentTab)
  );
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
  exp.textContent = tossOnly
    ? `${LOCATIONS[item.location].emoji} ${LOCATIONS[item.location].label} · ${expiryText(item)}`
    : expiryText(item) + (item.price > 0 ? ` · ${fmtMoney(item.price)}` : '');
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

function openEdit(id) {
  editingId = id || null;
  const item = id ? items.find((i) => i.id === id) : null;
  $('edit-title').textContent = item ? 'Edit item' : 'Add item';
  $('edit-name').value = item ? item.name : '';
  $('edit-location').value = item ? item.location : (currentTab === 'spend' ? 'pantry' : currentTab);
  $('edit-expires').value = item ? item.expiresAt : addDays(7);
  $('edit-price').value = item && item.price > 0 ? item.price.toFixed(2) : '';
  $('btn-edit-delete').classList.toggle('hidden', !item);
  $('edit-backdrop').classList.remove('hidden');
  if (!item) $('edit-name').focus();
}

function closeEdit() {
  $('edit-backdrop').classList.add('hidden');
  editingId = null;
}

$('btn-edit-save').addEventListener('click', () => {
  const name = $('edit-name').value.trim();
  if (!name) {
    $('edit-name').focus();
    return;
  }
  const location = $('edit-location').value;
  const expiresAt = $('edit-expires').value || addDays(7);
  const priceVal = parseFloat($('edit-price').value);
  const price = Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null;

  let item;
  if (editingId) {
    item = items.find((i) => i.id === editingId);
    Object.assign(item, { name, location, expiresAt, price });
  } else {
    item = { id: newId(), name, location, expiresAt, addedAt: todayStr(), price };
    items.push(item);
  }
  syncPurchase(item);
  persist();
  currentTab = location;
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
  if (editingId) return;
  const guess = guessFood($('edit-name').value);
  if (guess.matched) {
    $('edit-location').value = guess.location;
    $('edit-expires').value = addDays(guess.days);
  }
});

// ---------- add sheet ----------

$('fab').addEventListener('click', () => $('sheet-backdrop').classList.remove('hidden'));
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

// ---------- scan & review ----------

async function handleScanFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  $('scan-backdrop').classList.remove('hidden');
  $('scan-progress').classList.remove('hidden');
  $('scan-review').classList.add('hidden');
  $('scan-error').classList.add('hidden');
  $('progress-bar').style.width = '0%';
  $('scan-status').textContent = 'Reading your receipt…';

  try {
    const text = await recognizeReceipt(file, (p) => {
      $('progress-bar').style.width = `${Math.round(p * 100)}%`;
    });
    const parsed = parseReceiptText(text);
    if (!parsed.length) {
      showScanError("We couldn't find any items on that image. Try a clearer, well-lit shot — or add items manually.");
      return;
    }
    showReview(parsed);
  } catch (err) {
    showScanError(err.message || 'Something went wrong while reading the image.');
  }
}

$('receipt-input').addEventListener('change', handleScanFile);
$('upload-input').addEventListener('change', handleScanFile);

function showScanError(msg) {
  $('scan-progress').classList.add('hidden');
  $('scan-review').classList.add('hidden');
  $('scan-error').classList.remove('hidden');
  $('scan-error-msg').textContent = msg;
}

function closeScan() {
  $('scan-backdrop').classList.add('hidden');
}

function reviewRow({ name = '', location = 'pantry', days = 7, price = null, checked = true } = {}) {
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

  const date = document.createElement('input');
  date.type = 'date';
  date.value = addDays(days);

  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.step = '0.01';
  priceInput.min = '0';
  priceInput.inputMode = 'decimal';
  priceInput.placeholder = '$';
  priceInput.className = 'review-price';
  if (price > 0) priceInput.value = price.toFixed(2);

  // Re-guess when the user corrects an OCR'd name
  nameInput.addEventListener('change', () => {
    const guess = guessFood(nameInput.value);
    if (guess.matched) {
      sel.value = guess.location;
      date.value = addDays(guess.days);
    }
  });

  meta.append(sel, date, priceInput);
  li.append(cb, nameInput, meta);
  return li;
}

function showReview(parsed) {
  const ul = $('review-list');
  ul.innerHTML = '';
  for (const p of parsed) ul.appendChild(reviewRow(p));
  $('scan-progress').classList.add('hidden');
  $('scan-review').classList.remove('hidden');
}

$('btn-review-add-row').addEventListener('click', () => {
  $('review-list').appendChild(reviewRow({ checked: true }));
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
    const expiresAt = row.querySelector('input[type="date"]').value || addDays(7);
    const priceVal = parseFloat(row.querySelector('.review-price').value);
    const price = Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null;
    const item = { id: newId(), name, location, expiresAt, addedAt: todayStr(), price };
    items.push(item);
    syncPurchase(item);
    added++;
  }
  if (added) persist();
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const price = Number(r.price);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name: r.name.trim().slice(0, 80),
      location: Object.hasOwn(LOCATIONS, r.location) ? r.location : 'pantry',
      expiresAt: DATE_RE.test(r.expiresAt || '') ? r.expiresAt : addDays(7),
      addedAt: DATE_RE.test(r.addedAt || '') ? r.addedAt : todayStr(),
      price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
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
      date: DATE_RE.test(r.date || '') ? r.date : todayStr(),
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
    currentTab = tab.dataset.tab;
    render();
  })
);

// Close modals when tapping the dimmed backdrop
for (const id of ['edit-backdrop', 'scan-backdrop', 'toss-backdrop', 'backup-backdrop', 'import-backdrop']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === e.currentTarget && id !== 'scan-backdrop') e.currentTarget.classList.add('hidden');
  });
}

// ---------- boot ----------

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
