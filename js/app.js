import * as db from './db.js';
import { buildImport, decodeText, naturalCompare, baseName, chapterLabel, splitLines } from './parse.js';
import { readZip, writeZip } from './zip.js';
import { buildEpub } from './epub.js';
import * as sync from './sync.js';

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
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'more' ? '3' : '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
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

function promptDialog(title, label, initial = '') {
  const input = el('input', { type: 'text', value: initial });
  return dialog({
    title,
    body: el('label', { class: 'field' }, el('span', null, label), input),
    actions: [
      { label: 'Batal', value: null },
      { label: 'Simpan', primary: true, run: () => !!input.value.trim() || false },
    ],
    onOpen: () => input.select(),
  }).then((v) => (v === 'Simpan' ? input.value.trim() : null));
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
// Tema latar: cukup warna latar (bg) dan teks (fg); warna lain diturunkan otomatis.
const THEMES = {
  light: { label: 'Terang', bg: '#fbfaf7', fg: '#1f1f1c' },
  paper: { label: 'Kertas', bg: '#f1ece1', fg: '#2d2a25' },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#4a3a28', accent: '#8a5a2b' },
  mint: { label: 'Hijau', bg: '#e2ede3', fg: '#1e3325' },
  sky: { label: 'Biru muda', bg: '#e4ecf4', fg: '#1d2b3a', accent: '#2f5f8a' },
  gray: { label: 'Abu', bg: '#d6d6d2', fg: '#22221f' },
  claude: { label: 'Claude', bg: '#151515', fg: '#f9f9f7' },
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
  return { bg, fg, dark, accent: t.accent || (dark ? '#7fc4ae' : '#2f6f5e') };
}

const SETTINGS_KEY = 'baca-novel:settings';
// Bawaan tipografi meniru tampilan baca di aplikasi Claude (diukur dari tangkapan layar Android):
// tinggi huruf kecil ±9,5px, jarak antarbaris ±25,7px, tepi kiri-kanan ±20px, teks rata kiri.
const SETTINGS_VERSION = 2;
const DEFAULTS = {
  font: 'noto',
  size: 17,
  lh: 1.5,
  width: 680,
  justify: false,
  paraGap: 16,
  textLevel: 100,
  changeLock: false,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'claude' : 'light',
  customBg: '#e9e4f0',
  customFg: '',
  recapCount: 3,
  recapOpen: true,
  dim: 0,
  barOrder: ['lock', 'bookmark', 'search', 'toc', 'brightness', 'settings'],
  barHidden: ['search', 'brightness'],
  libSort: 'recent',
  libFilter: 'all',
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
} catch {}
const migrated = settings.v !== SETTINGS_VERSION;
settings.v = SETTINGS_VERSION;
delete settings.paraSpace;
if (!FONTS[settings.font]) settings.font = DEFAULTS.font;
if (!TEXT_LEVELS[settings.textLevel]) settings.textLevel = DEFAULTS.textLevel;
settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, settings.size));
if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;
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
  document.querySelector('meta[name="theme-color"]').content = c.bg;
  dimLayer.style.opacity = settings.dim;
  // Disimpan untuk skrip kecil di index.html yang mewarnai latar sebelum aplikasi dimuat.
  settings.paint = { bg: c.bg, dark: c.dark };
}
const dimLayer = document.createElement('div');
dimLayer.className = 'dim-layer';
document.body.append(dimLayer);
applySettings();
if (migrated) saveSettings();

// Dipasang oleh tampilan pembaca supaya posisi baca tetap saat ukuran teks berubah.
let readerHooks = null;

function openSettings() {
  const update = async (patch) => {
    const anchor = readerHooks?.anchor();
    Object.assign(settings, patch);
    applySettings();
    saveSettings();
    if ('recapCount' in patch) await readerHooks?.refreshRecap();
    if (anchor != null) readerHooks?.restore(anchor);
  };

  const picker = (label, entries, key) => {
    const sel = el(
      'select',
      { onchange: () => update({ [key]: typeof settings[key] === 'number' ? Number(sel.value) : sel.value }) },
      entries.map(([k, v]) => el('option', { value: k, selected: String(settings[key]) === k }, v.label)),
    );
    return el('label', null, label, sel);
  };

  const slider = (label, key, min, max, step, fmt) => {
    const out = el('output', null, fmt(settings[key]));
    const input = el('input', {
      type: 'range',
      min,
      max,
      step,
      value: settings[key],
      'aria-label': label,
      oninput: () => {
        update({ [key]: Number(input.value) });
        out.textContent = fmt(settings[key]);
      },
    });
    return el('label', { class: 'slider' }, el('span', null, label), input, out);
  };

  const check = (label, key) =>
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', checked: settings[key], onchange: (e) => update({ [key]: e.target.checked }) }),
      label,
    );

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
      el('div', { class: 'section-label' }, 'Tema latar'),
      swatches,
      customBox,
      el('div', { class: 'section-label' }, 'Kecerahan'),
      dimSlider(update),
      sizePicker(update),
      el(
        'div',
        { class: 'pick-row' },
        picker('Jenis huruf', Object.entries(FONTS), 'font'),
        picker('Kecerahan teks', Object.entries(TEXT_LEVELS).reverse(), 'textLevel'),
      ),
      slider('Jarak baris', 'lh', 1.2, 2.4, 0.05, (v) => v.toFixed(2)),
      slider('Jarak antarparagraf', 'paraGap', 0, 48, 1, (v) => `${v}px`),
      slider('Lebar teks', 'width', 360, 1200, 20, (v) => `${v}px`),
      check('Rata kiri-kanan', 'justify'),
      el('div', { class: 'section-label' }, 'Pengingat chapter sebelumnya'),
      slider('Jumlah paragraf terakhir yang ditampilkan (0 = mati)', 'recapCount', 0, 15, 1, (v) => String(v)),
      check('Tampilkan terbuka', 'recapOpen'),
      el('div', { class: 'section-label' }, 'Tombol di bar layar baca'),
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
            'Tema, huruf, ukuran, kecerahan teks, jarak baris & paragraf, lebar, kecerahan, pengingat, dan tombol bar kembali seperti awal. Novel, bookmark, posisi baca, kunci perubahan, dan sinkron tidak berubah.',
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
];

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

/** Atur tombol apa saja yang tampil di bar layar baca dan urutannya. */
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
  const [view, id, num] = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (view === 'read' && id) await showReader(decodeURIComponent(id), num != null && num !== '' ? Number(num) : null);
    else await showLibrary();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e));
  }
}
window.addEventListener('hashchange', route);

// ---------- Perpustakaan ----------

async function showLibrary() {
  document.title = 'Baca Novel';
  const novels = await db.listNovels();
  const bar = el(
    'header',
    { class: 'bar' },
    el(
      'h1',
      null,
      'Baca Novel',
      settings.changeLock ? el('span', { class: 'lock-badge', title: 'Perubahan dikunci' }, icon('lock')) : null,
    ),
    syncButton(),
    iconBtn('type', 'Pengaturan', openSettings),
    el('button', { type: 'button', class: 'btn primary', onclick: () => openImport() }, icon('plus'), 'Impor'),
  );

  const body = novels.length
    ? libraryList(novels)
    : el(
        'div',
        { class: 'empty' },
        el('h2', null, 'Belum ada novel'),
        el(
          'p',
          null,
          'Impor file .zip berisi .txt, file .txt, atau tempel teks. Tiap chapter diawali baris seperti ',
          el('code', null, 'Chapter 1: Judul'),
          '.',
        ),
        el('p', null, el('button', { type: 'button', class: 'btn primary', onclick: () => openImport() }, 'Impor novel')),
        el(
          'p',
          { class: 'small' },
          'Data tersimpan di browser perangkat ini. Agar sama di HP, iPad, dan laptop, nyalakan sinkronisasi (ikon panah melingkar di atas).',
        ),
      );

  const foot = el('p', { class: 'foot' });
  showStorageInfo(foot);
  setView([bar, el('main', { class: 'page library' }, body, syncLine(), foot)]);
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
function libraryList(novels) {
  const cards = el('div', { class: 'cards' });
  const search = el('input', { type: 'search', placeholder: 'Cari judul atau pengarang…', value: libQuery, 'aria-label': 'Cari novel' });
  const sort = el(
    'select',
    { 'aria-label': 'Urutkan' },
    Object.entries(SORTS).map(([k, v]) => el('option', { value: k, selected: settings.libSort === k }, v.label)),
  );
  const chips = el('div', { class: 'chips', role: 'tablist' });
  const counts = { all: novels.length };
  for (const n of novels) counts[statusOf(n)] = (counts[statusOf(n)] || 0) + 1;
  const renderChips = () =>
    chips.replaceChildren(
      ...Object.entries({ all: 'Semua', ...STATUSES }).map(([k, label]) =>
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(settings.libFilter === k),
            onclick: () => {
              settings.libFilter = k;
              saveSettings();
              renderChips();
              renderCards();
            },
          },
          `${label} ${counts[k] || 0}`,
        ),
      ),
    );
  const renderCards = () => {
    const q = fold(libQuery.trim());
    const shown = novels
      .filter((n) => settings.libFilter === 'all' || statusOf(n) === settings.libFilter)
      .filter((n) => !q || fold(`${n.title} ${n.author || ''}`).includes(q))
      .sort(SORTS[settings.libSort]?.fn || SORTS.recent.fn);
    cards.replaceChildren(...(shown.length ? shown.map(novelCard) : [el('p', { class: 'empty small' }, 'Tidak ada novel yang cocok.')]));
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
  return el('div', null, el('div', { class: 'lib-tools' }, search, sort), chips, cards);
}

function novelCard(n) {
  const total = n.toc.length;
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  const pct = total && idx >= 0 ? ((idx + 1) / total) * 100 : 0;
  const read = () => (location.hash = `#/read/${encodeURIComponent(n.id)}`);
  const meta = [`${fmtNum(total)} chapter`];
  if (total) meta.push(`Ch ${n.toc[0].num}–${n.toc[total - 1].num}`);
  if (idx >= 0) meta.push(`terakhir dibaca: Chapter ${n.lastRead.num}`);
  const st = statusOf(n);
  const marks = Object.keys(n.bookmarks || {}).length;
  return el(
    'section',
    { class: 'card' },
    el('h2', { onclick: total ? read : null }, n.title, n.author ? el('small', { class: 'author' }, n.author) : null),
    iconBtn('more', 'Menu novel', () => novelMenu(n)),
    el(
      'div',
      { class: 'meta' },
      el('span', { class: `badge st-${st}` }, STATUSES[st]),
      ' ',
      meta.join(' · '),
      marks ? ` · ${fmtNum(marks)} bookmark` : '',
    ),
    el('div', { class: 'progress', title: `${Math.round(pct)}%` }, el('div', { style: `width:${pct}%` })),
    el(
      'div',
      { class: 'actions' },
      total
        ? el('button', { type: 'button', class: 'btn primary', onclick: read }, idx >= 0 ? 'Lanjut baca' : 'Mulai baca')
        : el('span', { class: 'muted small' }, 'Belum ada chapter.'),
      el('button', { type: 'button', class: 'btn', onclick: () => openImport(n.id) }, 'Tambah chapter'),
    ),
  );
}

function novelMenu(n) {
  const has = n.toc.length > 0;
  const locked = settings.changeLock;
  const act = (label, fn, opts = {}) =>
    el(
      'button',
      {
        type: 'button',
        class: `btn${opts.danger ? ' danger' : ''}`,
        disabled: opts.disabled || (opts.change && locked),
        title: opts.change && locked ? 'Perubahan sedang dikunci' : null,
        onclick: () => {
          d.close();
          fn();
        },
      },
      label,
    );
  let d;
  const statusSeg = el(
    'div',
    { class: 'seg', role: 'radiogroup', 'aria-label': 'Status baca' },
    Object.entries(STATUSES).map(([k, label]) =>
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': String(statusOf(n) === k),
          onclick: async () => {
            await db.setStatus(n.id, k);
            changed();
            d.close();
            route();
          },
        },
        label,
      ),
    ),
  );
  const body = el(
    'div',
    { class: 'menu-list' },
    el('div', { class: 'section-label' }, 'Status baca'),
    statusSeg,
    el('div', { class: 'section-label' }, 'Aksi'),
    act('Impor / tambah chapter', () => openImport(n.id)),
    act('Compile ke EPUB', () => openEpub(n), { disabled: !has }),
    act('Ekspor sebagai .zip (txt)', () => exportTxt(n), { disabled: !has }),
    act(
      'Ganti judul',
      async () => {
        const t = await promptDialog('Ganti judul', 'Judul novel', n.title);
        if (t && t !== n.title) {
          await db.updateMeta(n.id, { title: t });
          changed();
          route();
        }
      },
      { change: true },
    ),
    act('Hapus rentang chapter', () => openDeleteRange(n), { disabled: !has, danger: true, change: true }),
    act(
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
    locked ? el('p', { class: 'small muted' }, 'Perubahan sedang dikunci. Buka kunci di Pengaturan.') : null,
  );
  dialog({ title: n.title, body, onOpen: (x) => (d = x) });
}

function rangeSelects(toc, onChange) {
  const opts = () => toc.map((t) => el('option', { value: t.num }, `${t.num}${t.title ? ' · ' + t.title : ''}`));
  const from = el('select', { 'aria-label': 'Dari chapter' }, opts());
  const to = el('select', { 'aria-label': 'Sampai chapter' }, opts());
  to.selectedIndex = toc.length - 1;
  const fix = (changed) => {
    if (from.selectedIndex > to.selectedIndex) {
      if (changed === from) to.selectedIndex = from.selectedIndex;
      else from.selectedIndex = to.selectedIndex;
    }
    onChange?.();
  };
  from.onchange = () => fix(from);
  to.onchange = () => fix(to);
  const node = el(
    'div',
    { class: 'row-2' },
    el('label', { class: 'field' }, el('span', null, 'Dari chapter'), from),
    el('label', { class: 'field' }, el('span', null, 'Sampai chapter'), to),
  );
  return {
    node,
    get from() {
      return Number(from.value);
    },
    get to() {
      return Number(to.value);
    },
    get count() {
      return to.selectedIndex - from.selectedIndex + 1;
    },
  };
}

async function openEpub(n) {
  const titleIn = el('input', { type: 'text', value: n.title });
  const authorIn = el('input', { type: 'text', value: n.author || '', placeholder: 'Opsional' });
  const langIn = el('input', { type: 'text', value: n.lang || 'id', placeholder: 'id / en / …' });
  const info = el('p', { class: 'small muted' });
  let titleTouched = false;
  titleIn.oninput = () => (titleTouched = true);
  const r = rangeSelects(n.toc, () => {
    const all = r.count === n.toc.length;
    if (!titleTouched) titleIn.value = all ? n.title : `${n.title} (${r.from}-${r.to})`;
    info.textContent = `${fmtNum(r.count)} chapter akan dimasukkan.`;
  });
  info.textContent = `${fmtNum(r.count)} chapter akan dimasukkan.`;

  let built = null;
  const ok = await dialog({
    title: 'Compile ke EPUB',
    body: [
      r.node,
      info,
      el('label', { class: 'field' }, el('span', null, 'Judul EPUB'), titleIn),
      el(
        'div',
        { class: 'row-2' },
        el('label', { class: 'field' }, el('span', null, 'Pengarang'), authorIn),
        el('label', { class: 'field' }, el('span', null, 'Kode bahasa'), langIn),
      ),
    ],
    actions: [
      { label: 'Batal', value: false },
      {
        label: 'Buat EPUB',
        primary: true,
        value: true,
        run: async () => {
          const title = titleIn.value.trim() || n.title;
          const chapters = await busy('Menyusun EPUB…', async () => {
            const list = await db.getChapterRange(n.id, r.from, r.to);
            const data = await buildEpub({ title, author: authorIn.value.trim(), lang: langIn.value.trim() || 'id', chapters: list });
            built = { data, name: `${safeFileName(title)}.epub` };
            return list;
          });
          if (!chapters.length) {
            toast('Tidak ada chapter di rentang itu.');
            return false;
          }
          const author = authorIn.value.trim();
          const lang = langIn.value.trim() || 'id';
          if (author !== (n.author || '') || lang !== (n.lang || 'id')) {
            await db.updateMeta(n.id, { author, lang });
            changed();
          }
        },
      },
    ],
  });
  if (ok && built) downloadOrShare(built.data, built.name, 'application/epub+zip');
}

async function exportTxt(n) {
  const data = await busy('Menyiapkan file…', async () => {
    const chapters = await db.getChapterRange(n.id);
    const width = String(Math.floor(Math.max(...chapters.map((c) => c.num)))).length;
    const files = chapters.map((c) => {
      const [i, f] = String(c.num).split('.');
      return {
        name: `${i.padStart(Math.max(4, width), '0')}${f ? '.' + f : ''}.txt`,
        data: [chapterLabel(c.num, c.title), ...c.paragraphs].join('\n\n') + '\n',
      };
    });
    return writeZip(files);
  });
  downloadOrShare(data, `${safeFileName(n.title)}.zip`, 'application/zip');
}

async function openDeleteRange(n) {
  const info = el('p', { class: 'small muted' });
  const r = rangeSelects(n.toc, () => (info.textContent = `${fmtNum(r.count)} chapter akan dihapus.`));
  r.node.querySelector('select').selectedIndex = 0;
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

const isZip = (f) => /\.zip$/i.test(f.name) || /zip/.test(f.type);
const isTxtName = (name) => /\.txt$/i.test(name) && !/(^|\/)(__MACOSX\/|\.)/.test(name);

async function readSources(files) {
  const sources = [];
  for (const f of files) {
    if (isZip(f)) {
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
  const fileIn = el('input', { type: 'file', multiple: true, accept: '.txt,.zip,text/plain,application/zip,application/x-zip-compressed' });
  const fileHelp = el(
    'p',
    { class: 'small muted' },
    'Pilih satu atau beberapa file .txt, atau .zip berisi .txt (diurutkan menurut nama file). File tanpa baris "Chapter N: …" dianggap satu chapter, nomornya diambil dari nama file.',
  );
  fileIn.onchange = () => {
    const f = fileIn.files[0];
    if (f && !titleIn.value) titleIn.value = fileIn.files.length === 1 ? baseName(f.name) : '';
  };

  const pastePane = el(
    'div',
    null,
    text,
    el('p', { class: 'small muted' }, 'Tiap baris yang tidak kosong menjadi satu paragraf; baris kosong diabaikan.'),
  );
  const filePane = el('div', { class: 'hidden' }, fileIn, fileHelp);
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
      el('div', { class: 'tabs', role: 'tablist' }, tabBtn('paste', 'Tempel teks'), tabBtn('file', 'File .txt / .zip')),
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
            if (!fileIn.files.length) return (showErr('Pilih file dulu.'), false);
            try {
              sources = await busy('Membaca file…', () => readSources([...fileIn.files]));
            } catch (e) {
              return (showErr(e.message), false);
            }
          }
          const res = buildImport(sources);
          if (res.error) return (showErr(res.error), false);
          let title = titleIn.value.trim();
          if (!target.value && !title && mode === 'file' && fileIn.files.length) title = baseName(fileIn.files[0].name);
          // Teruskan ke pratinjau; dialog impor ditutup, pratinjau bisa kembali ke sini lewat tombol Batal.
          pending = { res, novelId: target.value || null, title: title || 'Tanpa judul' };
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

async function openPreview({ res, novelId, title }) {
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
      existing.has(it.num) ? el('span', { class: 'badge exists' }, 'sudah ada') : el('span', { class: 'badge new' }, 'baru'),
      el('span', { class: 'cnt' }, `${fmtNum(it.paragraphs.length)} par.`),
    );
    const exp = el('button', { type: 'button', class: 'expand', 'aria-label': 'Lihat isi', 'aria-expanded': 'false' }, '▸');
    exp.onclick = () => {
      const show = body.classList.contains('hidden');
      if (show && !body.childElementCount) {
        const ps = it.paragraphs;
        body.append(
          ...[
            ...ps.slice(0, 3).map((p) => el('p', null, p)),
            ps.length > 4 ? el('p', null, `… (${fmtNum(ps.length - 4)} paragraf lagi) …`) : null,
            ps.length > 3 ? el('p', null, ps[ps.length - 1]) : null,
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
    rows.push({ it, setOn });
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
  await busy('Menyimpan…', () =>
    db.saveChapters(
      target.id,
      save.map(({ num, title, paragraphs }) => ({ num, title, paragraphs })),
    ),
  );
  requestPersist();
  const parts = [`${fmtNum(save.length - replaced)} chapter baru`];
  if (replaced) parts.push(`${fmtNum(replaced)} diganti`);
  if (skipped) parts.push(`${fmtNum(skipped)} dilewati`);
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

async function showReader(id, wantNum) {
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
  let para = 0;
  if (num == null && novel.lastRead) ({ num, para } = novel.lastRead);
  let idx = num == null ? 0 : novel.toc.findIndex((t) => t.num === num);
  if (idx < 0) {
    // Chapter sudah dihapus: pakai chapter terdekat sesudahnya.
    idx = novel.toc.findIndex((t) => t.num > num);
    if (idx < 0) idx = novel.toc.length - 1;
    para = 0;
  }

  const titleBtn = el('button', { type: 'button', class: 'bar-title', onclick: () => openToc() });
  const actions = {
    lock: () => setTouchLock(true),
    bookmark: () => openBookmarks(),
    search: () => openSearch(),
    toc: () => openToc(),
    brightness: openBrightness,
    settings: openSettings,
  };
  const barSlot = el('span', { class: 'bar-actions' });
  const rebuildBar = () =>
    barSlot.replaceChildren(
      ...settings.barOrder
        .filter((k) => !settings.barHidden.includes(k))
        .map((k) => iconBtn(BAR_ITEMS[k].icon, BAR_ITEMS[k].label, actions[k])),
    );
  rebuildBar();
  const bar = el(
    'header',
    { class: 'bar' },
    iconBtn('back', 'Kembali ke perpustakaan', () => (location.hash = '#/')),
    titleBtn,
    barSlot,
    iconBtn('more', 'Menu lainnya', () => openMore()),
  );
  // Bar pindah chapter di bawah bar atas: ‹ [pilih chapter] ›
  const chSelect = el('select', { 'aria-label': 'Pilih chapter', onchange: () => go(Number(chSelect.value)) });
  const fillChSelect = () =>
    chSelect.replaceChildren(...novel.toc.map((t, i) => el('option', { value: i }, chapterLabel(t.num, t.title))));
  fillChSelect();
  const chPrev = el('button', { type: 'button', class: 'ch-step', 'aria-label': 'Chapter sebelumnya', onclick: () => go(idx - 1) }, icon('back'));
  const chNext = el('button', { type: 'button', class: 'ch-step', 'aria-label': 'Chapter berikutnya', onclick: () => go(idx + 1) }, icon('chevron'));
  const chBar = el('div', { class: 'ch-bar hide' }, chPrev, el('div', { class: 'ch-pick' }, chSelect), chNext);
  bar.classList.add('hide');

  // Kontrol (bar atas + bar chapter) tersembunyi saat membaca; ketuk teks untuk menampilkan/menyembunyikan.
  let controls = false;
  function showControls(on) {
    controls = on;
    bar.classList.toggle('hide', !on);
    chBar.classList.toggle('hide', !on);
  }

  const main = el('main', {
    class: 'page reader',
    onclick: (e) => {
      if (touchLocked || e.target.closest('button, a, summary, input, select, textarea, label, .hold')) return;
      if (String(getSelection?.() || '').trim()) return; // sedang memilih teks
      showControls(!controls);
    },
  });
  const unlock = holdButton('Tahan untuk membuka kunci', 900, () => setTouchLock(false), 'unlock');
  const lockLayer = el('div', { class: 'lock-layer' }, unlock);
  let article = null;
  let recapSlot = null;
  let navSlot = null;
  let current = null; // { entry, chapter }
  let token = 0;

  setView([bar, chBar, main, lockLayer], () => {
    saveNow();
    setTouchLock(false);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', saveNow);
    scheduleSync(1500);
  });

  if (!settings.tapHint) {
    toast('Ketuk teks untuk menampilkan menu dan pindah chapter.');
    settings.tapHint = true;
    saveSettings();
  }

  // ----- Kunci sentuhan: sembunyikan kontrol, abaikan tap, hanya bisa scroll -----
  let touchLocked = false;
  function setTouchLock(on) {
    touchLocked = on;
    document.documentElement.classList.toggle('touch-locked', on);
    showControls(false);
    if (on) toast('Layar terkunci. Hanya bisa scroll. Tahan tombol gembok untuk membuka.');
  }

  // Posisi = indeks paragraf pertama yang terlihat di bawah bar (lebih tahan perubahan ukuran huruf daripada scrollY).
  const topOffset = () => bar.offsetHeight + 4;
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
    if (!p || !target) return window.scrollTo(0, 0);
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - topOffset());
    if (pinned?.para === p) pinned.y = window.scrollY;
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
    // Kontrol hanya muncul lewat ketukan; menggulir ke bawah menyembunyikannya lagi.
    if (controls && y > lastY + 8) showControls(false);
    lastY = y;
    scheduleSave();
  }
  function onKey(e) {
    if (touchLocked) return;
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
    if (!prev?.paragraphs.length) return null;
    const tail = prev.paragraphs.slice(-settings.recapCount);
    const d = el(
      'details',
      { class: 'recap', open: settings.recapOpen },
      el('summary', null, `Akhir ${chapterLabel(prev.num, prev.title)} · ${tail.length} paragraf terakhir`),
      tail.length < prev.paragraphs.length ? el('p', { class: 'gap' }, '…') : null,
      tail.map((p) => el('p', null, p)),
    );
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

  function buildNav() {
    const prevE = novel.toc[idx - 1];
    const nextE = novel.toc[idx + 1];
    return [
      el(
        'nav',
        { class: 'ch-nav' },
        el('button', { type: 'button', class: 'btn', disabled: !prevE, onclick: () => go(idx - 1) }, '‹ Sebelumnya'),
        el('button', { type: 'button', class: 'btn', onclick: () => openToc() }, 'Daftar isi'),
        el('button', { type: 'button', class: 'btn primary', disabled: !nextE, onclick: () => go(idx + 1) }, 'Berikutnya ›'),
      ),
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

    titleBtn.replaceChildren(
      el('span', null, chapterLabel(entry.num, entry.title)),
      el('small', null, `${novel.title} · ${idx + 1}/${novel.toc.length}`),
    );
    document.title = `${chapterLabel(entry.num, entry.title)} · ${novel.title}`;

    recapSlot = el('div', null, recap);
    article = el(
      'article',
      null,
      (chapter?.paragraphs || []).map((p) => el('p', null, p)),
    );
    navSlot = el('div', null, buildNav());
    main.replaceChildren(
      ...[
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
    fillChSelect(); // daftar isi bisa berubah (edit, hapus, sinkron)
    chSelect.value = String(idx);
    chPrev.disabled = idx === 0;
    chNext.disabled = idx === novel.toc.length - 1;
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

  function openToc() {
    const filter = el('input', { type: 'search', placeholder: 'Cari nomor atau judul…', 'aria-label': 'Cari chapter' });
    const ul = el('ul', { class: 'toc' });
    const marked = new Set(Object.values(novel.bookmarks || {}).map((b) => b.num));
    let d;
    const items = novel.toc.map((t, i) => {
      const b = el(
        'button',
        {
          type: 'button',
          class: i === idx ? 'current' : '',
          onclick: () => {
            d.close();
            go(i);
          },
        },
        el('span', { class: 'n' }, t.num),
        el('span', { class: 't' }, t.title || el('i', { class: 'muted' }, '(tanpa judul)')),
        marked.has(t.num) ? el('span', { class: 'toc-bm', title: 'Ada bookmark' }, icon('bookmark')) : null,
      );
      const li = el('li', null, b);
      li.dataset.q = `${t.num} ${t.title}`.toLowerCase();
      ul.append(li);
      return li;
    });
    filter.oninput = () => {
      const q = filter.value.trim().toLowerCase();
      for (const li of items) li.hidden = !!q && !li.dataset.q.includes(q);
    };
    dialog({
      title: `Daftar isi · ${fmtNum(novel.toc.length)} chapter`,
      className: 'drawer',
      body: [el('div', { class: 'toc-filter' }, filter), ul],
      onOpen: (x) => {
        d = x;
        items[idx]?.scrollIntoView({ block: 'center' });
      },
    });
  }

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
      body: [el('label', { class: 'field' }, el('span', null, 'Judul chapter'), titleIn), area, info],
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
    const paragraphs = splitLines(area.value);
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
  return el('p', { class: `sync-line${syncState.error ? ' err' : ''}` }, text);
}

function refreshSyncUi() {
  document.querySelectorAll('.sync-btn').forEach((b) => b.replaceWith(syncButton()));
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
      else if (!document.querySelector('dialog[open]') && !location.hash.startsWith('#/read')) await showLibrary();
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
            `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent(`Baca Novel ${sync.deviceName()}`)}&description=${encodeURIComponent('Sinkron aplikasi Baca Novel')}&contents=write`,
            'Buat token (fine-grained)',
          ),
          ': beri nama bebas (misalnya "Baca Novel iPad"), pilih masa berlaku, lalu di ',
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') runSync({ quiet: true });
});

// ---------- Service worker ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW gagal didaftarkan', e));
}

route();
runSync({ quiet: true });
