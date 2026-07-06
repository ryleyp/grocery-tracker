import { loadItems, saveItems, newId } from './store.js';
import { parseReceiptText, guessFood } from './parser.js';
import { recognizeReceipt } from './ocr.js';

const LOCATIONS = {
  fridge: { label: 'Fridge', emoji: '🧊', empty: 'Your fridge is empty!' },
  freezer: { label: 'Freezer', emoji: '❄️', empty: 'Nothing chilling in here!' },
  pantry: { label: 'Pantry', emoji: '🥫', empty: 'The pantry is bare!' },
};

const SOON_DAYS = 3;

let items = loadItems();
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

// ---------- rendering ----------

function persist() {
  saveItems(items);
}

function render() {
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
    : expiryText(item);
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
  $('edit-location').value = item ? item.location : currentTab;
  $('edit-expires').value = item ? item.expiresAt : addDays(7);
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

  if (editingId) {
    const item = items.find((i) => i.id === editingId);
    Object.assign(item, { name, location, expiresAt });
  } else {
    items.push({ id: newId(), name, location, expiresAt, addedAt: todayStr() });
  }
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

// ---------- scan & review ----------

$('receipt-input').addEventListener('change', async (e) => {
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
      showScanError("We couldn't find any items on that photo. Try a clearer, well-lit shot — or add items manually.");
      return;
    }
    showReview(parsed);
  } catch (err) {
    showScanError(err.message || 'Something went wrong while reading the receipt.');
  }
});

function showScanError(msg) {
  $('scan-progress').classList.add('hidden');
  $('scan-review').classList.add('hidden');
  $('scan-error').classList.remove('hidden');
  $('scan-error-msg').textContent = msg;
}

function closeScan() {
  $('scan-backdrop').classList.add('hidden');
}

function reviewRow({ name = '', location = 'pantry', days = 7, checked = true } = {}) {
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

  // Re-guess when the user corrects an OCR'd name
  nameInput.addEventListener('change', () => {
    const guess = guessFood(nameInput.value);
    if (guess.matched) {
      sel.value = guess.location;
      date.value = addDays(guess.days);
    }
  });

  meta.append(sel, date);
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
    items.push({ id: newId(), name, location, expiresAt, addedAt: todayStr() });
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

// ---------- tabs ----------

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    render();
  })
);

// Close modals when tapping the dimmed backdrop
for (const id of ['edit-backdrop', 'scan-backdrop', 'toss-backdrop']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === e.currentTarget && id !== 'scan-backdrop') e.currentTarget.classList.add('hidden');
  });
}

// ---------- boot ----------

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
