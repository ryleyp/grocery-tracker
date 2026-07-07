import {
  loadItems, saveItems, loadPurchases, savePurchases,
  loadUsage, saveUsage, loadShopping, saveShopping, newId,
} from './store.js';
import { parseReceiptText, guessFood } from './parser.js';
import { recognizeReceipt } from './ocr.js';
import { applyProductInfo, enrichItemsWithProductInfo, lookupProductInfo, lookupProductByBarcode, productInfoLabel } from './productInfo.js';
import { BUILD_BRANCH, BUILD_SHA, BUILD_TIME } from './version.js';

const LOCATIONS = {
  fridge: { label: 'Fridge', emoji: '🧊', empty: 'Your fridge is empty!' },
  freezer: { label: 'Freezer', emoji: '❄️', empty: 'Nothing chilling in here!' },
  pantry: { label: 'Pantry', emoji: '🥫', empty: 'The pantry is bare!' },
};

const SOON_DAYS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPO = 'ryleyp/grocery-tracker';
const GITHUB_MAIN_COMMIT = `https://api.github.com/repos/${REPO}/commits/main`;
const REFRESH_SNAPSHOT_KEY = 'grocery-tracker-refresh-snapshot-v1';

let items = loadItems();
let purchases = loadPurchases();
let usage = loadUsage();
let shopping = loadShopping();
let currentTab = 'fridge';
let editingId = null; // null = adding new
let editingProductInfo = null;
let calendarMonthOffset = 0; // months relative to the current month
let searchQuery = '';
let sortMode = 'expiry';
let filterMode = 'all';

const $ = (id) => document.getElementById(id);

// ---------- small helpers ----------

function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch {}
}

function itemQty(item) {
  const n = Number(item.qty);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

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

const SPECIAL_TABS = new Set(['spend', 'calendar', 'shopping']);

function sortItems(list) {
  const copy = [...list];
  if (sortMode === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode === 'added') {
    copy.sort((a, b) => purchaseDate(b).localeCompare(purchaseDate(a)) || a.name.localeCompare(b.name));
  } else if (sortMode === 'price') {
    copy.sort((a, b) => (b.price || 0) - (a.price || 0) || a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name));
  }
  return copy;
}

function inventoryList() {
  const q = searchQuery.trim().toLowerCase();
  // When searching, look across every location so you can answer
  // "do I already have this?" before buying it.
  let list = q
    ? items.filter((i) => i.name.toLowerCase().includes(q))
    : items.filter((i) => i.location === currentTab);

  if (filterMode === 'soon') {
    list = list.filter((i) => expiryStatus(i) !== 'ok');
  } else if (filterMode === 'fresh') {
    list = list.filter((i) => expiryStatus(i) === 'ok');
  }
  return sortItems(list);
}

function render() {
  const isSpend = currentTab === 'spend';
  const isCalendar = currentTab === 'calendar';
  const isShopping = currentTab === 'shopping';
  const isInventory = !SPECIAL_TABS.has(currentTab);
  $('inventory').classList.toggle('hidden', !isInventory);
  $('spend').classList.toggle('hidden', !isSpend);
  $('calendar').classList.toggle('hidden', !isCalendar);
  $('shopping').classList.toggle('hidden', !isShopping);

  if (isSpend) {
    renderSpend();
  } else if (isCalendar) {
    renderCalendar();
  } else if (isShopping) {
    renderShopping();
  } else {
    const loc = LOCATIONS[currentTab];
    const searching = Boolean(searchQuery.trim());
    $('section-title').textContent = searching ? '🔍 Search' : `${loc.emoji} ${loc.label}`;
    $('empty-emoji').textContent = searching ? '🔍' : loc.emoji;
    $('empty-text').textContent = searching ? 'No groceries match that.' : loc.empty;

    const list = inventoryList();
    $('section-count').textContent = list.length ? `${list.length} item${list.length === 1 ? '' : 's'}` : '';
    $('section-count').classList.toggle('hidden', !list.length);
    $('empty-state').classList.toggle('hidden', list.length > 0);

    const ul = $('item-list');
    ul.innerHTML = '';
    for (const item of list) ul.appendChild(itemCard(item, { swipe: true, showLocation: searching }));
  }

  // Per-tab expired badges
  for (const key of Object.keys(LOCATIONS)) {
    const n = items.filter((i) => i.location === key && expiryStatus(i) === 'expired').length;
    const badge = document.querySelector(`[data-badge="${key}"]`);
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }

  const shopBadge = document.querySelector('[data-badge="shopping"]');
  const openShop = shopping.filter((s) => !s.done).length;
  shopBadge.textContent = openShop;
  shopBadge.classList.toggle('hidden', openShop === 0);

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

  // This-month used-vs-wasted breakdown from the usage log
  let usedTotal = 0;
  let wastedTotal = 0;
  let wastedCount = 0;
  for (const u of usage) {
    if ((u.date || '').slice(0, 7) !== nowKey) continue;
    if (u.outcome === 'wasted') {
      wastedTotal += u.price || 0;
      wastedCount++;
    } else if (u.outcome === 'used') {
      usedTotal += u.price || 0;
    }
  }
  $('used-amount').textContent = fmtMoney(usedTotal);
  $('wasted-amount').textContent = fmtMoney(wastedTotal);
  $('used-label').textContent = 'used up';
  $('wasted-label').textContent = wastedCount
    ? `wasted · ${wastedCount} item${wastedCount === 1 ? '' : 's'}`
    : 'wasted';

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

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderCalendar() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();

  $('cal-month-label').textContent = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const byDate = new Map();
  for (const item of items) {
    const list = byDate.get(item.expiresAt) || [];
    list.push(item);
    byDate.set(item.expiresAt, list);
  }

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = todayStr();

  const grid = $('cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(year, month, d);
    const dayItems = byDate.get(key) || [];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day' + (key === todayKey ? ' today' : '');

    const num = document.createElement('span');
    num.textContent = d;
    cell.appendChild(num);

    if (dayItems.length) {
      const statuses = new Set(dayItems.map(expiryStatus));
      const dots = document.createElement('span');
      dots.className = 'cal-dots';
      for (const s of ['expired', 'soon', 'ok']) {
        if (statuses.has(s)) {
          const dot = document.createElement('i');
          dot.className = `cal-dot ${s}`;
          dots.appendChild(dot);
        }
      }
      cell.appendChild(dots);
      cell.addEventListener('click', () => openDayModal(key, dayItems));
    }

    grid.appendChild(cell);
  }
}

function openDayModal(key, dayItems) {
  const [y, m, d] = key.split('-').map(Number);
  $('day-title').textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const ul = $('day-list');
  ul.innerHTML = '';
  for (const item of dayItems.sort((a, b) => a.name.localeCompare(b.name))) {
    ul.appendChild(itemCard(item));
  }
  $('day-backdrop').classList.remove('hidden');
}

$('cal-prev').addEventListener('click', () => {
  calendarMonthOffset--;
  renderCalendar();
});

$('cal-next').addEventListener('click', () => {
  calendarMonthOffset++;
  renderCalendar();
});

$('btn-day-close').addEventListener('click', () => $('day-backdrop').classList.add('hidden'));

// ---------- usage log + undo toast ----------

function logUsage(item, outcome, qty = 1) {
  const entry = {
    id: newId(),
    itemId: item.id,
    date: todayStr(),
    name: item.name,
    price: item.price > 0 ? item.price : null,
    qty,
    outcome, // 'used' | 'wasted'
  };
  usage.push(entry);
  saveUsage(usage);
  return entry;
}

function unlogUsage(entryId) {
  usage = usage.filter((u) => u.id !== entryId);
  saveUsage(usage);
}

let toastTimer = null;
let pendingUndo = null;

function showToast(message, onUndo) {
  clearTimeout(toastTimer);
  $('toast-msg').textContent = message;
  $('toast-undo').classList.toggle('hidden', !onUndo);
  pendingUndo = onUndo || null;
  $('toast').classList.remove('hidden');
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').classList.add('hidden');
  pendingUndo = null;
}

$('toast-undo').addEventListener('click', () => {
  const fn = pendingUndo;
  hideToast();
  if (fn) fn();
});

// "Used one": decrement quantity; once the last one is gone, remove and log.
function useItem(item) {
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx < 0) return;
  buzz();
  const current = items[idx];
  const q = itemQty(current);

  if (q > 1) {
    current.qty = q - 1;
    persist();
    render();
    showToast(`Used one ${current.name} · ${q - 1} left`, () => {
      const it = items.find((i) => i.id === current.id);
      if (it) it.qty = q;
      persist();
      render();
    });
    return;
  }

  const snapshot = { ...current };
  items.splice(idx, 1);
  const entry = logUsage(snapshot, 'used', 1);
  persist();
  render();
  showToast(`✓ Used up ${snapshot.name}`, () => {
    items.splice(Math.min(idx, items.length), 0, snapshot);
    unlogUsage(entry.id);
    persist();
    render();
  });
}

// "Toss": remove the item entirely and log it as wasted.
function tossItem(item, { afterUndo, after } = {}) {
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx < 0) return;
  buzz(18);
  const snapshot = { ...items[idx] };
  items.splice(idx, 1);
  const entry = logUsage(snapshot, 'wasted', itemQty(snapshot));
  persist();
  render();
  after?.();
  showToast(`🗑️ Tossed ${snapshot.name}`, () => {
    items.splice(Math.min(idx, items.length), 0, snapshot);
    unlogUsage(entry.id);
    persist();
    render();
    afterUndo?.();
  });
}

// ---------- swipe gesture ----------

const SWIPE_TRIGGER = 88;

function attachSwipe(card, actionEl, item) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;
  let decided = false;

  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.icon-action, .item-btn')) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dragging = true;
    decided = false;
    card.classList.remove('snapping');
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) { dragging = false; return; } // vertical scroll
      decided = true;
      card.classList.add('dragging');
      try { card.setPointerCapture(e.pointerId); } catch {}
    }
    dx = mx;
    card.style.transform = `translateX(${dx}px)`;
    const isUsed = dx > 0;
    actionEl.className = `swipe-action show ${isUsed ? 'used' : 'toss'}`;
    actionEl.textContent = isUsed ? '✓ Used' : '🗑️ Toss';
  });

  function end() {
    if (!dragging && !decided) return;
    dragging = false;
    card.classList.remove('dragging');
    if (Math.abs(dx) >= SWIPE_TRIGGER) {
      const used = dx > 0;
      const row = card.closest('.item-row');
      card.style.transform = `translateX(${used ? 100 : -100}%)`;
      if (row) {
        row.style.maxHeight = `${row.offsetHeight}px`;
        requestAnimationFrame(() => row.classList.add('swiping-away'));
      }
      setTimeout(() => (used ? useItem(item) : tossItem(item)), 180);
    } else {
      card.classList.add('snapping');
      card.style.transform = '';
      actionEl.className = 'swipe-action';
    }
    dx = 0;
    decided = false;
  }

  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function itemCard(item, { tossOnly = false, swipe = false, showLocation = false } = {}) {
  const row = document.createElement('li');
  const status = expiryStatus(item);
  row.className = 'item-row';

  const action = document.createElement('div');
  action.className = 'swipe-action';

  const card = document.createElement('div');
  card.className = `item-card ${status}`;

  const bubble = document.createElement('div');
  bubble.className = 'item-emoji';
  bubble.textContent = itemEmoji(item);

  const main = document.createElement('div');
  main.className = 'item-main';

  const nameRow = document.createElement('div');
  nameRow.className = 'item-name-row';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;
  nameRow.appendChild(name);
  if (itemQty(item) > 1) {
    const qty = document.createElement('span');
    qty.className = 'qty-badge';
    qty.textContent = `×${itemQty(item)}`;
    nameRow.appendChild(qty);
  }
  if (showLocation) {
    const tag = document.createElement('span');
    tag.className = 'item-loc-tag';
    tag.textContent = LOCATIONS[item.location].emoji;
    tag.title = LOCATIONS[item.location].label;
    nameRow.appendChild(tag);
  }

  const exp = document.createElement('div');
  exp.className = `item-expiry ${status}`;
  exp.textContent = tossOnly
    ? `${LOCATIONS[item.location].emoji} ${LOCATIONS[item.location].label} · ${expiryText(item)}`
    : expiryText(item) + (item.price > 0 ? ` · ${fmtMoney(item.price)}` : '');
  main.append(nameRow, exp);
  if (!tossOnly) main.addEventListener('click', () => openEdit(item.id));

  card.append(bubble, main);

  if (tossOnly) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn toss';
    btn.textContent = '✓';
    btn.setAttribute('aria-label', 'Confirm tossed');
    btn.addEventListener('click', () => {
      buzz(18);
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const snap = { ...items[idx] };
        items.splice(idx, 1);
        logUsage(snap, 'wasted', itemQty(snap));
        persist();
      }
      render();
      renderTossList();
    });
    card.appendChild(btn);
  } else {
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const usedBtn = document.createElement('button');
    usedBtn.type = 'button';
    usedBtn.className = 'icon-action used';
    usedBtn.textContent = '✓';
    usedBtn.setAttribute('aria-label', 'Used');
    usedBtn.addEventListener('click', () => useItem(item));

    const tossBtn = document.createElement('button');
    tossBtn.type = 'button';
    tossBtn.className = 'icon-action toss';
    tossBtn.textContent = '🗑️';
    tossBtn.setAttribute('aria-label', 'Toss');
    tossBtn.addEventListener('click', () => tossItem(item));

    actions.append(usedBtn, tossBtn);
    card.appendChild(actions);
  }

  row.append(action, card);
  if (swipe) attachSwipe(card, action, item);
  return row;
}

// ---------- add / edit modal ----------

function openEdit(id) {
  $('day-backdrop').classList.add('hidden');
  editingId = id || null;
  const item = id ? items.find((i) => i.id === id) : null;
  editingProductInfo = sanitizeProductInfo(item?.productInfo);
  $('edit-title').textContent = item ? 'Edit item' : 'Add item';
  $('edit-name').value = item ? item.name : '';
  $('edit-location').value = item ? item.location : (currentTab === 'spend' ? 'pantry' : currentTab);
  $('edit-expires').value = item ? item.expiresAt : addDays(7);
  $('edit-qty').value = item ? itemQty(item) : 1;
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
  const qtyVal = parseInt($('edit-qty').value, 10);
  const qty = Number.isFinite(qtyVal) && qtyVal >= 1 ? qtyVal : 1;
  const priceVal = parseFloat($('edit-price').value);
  const price = Number.isFinite(priceVal) && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null;

  let item;
  if (editingId) {
    item = items.find((i) => i.id === editingId);
    Object.assign(item, { name, location, expiresAt, purchasedAt, qty, price, productInfo: editingProductInfo });
  } else {
    item = { id: newId(), name, location, expiresAt, addedAt: todayStr(), purchasedAt, qty, price, productInfo: editingProductInfo };
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
  const item = items.find((i) => i.id === editingId);
  closeEdit();
  if (item) tossItem(item);
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
        usage,
        shopping,
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
  if (Array.isArray(snapshot.usage)) { usage = snapshot.usage; saveUsage(usage); }
  if (Array.isArray(snapshot.shopping)) { shopping = snapshot.shopping; saveShopping(shopping); }
  persist();
  savePurchases(purchases);
}

$('btn-update').addEventListener('click', async () => {
  const btn = $('btn-update');
  btn.disabled = true;
  btn.textContent = '…';
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
    btn.disabled = false;
    btn.textContent = '↻';
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
    usage,
    shopping,
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
    const qtyNum = Number(r.qty);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name: r.name.trim().slice(0, 80),
      location: Object.hasOwn(LOCATIONS, r.location) ? r.location : 'pantry',
      expiresAt: validDate(r.expiresAt) ? r.expiresAt : addDays(7),
      addedAt,
      purchasedAt: validDate(r.purchasedAt) ? r.purchasedAt : addedAt,
      qty: Number.isFinite(qtyNum) && qtyNum >= 1 ? Math.round(qtyNum) : 1,
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

function sanitizeUsage(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    if (r.outcome !== 'used' && r.outcome !== 'wasted') continue;
    const price = Number(r.price);
    const qtyNum = Number(r.qty);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      itemId: typeof r.itemId === 'string' ? r.itemId : '',
      date: validDate(r.date) ? r.date : todayStr(),
      name: r.name.trim().slice(0, 80),
      price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
      qty: Number.isFinite(qtyNum) && qtyNum >= 1 ? Math.round(qtyNum) : 1,
      outcome: r.outcome,
    });
  }
  return out;
}

function sanitizeShopping(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name: r.name.trim().slice(0, 80),
      done: Boolean(r.done),
      addedAt: validDate(r.addedAt) ? r.addedAt : todayStr(),
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
  let importedUsage = [];
  let importedShopping = [];
  let exportedAt = null;
  try {
    const data = JSON.parse(await file.text());
    exportedAt = typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 10) : null;
    imported = sanitizeItems(Array.isArray(data) ? data : data.items);
    importedPurchases = sanitizePurchases(Array.isArray(data) ? [] : data.purchases);
    importedUsage = sanitizeUsage(Array.isArray(data) ? [] : data.usage);
    importedShopping = sanitizeShopping(Array.isArray(data) ? [] : data.shopping);
  } catch {
    imported = [];
  }
  if (!imported.length && !importedPurchases.length && !importedShopping.length) {
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
  pendingImport = { items: imported, purchases: importedPurchases, usage: importedUsage, shopping: importedShopping };
  $('import-backdrop').classList.remove('hidden');
});

function finishImport({ items: nextItems, purchases: nextPurchases, usage: nextUsage, shopping: nextShopping }) {
  items = nextItems;
  purchases = nextPurchases;
  usage = nextUsage;
  shopping = nextShopping;
  persist();
  savePurchases(purchases);
  saveUsage(usage);
  saveShopping(shopping);
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
  const haveUsage = new Set(usage.map((u) => u.id));
  const mergedUsage = usage.concat(pendingImport.usage.filter((u) => !haveUsage.has(u.id)));
  const listNames = new Set(shopping.map((s) => s.name.toLowerCase()));
  const mergedShopping = shopping.concat(
    pendingImport.shopping.filter((s) => !listNames.has(s.name.toLowerCase()))
  );
  finishImport({ items: mergedItems, purchases: mergedPurchases, usage: mergedUsage, shopping: mergedShopping });
});

$('btn-import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  finishImport(pendingImport);
});

$('btn-import-cancel').addEventListener('click', () => {
  pendingImport = null;
  $('import-backdrop').classList.add('hidden');
});

// ---------- search / filter / sort ----------

$('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  $('search-clear').classList.toggle('hidden', !searchQuery);
  render();
});

$('search-clear').addEventListener('click', () => {
  searchQuery = '';
  $('search-input').value = '';
  $('search-clear').classList.add('hidden');
  render();
  $('search-input').focus();
});

$('sort-select').addEventListener('change', (e) => {
  sortMode = e.target.value;
  render();
});

document.querySelectorAll('#filter-chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filterMode = chip.dataset.filter;
    document.querySelectorAll('#filter-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    render();
  });
});

// ---------- shopping list ----------

function shoppingSuggestions() {
  const haveNames = new Set(items.map((i) => i.name.toLowerCase()));
  const listNames = new Set(shopping.map((s) => s.name.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (let i = usage.length - 1; i >= 0 && out.length < 8; i--) {
    const name = usage[i].name;
    const key = name.toLowerCase();
    if (seen.has(key) || haveNames.has(key) || listNames.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function addShoppingItem(name) {
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) return;
  if (!shopping.some((s) => s.name.toLowerCase() === clean.toLowerCase() && !s.done)) {
    shopping.push({ id: newId(), name: clean, done: false, addedAt: todayStr() });
    saveShopping(shopping);
    buzz();
  }
  renderShopping();
  render();
}

function shoppingRow(entry) {
  const li = document.createElement('li');
  li.className = 'shop-row' + (entry.done ? ' done' : '');

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'shop-check';
  check.textContent = entry.done ? '✓' : '';
  check.setAttribute('aria-label', entry.done ? 'Mark not bought' : 'Mark bought');
  check.addEventListener('click', () => {
    entry.done = !entry.done;
    saveShopping(shopping);
    buzz();
    renderShopping();
    render();
  });

  const name = document.createElement('span');
  name.className = 'shop-name';
  name.textContent = entry.name;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'shop-del';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Remove');
  del.addEventListener('click', () => {
    shopping = shopping.filter((s) => s.id !== entry.id);
    saveShopping(shopping);
    renderShopping();
    render();
  });

  li.append(check, name, del);
  return li;
}

function renderShopping() {
  const open = shopping.filter((s) => !s.done).length;
  $('shopping-count').textContent = shopping.length ? `${open} to buy` : '';
  $('shopping-count').classList.toggle('hidden', !shopping.length);

  const ul = $('shopping-list');
  ul.innerHTML = '';
  const sorted = [...shopping].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  for (const entry of sorted) ul.appendChild(shoppingRow(entry));

  $('shopping-empty').classList.toggle('hidden', shopping.length > 0);
  $('btn-clear-done').classList.toggle('hidden', !shopping.some((s) => s.done));

  const suggestions = shoppingSuggestions();
  const chips = $('suggest-chips');
  chips.innerHTML = '';
  for (const name of suggestions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggest-chip';
    b.textContent = `+ ${name}`;
    b.addEventListener('click', () => addShoppingItem(name));
    chips.appendChild(b);
  }
  $('shopping-suggest').classList.toggle('hidden', suggestions.length === 0);
}

$('shopping-add').addEventListener('submit', (e) => {
  e.preventDefault();
  addShoppingItem($('shopping-input').value);
  $('shopping-input').value = '';
  $('shopping-input').focus();
});

$('btn-clear-done').addEventListener('click', () => {
  shopping = shopping.filter((s) => !s.done);
  saveShopping(shopping);
  renderShopping();
  render();
});

// ---------- barcode scanning ----------

let barcodeStream = null;
let barcodeDetector = null;
let barcodeRAF = null;
let barcodeScanning = false;

if ('BarcodeDetector' in window) {
  $('btn-barcode').classList.remove('hidden');
}

$('btn-barcode').addEventListener('click', () => {
  $('sheet-backdrop').classList.add('hidden');
  startBarcodeScan();
});

async function startBarcodeScan() {
  $('barcode-status').textContent = 'Point your camera at the barcode.';
  $('barcode-backdrop').classList.remove('hidden');
  try {
    barcodeDetector = barcodeDetector || new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
    });
    barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('barcode-video');
    video.srcObject = barcodeStream;
    await video.play();
    barcodeScanning = true;
    scanBarcodeFrame();
  } catch {
    $('barcode-status').textContent = 'Could not open the camera. Try “Type it instead”.';
  }
}

async function scanBarcodeFrame() {
  if (!barcodeScanning) return;
  try {
    const codes = await barcodeDetector.detect($('barcode-video'));
    if (codes && codes.length && codes[0].rawValue) {
      onBarcodeFound(codes[0].rawValue);
      return;
    }
  } catch {}
  barcodeRAF = requestAnimationFrame(scanBarcodeFrame);
}

function stopBarcodeScan() {
  barcodeScanning = false;
  if (barcodeRAF) cancelAnimationFrame(barcodeRAF);
  barcodeRAF = null;
  if (barcodeStream) {
    barcodeStream.getTracks().forEach((t) => t.stop());
    barcodeStream = null;
  }
  const video = $('barcode-video');
  if (video) video.srcObject = null;
}

async function onBarcodeFound(code) {
  buzz(20);
  barcodeScanning = false;
  if (barcodeRAF) cancelAnimationFrame(barcodeRAF);
  $('barcode-status').textContent = 'Looking up product…';

  let name = '';
  let info = null;
  try {
    const result = await lookupProductByBarcode(code);
    if (result.productName) name = result.productName;
    if (result.info) info = sanitizeProductInfo(result.info);
  } catch {}

  stopBarcodeScan();
  $('barcode-backdrop').classList.add('hidden');
  openEdit(null);

  if (name) {
    $('edit-name').value = name.slice(0, 80);
    if (info) {
      editingProductInfo = info;
      $('edit-info-status').textContent = productInfoLabel(info);
      if (info.suggestion) {
        $('edit-location').value = info.suggestion.location;
        $('edit-expires').value = addDays(info.suggestion.days);
      }
    } else {
      const guess = guessFood(name);
      if (guess.matched) {
        $('edit-location').value = guess.location;
        $('edit-expires').value = addDays(guess.days);
      }
    }
  } else {
    $('edit-info-status').textContent = `Scanned ${code} — no match found online. Type the name.`;
    $('edit-name').focus();
  }
}

$('btn-barcode-cancel').addEventListener('click', () => {
  stopBarcodeScan();
  $('barcode-backdrop').classList.add('hidden');
});

$('btn-barcode-manual').addEventListener('click', () => {
  stopBarcodeScan();
  $('barcode-backdrop').classList.add('hidden');
  openEdit(null);
});

$('barcode-backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    stopBarcodeScan();
    e.currentTarget.classList.add('hidden');
  }
});

// ---------- tabs ----------

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    render();
  })
);

// Close modals when tapping the dimmed backdrop
for (const id of ['edit-backdrop', 'scan-backdrop', 'toss-backdrop', 'backup-backdrop', 'import-backdrop', 'update-backdrop', 'day-backdrop']) {
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
