# 🥕 Grocery Tracker

A mobile-first web app for keeping track of what groceries you have and when to toss them. Snap a photo of your receipt, confirm the items, and everything gets sorted into **🧊 Fridge**, **❄️ Freezer**, and **🥫 Pantry** with expiry dates.

## Features

- **📷 Receipt & screenshot scanning** — snap a paper receipt with your phone camera, or upload a screenshot of a mobile order (Walmart, Instacart, etc.). Text is read on-device with [Tesseract.js](https://tesseract.projectnaptha.com/) OCR (vendored in this repo), so your receipts never leave your phone.
- **🧠 Smart guesses** — a built-in shelf-life database of 100+ common foods (including receipt abbreviations like `BNLS CHKN BRST` and `GRND BF`) auto-assigns each item a location and a "use or toss by" date. You review and fix anything before saving.
- **🗂️ Fridge / Freezer / Pantry tabs** — each with counts and red badges for expired items.
- **💸 Monthly spending** — prices are captured off receipts and screenshots (editable in the review step), and the Spend tab shows this month's grocery total plus past months at a glance. History sticks around even after items are used up.
- **🗑️ Toss alerts** — expired items are flagged with a header chip; tap it for a one-screen "time to toss" list you can clear in one tap.
- **✏️ Manual add & edit** — typing a name (e.g. "yogurt") auto-suggests location and expiry. Tap any item to edit it, mark it **✓ Used**, or **🗑️ Toss** it.
- **📱 Installable PWA** — add it to your phone's home screen and it works like an app, including offline (after the first scan the OCR engine is cached too).
- **💾 Backup & restore** — tap the 💾 button to export your whole list as a JSON file saved to your phone (Files/Downloads), and import it back any time. Importing lets you **merge** with what's there (duplicates skipped) or **replace** everything — handy for moving to a new phone or recovering after clearing browser data.
- **🔒 Private by design** — no accounts, no server, no tracking. Your inventory lives in your browser's local storage.

## Running it

It's a static site — no build step, no dependencies to install.

```bash
# any static file server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

### Hosting on GitHub Pages (automatic)

This repo ships with a GitHub Actions workflow ([`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)) that deploys the app to GitHub Pages on every push to `main`. After the first merge to `main`, the app is live at:

**https://ryleyp.github.io/grocery-tracker/**

Open that on your phone and "Add to Home Screen" to install it like an app. If the first workflow run can't enable Pages by itself, flip it on once in repo **Settings → Pages → Source: GitHub Actions** and re-run the workflow.

Netlify, Cloudflare Pages, Vercel, etc. also work — just point them at the repo root (any HTTPS static host is fine; HTTPS is required for the camera and PWA install).

## How receipt scanning works

1. Tap **＋**, then either **📷 Snap a paper receipt** (flat, well-lit, straight-on works best) or **🖼️ Upload a screenshot or photo** — e.g. a screenshot of your Walmart or Instacart order.
2. OCR runs on-device; lines with prices are treated as candidate items (both receipt-style `MILK  3.48` lines and order-app layouts where the price sits under the product name), while totals, tax, fees, tips, and payment lines are filtered out.
3. Each item is matched against the shelf-life database ([`js/foodData.js`](js/foodData.js)) to guess where it lives and how long it lasts; its price feeds the Spend tab.
4. You review the list — uncheck non-food items, fix names, spots, dates, and prices — then save.

OCR on crumpled receipts is imperfect, so the review step is always shown. Anything it misses can be added with **＋ Add a missed item** on the same screen.

## Project layout

```
index.html            app shell (tabs, modals)
css/styles.css        mobile-first styling, light + dark mode
js/app.js             UI logic and state
js/store.js           localStorage persistence
js/parser.js          receipt text → item candidates
js/foodData.js        shelf-life / location knowledge base
js/ocr.js             Tesseract.js wrapper
vendor/tesseract/     vendored OCR engine (JS + WASM + English data)
sw.js                 service worker (offline caching)
manifest.webmanifest  PWA manifest
```

## Tweaking shelf lives

All food knowledge is in [`js/foodData.js`](js/foodData.js) — each entry is a list of keywords with a location and a number of days. Edit it to match how you actually store things (e.g. if you keep bread in the freezer).
