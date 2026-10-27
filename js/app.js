import * as db from './db.js';
import { buildImport, decodeText, naturalCompare, baseName, chapterLabel } from './parse.js';
import { readZip, writeZip } from './zip.js';
import { buildEpub } from './epub.js';

const APP_VERSION = '1.0.0';
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
  document.getElementById('toasts').append(t);
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
        iconBtn('close', 'Tutup', () => d.close()),
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
        if (!inside) d.close();
      }
    });
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

const FONTS = {
  book: { label: 'Buku', css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  serif: { label: 'Serif', css: 'Georgia, "Times New Roman", Times, serif' },
  sans: { label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  mono: { label: 'Mono', css: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace' },
};
const THEMES = {
  light: { label: 'Terang', color: '#fbfaf7' },
  sepia: { label: 'Sepia', color: '#f4ecd8' },
  dark: { label: 'Gelap', color: '#141414' },
};
const SETTINGS_KEY = 'baca-novel:settings';
const DEFAULTS = {
  font: 'book',
  size: 19,
  lh: 1.7,
  width: 680,
  justify: false,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  recapCount: 3,
  recapOpen: true,
};

let settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {}
if (!FONTS[settings.font]) settings.font = DEFAULTS.font;
if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  r.style.setProperty('--read-font', FONTS[settings.font].css);
  r.style.setProperty('--read-size', `${settings.size}px`);
  r.style.setProperty('--read-lh', settings.lh);
  r.style.setProperty('--read-width', `${settings.width}px`);
  r.style.setProperty('--read-align', settings.justify ? 'justify' : 'left');
  document.querySelector('meta[name="theme-color"]').content = THEMES[settings.theme].color;
}
applySettings();

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

  const seg = (items, key, cls) => {
    const wrap = el('div', { class: 'seg' });
    for (const [k, v] of Object.entries(items)) {
      const b = el('button', { type: 'button', class: cls ? `${cls}-${k}` : '', 'aria-pressed': String(settings[key] === k) }, v.label);
      if (key === 'font') b.style.fontFamily = v.css;
      b.onclick = () => {
        update({ [key]: k });
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      };
      wrap.append(b);
    }
    return wrap;
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
    return el('label', { class: 'slider' }, el('span', null, label), out, input);
  };

  const check = (label, key) =>
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', checked: settings[key], onchange: (e) => update({ [key]: e.target.checked }) }),
      label,
    );

  const storageInfo = el('p', { class: 'small muted' });
  showStorageInfo(storageInfo);

  dialog({
    title: 'Tampilan',
    className: 'sheet',
    body: [
      el('div', { class: 'section-label' }, 'Tema'),
      seg(THEMES, 'theme', 't'),
      el('div', { class: 'section-label' }, 'Huruf'),
      seg(FONTS, 'font'),
      el('div', { class: 'section-label' }, 'Teks'),
      slider('Ukuran huruf', 'size', 13, 34, 1, (v) => `${v}px`),
      slider('Jarak baris', 'lh', 1.2, 2.4, 0.05, (v) => v.toFixed(2)),
      slider('Lebar teks', 'width', 360, 1200, 20, (v) => `${v}px`),
      check('Rata kiri-kanan', 'justify'),
      el('div', { class: 'section-label' }, 'Pengingat chapter sebelumnya'),
      slider('Jumlah paragraf terakhir yang ditampilkan (0 = mati)', 'recapCount', 0, 15, 1, (v) => String(v)),
      check('Tampilkan terbuka', 'recapOpen'),
      storageInfo,
    ],
  });
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
    el('h1', null, 'Baca Novel'),
    iconBtn('type', 'Tampilan', openSettings),
    el('button', { type: 'button', class: 'btn primary', onclick: () => openImport() }, icon('plus'), 'Impor'),
  );

  const list = el('div', { class: 'cards' });
  for (const n of novels) list.append(novelCard(n));

  const body = novels.length
    ? list
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
        el('p', { class: 'small' }, 'Semua data tersimpan di browser perangkat ini saja, tidak dikirim ke mana pun.'),
      );

  const foot = el('p', { class: 'foot' });
  showStorageInfo(foot);
  setView([bar, el('main', { class: 'page library' }, body, foot)]);
}

function novelCard(n) {
  const total = n.toc.length;
  const idx = n.lastRead ? n.toc.findIndex((t) => t.num === n.lastRead.num) : -1;
  const pct = total && idx >= 0 ? ((idx + 1) / total) * 100 : 0;
  const read = () => (location.hash = `#/read/${encodeURIComponent(n.id)}`);
  const meta = [`${fmtNum(total)} chapter`];
  if (total) meta.push(`Ch ${n.toc[0].num}–${n.toc[total - 1].num}`);
  if (idx >= 0) meta.push(`terakhir dibaca: Chapter ${n.lastRead.num}`);
  return el(
    'section',
    { class: 'card' },
    el('h2', { onclick: total ? read : null }, n.title),
    iconBtn('more', 'Menu novel', () => novelMenu(n)),
    el('div', { class: 'meta' }, meta.join(' · ')),
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
  const act = (label, fn, opts = {}) =>
    el(
      'button',
      {
        type: 'button',
        class: `btn${opts.danger ? ' danger' : ''}`,
        disabled: opts.disabled,
        onclick: () => {
          d.close();
          fn();
        },
      },
      label,
    );
  let d;
  const body = el(
    'div',
    { class: 'menu-list' },
    act('Impor / tambah chapter', () => openImport(n.id)),
    act('Compile ke EPUB', () => openEpub(n), { disabled: !has }),
    act('Ekspor sebagai .zip (txt)', () => exportTxt(n), { disabled: !has }),
    act('Ganti judul', async () => {
      const t = await promptDialog('Ganti judul', 'Judul novel', n.title);
      if (t) {
        await db.updateNovel(n.id, { title: t });
        route();
      }
    }),
    act('Hapus rentang chapter', () => openDeleteRange(n), { disabled: !has, danger: true }),
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
          route();
        }
      },
      { danger: true },
    ),
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
          await db.updateNovel(n.id, { author: authorIn.value.trim(), lang: langIn.value.trim() || 'id' });
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
  route();
}

/** Menanyakan ganti/lewati untuk tiap chapter yang nomornya sudah ada. Mengembalikan { skip:Set } atau null bila batal. */
async function askConflicts(conflicts, existing) {
  const radios = [];
  const rows = conflicts.map((c) => {
    const old = existing.get(c.num);
    const name = `conf-${c.i}`;
    const replace = el('input', { type: 'radio', name, value: 'replace' });
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
      el(
        'div',
        { class: 'conf-tools' },
        el('button', { type: 'button', class: 'btn', onclick: () => all('replace') }, 'Ganti semua'),
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
  const bar = el(
    'header',
    { class: 'bar' },
    iconBtn('back', 'Kembali ke perpustakaan', () => (location.hash = '#/')),
    titleBtn,
    iconBtn('toc', 'Daftar isi', () => openToc()),
    iconBtn('type', 'Tampilan', openSettings),
  );
  const main = el('main', { class: 'page reader' });
  let article = null;
  let recapSlot = null;
  let current = null; // { entry, chapter }
  let token = 0;

  setView([bar, main], () => {
    saveNow();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', saveNow);
  });

  // Posisi = indeks paragraf pertama yang terlihat di bawah bar (lebih tahan perubahan ukuran huruf daripada scrollY).
  const topOffset = () => bar.offsetHeight + 4;
  function anchor() {
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
  }

  let saveTimer = 0;
  let lastSaved = '';
  function saveNow() {
    clearTimeout(saveTimer);
    if (!current) return;
    const lr = { num: current.entry.num, para: anchor(), at: Date.now() };
    const key = `${lr.num}:${lr.para}`;
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
    if (y > lastY + 8 && y > 120) bar.classList.add('hide');
    else if (y < lastY - 8 || y < 60) bar.classList.remove('hide');
    lastY = y;
    scheduleSave();
  }
  function onKey(e) {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey)
      return;
    if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
  }
  function onVis() {
    if (document.visibilityState === 'hidden') saveNow();
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

  async function render(startPara) {
    const my = ++token;
    const entry = novel.toc[idx];
    const chapter = await db.getChapter(novel.id, entry.num);
    const recap = await buildRecap();
    if (my !== token) return;
    current = { entry, chapter };

    const prevE = novel.toc[idx - 1];
    const nextE = novel.toc[idx + 1];
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
    main.replaceChildren(
      ...[
        recapSlot,
        entry.title
          ? el('h1', { class: 'ch-title' }, el('small', null, `Chapter ${entry.num}`), entry.title)
          : el('h1', { class: 'ch-title' }, `Chapter ${entry.num}`),
        article,
        chapter?.paragraphs.length ? null : el('p', { class: 'muted' }, '(Chapter ini kosong.)'),
        el(
          'nav',
          { class: 'ch-nav' },
          el('button', { type: 'button', class: 'btn', disabled: !prevE, onclick: () => go(idx - 1) }, '‹ Sebelumnya'),
          el('button', { type: 'button', class: 'btn', onclick: () => openToc() }, 'Daftar isi'),
          el('button', { type: 'button', class: 'btn primary', disabled: !nextE, onclick: () => go(idx + 1) }, 'Berikutnya ›'),
        ),
        nextE ? null : el('p', { class: 'ch-end' }, 'Ini chapter terakhir yang tersimpan.'),
      ].filter(Boolean),
    );
    history.replaceState(null, '', `#/read/${encodeURIComponent(novel.id)}/${entry.num}`);
    bar.classList.remove('hide');
    restore(startPara);
    lastY = window.scrollY;
    lastSaved = '';
    saveNow();
  }

  function go(i) {
    if (i < 0 || i >= novel.toc.length || i === idx) return;
    saveNow();
    idx = i;
    render(0);
  }

  function openToc() {
    const filter = el('input', { type: 'search', placeholder: 'Cari nomor atau judul…', 'aria-label': 'Cari chapter' });
    const ul = el('ul', { class: 'toc' });
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

  readerHooks = { anchor: () => anchor(), restore, refreshRecap };
  await render(para);
}

// ---------- Service worker ----------

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const offer = (w) =>
        toast('Versi baru tersedia.', {
          label: 'Muat ulang',
          run: () => w.postMessage('skipWaiting'),
        });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
    })
    .catch((e) => console.warn('SW gagal didaftarkan', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

route();
