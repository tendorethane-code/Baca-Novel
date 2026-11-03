import * as db from './db.js';
import {
  buildImport,
  decodeText,
  naturalCompare,
  baseName,
  chapterLabel,
  splitLines,
  formatTlNote,
  headingBefore,
  isTlHead,
  isSeparator,
  autoTlNote,
  tidyParagraphs,
  missingNumbers,
  toRanges,
  fmtRanges,
} from './parse.js';
import { readZip, writeZip } from './zip.js';
import { buildEpub } from './epub.js';
import { readEpub } from './epubin.js';
import * as sync from './sync.js';
import { logoSvg, signatureHtml } from './logo.js';

const APP_VERSION = '1.2.0';
const app = document.getElementById('app');
history.scrollRestoration = 'manual';

// ---------- Utilitas DOM ----------

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'open', 'indeterminate']);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
  return n;
}

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  toc: 'M4 6h16M4 12h16M4 18h10',
  type: 'M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  book: 'M12 6.5C10 5 7 4.5 3.5 4.6V18c3.5-.1 6.5.4 8.5 1.9 2-1.5 5-2 8.5-1.9V4.6C17 4.5 14 5 12 6.5zM12 6.5v13.4',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  list: 'M4 5h4v5H4zM11 6h9M11 9h6M4 14h4v5H4zM11 15h9M11 18h6',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5v-5M12 8h.01',
  sort: 'M7 4v16M3.5 16.5L7 20l3.5-3.5M13 6h8M13 11h6M13 16h4',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  note: 'M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 13h7M9 17h4.5',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15',
  play: 'M8 5.5v13l10-6.5z',
  shelf: 'M4 19V5M9 19V5M14 19l-3-14M17 19h3V8h-3zM3 19h18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  spark: 'M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10z',
  sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.2 7.8L20 19M8.2 16.2L20 5',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const solid = name === 'play' || name === 'spark';
  const thin = name === 'shelf' || name === 'user';
  svg.setAttribute('fill', solid ? 'currentColor' : 'none');
  svg.setAttribute('stroke', solid ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', name === 'more' ? '3' : thin ? '1.8' : '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}
/** Logo D (Gerhana) di dalam aplikasi; warnanya ikut aksen tema. */
function brandLogo(cls = '') {
  const span = el('span', { class: `brand-logo ${cls}`.trim(), 'aria-hidden': 'true' });
  span.innerHTML = logoSvg('d');
  return span;
}
/** Tanda pembuat "by LinTendo" (Kristal, L & T berukir). */
function signature() {
  const t = document.createElement('template');
  t.innerHTML = signatureHtml();
  return t.content.firstElementChild;
}
const iconBtn = (name, label, onclick) =>
  el('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick }, icon(name));

function toast(msg, action) {
  const t = el('div', { class: 'toast', role: 'status' }, el('span', null, msg));
  if (action)
    t.append(
      el(
        'button',
        {
          type: 'button',
          onclick: () => {
            t.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  const box = document.getElementById('toasts');
  box.append(t);
  while (box.childElementCount > 2) box.firstElementChild.remove();
  setTimeout(() => t.remove(), action ? 12000 : 3500);
}

async function busy(label, fn) {
  const b = el('div', { class: 'busy' }, el('div', null, label));
  document.body.append(b);
  try {
    return await fn();
  } finally {
    b.remove();
  }
}

const fmtNum = (n) => n.toLocaleString('id-ID');
const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const safeFileName = (s) =>
  s
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'novel';

/**
 * Dialog generik. `actions`: [{ label, value, primary, danger, run }].
 * `run` boleh mengembalikan `false` (atau Promise false) agar dialog tetap terbuka.
 * Mengembalikan Promise berisi `value` tombol yang ditekan (atau null bila ditutup).
 */
function dialog({ title, body, actions = [], className = '', onOpen }) {
  return new Promise((resolve) => {
    let value = null;
    const d = el('dialog', { class: className });
    const foot = el('div', { class: 'dlg-foot' });
    for (const a of actions) {
      if (a.spacer) {
        foot.append(el('span', { class: 'spacer' }));
        continue;
      }
      foot.append(
        el(
          'button',
          {
            type: 'button',
            class: `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`,
            onclick: async (e) => {
              const btn = e.currentTarget;
              if (a.run) {
                btn.disabled = true;
                let ok;
                try {
                  ok = await a.run();
                } catch (err) {
                  console.error(err);
                  toast(err.message || String(err));
                  ok = false;
                }
                btn.disabled = false;
                if (ok === false) return;
              }
              value = a.value ?? a.label;
              d.close();
            },
          },
          a.label,
        ),
      );
    }
    d.append(
      el(
        'div',
        { class: 'dlg-head' },
        el('h2', null, title),
        iconBtn('close', 'Tutup', () => requestClose()),
      ),
      el('div', { class: 'dlg-body' }, body),
    );
    if (actions.length) d.append(foot);
    d.addEventListener('close', () => {
      d.remove();
      resolve(value);
    });
    // Klik di luar kotak dialog = tutup.
    d.addEventListener('click', (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) requestClose();
      }
    });
    // Tombol X & klik di luar memicu event `cancel` seperti tombol Esc, jadi pemilik dialog bisa menahannya.
    function requestClose() {
      if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
    }
    document.body.append(d);
    d.showModal();
    onOpen?.(d);
  });
}

const confirmDialog = (title, message, label = 'Ya', danger = false) =>
  dialog({
    title,
    body: el('p', null, message),
    actions: [
      { label: 'Batal', value: false },
      { label, value: true, primary: true, danger },
    ],
  }).then((v) => v === true);

/**
 * Tombol "+ TL note" untuk kotak teks: baris yang diblok dirapikan jadi "TL note Chapter N" + isi catatan
 * (lihat formatTlNote). Tanpa blok, judul TL note disisipkan di posisi kursor. `numAt(pos)` memberi nomor chapter.
 */
function tlNoteTool(area, numAt, joiner = '\n') {
  const run = () => {
    const v = area.value;
    let start = area.selectionStart;
    let end = area.selectionEnd;
    // Perluas ke baris utuh supaya blok yang kurang pas tetap rapi.
    start = v.lastIndexOf('\n', start - 1) + 1;
    if (end > start && v[end - 1] === '\n') end--;
    const nl = v.indexOf('\n', end);
    end = nl < 0 ? v.length : nl;
    const num = numAt(start);
    const out = formatTlNote(v.slice(start, end), num, joiner);
    area.setRangeText(out, start, end, 'select');
    area.dispatchEvent(new Event('input'));
    toast(num == null ? 'Nomor chapter tidak ditemukan; ganti "?" dengan nomornya.' : `TL note dirapikan (Chapter ${num}).`);
  };
  return el(
    'div',
    { class: 'tl-tool' },
    el('span', { class: 'small muted' }, 'Blok TL note format lama, lalu ketuk:'),
    // pointerdown dicegah supaya blok teks & keyboard tidak hilang saat tombol diketuk.
    el('button', { type: 'button', class: 'btn', onpointerdown: (e) => e.preventDefault(), onclick: run }, icon('plus'), 'TL note'),
  );
}

function downloadOrShare(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const file = new File([blob], filename, { type: mime });
  const canShare = !!navigator.canShare?.({ files: [file] });
  const actions = [];
  if (canShare) {
    actions.push({
      label: 'Bagikan / Simpan ke File',
      run: async () => {
        try {
          await navigator.share({ files: [file], title: filename });
        } catch (e) {
          if (e.name !== 'AbortError') throw e;
          return false;
        }
      },
    });
  }
  actions.push({
    label: 'Unduh',
    primary: true,
    run: () => {
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: filename });
      // Di luar dialog modal elemen bersifat inert, jadi taruh tautan di dalam dialog yang terbuka.
      (document.querySelector('dialog[open]') || document.body).append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  });
  return dialog({
    title: 'File siap',
    body: el('p', null, el('b', null, filename), el('br'), el('span', { class: 'muted' }, fmtBytes(blob.size))),
    actions,
  });
}

// ---------- Pengaturan tampilan ----------

// noto, source, roboto disertakan di fonts/ (lihat css/app.css); sisanya bergantung pada huruf perangkat.
// weight: ketebalan teks bacaan. Noto Serif sedikit ditebalkan supaya mendekati teks di aplikasi Claude.
const FONTS = {
  noto: { label: 'Noto Serif', css: '"Noto Serif", Georgia, serif', weight: 450 },
  source: { label: 'Source Serif', css: '"Source Serif 4", Georgia, serif' },
  roboto: { label: 'Roboto', css: 'Roboto, system-ui, sans-serif' },
  book: { label: 'Buku (Palatino)', css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  serif: { label: 'Georgia', css: 'Georgia, "Times New Roman", Times, serif' },
  sans: { label: 'Sans perangkat', css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  mono: { label: 'Mono', css: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace' },
};
// Kecerahan teks bacaan: persen warna teks tema yang dipakai (sisanya warna latar).
const TEXT_LEVELS = {
  100: { label: 'Terang' },
  85: { label: 'Sedang' },
  70: { label: 'Redup' },
  55: { label: 'Sangat redup' },
};
const SIZE_MIN = 14;
const SIZE_MAX = 34;
const RECAP_MAX = 10; // jumlah paragraf terbanyak di pengingat chapter sebelumnya
// Tema latar: cukup warna latar (bg) dan teks (fg); warna lain diturunkan otomatis.
const THEMES = {
  light: { label: 'Terang', bg: '#fbfaf7', fg: '#1f1f1c' },
  paper: { label: 'Kertas', bg: '#f1ece1', fg: '#2d2a25' },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#4a3a28', accent: '#8a5a2b' },
  mint: { label: 'Hijau', bg: '#e2ede3', fg: '#1e3325' },
  sky: { label: 'Biru muda', bg: '#e4ecf4', fg: '#1d2b3a', accent: '#2f5f8a' },
  gray: { label: 'Abu', bg: '#d6d6d2', fg: '#22221f' },
  // Senada dengan ikon aplikasi: hitam pekat, aksen cyan menyala (tombol utama diberi cahaya).
  neon: { label: 'Neon', bg: '#07070d', fg: '#f4f6fa', accent: '#2be3ff', glow: true },
  claude: { label: 'CL', bg: '#151515', fg: '#f9f9f7' },
  dusk: { label: 'Senja', bg: '#2b2530', fg: '#ddd4e1', accent: '#c9a6e0' },
  navy: { label: 'Biru malam', bg: '#141d2b', fg: '#cdd7e3', accent: '#8cb8e8' },
  dark: { label: 'Gelap', bg: '#141414', fg: '#d5d3ce' },
  black: { label: 'Hitam', bg: '#000000', fg: '#b8b8b8' },
  custom: { label: 'Kustom' },
};

function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const autoFg = (bg) => (luminance(bg) < 0.25 ? '#d8d6d0' : '#1f1f1c');

function themeColors() {
  const t = THEMES[settings.theme];
  const bg = settings.theme === 'custom' ? settings.customBg : t.bg;
  const fg = settings.theme === 'custom' ? settings.customFg || autoFg(bg) : t.fg;
  const dark = luminance(bg) < 0.25;
  return { bg, fg, dark, glow: !!t.glow, accent: t.accent || (dark ? '#7cb4ff' : '#1d66d6') };
}

// Gaya halaman depan. Palet & susunannya di css/app.css (body[data-home=…]); di sini nama & warna latarnya
// (untuk warna bar status HP). "Klasik" = tampilan lama yang mengikuti tema warna baca.
const HOME_STYLES = {
  neon: { label: 'Eclipse Neon', hint: 'Hitam pekat, cyan menyala', bg: '#07070d', hero: 'paint' },
  royal: { label: 'Royal Eclipse', hint: 'Ungu royal, lukisan sampul', bg: '#0b0716', hero: 'paint' },
  aurora: { label: 'Aurora', hint: 'Kaca & cahaya aurora', bg: '#07070d', hero: 'glass' },
  classic: { label: 'Klasik', hint: 'Ikut tema warna baca', bg: null, hero: null },
};
const homeStyle = () => (HOME_STYLES[settings.homeStyle]?.bg ? settings.homeStyle : null);
let currentView = 'home';

/** Pasang gaya halaman depan di <body> (bukan di layar baca). */
function applyHome() {
  const st = currentView === 'read' ? null : homeStyle();
  const b = document.body;
  if (currentView === 'read') delete b.dataset.nav;
  else b.dataset.nav = '';
  if (st) b.dataset.home = st;
  else delete b.dataset.home;
  const bg = st ? HOME_STYLES[st].bg : themeColors().bg;
  document.documentElement.style.background = bg;
  if (st) document.documentElement.style.colorScheme = 'dark';
  document.querySelector('meta[name="theme-color"]').content = bg;
}

const SETTINGS_KEY = 'baca-novel:settings';
// Bawaan tipografi meniru tampilan baca di aplikasi Claude (diukur dari tangkapan layar Android):
// tinggi huruf kecil ±9,5px, jarak antarbaris ±25,7px, tepi kiri-kanan ±20px, teks rata kiri.
const SETTINGS_VERSION = 4;
const DEFAULTS = {
  font: 'noto',
  size: 18,
  lh: 1.5,
  width: 680,
  justify: false,
  paraGap: 16,
  textLevel: 100,
  changeLock: false,
  // Neon (senada ikon) jadi bawaan di semua perangkat, tidak mengikuti mode terang/gelap sistem.
  theme: 'neon',
  customBg: '#e9e4f0',
  customFg: '',
  recapCount: 3,
  recapOpen: true,
  dim: 0,
  barOrder: ['lock', 'bookmark', 'search', 'toc', 'brightness', 'settings'],
  barHidden: ['search', 'brightness'],
  libSort: 'recent',
  libFilter: 'all',
  libView: 'shelf',
  coverTap: 'popup',
  // Gaya halaman depan (perpustakaan, info novel, profil); layar baca tetap memakai tema warna di atas.
  homeStyle: 'neon',
};

// Tombol yang bisa dipasang di bar layar baca. Semuanya juga selalu ada di menu ⋯.
const BAR_ITEMS = {
  lock: { label: 'Kunci sentuhan', icon: 'lock' },
  bookmark: { label: 'Bookmark', icon: 'bookmark' },
  search: { label: 'Cari teks', icon: 'search' },
  toc: { label: 'Daftar isi', icon: 'toc' },
  brightness: { label: 'Kecerahan', icon: 'sun' },
  settings: { label: 'Pengaturan', icon: 'type' },
};

let settings = { ...DEFAULTS };
try {
  const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  Object.assign(settings, stored);
  // Versi 1 → 2: tipografi pindah ke bawaan baru (mirip Claude) sekali saja; tema gelap lama ikut jadi tema Claude.
  if (Object.keys(stored).length && !(stored.v >= 2)) {
    for (const k of ['font', 'size', 'lh', 'paraGap', 'justify', 'textLevel']) settings[k] = DEFAULTS[k];
    if (settings.theme === 'dark') settings.theme = 'claude';
  }
  // Versi 2 → 3: tema gelap bawaan (Claude) jadi Neon, senada dengan ikon baru.
  if (Object.keys(stored).length && !(stored.v >= 3) && settings.theme === 'claude') settings.theme = 'neon';
  // Versi 3 → 4: ukuran huruf bawaan 17 → 18 (yang masih memakai bawaan lama ikut naik).
  if (Object.keys(stored).length && !(stored.v >= 4) && settings.size === 17) settings.size = 18;
} catch {}
const migrated = settings.v !== SETTINGS_VERSION;
settings.v = SETTINGS_VERSION;
delete settings.paraSpace;
if (!FONTS[settings.font]) settings.font = DEFAULTS.font;
if (!TEXT_LEVELS[settings.textLevel]) settings.textLevel = DEFAULTS.textLevel;
settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, settings.size));
settings.recapCount = Math.min(RECAP_MAX, Math.max(0, settings.recapCount)); // batas lama 15
if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;
if (!HOME_STYLES[settings.homeStyle]) settings.homeStyle = DEFAULTS.homeStyle;
// Tombol bar baru (dari versi aplikasi yang lebih baru) ikut muncul di urutan.
settings.barOrder = [
  ...settings.barOrder.filter((k) => BAR_ITEMS[k]),
  ...Object.keys(BAR_ITEMS).filter((k) => !settings.barOrder.includes(k)),
];

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

function applySettings() {
  const r = document.documentElement;
  const c = themeColors();
  const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const vars = {
    '--bg': c.bg,
    '--fg': c.fg,
    '--panel': c.dark ? mix(c.bg, '#ffffff', 94) : mix(c.bg, '#ffffff', 45),
    '--line': mix(c.fg, c.bg, c.dark ? 14 : 13),
    '--muted': mix(c.fg, c.bg, 62),
    '--accent': c.accent,
    '--accent-fg': c.dark ? '#111111' : '#ffffff',
    // Dipakai tampilan bergaya (rak kosong) saat gaya Klasik; gaya lain menimpanya di body[data-home].
    '--accent-2': mix(c.accent, '#ffffff', c.dark ? 55 : 82),
    '--accent-3': mix(c.accent, '#000000', c.dark ? 80 : 82),
    '--veil': hexRgb(c.bg).join(' '),
    '--glass': mix(c.fg, 'transparent', 5),
    '--glass-line': mix(c.fg, 'transparent', 13),
    '--danger': c.dark ? '#f2827a' : '#b3261e',
    '--warn-bg': c.dark ? '#3a3017' : '#fff1cc',
    '--warn-fg': c.dark ? '#f1d68b' : '#6b4e00',
    '--read-font': FONTS[settings.font].css,
    '--read-weight': FONTS[settings.font].weight || 400,
    '--read-fg': settings.textLevel < 100 ? mix(c.fg, c.bg, settings.textLevel) : c.fg,
    '--read-size': `${settings.size}px`,
    '--read-lh': settings.lh,
    '--read-width': `${settings.width}px`,
    '--read-align': settings.justify ? 'justify' : 'left',
    '--read-para': `${settings.paraGap}px`,
  };
  for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, String(v));
  r.style.background = c.bg;
  r.style.colorScheme = c.dark ? 'dark' : 'light';
  r.toggleAttribute('data-dark', c.dark);
  r.toggleAttribute('data-glow', c.glow);
  document.querySelector('meta[name="theme-color"]').content = c.bg;
  dimLayer.style.opacity = settings.dim;
  applyHome();
  // Disimpan untuk skrip kecil di index.html yang mewarnai latar sebelum aplikasi dimuat.
  settings.paint = { bg: c.bg, dark: c.dark, home: HOME_STYLES[homeStyle()]?.bg || null };
}
const dimLayer = document.createElement('div');
dimLayer.className = 'dim-layer';
document.body.append(dimLayer);
applySettings();
if (migrated) saveSettings();

// Dipasang oleh tampilan pembaca supaya posisi baca tetap saat ukuran teks berubah.
let readerHooks = null;

// Kontrol pengaturan; dipakai dialog Pengaturan dan panel di layar baca.
async function updateSettings(patch) {
  const anchor = readerHooks?.anchor();
  Object.assign(settings, patch);
  applySettings();
  saveSettings();
  if ('recapCount' in patch) await readerHooks?.refreshRecap();
  if (anchor != null) readerHooks?.restore(anchor);
}

function settingPicker(label, entries, key) {
  const sel = el(
    'select',
    { onchange: () => updateSettings({ [key]: typeof settings[key] === 'number' ? Number(sel.value) : sel.value }) },
    entries.map(([k, v]) => el('option', { value: k, selected: String(settings[key]) === k }, v.label)),
  );
  return el('label', null, label, sel);
}

function settingSlider(label, key, min, max, step, fmt) {
  const out = el('output', null, fmt(settings[key]));
  const input = el('input', {
    type: 'range',
    min,
    max,
    step,
    value: settings[key],
    'aria-label': label,
    oninput: () => {
      updateSettings({ [key]: Number(input.value) });
      out.textContent = fmt(settings[key]);
    },
  });
  return el('label', { class: 'slider' }, el('span', null, label), input, out);
}

/** Pengaturan huruf utama: ukuran, jenis & kecerahan teks, jarak baris & paragraf. */
function typeControls() {
  return [
    ...sizePicker(updateSettings),
    el(
      'div',
      { class: 'pick-row' },
      settingPicker('Jenis huruf', Object.entries(FONTS), 'font'),
      settingPicker('Kecerahan teks', Object.entries(TEXT_LEVELS).reverse(), 'textLevel'),
    ),
    settingSlider('Jarak baris', 'lh', 1.2, 2.4, 0.05, (v) => v.toFixed(2)),
    settingSlider('Jarak antarparagraf', 'paraGap', 0, 48, 1, (v) => `${v}px`),
  ];
}

function openSettings() {
  const update = updateSettings;
  const slider = settingSlider;

  const check = (label, key) =>
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', checked: settings[key], onchange: (e) => update({ [key]: e.target.checked }) }),
      label,
    );

  // Pilihan terbuka/terlipat hanya berlaku kalau pengingat menyala.
  const recapCountSlider = slider('Jumlah paragraf terakhir yang ditampilkan (0 = mati)', 'recapCount', 0, RECAP_MAX, 1, (v) => String(v));
  const recapOpenBox = check('Langsung terbuka (tidak dilipat)', 'recapOpen');
  const syncRecapOpen = () => recapOpenBox.classList.toggle('hidden', settings.recapCount <= 0);
  recapCountSlider.querySelector('input').addEventListener('input', syncRecapOpen);
  syncRecapOpen();

  const lockBox = el('input', { type: 'checkbox', checked: settings.changeLock });
  lockBox.onchange = async () => {
    if (!lockBox.checked) {
      lockBox.checked = true;
      const ok = await confirmDialog(
        'Buka kunci perubahan?',
        'Edit chapter, hapus, ganti judul, dan impor yang menimpa chapter akan bisa dipakai lagi.',
        'Buka kunci',
      );
      if (!ok) return;
      lockBox.checked = false;
    }
    update({ changeLock: lockBox.checked });
    onLockChange();
  };

  // Tema: contoh warna yang bisa diketuk, plus tema kustom dengan pemilih warna.
  const customBox = el('div', { class: 'custom-theme' });
  const contrastNote = el('p', { class: 'small' });
  const bgIn = el('input', { type: 'color', value: settings.customBg, 'aria-label': 'Warna latar' });
  const fgIn = el('input', { type: 'color', value: settings.customFg || autoFg(settings.customBg), 'aria-label': 'Warna teks' });
  const showContrast = () => {
    const c = themeColors();
    const ratio = contrast(c.bg, c.fg);
    contrastNote.textContent =
      ratio < 4.5 ? `Kontras rendah (${ratio.toFixed(1)}:1), teks bisa sulit dibaca.` : `Kontras ${ratio.toFixed(1)}:1`;
    contrastNote.className = ratio < 4.5 ? 'small error' : 'small muted';
  };
  bgIn.oninput = () => {
    update({ customBg: bgIn.value });
    if (!settings.customFg) fgIn.value = autoFg(bgIn.value);
    showContrast();
  };
  fgIn.oninput = () => {
    update({ customFg: fgIn.value });
    showContrast();
  };
  const resetFg = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        update({ customFg: '' });
        fgIn.value = autoFg(settings.customBg);
        showContrast();
      },
    },
    'Teks otomatis',
  );
  customBox.append(
    el('label', { class: 'color-field' }, bgIn, 'Latar'),
    el('label', { class: 'color-field' }, fgIn, 'Teks'),
    resetFg,
    contrastNote,
  );
  const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Tema' });
  const syncSwatches = () => {
    swatches.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === settings.theme)));
    customBox.classList.toggle('hidden', settings.theme !== 'custom');
    showContrast();
  };
  for (const [k, t] of Object.entries(THEMES)) {
    const b = el(
      'button',
      { type: 'button', role: 'radio', class: 'swatch', title: t.label },
      el('span', { class: 'sw-a' }, 'Aa'),
      t.label,
    );
    b.dataset.k = k;
    const bg = k === 'custom' ? settings.customBg : t.bg;
    b.querySelector('.sw-a').style.cssText = `background:${bg};color:${k === 'custom' ? settings.customFg || autoFg(bg) : t.fg}`;
    b.onclick = () => {
      update({ theme: k });
      syncSwatches();
    };
    swatches.append(b);
  }
  syncSwatches();

  const storageInfo = el('p', { class: 'small muted' });
  showStorageInfo(storageInfo);

  dialog({
    title: 'Pengaturan',
    className: 'sheet',
    body: [
      el('div', { class: 'section-label' }, 'Gaya halaman depan'),
      homeStylePicker(),
      el('div', { class: 'section-label' }, 'Tema latar (layar baca)'),
      swatches,
      customBox,
      el('div', { class: 'section-label' }, 'Kecerahan'),
      dimSlider(update),
      typeControls(),
      // Di layar sempit (HP) teks sudah selebar layar, jadi lebar teks tidak berpengaruh dan disembunyikan.
      el('div', { class: 'wide-only' }, slider('Lebar teks', 'width', 360, 1200, 20, (v) => `${v}px`)),
      check('Rata kiri-kanan', 'justify'),
      el('div', { class: 'section-label' }, 'Pengingat chapter sebelumnya'),
      recapCountSlider,
      recapOpenBox,
      el('div', { class: 'section-label' }, 'Perpustakaan'),
      el(
        'div',
        { class: 'pick-row one' },
        settingPicker('Saat sampul diketuk', Object.entries({ popup: { label: 'Popup info' }, page: { label: 'Halaman lengkap' } }), 'coverTap'),
      ),
      el('div', { class: 'section-label' }, 'Tombol di panel layar baca'),
      barEditor(),
      el('div', { class: 'section-label' }, 'Kunci perubahan'),
      el('label', { class: 'check' }, lockBox, 'Kunci perubahan (mode baca-saja)'),
      el(
        'p',
        { class: 'small muted' },
        'Saat terkunci: edit chapter, hapus, ganti judul, dan impor yang menimpa chapter tidak bisa dipakai. Impor chapter baru, bookmark, dan sinkron tetap jalan.',
      ),
      storageInfo,
    ],
    actions: [
      {
        label: 'Kembalikan ke bawaan',
        danger: true,
        run: async () => {
          const ok = await confirmDialog(
            'Kembalikan ke bawaan?',
            'Tema, huruf, ukuran, kecerahan teks, jarak baris & paragraf, lebar, kecerahan, pengingat, dan tombol panel baca kembali seperti awal. Novel, bookmark, posisi baca, kunci perubahan, dan sinkron tidak berubah.',
            'Kembalikan',
          );
          if (!ok) return false;
          resetSettings();
        },
      },
      { spacer: true },
      { label: 'Selesai', primary: true },
    ],
  });
}

// Pengaturan yang ikut dikembalikan oleh "Kembalikan ke bawaan".
const RESETTABLE = [
  'font',
  'size',
  'lh',
  'width',
  'justify',
  'paraGap',
  'textLevel',
  'theme',
  'customBg',
  'customFg',
  'recapCount',
  'recapOpen',
  'dim',
  'barOrder',
  'barHidden',
  'coverTap',
  'homeStyle',
];

/** Kartu pilihan gaya halaman depan, dengan pratinjau kecil. Dipakai Pengaturan & Profil. */
function homeStylePicker() {
  const box = el('div', { class: 'style-pick', role: 'radiogroup', 'aria-label': 'Gaya halaman depan' });
  const render = () =>
    box.replaceChildren(
      ...Object.entries(HOME_STYLES).map(([k, st]) =>
        el(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: `sp-card sp-${k}`,
            'aria-checked': String(settings.homeStyle === k),
            onclick: () => {
              if (settings.homeStyle === k) return;
              updateSettings({ homeStyle: k });
              render();
              if (currentView !== 'read') route();
            },
          },
          el('span', { class: 'sp-prev', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
          el('b', null, st.label),
          el('small', null, st.hint),
        ),
      ),
    );
  render();
  return box;
}

function resetSettings() {
  const before = structuredClone(settings);
  const apply = (values) => {
    const anchor = readerHooks?.anchor();
    for (const k of RESETTABLE) settings[k] = structuredClone(values[k]);
    applySettings();
    saveSettings();
    readerHooks?.rebuildBar();
    readerHooks?.refreshRecap().then(() => anchor != null && readerHooks?.restore(anchor));
  };
  apply(DEFAULTS);
  toast('Pengaturan dikembalikan ke bawaan.', { label: 'Batalkan', run: () => apply(before) });
}

/**
 * Slider bertitik: titik di tiap nilai bulat, angka di bawah titik `labels` dan di nilai yang dipilih.
 * `onInput(v)` dipanggil tiap nilai berubah (saat digeser maupun diketuk).
 */
function dotSlider({ label, min, max, value, labels = [], unit = '', onInput }) {
  const n = max - min;
  const pos = (v) => `${((v - min) / n) * 100}%`;
  const range = el('input', { type: 'range', class: 'size-range', min, max, step: 1, value, 'aria-label': label });
  const ticks = el('div', { class: 'size-ticks', 'aria-hidden': 'true' });
  const dots = [];
  for (let v = min; v <= max; v++) {
    const dot = el('i');
    const lab = el('b', null, String(v));
    dot.style.left = lab.style.left = pos(v);
    ticks.append(dot, lab);
    dots.push([v, dot, lab]);
  }
  const num = el('b');
  const head = el('div', { class: 'dot-head' }, el('span', null, label), el('output', null, num, unit ? ` ${unit}` : null));
  let cur = null;
  const show = (v) => {
    range.style.setProperty('--p', pos(v));
    for (const [x, dot, lab] of dots) {
      dot.className = x < v ? 'on' : '';
      dot.style.visibility = x === v ? 'hidden' : '';
      lab.className = x === v ? 'on' : '';
      lab.hidden = x !== v && !labels.includes(x);
    }
    range.setAttribute('aria-valuetext', `${v} ${unit}`.trim());
    num.textContent = String(v);
  };
  range.oninput = () => {
    const v = Number(range.value);
    if (v === cur) return;
    cur = v;
    show(v);
    onInput(v);
  };
  // Angka di bawah titik juga bisa diketuk/diklik langsung.
  for (const [v, , lab] of dots)
    lab.onclick = () => {
      range.value = v;
      range.oninput();
    };
  cur = Number(range.value);
  show(cur);
  return el('div', { class: 'dot-slider' }, head, el('div', { class: 'size-track' }, range, ticks));
}

/** Pemilih ukuran huruf: A− / A+ dan garis bertitik di tiap ukuran genap (ukuran ganjil tetap bisa dipilih). */
function sizePicker(update) {
  const n = SIZE_MAX - SIZE_MIN;
  const range = el('input', { type: 'range', class: 'size-range', min: SIZE_MIN, max: SIZE_MAX, step: 1, 'aria-label': 'Ukuran huruf' });
  const ticks = el('div', { class: 'size-ticks', 'aria-hidden': 'true' });
  const dots = [];
  for (let v = SIZE_MIN; v <= SIZE_MAX; v += 2) {
    const left = `${((v - SIZE_MIN) / n) * 100}%`;
    const dot = el('i');
    const lab = el('b', null, String(v));
    dot.style.left = lab.style.left = left;
    ticks.append(dot, lab);
    dots.push([v, dot, lab]);
  }
  const minus = el('button', { type: 'button', class: 'size-btn', 'aria-label': 'Perkecil huruf' }, 'A', el('sup', null, '−'));
  const plus = el('button', { type: 'button', class: 'size-btn', 'aria-label': 'Perbesar huruf' }, 'A', el('sup', null, '+'));
  const head = el('div', { class: 'section-label' });
  const show = () => {
    const cur = settings.size;
    range.value = cur;
    range.style.setProperty('--p', `${((cur - SIZE_MIN) / n) * 100}%`);
    for (const [v, dot, lab] of dots) {
      dot.className = v < cur ? 'on' : '';
      dot.style.visibility = v === cur ? 'hidden' : '';
      lab.className = v === cur ? 'on' : '';
    }
    minus.disabled = cur <= SIZE_MIN;
    plus.disabled = cur >= SIZE_MAX;
    range.setAttribute('aria-valuetext', `${cur}px`);
    head.textContent = `Ukuran huruf · ${cur}px`;
  };
  const set = (v) => {
    update({ size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)) });
    show();
  };
  range.oninput = () => set(Number(range.value));
  minus.onclick = () => set(settings.size - 1);
  plus.onclick = () => set(settings.size + 1);
  show();
  return [head, el('div', { class: 'size-pick' }, minus, el('div', { class: 'size-track' }, range, ticks), plus)];
}

/** Slider peredup. Browser tidak boleh mengubah kecerahan layar asli, jadi ini lapisan gelap di atas halaman. */
function dimSlider(update) {
  const out = el('output', null, '');
  const fmt = () => (out.textContent = settings.dim ? `diredupkan ${Math.round(settings.dim * 100)}%` : 'normal');
  const input = el('input', {
    type: 'range',
    min: 0,
    max: 0.8,
    step: 0.05,
    value: settings.dim,
    'aria-label': 'Redupkan layar',
    oninput: () => {
      update({ dim: Number(input.value) });
      fmt();
    },
  });
  fmt();
  return el(
    'div',
    null,
    el('label', { class: 'slider' }, el('span', null, 'Redupkan layar'), out, input),
    el(
      'p',
      { class: 'small muted' },
      'Aplikasi web tidak bisa mengatur kecerahan layar yang sebenarnya; ini hanya menggelapkan tampilan (tidak bisa lebih terang dari setelan HP). Untuk menambah terang, pakai setelan kecerahan perangkat.',
    ),
  );
}

function openBrightness() {
  dialog({
    title: 'Kecerahan',
    className: 'sheet',
    body: dimSlider((patch) => {
      Object.assign(settings, patch);
      applySettings();
      saveSettings();
    }),
  });
}

/** Atur tombol apa saja yang tampil di panel layar baca dan urutannya. */
function barEditor() {
  const list = el('div', { class: 'bar-editor' });
  const render = () => {
    list.replaceChildren(
      ...settings.barOrder.map((k, i) =>
        el(
          'div',
          { class: 'bar-row' },
          el(
            'label',
            { class: 'check' },
            el('input', {
              type: 'checkbox',
              checked: !settings.barHidden.includes(k),
              onchange: (e) => {
                settings.barHidden = e.target.checked ? settings.barHidden.filter((x) => x !== k) : [...settings.barHidden, k];
                done();
              },
            }),
            icon(BAR_ITEMS[k].icon),
            BAR_ITEMS[k].label,
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              'aria-label': `Naikkan ${BAR_ITEMS[k].label}`,
              disabled: i === 0,
              onclick: () => move(i, -1),
            },
            '▲',
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              'aria-label': `Turunkan ${BAR_ITEMS[k].label}`,
              disabled: i === settings.barOrder.length - 1,
              onclick: () => move(i, 1),
            },
            '▼',
          ),
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Tombol yang disembunyikan tetap bisa dibuka dari menu ⋯. Di layar HP sebaiknya maksimal 4 tombol.',
      ),
    );
  };
  const move = (i, d) => {
    const o = [...settings.barOrder];
    [o[i], o[i + d]] = [o[i + d], o[i]];
    settings.barOrder = o;
    done();
  };
  const done = () => {
    saveSettings();
    readerHooks?.rebuildBar();
    render();
  };
  render();
  return list;
}

async function showStorageInfo(target) {
  const parts = [`Versi ${APP_VERSION}`];
  try {
    if (navigator.storage?.estimate) {
      const { usage } = await navigator.storage.estimate();
      parts.push(`data terpakai ±${fmtBytes(usage || 0)}`);
    }
    if (navigator.storage?.persisted) {
      parts.push(
        (await navigator.storage.persisted())
          ? 'penyimpanan persisten: ya'
          : 'penyimpanan persisten: tidak (browser bisa menghapus data bila ruang penuh)',
      );
    }
  } catch {}
  target.textContent = parts.join(' · ');
}

// ---------- Router ----------

let cleanup = null;
function setView(nodes, teardown) {
  cleanup?.();
  cleanup = teardown || null;
  readerHooks = null;
  app.replaceChildren(...nodes);
}

async function route() {
  const [view, id, num, para] = location.hash.replace(/^#\/?/, '').split('/');
  currentView = view === 'read' && id ? 'read' : 'home';
  document.body.dataset.page = currentView === 'read' ? 'read' : view === 'novel' && id ? 'novel' : view === 'profil' ? 'profil' : 'rak';
  applyHome();
  try {
    if (view === 'read' && id)
      await showReader(decodeURIComponent(id), num != null && num !== '' ? Number(num) : null, Number(para) || 0);
    else if (view === 'novel' && id) await showNovel(decodeURIComponent(id));
    else if (view === 'profil') await showProfile();
    else await showLibrary();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e));
  }
}
window.addEventListener('hashchange', route);

// ---------- Perpustakaan ----------

async function showLibrary() {
  document.title = 'LumenRead';
  const [novels, covers] = await Promise.all([db.listNovels(), db.getCovers()]);
  const bar = el(
    'header',
    { class: 'bar' },
    el(
      'h1',
      { class: 'brand', 'aria-label': 'LumenRead' },
      'Lumen',
      el('span', { class: 'brand-accent' }, 'Read'),
      settings.changeLock ? el('span', { class: 'lock-badge', title: 'Perubahan dikunci' }, icon('lock')) : null,
    ),
  );
  // Semua gaya (termasuk Klasik): bar atas hanya judul; navigasi di bawah (HP/iPad) atau sidebar (laptop).
  // Sinkron & Pengaturan ada di Profil.

  const body = novels.length ? libraryList(novels, covers) : null;

  const foot = el('p', { class: 'foot' });
  showStorageInfo(foot);
  const credit = el('p', { class: 'credit' }, brandLogo('credit-logo'), 'Lumen', el('span', null, 'Read'), ' · ', signature());
  // Gaya halaman depan dipakai juga saat rak kosong (dulu jatuh ke tampilan Klasik: tanpa navigasi & tanpa hero).
  const styled = !!homeStyle();
  const empty = !novels.length;
  const glass = styled && HOME_STYLES[homeStyle()].hero === 'glass';
  const [emptyHero, emptyBody] = empty ? emptyHome(glass) : [];
  const hero = empty ? emptyHero : styled ? (glass ? glassHero(novels, covers) : homeHero(novels, covers)) : null;
  const main = el(
    'main',
    { class: `page library${hero && !glass ? ' has-hero' : ''}${empty ? ' is-empty' : ''}` },
    glass ? hero : null,
    empty ? emptyBody : body,
    el('footer', { class: 'lib-foot' }, syncLine(), foot, credit),
  );
  const nav = homeNav(novels, covers);
  if (pendingSearch) {
    pendingSearch = false;
    requestAnimationFrame(focusSearch);
  }
  setView([bar, glass ? null : hero, main, ...nav].filter(Boolean));
}

// ---------- Halaman depan bergaya (Eclipse Neon, dst.) ----------
const greeting = () => {
  const h = new Date().getHours();
  return h < 4 ? 'Selamat malam' : h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};
/** Novel di bagian atas: terakhir dibaca; kalau belum ada, novel terbaru yang punya chapter. */
function heroNovel(novels) {
  const read = novels.filter((n) => n.lastRead && n.toc.length).sort((a, b) => b.lastRead.at - a.lastRead.at);
  return read[0] || novels.filter((n) => n.toc.length).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
let ringSeq = 0;
/** Lingkaran progres (persen di tengah). */
function progressRing(pct, size = 54, stroke = 4) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `rg${++ringSeq}`;
  const box = el('div', { class: 'p-ring', role: 'img', 'aria-label': `${Math.round(pct)}% terbaca`, style: `width:${size}px;height:${size}px` });
  box.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  box.append(el('b', null, `${Math.round(pct)}%`));
  return box;
}
function starField(count = 34) {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const box = el('div', { class: 'h-stars', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++)
    box.append(el('i', { style: `left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 100).toFixed(1)}%;--s:${(0.6 + rnd() * 1.8).toFixed(1)}px;--o:${(0.3 + rnd() * 0.7).toFixed(2)};--d:${(rnd() * 4).toFixed(1)}s` }));
  return box;
}
function openToc(n) {
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  openTocDialog(
    n,
    idx,
    (i) => (location.hash = `#/read/${encodeURIComponent(n.id)}/${n.toc[i].num}`),
    (num, para) => (location.hash = `#/read/${encodeURIComponent(n.id)}/${num}/${para}`),
  );
}
/** Bagian atas: sampul novel yang sedang dibaca jadi lukisan latar, sapaan, tombol lanjut, daftar isi, progres. */
function homeHero(novels, covers) {
  const n = heroNovel(novels);
  if (!n) return null;
  const cover = covers.get(n.id);
  const pct = readPct(n);
  const total = n.toc[n.toc.length - 1].num;
  const art = el('div', { class: 'h-art' });
  if (cover) art.style.backgroundImage = `url("${cover}")`;
  else {
    const hue = 185 + (titleHue(n.title) % 150);
    art.style.background = `radial-gradient(70% 60% at 70% 30%, hsl(${hue} 80% 45% / .55), transparent 70%)`;
  }
  return el(
    'section',
    { class: 'h-hero' },
    art,
    el('div', { class: 'h-moon', 'aria-hidden': 'true' }),
    starField(),
    el(
      'div',
      { class: 'h-txt' },
      el('small', null, icon('spark'), `${greeting()} · ${n.lastRead ? 'lanjut membaca' : 'mulai membaca'}`),
      // Judul besar = judul novel (ukurannya menyesuaikan panjang judul).
      el(
        'h2',
        { class: `h-title${n.title.length > 30 ? ' xl' : n.title.length > 16 ? ' l' : ''}`, onclick: () => openNovelInfo(n), title: 'Info novel' },
        n.title,
      ),
      el(
        'p',
        null,
        n.lastRead ? [el('b', null, `Chapter ${n.lastRead.num}`), ` dari ${total}`] : el('b', null, `${fmtNum(n.toc.length)} chapter`),
        n.author ? ` · ${n.author}` : '',
        n.lastRead ? el('span', { class: 'h-pct' }, ` · ${Math.round(pct)}%`) : null,
      ),
      el(
        'div',
        { class: 'h-btns' },
        el('a', { class: 'h-cta', href: `#/read/${encodeURIComponent(n.id)}` }, icon('play'), n.lastRead ? 'Lanjut baca' : 'Mulai baca'),
        el('button', { type: 'button', class: 'h-round', 'aria-label': 'Daftar isi', title: 'Daftar isi', onclick: () => openToc(n) }, icon('toc')),
        n.lastRead ? progressRing(pct) : null,
      ),
    ),
  );
}
// ---------- Rak kosong (gaya halaman depan) ----------
// Siapa yang melihat layar ini: pengguna baru, ATAU pengguna lama di perangkat baru (novelnya ada di HP lain).
// Jadi selain Impor, ambil-dari-sinkronisasi juga ditawarkan, dan tulisannya ikut berubah saat sinkron jalan.
function emptySync() {
  const cfg = sync.loadConfig();
  const [ic, title, state] = !cfg
    ? ['sync', 'Ambil dari perangkat lain', 'off']
    : syncState.running
      ? ['sync', 'Mengambil dari sinkronisasi…', 'run']
      : syncState.error
        ? ['sync', 'Sinkron gagal · coba lagi', 'err']
        : ['check', 'Sinkronisasi aktif', 'ok'];
  return el(
    'button',
    { type: 'button', class: `e-pill s-${state}`, onclick: openSync, title: state === 'err' ? syncState.error : null },
    el('span', { class: 'e-ic' }, icon(ic)),
    el('b', null, title),
  );
}
/** Rak bayangan: slot sampul kosong (memudar ke kanan), yang pertama tombol Impor. */
function ghostShelf() {
  const tiles = [
    el(
      'button',
      { type: 'button', class: 'e-slot e-add', onclick: () => openImport() },
      el('span', { class: 'e-plus' }, icon('plus')),
      el('b', null, 'Impor novel'),
      el('span', null, '.epub · .zip · .txt'),
    ),
  ];
  while (tiles.length < 12) tiles.push(el('div', { class: 'e-slot e-ghost', 'aria-hidden': 'true' }));
  return el('div', { class: 'e-shelf' }, ...tiles);
}
/** Halaman depan saat rak kosong. Susunannya sama dengan rak berisi (bagian atas → Rak buku), tanpa sampul.
 *  Eclipse Neon & Royal: lukisan dengan logo gerhana besar. Aurora: kartu kaca seperti novel yang sedang dibaca. */
function emptyHome(glass) {
  const title = el('span', null, 'Mulai rak ', el('em', null, 'bukumu'));
  const sub = 'Impor novel dari file, atau ambil yang sudah ada di perangkat lain.';
  const btns = el(
    'div',
    { class: `h-btns e-btns${glass ? ' g-btns' : ''}` },
    el('button', { type: 'button', class: 'h-cta', onclick: () => openImport() }, icon('plus'), 'Impor novel'),
    emptySync(),
  );
  const body = el(
    'div',
    null,
    el(
      'div',
      { class: 'h-sec' },
      el('h3', null, icon('spark'), 'Rak buku'),
      el('span', null, '.epub · .zip berisi .txt · .txt · tempel teks'),
    ),
    ghostShelf(),
    el('p', { class: 'e-hint' }, 'Untuk teks, tiap chapter diawali baris seperti ', el('code', null, 'Chapter 1: Judul'), '.'),
  );
  if (glass) {
    const part = greeting().replace('Selamat ', '');
    const hero = el(
      'div',
      { class: 'g-wrap' },
      el(
        'header',
        { class: 'g-hello' },
        el('small', null, greeting()),
        el('h2', null, 'Mau baca ', el('span', null, 'apa'), ` ${part} ini?`),
      ),
      el(
        'section',
        { class: 'g-hero e-glass' },
        el('div', { class: 'e-glass-logo', 'aria-hidden': 'true' }, brandLogo()),
        el('div', { class: 'g-body' }, el('small', null, icon('spark'), 'Rak masih kosong'), el('h3', null, title), el('p', null, sub)),
        btns,
      ),
    );
    return [hero, body];
  }
  const hero = el(
    'section',
    { class: 'h-hero e-hero' },
    el('div', { class: 'e-eclipse', 'aria-hidden': 'true' }, brandLogo()),
    starField(),
    el(
      'div',
      { class: 'h-txt' },
      el('small', null, icon('spark'), greeting(), el('span', { class: 'e-long' }, ' · rak masih kosong')),
      el('h2', { class: 'h-title' }, title),
      el('p', null, sub),
      btns,
    ),
  );
  return [hero, body];
}

function focusSearch() {
  const input = document.querySelector('.lib-search input');
  // Rak kosong belum punya kolom cari: beri tahu, jangan diam saja.
  if (!input) {
    if (document.querySelector('.is-empty')) toast('Rak masih kosong, belum ada novel untuk dicari.', { label: 'Impor', run: () => openImport() });
    return;
  }
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}
let pendingSearch = false;
const openProfile = () => (location.hash = '#/profil');
/** Navigasi halaman depan bergaya: bar bawah (HP/iPad) dan sidebar (laptop ≥ 1100px). */
function homeNav(novels, covers, active = 'rak') {
  const n = heroNovel(novels);
  const go = () => (n ? (location.hash = `#/read/${encodeURIComponent(n.id)}`) : openImport());
  const onLib = active === 'rak';
  const none = !novels.length; // rak kosong: Cari diredupkan (tetap bisa diketuk, muncul penjelasan)
  const toTop = () => (onLib ? window.scrollTo({ top: 0, behavior: 'smooth' }) : (location.hash = '#/'));
  const search = () => {
    if (onLib) return focusSearch();
    pendingSearch = true;
    location.hash = '#/';
  };
  const item = (ic, label, onclick, on, dim) =>
    el(
      'button',
      { type: 'button', class: `n-it${on ? ' on' : ''}${dim ? ' dim' : ''}`, 'aria-current': on ? 'page' : null, 'aria-label': dim ? `${label} (rak masih kosong)` : null, onclick },
      icon(ic),
      el('span', null, label),
    );
  const bottom = el(
    'nav',
    { class: 'n-bar', 'aria-label': 'Navigasi' },
    item('shelf', 'Rak', toTop, onLib),
    item('search', 'Cari', search, false, none),
    el(
      'button',
      { type: 'button', class: 'n-star', 'aria-label': n ? `Lanjut baca ${n.title}` : 'Impor novel', title: n ? `Lanjut: ${n.title}` : 'Impor novel', onclick: go },
      el('i', { 'aria-hidden': 'true' }),
      icon('spark'),
    ),
    item('upload', 'Impor', () => openImport()),
    item('user', 'Profil', openProfile, active === 'profil'),
  );
  const sItem = (ic, label, onclick, extra, on, dim) =>
    el(
      'button',
      { type: 'button', class: `sd-it${on ? ' on' : ''}${dim ? ' dim' : ''}`, 'aria-current': on ? 'page' : null, 'aria-label': dim ? `${label} (rak masih kosong)` : null, onclick },
      icon(ic),
      el('span', null, label),
      extra || null,
    );
  let now = null;
  if (n) {
    const pct = Math.round(readPct(n));
    now = el(
      'div',
      { class: 'sd-now' },
      el('small', null, icon('spark'), n.lastRead ? 'Sedang dibaca' : 'Mulai membaca'),
      el(
        'button',
        { type: 'button', class: 'sd-now-row', onclick: () => openNovelInfo(n), 'aria-label': `Info ${n.title}` },
        coverEl(n, covers.get(n.id), 'sd-cover'),
        el('span', null, el('b', null, n.title), el('span', null, n.lastRead ? `Ch. ${n.lastRead.num} · ${pct}%` : `${fmtNum(n.toc.length)} chapter`)),
      ),
      el('div', { class: 'sd-bar' }, el('i', { style: `width:${pct}%` })),
      el('a', { class: 'sd-go', href: `#/read/${encodeURIComponent(n.id)}` }, icon('play'), n.lastRead ? 'Lanjut baca' : 'Mulai baca'),
    );
    applyTint(now, n, covers.get(n.id));
  }
  const side = el(
    'aside',
    { class: 'sd', 'aria-label': 'Navigasi' },
    el('div', { class: 'sd-brand' }, brandLogo(), el('b', null, 'Lumen', el('em', null, 'Read'))),
    el(
      'nav',
      { class: 'sd-nav' },
      sItem('shelf', 'Rak buku', toTop, el('em', null, fmtNum(novels.length)), onLib),
      sItem('search', 'Cari', search, none ? null : el('kbd', null, '/'), false, none),
      sItem('upload', 'Impor novel', () => openImport()),
      sItem('user', 'Profil & pengaturan', openProfile, null, active === 'profil'),
    ),
    el('div', { class: 'sd-sp' }),
    now,
    el('div', { class: 'sd-foot' }, syncLine() || el('span'), signature()),
  );
  return [bottom, side];
}
// Laptop: tombol / langsung ke kolom cari perpustakaan.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || currentView === 'read') return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
  e.preventDefault();
  if (document.querySelector('.lib-search input, .is-empty')) focusSearch();
  else if (document.querySelector('.sd')) {
    pendingSearch = true;
    location.hash = '#/';
  }
});

// ---------- Profil (lokal, tanpa akun) ----------
const PROFILE_KEY = 'lumenread:profile';
function loadProfile() {
  try {
    return { name: '', photo: '', ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') };
  } catch {
    return { name: '', photo: '' };
  }
}
function saveProfile(p) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    toast('Foto terlalu besar untuk disimpan di browser ini.');
    return false;
  }
}
/** Foto profil: dipotong persegi di tengah, dikecilkan jadi JPEG 192×192 (±10–20 KB). */
async function avatarData(file) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 192, 192);
  img.close?.();
  return c.toDataURL('image/jpeg', 0.85);
}
function avatarEl(p, cls = 'pf-ava') {
  const inner = p.photo ? el('img', { src: p.photo, alt: '' }) : el('span', null, (p.name || 'L').trim().charAt(0).toUpperCase() || 'L');
  return el('span', { class: cls, 'aria-hidden': 'true' }, inner);
}
function editProfile(onDone) {
  const p = loadProfile();
  const name = el('input', { type: 'text', value: p.name, placeholder: 'Nama kamu', maxlength: '40', 'aria-label': 'Nama' });
  const preview = el('div', { class: 'pf-edit-ava' }, avatarEl(p));
  const file = el('input', { type: 'file', accept: 'image/*', class: 'drop-input' });
  const pick = el('button', { type: 'button', class: 'btn small-btn', onclick: () => file.click() }, 'Pilih foto');
  const remove = el('button', { type: 'button', class: 'btn small-btn danger', onclick: () => ((p.photo = ''), preview.replaceChildren(avatarEl(p)), (remove.hidden = true)) }, 'Hapus foto');
  remove.hidden = !p.photo;
  file.onchange = async () => {
    if (!file.files[0]) return;
    try {
      p.photo = await avatarData(file.files[0]);
      preview.replaceChildren(avatarEl(p));
      remove.hidden = false;
    } catch {
      toast('Gambar tidak bisa dibaca.');
    }
  };
  dialog({
    title: 'Ubah nama & foto',
    body: [
      el('div', { class: 'pf-edit' }, preview, el('div', { class: 'pf-edit-btns' }, pick, remove, file)),
      el('label', { class: 'field' }, el('span', null, 'Nama'), name),
      el('p', { class: 'small muted' }, 'Hanya disimpan di perangkat ini (tidak ikut sinkron).'),
    ],
    actions: [
      { label: 'Batal' },
      {
        label: 'Simpan',
        primary: true,
        run: () => {
          p.name = name.value.trim();
          if (!saveProfile(p)) return false;
          onDone?.();
        },
      },
    ],
  });
}

async function showProfile() {
  document.title = 'Profil · LumenRead';
  const [novels, covers] = await Promise.all([db.listNovels(), db.getCovers()]);
  const p = loadProfile();
  const read = novels.reduce((t, n) => t + (n.lastRead ? n.toc.findIndex((c) => c.num === n.lastRead.num) + 1 : 0), 0);
  const marks = novels.reduce((t, n) => t + Object.keys(n.bookmarks || {}).length, 0);
  const done = novels.filter((n) => statusOf(n) === 'done').length;
  const since = novels.length ? Math.min(...novels.map((n) => n.createdAt || Date.now())) : null;
  const row = (ic, title, sub, onclick, extra) =>
    el(
      onclick ? 'button' : 'div',
      { type: onclick ? 'button' : null, class: 'pf-row', onclick },
      el('span', { class: 'pf-ic' }, icon(ic)),
      el('span', { class: 'pf-txt' }, el('b', null, title), sub ? el('span', null, sub) : null),
      extra || (onclick ? icon('chevron') : null),
    );
  const cfg = sync.loadConfig();
  const syncSub = !cfg
    ? 'Belum dinyalakan · samakan HP, iPad, laptop'
    : syncState.error
      ? `Gagal: ${syncState.error}`
      : syncState.last
        ? `Terakhir ${fmtTime(syncState.last)}`
        : 'Belum pernah sinkron';
  const storage = row('book', 'Penyimpanan', 'Menghitung…');
  const storageText = storage.querySelector('.pf-txt span');
  showStorageInfo(storageText).then(() => (storageText.textContent = storageText.textContent.replace(/^Versi [^·]+·\s*/, '')));
  const bar = el('header', { class: 'bar' }, el('h1', { class: 'brand' }, 'Profil'));
  const main = el(
    'main',
    { class: 'page profile' },
    el(
      'section',
      { class: 'pf-head' },
      avatarEl(p),
      el(
        'div',
        { class: 'pf-who' },
        el('h2', null, p.name || 'Pembaca'),
        el('p', null, since ? `Pembaca sejak ${new Date(since).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}` : 'Selamat datang di LumenRead'),
        el('button', { type: 'button', class: 'link-btn pf-edit-btn', onclick: () => editProfile(route) }, 'Ubah nama & foto'),
      ),
    ),
    el(
      'section',
      { class: 'pf-stats', 'aria-label': 'Statistik' },
      [['Novel', novels.length], ['Chapter terbaca', read], ['Selesai', done], ['Bookmark', marks]].map(([l, v]) => el('div', null, el('b', null, fmtNum(v)), el('span', null, l))),
    ),
    el('h3', { class: 'pf-sec' }, 'Gaya halaman depan'),
    homeStylePicker(),
    el('h3', { class: 'pf-sec' }, 'Pengaturan'),
    el(
      'div',
      { class: 'pf-list' },
      row('type', 'Tampilan & pengaturan', 'Tema baca, huruf, ukuran, pengingat, tombol panel', openSettings),
      row('upload', 'Impor novel', 'File .txt, .zip, .epub, atau tempel teks', () => openImport()),
    ),
    el('h3', { class: 'pf-sec' }, 'Data'),
    el(
      'div',
      { class: 'pf-list' },
      row('sync', 'Sinkronisasi', syncSub, openSync, cfg && !syncState.error && syncState.last ? el('em', { class: 'pf-ok' }, '● aktif') : null),
      storage,
      row('info', 'Tentang LumenRead', `Versi ${APP_VERSION} · by LinTendo`),
    ),
    el('div', { class: 'pf-brand' }, brandLogo(), el('p', { class: 'credit' }, 'Lumen', el('span', null, 'Read'), ' · ', signature())),
  );
  setView([bar, main, ...homeNav(novels, covers, 'profil')]);
}

/** Bagian atas gaya Aurora: sapaan + kartu kaca berisi sampul, tombol lanjut, daftar isi, progres. */
function glassHero(novels, covers) {
  const n = heroNovel(novels);
  if (!n) return null;
  const cover = covers.get(n.id);
  const total = n.toc[n.toc.length - 1].num;
  const part = greeting().replace('Selamat ', '');
  const card = el(
    'section',
    { class: 'g-hero' },
    cover ? el('div', { class: 'g-bg', style: `background-image:url("${cover}")` }) : null,
    el('button', { type: 'button', class: 'g-cover', 'aria-label': `Info ${n.title}`, onclick: () => openNovelInfo(n) }, coverEl(n, cover)),
    el(
      'div',
      { class: 'g-body' },
      el('small', null, icon('spark'), n.lastRead ? 'Lanjut membaca' : 'Mulai membaca'),
      el('h3', null, n.title),
      el('p', null, [n.author, n.lastRead ? `Ch ${n.lastRead.num} dari ${total}` : `${fmtNum(n.toc.length)} chapter`].filter(Boolean).join(' · ')),
    ),
    el(
      'div',
      { class: 'h-btns g-btns' },
      el('a', { class: 'h-cta', href: `#/read/${encodeURIComponent(n.id)}` }, icon('play'), n.lastRead ? 'Lanjut baca' : 'Mulai baca'),
      el('button', { type: 'button', class: 'h-round', 'aria-label': 'Daftar isi', title: 'Daftar isi', onclick: () => openToc(n) }, icon('toc')),
    ),
    n.lastRead ? progressRing(readPct(n), 50, 4) : null,
  );
  applyTint(card, n, cover);
  return el(
    'div',
    { class: 'g-wrap' },
    el('header', { class: 'g-hello' }, el('small', null, greeting()), el('h2', null, 'Mau baca ', el('span', null, 'apa'), ` ${part} ini?`)),
    card,
  );
}

/** Kartu ringkas untuk halaman depan bergaya: satu tombol baca; daftar isi & lainnya di menu ⋯. */
function compactCard(n, cover) {
  const total = n.toc.length;
  const pct = readPct(n);
  const st = statusOf(n);
  const info = () => openNovelInfo(n);
  const card = el(
    'section',
    { class: 'hcard' },
    el('button', { type: 'button', class: 'card-cover', 'aria-label': `Buka ${n.title}`, onclick: info }, coverEl(n, cover)),
    el(
      'div',
      { class: 'hc-info' },
      el('h2', { onclick: info }, n.title),
      byline(n) ? el('p', { class: 'hc-by' }, byline(n)) : null,
      el(
        'p',
        { class: 'hc-meta' },
        el('span', { class: `hc-st st-${st}` }, STATUSES[st]),
        n.lastRead && total ? `Ch ${n.lastRead.num} / ${n.toc[total - 1].num}` : `${fmtNum(total)} chapter`,
      ),
      el('div', { class: 'hc-prog' }, el('i', null, el('i', { style: `width:${pct}%` })), el('b', null, `${Math.round(pct)}%`)),
    ),
    el(
      'div',
      { class: 'hc-acts' },
      total
        ? el('a', { class: 'hc-go', href: `#/read/${encodeURIComponent(n.id)}`, 'aria-label': `${n.lastRead ? 'Lanjut' : 'Mulai'} baca ${n.title}`, title: n.lastRead ? 'Lanjut baca' : 'Mulai baca' }, icon('play'))
        : null,
      iconBtn('more', 'Menu novel', () => novelMenu(n)),
    ),
  );
  applyTint(card, n, cover);
  return card;
}

const STATUSES = { reading: 'Sedang dibaca', later: 'Nanti', done: 'Selesai' };
const statusOf = (n) => n.status?.v || (n.lastRead ? 'reading' : 'later');
const SORTS = {
  recent: { label: 'Terakhir dibaca', fn: (a, b) => (b.lastRead?.at || b.updatedAt) - (a.lastRead?.at || a.updatedAt) },
  title: { label: 'Judul A–Z', fn: (a, b) => naturalCompare(a.title, b.title) },
  added: { label: 'Baru ditambah', fn: (a, b) => b.createdAt - a.createdAt },
};
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
let libQuery = '';

/** Perpustakaan: cari judul/pengarang, urutkan, dan saring menurut status baca. */
function libraryList(novels, covers) {
  const cards = el('div', { class: 'cards' });
  const styled = !!homeStyle();
  const hero = styled ? heroNovel(novels) : null;
  const pickView = (v) => {
    if (settings.libView === v) return;
    settings.libView = v;
    saveSettings();
    renderCards();
  };
  const viewBtns = {
    list: el('button', { type: 'button', 'aria-label': 'Tampilan daftar', title: 'Tampilan daftar', onclick: () => pickView('list') }, icon('list')),
    shelf: el('button', { type: 'button', 'aria-label': 'Tampilan rak', title: 'Tampilan rak', onclick: () => pickView('shelf') }, icon('grid')),
  };
  const search = el('input', { type: 'search', placeholder: 'Cari judul, pengarang, genre…', value: libQuery, 'aria-label': 'Cari novel' });
  const sort = el(
    'select',
    { 'aria-label': 'Urutkan' },
    Object.entries(SORTS).map(([k, v]) => el('option', { value: k, selected: settings.libSort === k }, v.label)),
  );
  const chips = el('div', { class: 'chips', role: 'tablist', 'aria-label': 'Saring menurut status' });
  const counts = { all: novels.length };
  for (const n of novels) counts[statusOf(n)] = (counts[statusOf(n)] || 0) + 1;
  const setFilter = (k) => {
    settings.libFilter = k;
    saveSettings();
    renderChips();
    renderCards();
  };
  const renderChips = () =>
    chips.replaceChildren(
      ...Object.entries({ all: 'Semua', ...STATUSES }).map(([k, label]) =>
        el(
          'button',
          { type: 'button', role: 'tab', 'aria-selected': String(settings.libFilter === k), onclick: () => setFilter(k) },
          el('span', { class: 'l' }, el('span', { class: 'l-full' }, label), k === 'reading' ? el('span', { class: 'l-short' }, 'Dibaca') : null),
          el('span', { class: 'n' }, fmtNum(counts[k] || 0)),
        ),
      ),
    );
  const renderCards = () => {
    const q = fold(libQuery.trim());
    let shown = novels
      .filter((n) => settings.libFilter === 'all' || statusOf(n) === settings.libFilter)
      .filter((n) => {
        const i = n.info || {};
        return !q || fold([n.title, n.author, i.origTitle, i.translator, ...(i.genres || [])].join(' ')).includes(q);
      })
      .sort(SORTS[settings.libSort]?.fn || SORTS.recent.fn);
    const shelf = settings.libView === 'shelf';
    // Halaman depan bergaya: novel di bagian atas tidak diulang di daftar (kecuali saat mencari, atau bila
    // daftarnya jadi kosong, mis. baru punya satu novel).
    if (styled && !q && hero && shown.length > 1 && shown.includes(hero)) shown = shown.filter((n) => n !== hero);
    cards.className = shelf ? 'shelf' : 'cards';
    viewBtns.list.setAttribute('aria-pressed', String(!shelf));
    viewBtns.shelf.setAttribute('aria-pressed', String(shelf));
    const make = shelf ? (n) => shelfItem(n, covers.get(n.id)) : styled ? (n) => compactCard(n, covers.get(n.id)) : (n) => novelCard(n, covers.get(n.id));
    if (shown.length) return cards.replaceChildren(...shown.map(make));
    // Tidak ada yang cocok: tawarkan cara keluar dari pencarian/saringan.
    const reset = el('button', {
      type: 'button',
      class: 'btn small-btn',
      onclick: () => {
        libQuery = search.value = '';
        if (settings.libFilter !== 'all') setFilter('all');
        else renderCards();
      },
    });
    reset.textContent = q ? 'Hapus pencarian' : 'Tampilkan semua';
    cards.replaceChildren(
      el(
        'div',
        { class: 'lib-empty' },
        icon('search'),
        el('p', null, q ? `Tidak ada novel yang cocok dengan “${libQuery.trim()}”.` : `Belum ada novel berstatus ${STATUSES[settings.libFilter] || ''}.`),
        reset,
      ),
    );
  };
  search.oninput = () => {
    libQuery = search.value;
    renderCards();
  };
  sort.onchange = () => {
    settings.libSort = sort.value;
    saveSettings();
    renderCards();
  };
  renderChips();
  renderCards();
  const read = novels.reduce((t, n) => t + (n.lastRead ? n.toc.findIndex((c) => c.num === n.lastRead.num) + 1 : 0), 0);
  return el(
    'div',
    null,
    styled
      ? el('div', { class: 'h-sec' }, el('h3', null, icon('spark'), 'Rak buku'), el('span', null, `${fmtNum(novels.length)} novel · ${fmtNum(read)} chapter terbaca`))
      : null,
    el(
      'div',
      { class: 'lib-tools' },
      el('label', { class: 'lib-search' }, icon('search'), search),
      el('label', { class: 'lib-sort' }, icon('sort'), sort),
      el('div', { class: 'view-seg', role: 'group', 'aria-label': 'Tampilan' }, viewBtns.list, viewBtns.shelf),
    ),
    chips,
    cards,
  );
}

/** Progres baca (persen, menurut urutan chapter terakhir dibaca). */
function readPct(n) {
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  return n.toc.length && idx >= 0 ? ((idx + 1) / n.toc.length) * 100 : 0;
}

/** Tampilan rak: sampul + garis progres, judul & posisi baca di bawah; ⋯ membuka menu novel. */
function shelfItem(n, cover) {
  const pct = readPct(n);
  const st = statusOf(n);
  const sub = n.lastRead && pct ? `Ch ${n.lastRead.num} · ${Math.round(pct)}%` : STATUSES[st];
  const item = el(
    'div',
    { class: 'book' },
    el(
      'button',
      { type: 'button', class: 'book-cover', 'aria-label': `Buka ${n.title}`, onclick: () => openNovelInfo(n) },
      coverEl(n, cover),
      pct ? el('span', { class: 'book-bar', 'aria-hidden': 'true' }, el('i', { style: `width:${pct}%` })) : null,
    ),
    el(
      'div',
      { class: 'book-foot' },
      el('span', { class: 'book-title', title: n.title }, n.title),
      iconBtn('more', 'Menu novel', () => novelMenu(n)),
      el('span', { class: 'book-sub' }, sub),
    ),
  );
  applyTint(item, n, cover);
  return item;
}

function novelCard(n, cover) {
  const total = n.toc.length;
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  const pct = total && idx >= 0 ? ((idx + 1) / total) * 100 : 0;
  const read = () => (location.hash = `#/read/${encodeURIComponent(n.id)}`);
  const info = () => openNovelInfo(n);
  const facts = [`${fmtNum(total)} chapter`];
  if (total) facts.push(`Ch ${n.toc[0].num}–${n.toc[total - 1].num}`);
  const marks = Object.keys(n.bookmarks || {}).length;
  if (marks) facts.push(`${fmtNum(marks)} bookmark`);
  const st = statusOf(n);
  const card = el(
    'section',
    { class: 'card' },
    el('button', { type: 'button', class: 'card-cover', 'aria-label': `Buka ${n.title}`, onclick: info }, coverEl(n, cover)),
    el(
      'div',
      { class: 'card-main' },
      el(
        'div',
        { class: 'card-head' },
        el('h2', { onclick: info }, n.title, byline(n) ? el('small', { class: 'author' }, byline(n)) : null),
        iconBtn('more', 'Menu novel', () => novelMenu(n)),
      ),
      el('div', { class: 'meta' }, el('span', { class: `badge st-${st}` }, STATUSES[st]), el('span', null, facts.join(' · '))),
      total
        ? el(
            'div',
            { class: 'card-prog' },
            el(
              'div',
              { class: 'prog-label' },
              el('span', null, idx >= 0 ? [el('span', { class: 'pre' }, 'Terakhir: '), `Chapter ${n.lastRead.num}`] : 'Belum dibaca'),
              el('b', null, `${Math.round(pct)}%`),
            ),
            el(
              'div',
              { class: 'progress', role: 'progressbar', 'aria-label': 'Progres baca', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) },
              el('div', { style: `width:${pct}%` }),
            ),
          )
        : null,
    ),
    el(
      'div',
      { class: 'actions' },
      total
        ? el('button', { type: 'button', class: 'btn primary', onclick: read }, icon('book'), el('span', { class: 't' }, idx >= 0 ? 'Lanjut baca' : 'Mulai baca'))
        : el('span', { class: 'muted small' }, 'Belum ada chapter.'),
      total
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn',
              title: 'Daftar isi',
              onclick: () =>
                openTocDialog(
                  n,
                  idx,
                  (i) => (location.hash = `#/read/${encodeURIComponent(n.id)}/${n.toc[i].num}`),
                  (num, para) => (location.hash = `#/read/${encodeURIComponent(n.id)}/${num}/${para}`),
                ),
            },
            icon('toc'),
            el('span', { class: 't' }, 'Daftar isi'),
          )
        : null,
      el('button', { type: 'button', class: 'btn add', 'aria-label': 'Tambah chapter', title: 'Tambah chapter', onclick: () => openImport(n.id) }, icon('plus')),
    ),
  );
  applyTint(card, n, cover);
  return card;
}

// ---------- Rona sampul ----------
// Warna khas sampul dipakai untuk rona kartu & cahaya di bawah sampul, supaya tiap novel punya nuansanya sendiri.
const tintCache = new Map();

/** Warna khas gambar: rata-rata 12×12 piksel, piksel yang lebih berwarna diberi bobot lebih besar. */
async function imageTint(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 12, 12);
  const d = g.getImageData(0, 0, 12, 12).data;
  let r = 0, gr = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const s = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    const k = s * s + 64;
    r += d[i] * k;
    gr += d[i + 1] * k;
    b += d[i + 2] * k;
    w += k;
  }
  return `rgb(${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)})`;
}

function applyTint(node, n, cover) {
  const key = `${n.id}:${cover ? cover.length : `ph:${n.title}`}`;
  const set = (t) => t && node.style.setProperty('--tint', t);
  if (tintCache.has(key)) return set(tintCache.get(key));
  if (!cover) {
    const h = titleHue(n.title);
    const t = `hsl(${THEMES[settings.theme]?.glow ? 185 + (h % 150) : h % 360} 70% 50%)`;
    tintCache.set(key, t);
    return set(t);
  }
  imageTint(cover)
    .then((t) => {
      tintCache.set(key, t);
      set(t);
    })
    .catch(() => tintCache.set(key, null));
}

// ---------- Sampul ----------
// Tajam untuk lukisan sampul di layar retina: di iPad potret lukisan selebar layar (±1670 piksel fisik), di laptop
// ±60% lebar layar. 800 piksel (batas lama) terlihat lembek di sana. ±300–600 KB per sampul.
const COVER_W = 1200;
const COVER_H = 1800;

/** Gambar (Blob/File) → data URL JPEG maks 1200×1800, supaya tetap ringan disimpan & disinkron. */
async function coverData(blob) {
  const img = await createImageBitmap(blob);
  const scale = Math.min(1, COVER_W / img.width, COVER_H / img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return c.toDataURL('image/jpeg', 0.86);
}

/** Angka tetap per judul, dasar warna sampul otomatis. */
function titleHue(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** Sampul novel; tanpa gambar dibuat sampul berwarna berisi judul (warna tetap per judul). */
function coverEl(n, data, cls = '') {
  if (data) return el('img', { class: `cover ${cls}`, src: data, alt: '', loading: 'lazy', decoding: 'async' });
  const h = titleHue(n.title);
  const ph = el('div', { class: `cover ph ${cls}`, 'aria-hidden': 'true' }, el('span', null, n.title));
  if (THEMES[settings.theme]?.glow) {
    // Tema Neon: warna di rentang cyan → ungu → merah muda, gelap di bawah, supaya senada.
    const hue = 185 + (h % 150);
    ph.style.background = `linear-gradient(160deg, hsl(${hue} 85% 42%), hsl(${(hue + 30) % 360} 70% 14%) 75%)`;
  } else {
    const hue = h % 360;
    ph.style.background = `linear-gradient(150deg, hsl(${hue} 55% 46%), hsl(${(hue + 40) % 360} 60% 30%))`;
  }
  return ph;
}

// ---------- Info novel ----------
// Disimpan di novel.info (ikut sinkron): { origTitle, translator, status, genres: [], source, synopsis }.
const STORY_STATUS = {
  '': { label: '—' },
  ongoing: { label: 'Bersambung' },
  completed: { label: 'Tamat' },
  hiatus: { label: 'Hiatus' },
};

/** "Penulis · Terj. Penerjemah" untuk kartu novel. */
function byline(n) {
  const t = n.info?.translator;
  return [n.author, t && `Terj. ${t}`].filter(Boolean).join(' · ');
}

const novelHash = (id) => `#/novel/${encodeURIComponent(id)}`;
const readHash = (id, num, para) =>
  `#/read/${encodeURIComponent(id)}${num != null ? `/${num}${para ? `/${para}` : ''}` : ''}`;

/** Buka info novel sesuai pilihan di Pengaturan: popup (bawaan) atau halaman lengkap. */
async function openNovelInfo(n) {
  if (settings.coverTap === 'page') location.hash = novelHash(n.id);
  else await openNovelPopup(n);
}

/** Bagian info novel yang dipakai popup dan halaman lengkap. */
function novelParts(n, cover, { onBeforeNav = () => {} } = {}) {
  const i = n.info || {};
  const total = n.toc.length;
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  const locked = settings.changeLock;
  const go = (hash) => {
    onBeforeNav();
    location.hash = hash;
  };

  // Atas: latar sampul diburamkan, sampul, judul, judul asli, penulis & penerjemah, status baca.
  const heroBg = el('div', { class: 'nv-hero-bg' });
  if (cover) heroBg.style.backgroundImage = `url("${cover}")`;
  else heroBg.append(coverEl(n, null));
  const hero = el(
    'section',
    { class: 'nv-hero' },
    heroBg,
    el(
      'div',
      { class: 'nv-hero-in' },
      el('div', { class: 'nv-cover' }, coverEl(n, cover)),
      el(
        'div',
        { class: 'nv-head' },
        el('h2', null, n.title),
        i.origTitle ? el('p', { class: 'nv-orig' }, i.origTitle) : null,
        n.author ? el('p', null, el('span', { class: 'muted' }, 'Penulis: '), n.author) : null,
        i.translator ? el('p', null, el('span', { class: 'muted' }, 'Penerjemah: '), i.translator) : null,
        el('span', { class: `badge st-${statusOf(n)}` }, STATUSES[statusOf(n)]),
      ),
    ),
  );

  const readBtn = total
    ? el(
        'button',
        { type: 'button', class: 'btn primary nv-read', onclick: () => go(readHash(n.id)) },
        el('b', null, idx >= 0 ? 'Lanjut baca' : 'Mulai baca'),
        el('small', null, idx >= 0 ? chapterLabel(n.toc[idx].num, n.toc[idx].title) : chapterLabel(n.toc[0].num, n.toc[0].title)),
      )
    : el(
        'button',
        {
          type: 'button',
          class: 'btn primary nv-read',
          onclick: () => {
            onBeforeNav();
            openImport(n.id);
          },
        },
        el('b', null, 'Impor chapter'),
      );
  const editBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn nv-edit',
      disabled: locked,
      title: locked ? 'Perubahan sedang dikunci' : null,
      onclick: () => {
        onBeforeNav();
        editNovelInfo(n);
      },
    },
    icon('type'),
    'Edit info',
  );

  const tile = (value, label, cls = '') => el('div', { class: `nv-tile ${cls}` }, el('b', null, value), el('span', null, label));
  const tiles = el(
    'div',
    { class: 'nv-tiles' },
    tile(fmtNum(total), total ? `Chapter · ${n.toc[0].num}–${n.toc[total - 1].num}` : 'Chapter'),
    tile(i.status ? STORY_STATUS[i.status].label : '—', 'Status cerita', i.status ? `story-${i.status}` : ''),
    tile(fmtNum(Object.keys(n.bookmarks || {}).length), 'Bookmark'),
    tile(`${Math.round(readPct(n))}%`, idx >= 0 ? `Terbaca · Ch ${n.lastRead.num}` : 'Terbaca'),
  );

  // Chapter bolong: nomor bulat di antara chapter pertama & terakhir yang belum ada, diringkas jadi rentang.
  const GAP_SHOWN = 12;
  const missing = missingNumbers(n.toc.map((t) => t.num));
  let gapBox = null;
  if (missing.length) {
    const ranges = toRanges(missing);
    const list = el('p', { class: 'nv-gap-list' }, fmtRanges(ranges.slice(0, GAP_SHOWN)) + (ranges.length > GAP_SHOWN ? ', …' : ''));
    const all =
      ranges.length > GAP_SHOWN
        ? el(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                list.textContent = fmtRanges(ranges);
                all.remove();
              },
            },
            `Lihat semua (${fmtNum(ranges.length)} rentang)`,
          )
        : null;
    const add = locked
      ? null
      : el(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            onclick: () => {
              onBeforeNav();
              openImport(n.id);
            },
          },
          'Impor chapter',
        );
    gapBox = el(
      'section',
      { class: 'nv-gaps warn' },
      el(
        'div',
        { class: 'nv-gaps-head' },
        el('b', null, `${fmtNum(missing.length)} chapter belum ada`),
        el('span', null, `di antara Ch ${n.toc[0].num}–${n.toc[total - 1].num}`),
      ),
      list,
      all || add ? el('div', { class: 'nv-gaps-foot' }, all, add) : null,
    );
  } else if (total > 1) gapBox = el('p', { class: 'nv-gaps ok' }, `✓ Tidak ada chapter bolong (Ch ${n.toc[0].num}–${n.toc[total - 1].num})`);

  let source = null;
  if (i.source) {
    let host = i.source;
    try {
      host = new URL(i.source).hostname.replace(/^www\./, '');
    } catch {}
    source = /^https?:\/\//i.test(i.source) ? el('a', { href: i.source, target: '_blank', rel: 'noopener noreferrer' }, host) : i.source;
  }
  const syn = i.synopsis ? el('p', { class: 'nv-syn clamp' }, i.synopsis) : null;
  const more = syn
    ? el('button', { type: 'button', class: 'link-btn', onclick: () => (more.textContent = syn.classList.toggle('clamp') ? 'Selengkapnya' : 'Ringkas') }, 'Selengkapnya')
    : null;
  const empty = !n.author && !Object.values(i).some((v) => (Array.isArray(v) ? v.length : v));
  const infoBox = el(
    'section',
    { class: 'nv-box nv-info' },
    i.genres?.length ? [el('div', { class: 'nv-label' }, 'Genre'), el('div', { class: 'genre-chips nv-genres' }, i.genres.map((g) => el('span', { class: 'chip' }, g)))] : null,
    syn ? [el('div', { class: 'nv-label' }, 'Sinopsis'), syn, more] : null,
    source ? el('p', { class: 'nv-src' }, el('span', { class: 'muted' }, 'Sumber: '), source) : null,
    el('p', { class: 'nv-src muted' }, `Ditambahkan ${new Date(n.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`),
    empty && !locked ? el('p', { class: 'muted small' }, 'Belum ada info. Ketuk Edit info untuk menambahkan penulis, penerjemah, genre, sinopsis, dan sampul.') : null,
  );
  return { hero, readBtn, editBtn, tiles, gapBox, infoBox, idx, total };
}

/** Popup info novel: dari bawah di HP, di tengah layar di tablet/laptop. */
async function openNovelPopup(n) {
  const cover = await db.getCover(n.id);
  let d;
  const close = () => d?.close();
  const parts = novelParts(n, cover, { onBeforeNav: close });
  const listBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      disabled: !parts.total,
      onclick: () =>
        openTocDialog(
          n,
          parts.idx,
          (k) => {
            close();
            location.hash = readHash(n.id, n.toc[k].num);
          },
          (num, para) => {
            close();
            location.hash = readHash(n.id, num, para);
          },
        ),
    },
    icon('toc'),
    'Daftar chapter',
  );
  const pageBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        close();
        location.hash = novelHash(n.id);
      },
    },
    icon('info'),
    'Detail lengkap',
  );
  dialog({
    title: n.title,
    className: 'nv-pop',
    body: [
      parts.hero,
      el('div', { class: 'nv-actions' }, parts.readBtn, parts.editBtn),
      el('div', { class: 'nv-pop-links' }, listBtn, pageBtn),
      parts.tiles,
      parts.gapBox,
      parts.infoBox,
    ],
    onOpen: (x) => (d = x),
  });
}

/** Halaman novel lengkap: info di atas (di layar lebar: kolom kiri), daftar chapter di bawah (kolom kanan). */
async function showNovel(id) {
  const [n, cover] = await Promise.all([db.getNovel(id), db.getCover(id)]);
  if (!n) {
    location.hash = '#/';
    return;
  }
  document.title = `${n.title} · LumenRead`;
  const parts = novelParts(n, cover);
  const bar = el(
    'header',
    { class: 'bar' },
    iconBtn('back', 'Kembali ke perpustakaan', () => (location.hash = '#/')),
    el('h1', { class: 'bar-novel' }, n.title),
    iconBtn('more', 'Menu novel', () => novelMenu(n)),
  );
  // Daftar chapter langsung di halaman (sama dengan daftar isi: cari, urutan, 📍, bookmark, per halaman).
  const toc = parts.total
    ? tocBody(
        n,
        parts.idx,
        (k) => (location.hash = readHash(n.id, n.toc[k].num)),
        (num, para) => (location.hash = readHash(n.id, num, para)),
      )
    : null;
  const tocBox = toc ? el('section', { class: 'nv-box nv-toc' }, el('div', { class: 'nv-label' }, 'Daftar chapter'), toc.nodes) : null;
  setView([
    bar,
    el(
      'main',
      { class: 'page novel-page' },
      el('div', { class: 'nv-side' }, parts.hero, el('div', { class: 'nv-actions' }, parts.readBtn, parts.editBtn), parts.tiles, parts.gapBox, parts.infoBox),
      el('div', { class: 'nv-main' }, tocBox),
    ),
  ]);
  toc?.locate(false);
}

async function editNovelInfo(n) {
  const i = n.info || {};
  // Sampul: diganti/dihapus di sini, baru disimpan saat Simpan. undefined = tidak berubah, null = dihapus.
  const oldCover = await db.getCover(n.id);
  let newCover;
  const coverBox = el('div', { class: 'edit-cover' });
  const coverInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const removeBtn = el('button', { type: 'button', class: 'btn small-btn' }, 'Hapus');
  const showCover = () => {
    const data = newCover === undefined ? oldCover : newCover;
    coverBox.replaceChildren(coverEl(n, data));
    removeBtn.disabled = !data;
  };
  const pickBtn = el('button', { type: 'button', class: 'btn small-btn', onclick: () => coverInput.click() }, 'Pilih sampul');
  coverBox.onclick = () => coverInput.click();
  coverInput.onchange = async () => {
    const f = coverInput.files[0];
    if (!f) return;
    try {
      newCover = await busy('Menyiapkan sampul…', () => coverData(f));
    } catch (e) {
      console.error(e);
      toast('Gambar tidak bisa dibaca.');
    }
    coverInput.value = '';
    showCover();
  };
  removeBtn.onclick = () => {
    newCover = null;
    showCover();
  };
  showCover();
  const field = (label, input) => el('label', { class: 'field' }, el('span', null, label), input);
  const text = (value, placeholder = 'Opsional') => el('input', { type: 'text', value: value || '', placeholder });
  const titleIn = text(n.title, 'Wajib');
  const origIn = text(i.origTitle, 'mis. 魔帝大管家');
  const authorIn = text(n.author);
  const transIn = text(i.translator);
  const statusIn = el(
    'select',
    null,
    Object.entries(STORY_STATUS).map(([k, v]) => el('option', { value: k, selected: (i.status || '') === k }, v.label)),
  );
  const genreIn = text((i.genres || []).join(', '), 'mis. Xianxia, Aksi, Komedi');
  const sourceIn = el('input', { type: 'url', value: i.source || '', placeholder: 'https://…' });
  const synIn = el('textarea', { class: 'plain', rows: 6, value: i.synopsis || '', placeholder: 'Opsional' });
  const v = await dialog({
    title: 'Edit info novel',
    body: [
      el(
        'div',
        { class: 'edit-head' },
        coverBox,
        el('div', { class: 'edit-head-main' }, field('Judul', titleIn), el('div', { class: 'edit-cover-btns' }, pickBtn, removeBtn), coverInput),
      ),
      field('Judul asli', origIn),
      el('div', { class: 'row-2' }, field('Penulis', authorIn), field('Penerjemah', transIn)),
      el('div', { class: 'row-2' }, field('Status cerita', statusIn), field('Genre (pisahkan dengan koma)', genreIn)),
      field('Sumber / tautan', sourceIn),
      field('Sinopsis', synIn),
    ],
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Simpan',
        primary: true,
        value: 'save',
        run: () => {
          if (titleIn.value.trim()) return true;
          toast('Judul tidak boleh kosong.');
          return false;
        },
      },
    ],
  });
  if (v !== 'save') return;
  const info = {
    origTitle: origIn.value.trim(),
    translator: transIn.value.trim(),
    status: statusIn.value,
    genres: [...new Set(genreIn.value.split(',').map((g) => g.trim()).filter(Boolean))],
    source: sourceIn.value.trim(),
    synopsis: synIn.value.trim(),
  };
  for (const k of Object.keys(info)) if (!info[k] || (Array.isArray(info[k]) && !info[k].length)) delete info[k];
  const patch = { title: titleIn.value.trim(), author: authorIn.value.trim(), info };
  const same = patch.title === n.title && patch.author === (n.author || '') && JSON.stringify(info) === JSON.stringify(n.info || {});
  const coverChanged = newCover !== undefined && newCover !== oldCover;
  if (same && !coverChanged) return;
  if (!same) await db.updateMeta(n.id, patch);
  if (coverChanged) await db.setCover(n.id, newCover);
  changed();
  toast('Info novel disimpan.');
  route();
}

/** Rapikan TL note format lama di semua chapter tersimpan (aturan sama dengan saat impor). */
async function tidyTlNotes(n) {
  const fixes = await busy('Memeriksa TL note…', async () =>
    (await db.getChapterRange(n.id))
      .map((c) => {
        const paragraphs = autoTlNote(c.paragraphs, c.num);
        return paragraphs && { num: c.num, title: c.title, paragraphs };
      })
      .filter(Boolean),
  );
  if (!fixes.length) return toast('Tidak ada TL note format lama yang perlu dirapikan.');
  const nums = fixes.map((f) => f.num);
  const shown = nums.slice(0, 12).join(', ') + (nums.length > 12 ? `, … (+${nums.length - 12})` : '');
  const ok = await confirmDialog(
    'Rapikan TL note?',
    `${fmtNum(fixes.length)} chapter punya TL note format lama (Chapter ${shown}). Judul catatannya akan diganti "TL note Chapter N"; isi catatan tidak berubah.`,
    'Rapikan',
  );
  if (!ok) return;
  await db.saveChapters(n.id, fixes);
  changed();
  toast(`${fmtNum(fixes.length)} chapter dirapikan.`);
  route();
}

/**
 * Menu novel (⋯): kepala bersampul (judul serif, penulis, progres), status baca berupa kapsul,
 * lalu aksi berkelompok (Baca · Kelola · Hapus) dengan ikon. Teks aksi sama seperti sebelumnya.
 */
async function novelMenu(n) {
  const has = n.toc.length > 0;
  const locked = settings.changeLock;
  const cover = await db.getCover(n.id).catch(() => null);
  let d;
  const act = (ic, label, fn, opts = {}) => {
    const off = opts.disabled || (opts.change && locked);
    return el(
      'button',
      {
        type: 'button',
        class: `nm-row${opts.danger ? ' danger' : ''}`,
        disabled: off,
        title: opts.change && locked ? 'Perubahan sedang dikunci' : null,
        onclick: () => {
          d.close();
          fn();
        },
      },
      el('span', { class: 'nm-ic' }, icon(ic)),
      el('span', { class: 'nm-txt' }, label, opts.sub ? el('small', null, opts.sub) : null),
      icon('chevron'),
    );
  };
  const statusIcons = { reading: 'book', later: 'clock', done: 'check' };
  const statusSeg = el(
    'div',
    { class: 'nm-seg', role: 'radiogroup', 'aria-label': 'Status baca' },
    Object.entries(STATUSES).map(([k, label]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(statusOf(n) === k),
          onclick: async () => {
            await db.setStatus(n.id, k);
            changed();
            d.close();
            route();
          },
        },
        icon(statusIcons[k]),
        el('span', null, label),
      ),
    ),
  );
  const pct = Math.round(readPct(n));
  const pos = n.lastRead && pct ? `Chapter ${n.lastRead.num} dari ${fmtNum(n.toc.length)} · ${pct}%` : `${fmtNum(n.toc.length)} chapter`;
  const head = el(
    'div',
    { class: 'nm-head' },
    cover ? el('div', { class: 'nm-glow', style: `background-image:url("${cover}")`, 'aria-hidden': 'true' }) : null,
    el('div', { class: 'nm-cover' }, coverEl(n, cover)),
    el(
      'div',
      { class: 'nm-meta' },
      el('small', null, icon('spark'), 'Menu novel'),
      el('h3', null, n.title),
      n.author ? el('p', { class: 'nm-by' }, n.author) : null,
      el('div', { class: 'nm-prog', 'aria-hidden': 'true' }, el('i', { style: `width:${pct}%` })),
      el('p', { class: 'nm-pos' }, pos),
    ),
  );
  const group = (label, cls, ...rows) => [
    label ? el('div', { class: 'nm-label' }, label) : null,
    el('div', { class: `nm-group${cls ? ' ' + cls : ''}` }, rows),
  ];
  const body = el(
    'div',
    { class: 'nm' },
    head,
    el('div', { class: 'nm-label' }, 'Status baca'),
    statusSeg,
    group(
      'Baca',
      '',
      act('toc', 'Daftar isi', () => openToc(n), { disabled: !has, sub: has ? `${fmtNum(n.toc.length)} chapter` : 'Belum ada chapter' }),
      act('info', 'Info novel', () => openNovelInfo(n)),
    ),
    group(
      'Kelola',
      '',
      act('upload', 'Impor / tambah chapter', () => openImport(n.id)),
      act('note', 'Rapikan TL note semua chapter', () => tidyTlNotes(n), { disabled: !has, change: true }),
      act('download', 'Ekspor & compile…', () => openExport(n), { disabled: !has, sub: 'EPUB atau .zip berisi .txt' }),
      act('pen', 'Edit judul & info novel', () => editNovelInfo(n), { change: true }),
    ),
    group(
      null,
      'danger',
      act('cut', 'Hapus rentang chapter', () => openDeleteRange(n), { disabled: !has, danger: true, change: true }),
      act(
        'trash',
        'Hapus novel',
        async () => {
          if (
            await confirmDialog(
              'Hapus novel',
              `Hapus "${n.title}" beserta ${fmtNum(n.toc.length)} chapter dari perangkat ini?`,
              'Hapus',
              true,
            )
          ) {
            await db.deleteNovel(n.id);
            toast('Novel dihapus.');
            changed();
            route();
          }
        },
        { danger: true, change: true },
      ),
    ),
    locked ? el('p', { class: 'nm-lock' }, icon('lock'), 'Perubahan sedang dikunci. Buka kunci di Pengaturan.') : null,
  );
  dialog({ title: n.title, body, className: 'nm-dlg', onOpen: (x) => (d = x) });
}

/**
 * Pilih rentang chapter: dua tombol (Dari / Sampai) yang membuka daftar chapter aplikasi
 * (daftar pilihan bawaan HP terlalu besar & tidak bisa diatur tampilannya). Bawaan: semua chapter.
 */
function rangePicker(n, onChange) {
  const toc = n.toc;
  let fromI = 0;
  let toI = toc.length - 1;
  const face = (i) => {
    const t = toc[i];
    const m = t.title && /^(.+?)\s*\(([^()]+)\)\s*$/.exec(t.title);
    return [el('b', null, `Chapter ${t.num}`), el('span', null, m ? m[1] : t.title || '(tanpa judul)')];
  };
  const fromBtn = el('button', { type: 'button', class: 'range-btn', 'aria-label': 'Pilih chapter awal' });
  const toBtn = el('button', { type: 'button', class: 'range-btn', 'aria-label': 'Pilih chapter akhir' });
  const render = () => {
    fromBtn.replaceChildren(...face(fromI));
    toBtn.replaceChildren(...face(toI));
    onChange?.();
  };
  fromBtn.onclick = () =>
    openTocDialog(n, fromI, (i) => {
      fromI = i;
      if (toI < fromI) toI = fromI;
      render();
    }, null, { title: 'Dari chapter', pickOnly: true });
  toBtn.onclick = () =>
    openTocDialog(n, toI, (i) => {
      toI = i;
      if (fromI > toI) fromI = toI;
      render();
    }, null, { title: 'Sampai chapter', pickOnly: true });
  const node = el(
    'div',
    { class: 'row-2 range-pick' },
    el('div', { class: 'field' }, el('span', null, 'Dari chapter'), fromBtn),
    el('div', { class: 'field' }, el('span', null, 'Sampai chapter'), toBtn),
  );
  fromBtn.replaceChildren(...face(fromI));
  toBtn.replaceChildren(...face(toI));
  return {
    node,
    get from() {
      return toc[fromI].num;
    },
    get to() {
      return toc[toI].num;
    },
    get count() {
      return toI - fromI + 1;
    },
    setAll() {
      fromI = 0;
      toI = toc.length - 1;
      render();
    },
  };
}

/** File .txt per chapter (format mentah, TL note dibakukan) dalam satu .zip; bisa diimpor ulang apa adanya. */
async function buildTxtZip(chapters) {
  const width = String(Math.floor(Math.max(...chapters.map((c) => c.num)))).length;
  return writeZip(
    chapters.map((c) => {
      const [i, f] = String(c.num).split('.');
      return {
        name: `${i.padStart(Math.max(4, width), '0')}${f ? '.' + f : ''}.txt`,
        data: [chapterLabel(c.num, c.title), ...tidyParagraphs(c.paragraphs, c.num)].join('\n\n') + '\n',
      };
    }),
  );
}

const EXPORTS = {
  epub: { label: 'EPUB', hint: 'Untuk dibaca di Moon+ Reader dan aplikasi lain; dengan sampul & sinopsis.' },
  zip: { label: '.zip (txt)', hint: 'Arsip teks mentah, satu file .txt per chapter; bisa diimpor ulang.' },
};

/** Ekspor & compile: pilih format (EPUB / .zip berisi .txt) dan rentang chapter. */
async function openExport(n) {
  let format = EXPORTS[settings.exportFormat] ? settings.exportFormat : 'epub';
  const titleIn = el('input', { type: 'text', value: n.title });
  const authorIn = el('input', { type: 'text', value: n.author || '', placeholder: 'Opsional' });
  const langIn = el('input', { type: 'text', value: n.lang || 'id', placeholder: 'id / en / …' });
  const info = el('p', { class: 'small muted' });
  const hint = el('p', { class: 'small muted export-hint' });
  let titleTouched = false;
  titleIn.oninput = () => (titleTouched = true);
  const r = rangePicker(n, () => {
    const all = r.count === n.toc.length;
    if (!titleTouched) titleIn.value = all ? n.title : `${n.title} (${r.from === r.to ? r.from : `${r.from}-${r.to}`})`;
    info.textContent = `${fmtNum(r.count)} chapter akan dimasukkan.`;
  });
  info.textContent = `${fmtNum(r.count)} chapter akan dimasukkan.`;
  // "Semua chapter" (bawaan): rentang disembunyikan dan diset dari chapter pertama sampai terakhir.
  const allBox = el('input', { type: 'checkbox', checked: true });
  const applyAll = () => {
    if (allBox.checked) r.setAll();
    r.node.classList.toggle('hidden', allBox.checked);
  };
  allBox.onchange = applyAll;
  applyAll();
  const allLabel = el('label', { class: 'check' }, allBox, `Semua chapter (${fmtNum(n.toc.length)})`);
  const titleLabel = el('span');
  const epubFields = el(
    'div',
    { class: 'row-2' },
    el('label', { class: 'field' }, el('span', null, 'Pengarang'), authorIn),
    el('label', { class: 'field' }, el('span', null, 'Kode bahasa'), langIn),
  );
  const seg = el('div', { class: 'seg export-seg', role: 'radiogroup', 'aria-label': 'Format' });
  let goBtn = null;
  const sync = () => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === format)));
    hint.textContent = EXPORTS[format].hint;
    epubFields.classList.toggle('hidden', format !== 'epub');
    titleLabel.textContent = format === 'epub' ? 'Judul EPUB' : 'Nama file';
    if (goBtn) goBtn.textContent = format === 'epub' ? 'Buat EPUB' : 'Buat .zip';
  };
  for (const [k, v] of Object.entries(EXPORTS)) {
    const b = el('button', { type: 'button', role: 'radio' }, v.label);
    b.dataset.k = k;
    b.onclick = () => {
      format = k;
      settings.exportFormat = k;
      saveSettings();
      sync();
    };
    seg.append(b);
  }
  sync();

  let built = null;
  const ok = await dialog({
    title: 'Ekspor & compile',
    body: [
      el('div', { class: 'section-label' }, 'Format'),
      seg,
      hint,
      el('div', { class: 'section-label' }, 'Rentang chapter'),
      allLabel,
      r.node,
      info,
      el('label', { class: 'field' }, titleLabel, titleIn),
      epubFields,
    ],
    onOpen: (d) => {
      goBtn = d.querySelector('.dlg-foot .btn.primary');
      sync();
    },
    actions: [
      { label: 'Batal', value: false },
      {
        label: 'Buat',
        primary: true,
        value: true,
        run: async () => {
          const title = titleIn.value.trim() || n.title;
          const epub = format === 'epub';
          const chapters = await busy(epub ? 'Menyusun EPUB…' : 'Menyiapkan file…', async () => {
            const list = await db.getChapterRange(n.id, r.from, r.to);
            if (!list.length) return list;
            const data = epub
              ? await buildEpub({
                  title,
                  author: authorIn.value.trim(),
                  lang: langIn.value.trim() || 'id',
                  description: n.info?.synopsis || '',
                  cover: await db.getCover(n.id),
                  chapters: list,
                })
              : await buildTxtZip(list);
            built = {
              data,
              name: `${safeFileName(title)}.${epub ? 'epub' : 'zip'}`,
              mime: epub ? 'application/epub+zip' : 'application/zip',
            };
            return list;
          });
          if (!chapters.length) {
            toast('Tidak ada chapter di rentang itu.');
            return false;
          }
          if (epub) {
            const author = authorIn.value.trim();
            const lang = langIn.value.trim() || 'id';
            if (author !== (n.author || '') || lang !== (n.lang || 'id')) {
              await db.updateMeta(n.id, { author, lang });
              changed();
            }
          }
        },
      },
    ],
  });
  if (ok && built) downloadOrShare(built.data, built.name, built.mime);
}

async function openDeleteRange(n) {
  const info = el('p', { class: 'small muted' });
  const r = rangePicker(n, () => (info.textContent = `${fmtNum(r.count)} chapter akan dihapus.`));
  info.textContent = `${fmtNum(r.count)} chapter akan dihapus.`;
  const v = await dialog({
    title: 'Hapus rentang chapter',
    body: [r.node, info],
    actions: [
      { label: 'Batal', value: false },
      { label: 'Hapus', value: true, primary: true, danger: true },
    ],
  });
  if (v !== true) return;
  if (
    !(await confirmDialog(
      'Yakin?',
      `Hapus Chapter ${r.from}–${r.to} (${fmtNum(r.count)} chapter)? Tindakan ini tidak bisa dibatalkan.`,
      'Hapus',
      true,
    ))
  )
    return;
  await db.deleteChapters(n.id, r.from, r.to);
  toast(`${fmtNum(r.count)} chapter dihapus.`);
  changed();
  route();
}

// ---------- Impor ----------

const isEpub = (f) => /\.epub$/i.test(f.name) || f.type === 'application/epub+zip';
const isZip = (f) => !isEpub(f) && (/\.zip$/i.test(f.name) || /zip/.test(f.type));
const isTxtName = (name) => /\.txt$/i.test(name) && !/(^|\/)(__MACOSX\/|\.)/.test(name);

async function readSources(files) {
  const sources = [];
  for (const f of files) {
    if (isEpub(f)) {
      let ep;
      try {
        ep = await readEpub(await f.arrayBuffer());
      } catch (e) {
        throw new Error(`${f.name}: ${e.message}`);
      }
      if (!ep.chapters.length) throw new Error(`${f.name}: tidak ada chapter berisi teks di dalam EPUB.`);
      sources.push({ name: f.name, chapters: ep.chapters, epub: ep });
    } else if (isZip(f)) {
      const entries = readZip(await f.arrayBuffer())
        .filter((e) => !e.dir && isTxtName(e.name))
        .sort((a, b) => naturalCompare(a.name, b.name));
      if (!entries.length) throw new Error(`${f.name}: tidak ada file .txt di dalam zip.`);
      for (const e of entries) sources.push({ name: e.name, text: decodeText(await e.read()) });
    } else {
      sources.push({ name: f.name, text: decodeText(new Uint8Array(await f.arrayBuffer())) });
    }
  }
  return sources;
}

const DRAFT_KEY = 'baca-novel:import-draft';
function loadImportDraft() {
  try {
    return sessionStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
}
function saveImportDraft(v) {
  try {
    if (v) sessionStorage.setItem(DRAFT_KEY, v);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {} // teks terlalu besar untuk penyimpanan sementara: lewati saja
}

async function openImport(presetNovelId) {
  const novels = await db.listNovels();
  let mode = 'paste';
  const err = el('p', { class: 'error hidden' });
  const showErr = (m) => {
    err.textContent = m;
    err.classList.toggle('hidden', !m);
  };

  const target = el(
    'select',
    { 'aria-label': 'Simpan ke' },
    el('option', { value: '' }, '➕ Novel baru'),
    novels.map((n) => el('option', { value: n.id, selected: n.id === presetNovelId }, n.title)),
  );
  const titleIn = el('input', { type: 'text', placeholder: 'Judul novel' });
  const titleField = el('label', { class: 'field' }, el('span', null, 'Judul novel baru'), titleIn);
  const syncTarget = () => titleField.classList.toggle('hidden', !!target.value);
  target.onchange = syncTarget;
  syncTarget();

  const text = el('textarea', {
    rows: 12,
    placeholder: 'Chapter 1: Awal Mula\nParagraf pertama…\nParagraf kedua…\n\nChapter 2: Judul Berikutnya\n…',
    spellcheck: 'false',
  });
  // Draf: teks tempelan disimpan sementara, supaya tidak hilang bila Android menutup aplikasi saat pindah ke Notes.
  text.value = loadImportDraft();
  let draftTimer = 0;
  text.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveImportDraft(text.value), 600);
  });
  // ----- Pilih file: kotak ketuk/tarik-lepas (pengganti tombol bawaan browser) + daftar file terpilih -----
  const fileIn = el('input', {
    type: 'file',
    multiple: true,
    class: 'drop-input',
    accept: '.txt,.zip,.epub,text/plain,application/zip,application/x-zip-compressed,application/epub+zip',
  });
  let picked = []; // file yang dipilih, urut nama; bisa ditambah & dihapus satu per satu
  let autoTitle = '';
  const kindOf = (f) => (isEpub(f) ? 'epub' : isZip(f) ? 'zip' : 'txt');
  const okFile = (f) => isEpub(f) || isZip(f) || /\.txt$/i.test(f.name) || f.type === 'text/plain';
  const typeTag = (k) => el('i', { class: `ftype ${k}` }, k.toUpperCase());
  const drop = el(
    'label',
    { class: 'drop' },
    fileIn,
    el('span', { class: 'drop-icon' }, icon('upload')),
    el(
      'b',
      { class: 'drop-title' },
      el('span', { class: 'touch-only' }, 'Ketuk untuk memilih file'),
      el('span', { class: 'mouse-only' }, 'Klik untuk memilih, atau tarik file ke sini'),
    ),
    el('span', { class: 'drop-types' }, typeTag('epub'), typeTag('txt'), typeTag('zip')),
    el('span', { class: 'drop-sub' }, 'Bisa beberapa file .txt sekaligus'),
    el('b', { class: 'drop-add' }, 'Tambah file'),
  );
  const fileList = el('div', { class: 'file-list' });
  const renderFiles = () => {
    drop.classList.toggle('compact', picked.length > 0);
    // Judul novel baru diisi dari nama file (kalau satu file), selama belum diketik sendiri.
    if (!titleIn.value || titleIn.value === autoTitle) titleIn.value = autoTitle = picked.length === 1 ? baseName(picked[0].name) : '';
    const total = picked.reduce((n, f) => n + f.size, 0);
    fileList.replaceChildren(
      ...(picked.length
        ? [
            el(
              'div',
              { class: 'file-sum' },
              el('span', null, `${fmtNum(picked.length)} file · ${fmtBytes(total)}`),
              el('button', { type: 'button', class: 'link-btn', onclick: () => ((picked = []), showErr(''), renderFiles()) }, 'Hapus semua'),
            ),
            el(
              'div',
              { class: 'file-rows' },
              picked.map((f, i) =>
                el(
                  'div',
                  { class: 'file-row' },
                  typeTag(kindOf(f)),
                  el('span', { class: 'fname', title: f.name }, f.name),
                  el('span', { class: 'fsize' }, fmtBytes(f.size)),
                  iconBtn('close', `Hapus ${f.name}`, () => {
                    picked.splice(i, 1);
                    renderFiles();
                  }),
                ),
              ),
            ),
          ]
        : []),
    );
  };
  const addFiles = (list) => {
    const all = [...list];
    const bad = all.filter((f) => !okFile(f));
    const seen = new Set(picked.map((f) => `${f.name}|${f.size}`));
    for (const f of all) {
      const key = `${f.name}|${f.size}`;
      if (!okFile(f) || seen.has(key)) continue;
      picked.push(f);
      seen.add(key);
    }
    picked.sort((a, b) => naturalCompare(a.name, b.name));
    showErr(bad.length ? `Dilewati (bukan .txt, .zip, atau .epub): ${bad.map((f) => f.name).join(', ')}` : '');
    renderFiles();
  };
  fileIn.onchange = () => {
    addFiles(fileIn.files);
    fileIn.value = ''; // supaya file yang sama bisa dipilih lagi setelah dihapus
  };
  const fileHelp = el(
    'details',
    { class: 'drop-help' },
    el('summary', null, 'Cara kerja impor file'),
    el(
      'p',
      { class: 'small muted' },
      'Pilih file .epub, satu atau beberapa file .txt, atau .zip berisi .txt (diurutkan menurut nama file). File .txt tanpa baris "Chapter N: …" dianggap satu chapter, nomornya diambil dari nama file. Dari EPUB ikut diambil judul, pengarang, sinopsis, dan sampul.',
    ),
  );

  const pastePane = el(
    'div',
    null,
    tlNoteTool(text, (pos) => headingBefore(text.value, pos)),
    text,
    el('p', { class: 'small muted' }, 'Tiap baris yang tidak kosong menjadi satu paragraf; baris kosong diabaikan.'),
  );
  const filePane = el('div', { class: 'hidden' }, drop, fileList, fileHelp);
  // Tarik-lepas (laptop/tablet): file boleh dilepas di mana saja di bagian file, kotaknya ikut menyala.
  let dragDepth = 0;
  filePane.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++dragDepth === 1) drop.classList.add('over');
  });
  filePane.addEventListener('dragover', (e) => e.preventDefault());
  filePane.addEventListener('dragleave', () => {
    if (--dragDepth > 0) return;
    dragDepth = 0;
    drop.classList.remove('over');
  });
  filePane.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('over');
    if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
  });
  const tabBtn = (m, label) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(mode === m),
        onclick: (e) => {
          mode = m;
          e.currentTarget.parentNode
            .querySelectorAll('button')
            .forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          pastePane.classList.toggle('hidden', m !== 'paste');
          filePane.classList.toggle('hidden', m !== 'file');
          showErr('');
        },
      },
      label,
    );

  const v = await dialog({
    title: 'Impor',
    className: 'wide',
    body: [
      el('div', { class: 'tabs', role: 'tablist' }, tabBtn('paste', 'Tempel teks'), tabBtn('file', 'Dari file')),
      pastePane,
      filePane,
      el('div', { class: 'row-2' }, el('label', { class: 'field' }, el('span', null, 'Simpan ke'), target), titleField),
      err,
    ],
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Pratinjau',
        primary: true,
        value: 'next',
        run: async () => {
          showErr('');
          let sources;
          if (mode === 'paste') {
            if (!text.value.trim()) return (showErr('Teks masih kosong.'), false);
            sources = [{ name: null, text: text.value }];
          } else {
            if (!picked.length) return (showErr('Pilih file dulu.'), false);
            try {
              sources = await busy('Membaca file…', () => readSources(picked));
            } catch (e) {
              return (showErr(e.message), false);
            }
          }
          // Nomor yang sudah ada di novel tujuan tidak ikut dilaporkan sebagai nomor hilang.
          const existingNums = target.value ? ((await db.getNovel(target.value))?.toc || []).map((t) => t.num) : [];
          const res = buildImport(sources, existingNums);
          if (res.error) return (showErr(res.error), false);
          const epub = sources.find((s) => s.epub)?.epub || null;
          let title = titleIn.value.trim();
          // Judul file mengisi kolom judul otomatis; untuk EPUB judul dari metadata lebih tepat.
          if (mode === 'file' && epub?.title && (!title || title === baseName(picked[0].name))) title = epub.title;
          if (!target.value && !title && mode === 'file' && picked.length) title = baseName(picked[0].name);
          // Teruskan ke pratinjau; dialog impor ditutup, pratinjau bisa kembali ke sini lewat tombol Batal.
          pending = { res, novelId: target.value || null, title: title || 'Tanpa judul', epub };
        },
      },
    ],
    onOpen: () => text.focus(),
  });
  if (v === 'next' && pending) {
    const p = pending;
    pending = null;
    await openPreview(p);
  }
}
let pending = null;

async function openPreview({ res, novelId, title, epub }) {
  const novel = novelId ? await db.getNovel(novelId) : null;
  const existing = new Map((novel?.toc || []).map((t) => [t.num, t]));
  const items = res.items.map((it, i) => ({ ...it, i, on: !it.dup }));

  const summary = el('div', { class: 'summary' });
  const refreshSummary = () => {
    const on = items.filter((x) => x.on);
    const paras = on.reduce((s, x) => s + x.paragraphs.length, 0);
    const conflicts = on.filter((x) => existing.has(x.num)).length;
    summary.replaceChildren(
      ...[
        el('span', null, el('b', null, fmtNum(on.length)), ` dari ${fmtNum(items.length)} chapter dipilih`),
        el('span', null, `${fmtNum(paras)} paragraf`),
        conflicts && el('span', null, el('b', null, fmtNum(conflicts)), ' sudah ada di novel ini'),
        el('span', { class: 'muted' }, novel ? `→ ${novel.title}` : `→ novel baru "${title}"`),
      ].filter(Boolean),
    );
  };

  const rows = [];
  const list = el('div', { class: 'plist' });
  for (const it of items) {
    const cb = el('input', { type: 'checkbox', checked: it.on, 'aria-label': `Pilih chapter ${it.num}` });
    const body = el('div', { class: 'pbody hidden' });
    const head = el(
      'div',
      { class: 'phead' },
      cb,
      el('span', { class: 'num' }, it.num),
      el('span', { class: 'ttl' }, it.title || el('i', { class: 'muted' }, '(tanpa judul)')),
      it.autoNum ? el('span', { class: 'badge auto' }, 'nomor otomatis') : null,
      it.dup ? el('span', { class: 'badge dup' }, 'nomor kembar') : null,
      it.tl === 'fixed' ? el('span', { class: 'badge tl-fixed', title: 'Format TL note dirapikan otomatis' }, 'TL note dirapikan') : null,
      it.tl === 'ok' ? el('span', { class: 'badge tl-ok' }, 'TL note') : null,
      existing.has(it.num) ? el('span', { class: 'badge exists' }, 'sudah ada') : el('span', { class: 'badge new' }, 'baru'),
      el('span', { class: 'cnt' }, `${fmtNum(it.paragraphs.length)} par.`),
    );
    const exp = el('button', { type: 'button', class: 'expand', 'aria-label': 'Lihat isi', 'aria-expanded': 'false' }, '▸');
    exp.onclick = () => {
      const show = body.classList.contains('hidden');
      if (show && !body.childElementCount) {
        // Chapter ber-TL note: tampilkan akhir cerita, pemisah "---" (apa adanya, di luar kotak), dan seluruh TL note
        // supaya formatnya bisa dicek.
        const tl = it.tl ? it.paragraphs.findIndex(isTlHead) : -1;
        const ps = tl >= 0 ? it.paragraphs.slice(0, tl) : it.paragraphs.slice();
        const seps = [];
        if (tl >= 0) while (ps.length && isSeparator(ps[ps.length - 1])) seps.unshift(ps.pop());
        body.append(
          ...[
            ...ps.slice(0, 3).map((p) => el('p', null, p)),
            ps.length > 4 ? el('p', null, `… (${fmtNum(ps.length - 4)} paragraf lagi) …`) : null,
            ps.length > 3 ? el('p', null, ps[ps.length - 1]) : null,
            ...seps.map((p) => el('p', null, p)),
            ...(tl >= 0 ? it.paragraphs.slice(tl).map((p) => el('p', { class: 'ptl' }, p)) : []),
            !ps.length ? el('p', null, '(kosong)') : null,
            it.source ? el('p', { class: 'src' }, `Sumber: ${it.source}`) : null,
          ].filter(Boolean),
        );
      }
      body.classList.toggle('hidden', !show);
      exp.textContent = show ? '▾' : '▸';
      exp.setAttribute('aria-expanded', String(show));
    };
    head.append(exp);
    const row = el('div', { class: `pitem${it.on ? '' : ' off'}` }, head, body);
    const setOn = (on) => {
      it.on = on;
      cb.checked = on;
      row.classList.toggle('off', !on);
    };
    cb.onchange = () => {
      // Satu nomor hanya boleh satu: memilih yang satu melepas yang lain.
      if (cb.checked) for (const o of rows) if (o.it !== it && o.it.num === it.num && o.it.on) o.setOn(false);
      setOn(cb.checked);
      refreshSummary();
    };
    head.querySelector('.ttl').onclick = () => exp.click();
    rows.push({ it, setOn, row });
    list.append(row);
  }

  const setAll = (on) => {
    const used = new Set();
    for (const r of rows) {
      const ok = on && !used.has(r.it.num);
      if (ok) used.add(r.it.num);
      r.setOn(ok);
    }
    refreshSummary();
  };
  refreshSummary();

  // Saring daftar: hanya chapter yang punya TL note (yang dirapikan otomatis ditampilkan lebih dulu di pesan atas).
  const tlCount = items.filter((x) => x.tl).length;
  const tlFilter = tlCount
    ? el('button', { type: 'button', class: 'btn', 'aria-pressed': 'false' }, `Hanya ber-TL note (${fmtNum(tlCount)})`)
    : null;
  if (tlFilter)
    tlFilter.onclick = () => {
      const on = tlFilter.getAttribute('aria-pressed') !== 'true';
      tlFilter.setAttribute('aria-pressed', String(on));
      for (const r of rows) r.row.classList.toggle('hidden', on && !r.it.tl);
    };

  let toSave = null;
  const v = await dialog({
    title: 'Pratinjau impor',
    className: 'wide',
    body: [
      summary,
      res.warnings.length
        ? el(
            'ul',
            { class: 'warnings' },
            res.warnings.map((w) => el('li', null, w)),
          )
        : null,
      el(
        'div',
        { class: 'preview-tools' },
        el('button', { type: 'button', class: 'btn', onclick: () => setAll(true) }, 'Pilih semua'),
        el('button', { type: 'button', class: 'btn', onclick: () => setAll(false) }, 'Kosongkan'),
        tlFilter,
      ),
      list,
    ],
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Simpan',
        primary: true,
        value: 'save',
        run: async () => {
          const chosen = items.filter((x) => x.on);
          if (!chosen.length) return (toast('Belum ada chapter yang dipilih.'), false);
          const conflicts = chosen.filter((x) => existing.has(x.num));
          let skip = new Set();
          if (conflicts.length) {
            const decision = await askConflicts(conflicts, existing);
            if (!decision) return false; // kembali ke pratinjau
            skip = decision.skip;
          }
          toSave = { save: chosen.filter((x) => !skip.has(x.num)), replaced: conflicts.length - skip.size, skipped: skip.size };
        },
      },
    ],
  });
  if (v !== 'save' || !toSave) return;

  const { save, replaced, skipped } = toSave;
  if (!save.length) {
    toast('Tidak ada yang disimpan (semua dilewati).');
    return;
  }
  const target = novel || (await db.createNovel(title));
  await busy('Menyimpan…', async () => {
    await db.saveChapters(
      target.id,
      save.map(({ num, title, paragraphs }) => ({ num, title, paragraphs })),
    );
    // Dari EPUB: pengarang & sinopsis untuk novel baru, sampul bila novel belum punya.
    if (epub) {
      if (!novel && (epub.author || epub.synopsis))
        await db.updateMeta(target.id, { author: epub.author, ...(epub.synopsis ? { info: { synopsis: epub.synopsis } } : {}) });
      if (epub.cover && !(novel?.cover && !novel.cover.del)) {
        try {
          await db.setCover(target.id, await coverData(new Blob([epub.cover.bytes], { type: epub.cover.type })));
        } catch (e) {
          console.error(e);
        }
      }
    }
  });
  requestPersist();
  const parts = [`${fmtNum(save.length - replaced)} chapter baru`];
  if (replaced) parts.push(`${fmtNum(replaced)} diganti`);
  if (skipped) parts.push(`${fmtNum(skipped)} dilewati`);
  saveImportDraft(''); // tersimpan: draf tempelan tidak diperlukan lagi
  toast(`Tersimpan: ${parts.join(', ')}.`, { label: 'Baca', run: () => (location.hash = `#/read/${encodeURIComponent(target.id)}`) });
  changed();
  route();
}

/** Menanyakan ganti/lewati untuk tiap chapter yang nomornya sudah ada. Mengembalikan { skip:Set } atau null bila batal. */
async function askConflicts(conflicts, existing) {
  const radios = [];
  const rows = conflicts.map((c) => {
    const old = existing.get(c.num);
    const name = `conf-${c.i}`;
    const replace = el('input', { type: 'radio', name, value: 'replace', disabled: settings.changeLock });
    const skip = el('input', { type: 'radio', name, value: 'skip', checked: true });
    radios.push({ num: c.num, replace, skip });
    return el(
      'div',
      { class: 'conf' },
      el(
        'div',
        { class: 'what' },
        el('b', null, `Chapter ${c.num}`),
        el('br'),
        el('span', { class: 'muted' }, `Lama: ${old.title || '(tanpa judul)'} · ${fmtNum(old.n)} par.`),
        el('br'),
        el('span', null, `Baru: ${c.title || '(tanpa judul)'} · ${fmtNum(c.paragraphs.length)} par.`),
      ),
      el('div', { class: 'opts' }, el('label', null, replace, 'Ganti'), el('label', null, skip, 'Lewati')),
    );
  });
  const all = (which) => radios.forEach((r) => (r[which].checked = true));
  const v = await dialog({
    title: `${fmtNum(conflicts.length)} chapter sudah ada`,
    body: [
      el(
        'p',
        null,
        'Nomor chapter berikut sudah ada di novel ini. Pilih untuk masing-masing: ganti dengan versi baru, atau lewati (biarkan yang lama).',
      ),
      settings.changeLock
        ? el(
            'p',
            { class: 'warnings' },
            'Perubahan sedang dikunci, jadi chapter yang sudah ada hanya bisa dilewati. Buka kunci di Pengaturan untuk mengganti.',
          )
        : null,
      el(
        'div',
        { class: 'conf-tools' },
        el('button', { type: 'button', class: 'btn', disabled: settings.changeLock, onclick: () => all('replace') }, 'Ganti semua'),
        el('button', { type: 'button', class: 'btn', onclick: () => all('skip') }, 'Lewati semua'),
      ),
      rows,
    ],
    actions: [
      { label: 'Kembali', value: null },
      { label: 'Lanjut simpan', value: 'ok', primary: true },
    ],
  });
  if (v !== 'ok') return null;
  return { skip: new Set(radios.filter((r) => r.skip.checked).map((r) => r.num)) };
}

let persistAsked = false;
function requestPersist() {
  if (persistAsked || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persist().catch(() => {});
}

// ---------- Pembaca ----------

/** Tombol yang baru bekerja setelah ditahan `ms` milidetik (untuk mode kunci sentuhan). */
function holdButton(label, ms, onDone, cls = '') {
  const b = el(
    'button',
    { type: 'button', class: `hold ${cls}`, 'aria-label': label },
    el('span', { class: 'fill' }),
    el('span', null, label),
  );
  let timer = 0;
  const stop = () => {
    clearTimeout(timer);
    b.classList.remove('holding');
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.style.setProperty('--hold-ms', `${ms}ms`);
    b.classList.add('holding');
    timer = setTimeout(() => {
      stop();
      onDone();
    }, ms);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard: tekan Enter/Spasi dua kali cepat juga bisa, supaya tetap dapat diakses tanpa layar sentuh.
  let lastKey = 0;
  b.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastKey < 600) onDone();
    lastKey = now;
  });
  return b;
}

let lastSearch = '';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pecah teks menjadi node dengan kata yang dicari diberi <mark>. */
function highlightText(text, q) {
  if (!q) return [text];
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, 'gi'));
  return parts.map((part, i) => (i % 2 ? el('mark', null, part) : part)).filter((x) => x !== '');
}

function snippetAround(text, q, pad = 70) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0 || text.length <= pad * 2) return text.length > pad * 2 ? text.slice(0, pad * 2) + '…' : text;
  const start = Math.max(0, at - pad);
  const end = Math.min(text.length, at + q.length + pad);
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// Judul seperti "Water and Fire (Air dan Api)": bagian dalam kurung (biasanya terjemahan) jadi baris kedua.
function tocTitle(title) {
  if (!title) return el('span', { class: 't' }, el('i', { class: 'muted' }, '(tanpa judul)'));
  const m = /^(.+?)\s*\(([^()]+)\)\s*$/.exec(title);
  return el('span', { class: 't' }, el('span', null, m ? m[1] : title), m ? el('small', null, m[2]) : null);
}

/**
 * Daftar isi: tab Chapter (cari, urutan, ke chapter sekarang, per halaman 100) dan tab Bookmark.
 * Dipakai di layar baca dan di kartu novel perpustakaan. `idx` = indeks chapter yang sedang/terakhir dibaca (-1 bila belum),
 * `onChapter(i)` dan `onBookmark(num, para)` dipanggil setelah dialog ditutup.
 * opts.title: judul dialog (bawaan judul novel); opts.pickOnly: hanya tab chapter (untuk memilih rentang).
 */
function openTocDialog(novel, idx, onChapter, onBookmark, opts = {}) {
  let d;
  const body = tocBody(novel, idx, onChapter, onBookmark, {
    ...opts,
    wrap: (fn) => () => {
      d.close();
      fn();
    },
  });
  dialog({
    title: opts.title || novel.title,
    className: 'toc-dlg',
    body: body.nodes,
    onOpen: (x) => {
      d = x;
      body.locate();
    },
  });
}

/**
 * Isi daftar isi (tab Chapter & Bookmark, cari, urutan, 📍, per halaman 100); dipakai di dialog dan halaman novel.
 * opts.wrap(fn): membungkus aksi pilih (mis. menutup dialog dulu). Mengembalikan { nodes, locate(scroll) }.
 */
function tocBody(novel, idx, onChapter, onBookmark, opts = {}) {
  const PAGE = 100;
  let desc = false;
  let page = 0;
  let rows = []; // [indeks toc] yang lolos pencarian, sesuai urutan
  const marked = new Set(Object.values(novel.bookmarks || {}).map((b) => b.num));
  const pick = opts.wrap || ((fn) => fn);

  const filter = el('input', { type: 'search', placeholder: 'Cari chapter…', 'aria-label': 'Cari nomor atau judul chapter' });
  const sortBtn = iconBtn('sort', 'Balik urutan', () => {
    desc = !desc;
    sortBtn.classList.toggle('on', desc);
    locate();
  });
  const list = el('div', { class: 'toc-list' });
  const pageSel = el('select', { 'aria-label': 'Pilih halaman', onchange: () => show(Number(pageSel.value)) });
  const pager = (label, aria, to) => el('button', { type: 'button', class: 'btn', 'aria-label': aria, onclick: () => show(to()) }, label);
  const pages = () => Math.max(1, Math.ceil(rows.length / PAGE));
  const nav = [
    pager('«', 'Halaman pertama', () => 0),
    pager('‹', 'Halaman sebelumnya', () => page - 1),
    el('div', { class: 'toc-pagesel' }, pageSel),
    pager('›', 'Halaman berikutnya', () => page + 1),
    pager('»', 'Halaman terakhir', () => pages() - 1),
  ];
  const pagerBar = el('div', { class: 'toc-pager' }, nav);

  function compute() {
    const q = filter.value.trim().toLowerCase();
    rows = novel.toc.map((_, i) => i).filter((i) => !q || `${novel.toc[i].num} ${novel.toc[i].title}`.toLowerCase().includes(q));
    if (desc) rows.reverse();
    pageSel.replaceChildren(
      ...Array.from({ length: pages() }, (_, p) => {
        const a = novel.toc[rows[p * PAGE]];
        const b = novel.toc[rows[Math.min(rows.length, (p + 1) * PAGE) - 1]];
        return el('option', { value: p }, a ? `${a.num}–${b.num}` : '–');
      }),
    );
  }
  function show(p) {
    page = Math.max(0, Math.min(pages() - 1, p));
    pageSel.value = String(page);
    const [first, prev, , next, last] = nav;
    first.disabled = prev.disabled = page === 0;
    next.disabled = last.disabled = page >= pages() - 1;
    pagerBar.hidden = pages() < 2;
    const slice = rows.slice(page * PAGE, (page + 1) * PAGE);
    list.replaceChildren(
      ...(slice.length
        ? slice.map((i) => {
            const t = novel.toc[i];
            return el(
              'button',
              { type: 'button', class: `toc-row${i === idx ? ' current' : ''}`, title: chapterLabel(t.num, t.title), onclick: pick(() => onChapter(i)) },
              el('span', { class: 'n' }, t.num),
              tocTitle(t.title),
              marked.has(t.num) ? el('span', { class: 'toc-bm', title: 'Ada bookmark' }, icon('bookmark')) : null,
            );
          })
        : [el('p', { class: 'muted toc-empty' }, 'Tidak ada chapter yang cocok.')]),
    );
    list.scrollTop = 0;
  }
  // Ke halaman berisi chapter yang sedang dibaca, lalu (bila scroll) gulir ke barisnya.
  function locate(scroll = true) {
    compute();
    const at = rows.indexOf(idx);
    show(at < 0 ? 0 : Math.floor(at / PAGE));
    if (scroll) list.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }
  filter.oninput = () => {
    compute();
    show(0);
  };
  const locateBtn = iconBtn('pin', 'Ke chapter yang sedang dibaca', () => {
    filter.value = '';
    locate();
  });

  // Tab bookmark: lompat ke posisinya. Tambah & hapus tetap lewat tombol Bookmark.
  const bms = Object.values(novel.bookmarks || {}).sort((a, b) => a.num - b.num || a.para - b.para);
  const bmPane = el(
    'div',
    { class: 'toc-pane toc-list', hidden: true },
    bms.length
      ? bms.map((b) =>
          el(
            'button',
            { type: 'button', class: 'toc-row bm-row', onclick: pick(() => onBookmark(b.num, b.para)) },
            el('span', { class: 'n' }, b.num),
            el(
              'span',
              { class: 't' },
              el('b', null, b.note || `Paragraf ${b.para + 1}`),
              b.text ? el('small', null, b.text) : null,
            ),
          ),
        )
      : el('p', { class: 'muted toc-empty' }, 'Belum ada bookmark. Tambahkan lewat tombol Bookmark di panel baca.'),
  );
  const chPane = el(
    'div',
    { class: 'toc-pane' },
    el('div', { class: 'toc-tools' }, el('label', { class: 'toc-search' }, icon('search'), filter), sortBtn, locateBtn),
    list,
    pagerBar,
  );
  const tab = (label, pane, other) => {
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(pane === chPane) }, label);
    b.onclick = () => {
      pane.hidden = false;
      other.hidden = true;
      b.parentNode.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    };
    return b;
  };
  return {
    nodes: [
      opts.pickOnly
        ? null
        : el(
            'div',
            { class: 'toc-tabs', role: 'tablist' },
            tab(`Chapter (${fmtNum(novel.toc.length)})`, chPane, bmPane),
            tab(`Bookmark (${fmtNum(bms.length)})`, bmPane, chPane),
          ),
      chPane,
      opts.pickOnly ? null : bmPane,
    ].filter(Boolean),
    locate,
  };
}

/**
 * TL note ("TL note Chapter N" sampai akhir chapter) ditandai dengan kelas supaya tampil sebagai kotak catatan.
 * Tiap paragraf tetap satu elemen <p>, jadi nomor paragraf untuk posisi baca & bookmark tidak berubah.
 */
function markTlNote(ps) {
  const at = ps.findIndex((p) => isTlHead(p.textContent));
  if (at < 0) return ps;
  ps[at].classList.add('tl-head');
  for (const p of ps.slice(at + 1)) {
    p.classList.add('tl-note');
    if (p.textContent.startsWith('- ')) p.classList.add('tl-item'); // beberapa catatan: tampil menjorok seperti daftar
  }
  ps[ps.length - 1].classList.add('tl-last');
  if (at > 0 && ps[at - 1].classList.contains('sep')) ps[at - 1].classList.add('tl-sep');
  return ps;
}

/** Popup TL note chapter sebelumnya (dari kotak pengingat). Catatan berawalan "- " tampil seperti daftar. */
function showTlNotes(prev, notes) {
  dialog({
    title: `TL note · Chapter ${prev.num}`,
    className: 'tl-pop',
    body: el(
      'div',
      { class: 'tl-pop-body' },
      prev.title ? el('p', { class: 'muted small' }, chapterLabel(prev.num, prev.title)) : null,
      notes.map((p) => (p.startsWith('- ') ? el('p', { class: 'tl-item' }, p.slice(2)) : el('p', null, p))),
    ),
  });
}

async function showReader(id, wantNum, wantPara = 0) {
  const novel = await db.getNovel(id);
  if (!novel) {
    toast('Novel tidak ditemukan.');
    location.hash = '#/';
    return;
  }
  if (!novel.toc.length) {
    toast('Novel ini belum punya chapter.');
    location.hash = '#/';
    return;
  }

  let num = wantNum;
  let para = wantNum == null ? 0 : wantPara;
  if (num == null && novel.lastRead) ({ num, para } = novel.lastRead);
  let idx = num == null ? 0 : novel.toc.findIndex((t) => t.num === num);
  if (idx < 0) {
    // Chapter sudah dihapus: pakai chapter terdekat sesudahnya.
    idx = novel.toc.findIndex((t) => t.num > num);
    if (idx < 0) idx = novel.toc.length - 1;
    para = 0;
  }

  // Panel baca: tersembunyi saat membaca, muncul dari bawah saat teks diketuk.
  // Isinya judul & progres, baris tombol (bisa diatur di Pengaturan), dan pengaturan huruf.
  const closing = (fn) => () => {
    showPanel(false);
    fn();
  };
  const actions = {
    lock: () => setTouchLock(true),
    bookmark: closing(() => openBookmarks()),
    search: closing(() => openSearch()),
    toc: closing(() => openToc()),
    brightness: closing(openBrightness),
    settings: closing(openSettings),
  };
  const prevBtn = iconBtn('back', 'Chapter sebelumnya', () => go(idx - 1));
  const nextBtn = iconBtn('chevron', 'Chapter berikutnya', () => go(idx + 1));
  const btnRow = el('div', { class: 'rp-actions' });
  const rebuildBar = () =>
    btnRow.replaceChildren(
      prevBtn,
      iconBtn('home', 'Kembali ke perpustakaan', () => (location.hash = '#/')),
      ...settings.barOrder
        .filter((k) => !settings.barHidden.includes(k))
        .map((k) => iconBtn(BAR_ITEMS[k].icon, BAR_ITEMS[k].label, actions[k])),
      iconBtn('more', 'Menu lainnya', closing(() => openMore())),
      nextBtn,
    );
  rebuildBar();

  // Nama chapter membuka daftar isi (daftar pilihan bawaan HP terlalu besar & tidak bisa diatur tampilannya).
  const chBtn = el('button', { type: 'button', 'aria-label': 'Pilih chapter dari daftar isi', onclick: closing(() => openToc()) });
  const progressText = el('span', { class: 'rp-pct' });
  const progressFill = el('i');
  const typeSlot = el('div', { class: 'rp-type' });
  const panel = el(
    'section',
    { class: 'rp-panel', 'aria-label': 'Menu baca' },
    el(
      'div',
      { class: 'rp-head' },
      el('div', { class: 'rp-novel' }, novel.title),
      progressText,
      iconBtn('close', 'Tutup menu', () => showPanel(false)),
      el('div', { class: 'rp-ch' }, chBtn),
      el('div', { class: 'rp-progress' }, progressFill),
    ),
    btnRow,
    typeSlot,
  );
  const backdrop = el('div', { class: 'rp-backdrop', onclick: () => showPanel(false) });

  function refreshHead() {
    const t = novel.toc[idx];
    chBtn.textContent = chapterLabel(t.num, t.title);
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === novel.toc.length - 1;
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = Math.round((max > 0 ? Math.min(1, window.scrollY / max) : 1) * 100);
    progressText.textContent = `${idx + 1}/${novel.toc.length} · ${pct}%`;
    progressFill.style.width = `${pct}%`;
  }

  let controls = false;
  function showPanel(on) {
    controls = on;
    document.documentElement.classList.toggle('panel-open', on);
    if (on) {
      refreshHead();
      typeSlot.replaceChildren(...typeControls()); // dibuat ulang supaya sesuai setelan terbaru
    }
  }

  const main = el('main', {
    class: 'page reader',
    onclick: (e) => {
      if (touchLocked || e.target.closest('button, a, summary, input, select, textarea, label, .hold, .rc-ctl')) return;
      if (String(getSelection?.() || '').trim()) return; // sedang memilih teks
      showPanel(!controls);
    },
  });
  const unlock = holdButton('Tahan untuk membuka kunci', 900, () => setTouchLock(false), 'unlock');
  const lockLayer = el('div', { class: 'lock-layer' }, unlock);
  let article = null;
  let recapSlot = null;
  let navSlot = null;
  let topSlot = null;
  let current = null; // { entry, chapter }
  let token = 0;

  setView([main, backdrop, panel, lockLayer], () => {
    saveNow();
    showPanel(false);
    setTouchLock(false);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', saveNow);
    scheduleSync(1500);
  });

  if (!settings.tapHint) {
    toast('Ketuk teks untuk membuka menu baca.');
    settings.tapHint = true;
    saveSettings();
  }

  // ----- Kunci sentuhan: sembunyikan kontrol, abaikan tap, hanya bisa scroll -----
  let touchLocked = false;
  function setTouchLock(on) {
    touchLocked = on;
    document.documentElement.classList.toggle('touch-locked', on);
    showPanel(false);
    if (on) toast('Layar terkunci. Hanya bisa scroll. Tahan tombol gembok untuk membuka.');
  }

  // Posisi = indeks paragraf pertama yang terlihat di layar (lebih tahan perubahan ukuran huruf daripada scrollY).
  const topOffset = () => 8;
  // Setelah lompat ke paragraf tertentu (hasil cari/bookmark/posisi terakhir), paragraf itu yang dianggap
  // posisi sekarang sampai pengguna menggulir sendiri. Kalau tidak, paragraf di akhir chapter (yang tidak bisa
  // digulir sampai ke atas layar) tersimpan sebagai beberapa paragraf sebelumnya.
  let pinned = null;
  function anchor() {
    if (pinned && Math.abs(window.scrollY - pinned.y) < 40) return pinned.para;
    pinned = null;
    const ps = article?.children;
    if (!ps?.length) return 0;
    const top = topOffset();
    let lo = 0;
    let hi = ps.length - 1;
    let ans = ps.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ps[mid].getBoundingClientRect().bottom > top) {
        ans = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return ans;
  }
  function restore(p) {
    const target = article?.children[p];
    window.scrollTo(0, !p || !target ? 0 : target.getBoundingClientRect().top + window.scrollY - topOffset());
    if (pinned && pinned.para === p) pinned.y = window.scrollY;
    lastY = window.scrollY; // gulir oleh aplikasi, bukan pengguna: jangan tutup panel
  }

  let saveTimer = 0;
  let lastSaved = '';
  function saveNow() {
    clearTimeout(saveTimer);
    if (!current) return;
    const lr = { num: current.entry.num, para: anchor(), at: Date.now() };
    const key = `${lr.num}:${lr.para}`;
    // Hanya simpan bila posisinya benar-benar berubah. Kalau tidak, membuka novel saja sudah
    // memperbarui waktu posisi dan bisa menimpa posisi yang lebih jauh dari perangkat lain.
    if (key === lastSaved) return;
    lastSaved = key;
    novel.lastRead = lr;
    db.setLastRead(novel.id, lr).catch((e) => console.error(e));
  }
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  };

  let lastY = window.scrollY;
  function onScroll() {
    const y = window.scrollY;
    // Panel hanya muncul lewat ketukan; menggulir menutupnya lagi.
    if (controls && Math.abs(y - lastY) > 8) showPanel(false);
    lastY = y;
    scheduleSave();
  }
  function onKey(e) {
    if (touchLocked) return;
    if (controls && e.key === 'Escape' && !document.querySelector('dialog[open]')) return showPanel(false);
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey)
      return;
    if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
  }
  function onVis() {
    if (document.visibilityState === 'hidden') {
      saveNow();
      runSync({ quiet: true });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', saveNow);

  async function buildRecap() {
    const prevEntry = novel.toc[idx - 1];
    if (!prevEntry || settings.recapCount <= 0) return null;
    const prev = await db.getChapter(novel.id, prevEntry.num);
    // Yang diingatkan adalah akhir cerita: TL note dan baris pemisah di akhir chapter dilewati.
    let story = prev?.paragraphs || [];
    const tl = story.findIndex(isTlHead);
    if (tl >= 0) story = story.slice(0, tl);
    while (story.length && isSeparator(story[story.length - 1])) story = story.slice(0, -1);
    if (!story.length) return null;
    // TL note chapter sebelumnya tidak ikut ditampilkan, tapi bisa dibuka sebagai popup.
    const notes = tl >= 0 ? prev.paragraphs.slice(tl + 1).filter((p) => p.trim() && !isSeparator(p)) : [];
    const label = chapterLabel(prev.num, prev.title);

    const summary = el('summary');
    const body = el('div', { class: 'rc-body' });
    const show = () => {
      const tail = story.slice(-settings.recapCount);
      summary.textContent = `Akhir ${label} · ${tail.length} paragraf terakhir${notes.length ? ' · ada TL note' : ''}`;
      const ps = tail.map((p) => el('p', null, p));
      if (tail.length < story.length) ps.unshift(el('p', { class: 'gap' }, '…'));
      body.replaceChildren(...ps);
    };
    // Jumlah paragraf bisa diatur langsung di sini (1–10; mematikan pengingat tetap lewat Pengaturan).
    const count = dotSlider({
      label: 'Paragraf terakhir',
      min: 1,
      max: RECAP_MAX,
      value: settings.recapCount,
      labels: Array.from({ length: RECAP_MAX }, (_, i) => i + 1),
      unit: 'paragraf',
      onInput: (v) => {
        settings.recapCount = v;
        saveSettings();
        show();
      },
    });

    const d = el('details', { class: 'recap', open: settings.recapOpen });
    // Tutup dari bawah: chapter yang sedang dibaca tetap di posisi layarnya, jadi tidak perlu gulir ke atas.
    const closeBtn = el(
      'button',
      {
        type: 'button',
        class: 'rc-btn',
        onclick: () => {
          const ref = d.parentElement?.nextElementSibling;
          const before = ref?.getBoundingClientRect().top;
          // Penyesuaian gulir dilakukan sendiri; scroll anchoring browser dimatikan sebentar supaya tidak dobel.
          const root = document.documentElement;
          root.style.overflowAnchor = 'none';
          d.open = false;
          if (ref) window.scrollBy(0, ref.getBoundingClientRect().top - before);
          lastY = window.scrollY;
          requestAnimationFrame(() => requestAnimationFrame(() => (root.style.overflowAnchor = '')));
        },
      },
      'Tutup',
      el('span', { class: 'rc-up', 'aria-hidden': 'true' }),
    );
    // Tombol TL note hanya ada kalau chapter sebelumnya punya TL note.
    const noteBtn = notes.length
      ? el(
          'button',
          {
            type: 'button',
            class: 'rc-btn rc-tl',
            'aria-label': `TL note Chapter ${prev.num} (${notes.length} catatan)`,
            onclick: () => showTlNotes(prev, notes),
          },
          icon('note'),
          'TL note',
          el('span', { class: 'rc-badge' }, String(notes.length)),
        )
      : null;
    d.append(summary, el('div', { class: 'rc-ctl rc-count' }, count), body, el('div', { class: 'rc-foot rc-ctl' }, closeBtn, noteBtn));
    show();
    d.addEventListener('toggle', () => {
      settings.recapOpen = d.open;
      saveSettings();
    });
    return d;
  }

  async function refreshRecap() {
    if (!recapSlot) return;
    const r = await buildRecap();
    recapSlot.replaceChildren(...(r ? [r] : []));
  }

  // Bar pindah chapter di awal dan akhir chapter: ‹ [pilih chapter] ›
  function jumpBar() {
    const t = novel.toc[idx];
    return el(
      'nav',
      { class: 'ch-jump' },
      el('button', { type: 'button', class: 'ch-step', 'aria-label': 'Chapter sebelumnya', disabled: idx === 0, onclick: () => go(idx - 1) }, icon('back')),
      el(
        'div',
        { class: 'ch-pick' },
        el('button', { type: 'button', 'aria-label': 'Pilih chapter dari daftar isi', onclick: () => openToc() }, chapterLabel(t.num, t.title)),
      ),
      el(
        'button',
        { type: 'button', class: 'ch-step', 'aria-label': 'Chapter berikutnya', disabled: idx === novel.toc.length - 1, onclick: () => go(idx + 1) },
        icon('chevron'),
      ),
    );
  }

  function buildNav() {
    const nextE = novel.toc[idx + 1];
    return [
      jumpBar(),
      // Saat kunci sentuhan aktif, tombol di atas disembunyikan; pindah chapter harus ditahan.
      nextE ? holdButton(`Tahan untuk lanjut ke Chapter ${nextE.num}`, 700, () => go(idx + 1), 'locked-next') : null,
      nextE ? null : el('p', { class: 'ch-end' }, 'Ini chapter terakhir yang tersimpan.'),
    ].filter(Boolean);
  }

  // Penanda bookmark di paragraf chapter yang sedang dibuka.
  function markBookmarks() {
    if (!article || !current) return;
    const marked = new Set(
      Object.values(novel.bookmarks || {})
        .filter((b) => b.num === current.entry.num)
        .map((b) => b.para),
    );
    [...article.children].forEach((p, i) => p.classList.toggle('bm', marked.has(i)));
  }

  async function render(startPara, highlight) {
    const my = ++token;
    const entry = novel.toc[idx];
    const chapter = await db.getChapter(novel.id, entry.num);
    const recap = await buildRecap();
    if (my !== token) return;
    current = { entry, chapter };

    document.title = `${chapterLabel(entry.num, entry.title)} · ${novel.title}`;

    recapSlot = el('div', null, recap);
    article = el(
      'article',
      null,
      markTlNote((chapter?.paragraphs || []).map((p) => el('p', isSeparator(p) ? { class: 'sep' } : null, p))),
    );
    topSlot = el('div', null, jumpBar());
    navSlot = el('div', { class: 'ch-bottom' }, buildNav());
    main.replaceChildren(
      ...[
        topSlot,
        recapSlot,
        entry.title
          ? el('h1', { class: 'ch-title' }, el('small', null, `Chapter ${entry.num}`), entry.title)
          : el('h1', { class: 'ch-title' }, `Chapter ${entry.num}`),
        article,
        chapter?.paragraphs.length ? null : el('p', { class: 'muted' }, '(Chapter ini kosong.)'),
        navSlot,
      ].filter(Boolean),
    );
    history.replaceState(null, '', `#/read/${encodeURIComponent(novel.id)}/${entry.num}`);
    if (controls) refreshHead();
    markBookmarks();
    const target = article.children[startPara];
    if (highlight && target) {
      target.replaceChildren(...highlightText(target.textContent, highlight));
      target.classList.add('flash');
    }
    restore(startPara);
    pinned = startPara ? { para: startPara, y: window.scrollY } : null;
    lastY = window.scrollY;
    // Posisi awal = posisi tersimpan? Jangan dianggap perubahan.
    const lr = novel.lastRead;
    lastSaved = lr && lr.num === entry.num ? `${lr.num}:${lr.para}` : '';
    saveNow();
  }

  function go(i, para = 0, highlight) {
    if (i < 0 || i >= novel.toc.length) return;
    if (i === idx && !para && !highlight) return;
    saveNow();
    idx = i;
    render(para, highlight);
  }
  const goNum = (num, para, highlight) => {
    const i = novel.toc.findIndex((t) => t.num === num);
    if (i < 0) return toast(`Chapter ${num} sudah tidak ada.`);
    go(i, para, highlight);
  };

  // ----- Bookmark -----
  function openBookmarks() {
    let d;
    const para = anchor();
    const text = article?.children[para]?.textContent || '';
    const note = el('input', { type: 'text', placeholder: 'Catatan (opsional)' });
    const list = el('div', { class: 'bm-list' });
    const renderList = () => {
      const all = Object.entries(novel.bookmarks || {}).sort(([, a], [, b]) => a.num - b.num || a.para - b.para);
      list.replaceChildren(
        ...(all.length
          ? all.map(([id, b]) =>
              el(
                'div',
                { class: 'bm-item' },
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'bm-go',
                    onclick: () => {
                      d.close();
                      goNum(b.num, b.para);
                    },
                  },
                  el('b', null, `Chapter ${b.num}`, el('span', { class: 'muted' }, ` · paragraf ${b.para + 1}`)),
                  b.note ? el('span', { class: 'bm-note' }, b.note) : null,
                  b.text ? el('span', { class: 'bm-text' }, b.text) : null,
                  el('span', { class: 'small muted' }, fmtTime(b.at)),
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'aria-label': `Hapus bookmark Chapter ${b.num}`,
                    onclick: async () => {
                      await db.removeBookmark(novel.id, id);
                      Object.assign(novel, await db.getNovel(novel.id));
                      changed();
                      markBookmarks();
                      renderList();
                    },
                  },
                  icon('close'),
                ),
              ),
            )
          : [el('p', { class: 'muted small' }, 'Belum ada bookmark di novel ini.')]),
      );
    };
    renderList();
    dialog({
      title: 'Bookmark',
      className: 'drawer',
      body: [
        el(
          'div',
          { class: 'bm-add' },
          el('div', { class: 'small muted' }, `Posisi sekarang: Chapter ${current.entry.num}, paragraf ${para + 1}`),
          text ? el('div', { class: 'bm-text' }, text) : null,
          note,
          el(
            'button',
            {
              type: 'button',
              class: 'btn primary',
              onclick: async () => {
                await db.saveBookmark(novel.id, { num: current.entry.num, para, note: note.value.trim(), text: text.slice(0, 140) });
                Object.assign(novel, await db.getNovel(novel.id));
                note.value = '';
                changed();
                markBookmarks();
                renderList();
                toast('Bookmark ditambahkan.');
              },
            },
            icon('bookmark'),
            'Tandai posisi ini',
          ),
        ),
        el('div', { class: 'section-label' }, 'Semua bookmark'),
        list,
      ],
      onOpen: (x) => (d = x),
    });
  }

  // ----- Pencarian teks -----
  function openSearch() {
    let d;
    let timer = 0;
    let seq = 0;
    const input = el('input', { type: 'search', placeholder: 'Ketik minimal 2 huruf…', 'aria-label': 'Cari teks', value: lastSearch });
    let scope = 'all';
    const scopeSeg = el(
      'div',
      { class: 'seg' },
      [
        ['all', 'Semua chapter'],
        ['here', 'Chapter ini'],
      ].map(([k, label]) =>
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String(scope === k),
            onclick: (e) => {
              scope = k;
              e.currentTarget.parentNode
                .querySelectorAll('button')
                .forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
              run();
            },
          },
          label,
        ),
      ),
    );
    const info = el('p', { class: 'small muted' });
    const results = el('div', { class: 'search-results' });
    const run = async () => {
      const q = input.value.trim();
      lastSearch = q;
      const my = ++seq;
      if (q.length < 2) {
        info.textContent = '';
        results.replaceChildren();
        return;
      }
      info.textContent = 'Mencari…';
      const here = current.entry.num;
      const { results: found, more } = await db.searchChapters(novel.id, q, scope === 'here' ? { from: here, to: here } : {});
      if (my !== seq) return;
      info.textContent = found.length
        ? `${fmtNum(found.length)}${more ? '+' : ''} hasil${more ? ' (perjelas kata kuncinya untuk melihat sisanya)' : ''}`
        : 'Tidak ditemukan.';
      let lastNum = null;
      const nodes = [];
      for (const r of found) {
        if (r.num !== lastNum) {
          nodes.push(el('div', { class: 'sr-head' }, chapterLabel(r.num, r.title)));
          lastNum = r.num;
        }
        nodes.push(
          el(
            'button',
            {
              type: 'button',
              class: 'sr-item',
              onclick: () => {
                d.close();
                goNum(r.num, r.para, q);
              },
            },
            highlightText(snippetAround(r.text, q), q),
          ),
        );
      }
      results.replaceChildren(...nodes);
    };
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    };
    dialog({
      title: 'Cari teks',
      className: 'drawer',
      body: [el('div', { class: 'toc-filter' }, input, scopeSeg, info), results],
      onOpen: (x) => {
        d = x;
        input.focus();
        if (input.value) run();
      },
    });
  }

  const openToc = () => openTocDialog(novel, idx, (i) => go(i), (num, para) => goNum(num, para));

  // Menu "lainnya". Edit sengaja ditaruh di sini (bukan di bar) dan dipisah dari tombol biasa,
  // supaya tidak terpencet tanpa sengaja.
  function openMore() {
    let d;
    const locked = settings.changeLock;
    dialog({
      title: chapterLabel(current.entry.num, current.entry.title),
      body: el(
        'div',
        { class: 'menu-list' },
        settings.barOrder.map((k) =>
          el(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                d.close();
                actions[k]();
              },
            },
            icon(BAR_ITEMS[k].icon),
            k === 'lock' ? 'Kunci sentuhan (hanya scroll)' : BAR_ITEMS[k].label,
          ),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => {
              d.close();
              openNovelInfo(novel);
            },
          },
          icon('info'),
          'Info novel',
        ),
        el('div', { class: 'section-label danger-zone' }, 'Ubah isi'),
        el(
          'button',
          {
            type: 'button',
            class: 'btn danger',
            disabled: locked,
            onclick: () => {
              d.close();
              openEditor();
            },
          },
          'Edit teks chapter ini…',
        ),
        locked ? el('p', { class: 'small muted' }, 'Perubahan sedang dikunci. Buka kunci di Pengaturan untuk mengedit.') : null,
      ),
      onOpen: (x) => (d = x),
    });
  }

  async function openEditor() {
    if (settings.changeLock) return toast('Perubahan sedang dikunci.');
    const entry = current.entry;
    const chapter = (await db.getChapter(novel.id, entry.num)) || { title: entry.title, paragraphs: [] };
    const original = chapter.paragraphs.join('\n\n');
    const titleIn = el('input', { type: 'text', value: chapter.title || '', placeholder: '(tanpa judul)' });
    const area = el('textarea', { class: 'editor', spellcheck: 'false', value: original });
    const info = el('p', { class: 'small muted' });
    const count = () =>
      (info.textContent = `${fmtNum(splitLines(area.value).length)} paragraf · tiap baris yang tidak kosong = satu paragraf`);
    area.oninput = count;
    count();
    const dirty = () => area.value !== original || titleIn.value.trim() !== (chapter.title || '');
    const startPara = anchor();

    const v = await dialog({
      title: `Edit Chapter ${entry.num}`,
      className: 'editor-dlg',
      body: [el('label', { class: 'field' }, el('span', null, 'Judul chapter'), titleIn), tlNoteTool(area, () => entry.num, '\n\n'), area, info],
      actions: [
        {
          label: 'Batal',
          value: null,
          run: async () =>
            !dirty() || (await confirmDialog('Buang perubahan?', 'Perubahan yang belum disimpan akan hilang.', 'Buang', true)),
        },
        { label: 'Simpan', value: 'save', primary: true },
      ],
      onOpen: (d) => {
        // Mulai di sekitar paragraf yang sedang dibaca.
        const offset = chapter.paragraphs.slice(0, startPara).reduce((s, p) => s + p.length + 2, 0);
        area.setSelectionRange(offset, offset);
        area.scrollTop = (offset / Math.max(1, area.value.length)) * area.scrollHeight - 40;
        // Tutup lewat Esc / klik di luar juga minta konfirmasi bila ada perubahan.
        d.addEventListener('cancel', async (e) => {
          if (!dirty()) return;
          e.preventDefault();
          if (await confirmDialog('Buang perubahan?', 'Perubahan yang belum disimpan akan hilang.', 'Buang', true)) d.close();
        });
      },
    });
    if (v !== 'save' || !dirty()) return;
    const lines = splitLines(area.value);
    const paragraphs = autoTlNote(lines, entry.num) || lines;
    await db.saveChapters(novel.id, [{ num: entry.num, title: titleIn.value.trim(), paragraphs }]);
    Object.assign(novel, await db.getNovel(novel.id));
    toast('Chapter disimpan.');
    changed();
    await render(Math.min(startPara, Math.max(0, paragraphs.length - 1)));
  }

  // Dipanggil setelah sinkron membawa data baru dari perangkat lain.
  async function onSynced() {
    const fresh = await db.getNovel(novel.id);
    if (!fresh || !current) return;
    const mine = novel.lastRead;
    Object.assign(novel, { title: fresh.title, toc: fresh.toc, bookmarks: fresh.bookmarks });
    markBookmarks();
    const at = novel.toc.findIndex((t) => t.num === current.entry.num);
    if (at >= 0) idx = at;
    navSlot?.replaceChildren(...buildNav());
    topSlot?.replaceChildren(jumpBar());
    const lr = fresh.lastRead;
    if (lr && (!mine || lr.at > mine.at) && (lr.num !== current.entry.num || Math.abs(lr.para - anchor()) > 2)) {
      novel.lastRead = lr;
      toast(`Perangkat lain terakhir membaca Chapter ${lr.num}.`, {
        label: 'Lompat',
        run: () => {
          const i = novel.toc.findIndex((t) => t.num === lr.num);
          if (i < 0) return;
          idx = i;
          render(lr.para);
        },
      });
    }
  }

  readerHooks = { anchor: () => anchor(), restore, refreshRecap, onSynced, rebuildBar };
  await render(para);
}

function onLockChange() {
  // Perbarui tampilan perpustakaan supaya tanda gembok & menu ikut berubah.
  if (!readerHooks) route();
}

// ---------- Sinkronisasi ----------

const syncState = { running: null, again: false, last: null, error: null, timer: 0 };
const SYNC_LAST_KEY = 'baca-novel:sync-last';
try {
  syncState.last = Number(localStorage.getItem(SYNC_LAST_KEY)) || null;
} catch {}

const fmtTime = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function syncButton() {
  const cfg = sync.loadConfig();
  const b = iconBtn('sync', 'Sinkronisasi', openSync);
  b.classList.add('sync-btn');
  if (!cfg) b.classList.add('off');
  if (syncState.running) b.classList.add('spin');
  if (syncState.error) b.classList.add('err');
  return b;
}

function syncLine() {
  const cfg = sync.loadConfig();
  if (!cfg) return null;
  const text = syncState.running
    ? 'Menyinkronkan…'
    : syncState.error
      ? `Sinkron gagal: ${syncState.error}`
      : syncState.last
        ? `Sinkron terakhir ${fmtTime(syncState.last)}`
        : 'Belum pernah sinkron';
  const ok = !syncState.running && !syncState.error && syncState.last;
  return el('p', { class: `sync-line${syncState.error ? ' err' : ok ? ' ok' : ''}` }, text);
}

function refreshSyncUi() {
  document.querySelectorAll('.sync-btn').forEach((b) => b.replaceWith(syncButton()));
  // Rak kosong: kartu/tombol sinkron ikut berubah (mengambil… → gagal/aktif).
  document.querySelectorAll('.e-pill').forEach((b) => b.replaceWith(emptySync()));
  const line = document.querySelector('.sync-line');
  const next = syncLine();
  if (line && next) line.replaceWith(next);
}

/** Dipanggil setiap ada perubahan data lokal. */
function changed() {
  scheduleSync(3000);
}

function scheduleSync(delay) {
  if (!sync.loadConfig()?.auto) return;
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(() => runSync({ quiet: true }), delay);
}

async function runSync({ quiet = false } = {}) {
  const cfg = sync.loadConfig();
  if (!cfg) return;
  if (syncState.running) {
    syncState.again = true;
    return syncState.running;
  }
  if (!navigator.onLine) {
    if (!quiet) toast('Sedang offline. Sinkron akan dicoba lagi saat online.');
    return;
  }
  syncState.running = (async () => {
    refreshSyncUi();
    try {
      const r = await sync.syncNow(cfg);
      syncState.error = null;
      syncState.last = Date.now();
      try {
        localStorage.setItem(SYNC_LAST_KEY, String(syncState.last));
      } catch {}
      const changedLocally = r.down || r.newNovels || r.removed;
      if (changedLocally) {
        const parts = [];
        if (r.newNovels) parts.push(`${fmtNum(r.newNovels)} novel baru`);
        if (r.down) parts.push(`${fmtNum(r.down)} chapter diperbarui`);
        if (r.removed) parts.push(`${fmtNum(r.removed)} novel dihapus`);
        toast(`Sinkron: ${parts.join(', ')}.`);
      } else if (!quiet) toast(r.committed ? 'Sinkron selesai, perubahan terkirim.' : 'Sinkron selesai, semua sudah sama.');
      if (readerHooks?.onSynced) await readerHooks.onSynced();
      else if (!document.querySelector('dialog[open]') && !location.hash.startsWith('#/read')) await route();
      return r;
    } catch (e) {
      console.error(e);
      syncState.error = e.message || String(e);
      if (!quiet || e.status === 401) toast(`Sinkron gagal: ${syncState.error}`);
    } finally {
      syncState.running = null;
      refreshSyncUi();
      if (syncState.again) {
        syncState.again = false;
        scheduleSync(500);
      }
    }
  })();
  return syncState.running;
}

function openSync() {
  const cfg = sync.loadConfig();
  if (!cfg) return openSyncSetup();
  const auto = el('input', { type: 'checkbox', checked: cfg.auto !== false });
  auto.onchange = () => sync.saveConfig({ ...cfg, auto: auto.checked });
  const status = el(
    'p',
    { class: syncState.error ? 'error' : 'small muted' },
    syncState.error
      ? `Terakhir gagal: ${syncState.error}`
      : syncState.last
        ? `Sinkron terakhir: ${fmtTime(syncState.last)}`
        : 'Belum pernah sinkron.',
  );
  dialog({
    title: 'Sinkronisasi',
    body: [
      el('p', null, 'Terhubung ke repo privat ', el('b', null, cfg.repo), '.'),
      status,
      el('label', { class: 'check' }, auto, 'Sinkron otomatis (saat aplikasi dibuka, setelah ada perubahan, dan saat ditinggalkan)'),
      el(
        'p',
        { class: 'small muted' },
        'Yang disinkron: novel, chapter, hasil edit, hapusan, dan posisi baca. Pengaturan tampilan & kunci tidak ikut, supaya tiap perangkat bisa beda.',
      ),
    ],
    actions: [
      {
        label: 'Putuskan',
        danger: true,
        run: async () => {
          const ok = await confirmDialog(
            'Putuskan sinkron di perangkat ini?',
            'Token dihapus dari perangkat ini. Novel di perangkat ini dan di repo tetap ada.',
            'Putuskan',
            true,
          );
          if (!ok) return false;
          sync.clearConfig();
          syncState.error = null;
          route();
        },
      },
      { spacer: true },
      { label: 'Tutup', value: null },
      { label: 'Sinkron sekarang', primary: true, run: () => void runSync() },
    ],
  });
}

function openSyncSetup() {
  const repoIn = el('input', {
    type: 'text',
    value: sync.DEFAULT_REPO_NAME,
    placeholder: sync.DEFAULT_REPO_NAME,
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const tokenIn = el('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const err = el('p', { class: 'error hidden' });
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  dialog({
    title: 'Nyalakan sinkronisasi',
    className: 'wide',
    body: [
      el(
        'p',
        null,
        'Novel dan posisi baca disimpan di repo GitHub ',
        el('b', null, 'privat'),
        ' milik Anda sendiri, jadi bisa dipakai bersama di HP, iPad, dan laptop. Persiapan cukup sekali:',
      ),
      el(
        'ol',
        { class: 'steps' },
        el(
          'li',
          null,
          link('https://github.com/new', 'Buat repo baru'),
          ', misalnya ',
          el('code', null, 'baca-novel-data'),
          '. Pilih ',
          el('b', null, 'Private'),
          '. Repo ini khusus data, terpisah dari repo kode aplikasi.',
        ),
        el(
          'li',
          null,
          link(
            `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent(`LumenRead ${sync.deviceName()}`)}&description=${encodeURIComponent('Sinkron aplikasi LumenRead')}&contents=write`,
            'Buat token (fine-grained)',
          ),
          ': beri nama bebas (misalnya "LumenRead iPad"), pilih masa berlaku, lalu di ',
          el('i', null, 'Repository access'),
          ' pilih ',
          el('b', null, 'Only select repositories'),
          ' → repo data tadi. Di ',
          el('i', null, 'Permissions → Repository permissions'),
          ' ubah ',
          el('b', null, 'Contents'),
          ' menjadi ',
          el('b', null, 'Read and write'),
          '. Klik ',
          el('i', null, 'Generate token'),
          ' lalu salin. Token hanya ditampilkan sekali.',
        ),
        el(
          'li',
          null,
          'Tempel di kolom di bawah, lalu ketuk Hubungkan. Untuk perangkat lain, paling gampang buat token baru langsung di perangkat itu (langkah 2 saja; repo-nya pakai yang sama).',
        ),
      ),
      el(
        'div',
        { class: 'row-2' },
        el('label', { class: 'field' }, el('span', null, 'Nama repo data (cukup namanya)'), repoIn),
        el('label', { class: 'field' }, el('span', null, 'Token'), tokenIn),
      ),
      err,
      el(
        'p',
        { class: 'small muted' },
        'Token disimpan di browser perangkat ini dan hanya dikirim ke GitHub. Karena tokennya cuma bisa mengakses repo data itu, kalau bocor pun repo lain aman. ',
        'Impor novel di satu perangkat saja lalu biarkan sinkron membawanya ke perangkat lain; kalau novel yang sama diimpor terpisah di dua perangkat, hasilnya jadi dua novel.',
      ),
    ],
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Hubungkan',
        primary: true,
        run: async () => {
          const show = (m) => {
            err.textContent = m;
            err.classList.toggle('hidden', !m);
            return false;
          };
          const token = tokenIn.value.trim();
          if (!token) return show('Token masih kosong.');
          let repo;
          try {
            repo = await busy('Memeriksa repo…', () => sync.resolveRepo(repoIn.value, token));
          } catch (e) {
            return show(e.message);
          }
          sync.saveConfig({ repo, token, auto: true });
          syncState.error = null;
          route();
          runSync();
        },
      },
    ],
    onOpen: () => repoIn.focus(),
  });
}

window.addEventListener('online', () => runSync({ quiet: true }));
// Saat kembali ke aplikasi: sinkron ditunda sebentar (supaya tidak bikin tersendat tepat saat mulai mengetik/menempel),
// dilewati bila baru saja sinkron atau ada dialog terbuka (mis. sedang impor); nanti dicoba lagi saat kembali berikutnya.
const RESUME_SYNC_DELAY = 4000;
const RESUME_SYNC_MIN_GAP = 2 * 60 * 1000;
let resumeTimer = 0;
document.addEventListener('visibilitychange', () => {
  clearTimeout(resumeTimer);
  if (document.visibilityState !== 'visible') return;
  resumeTimer = setTimeout(() => {
    if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
    if (syncState.last && Date.now() - syncState.last < RESUME_SYNC_MIN_GAP) return;
    runSync({ quiet: true });
  }, RESUME_SYNC_DELAY);
});

// ---------- Service worker ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW gagal didaftarkan', e));
}

// Layar pembuka (index.html): tampil minimal 2 detik sejak aplikasi dibuka, lalu memudar setelah tampilan pertama siap.
// Sudah tampil di sesi ini (tab dimuat ulang): langsung dilewati.
const SPLASH_MS = 2000;
if (document.documentElement.classList.contains('no-splash')) document.getElementById('splash')?.remove();
route().finally(() => {
  const sp = document.getElementById('splash');
  if (!sp) return;
  setTimeout(() => {
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 500);
  }, Math.max(0, SPLASH_MS - performance.now()));
});
runSync({ quiet: true });
