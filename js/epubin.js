// Membaca file EPUB (2 & 3) jadi chapter teks untuk diimpor, plus judul, pengarang, sinopsis, dan sampul.
// Memakai DOMParser (browser). Tiap dokumen di spine = satu chapter; judulnya dari daftar isi (nav / toc.ncx)
// atau judul pertama di dokumen. Nomor diambil dari "Chapter 12", "Bab 12", "Ch. 12", "12." dan seterusnya;
// dokumen tanpa nomor diberi nomor berikutnya.
import { readZip } from './zip.js';
import { decodeText } from './parse.js';

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'FIGCAPTION', 'TD', 'TH']);
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** "Chapter 12: Judul" / "Chapter 12 Judul" / "Ch. 12 - Judul" / "12. Judul" → { num, title }, atau null. */
export function parseChapterTitle(text) {
  const t = clean(text || '');
  const m =
    /^(?:chapter|chap\.?|ch\.?|bab|episode|ep\.?)\s*(\d+(?:\.\d+)?)\s*(?:[:：.,\-–—)]\s*)?(.*)$/i.exec(t) ||
    // Angka saja wajib diikuti pemisah atau akhir, supaya "2024 Tahun Naga" tidak terbaca nomor.
    /^(\d+(?:\.\d+)?)\s*(?:[:：.\-–—)]\s*(.*)|$)/.exec(t);
  return m ? { num: Number(m[1]), title: clean(m[2] || '') } : null;
}

function normalizePath(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.replace(/[^/]*$/, '') : '');

function parseDoc(text, type) {
  const doc = new DOMParser().parseFromString(text, type);
  if (doc.getElementsByTagName('parsererror').length) return new DOMParser().parseFromString(text, 'text/html');
  return doc;
}

const byTag = (root, tag) => [...root.getElementsByTagNameNS('*', tag)];

/** Paragraf teks dari satu dokumen XHTML: blok teks terdalam, <br> memisah baris, <hr> jadi "---". */
function paragraphsOf(body) {
  const out = [];
  let buf = '';
  const flush = () => {
    const t = clean(buf);
    if (t) out.push(t);
    buf = '';
  };
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) buf += n.nodeValue;
      else if (n.nodeType === 1) {
        const tag = n.localName.toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        if (tag === 'BR') flush();
        else if (tag === 'HR') {
          flush();
          out.push('---');
        } else if (BLOCKS.has(tag) || tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
          flush();
          // Judul diberi spasi di antara bagian-bagiannya ("Chapter 12<span>Judul</span>" → "Chapter 12 Judul").
          if (/^H[1-6]$/.test(tag)) {
            buf = [...n.childNodes].map((c) => c.textContent).join(' ');
            flush();
          } else {
            walk(n);
            flush();
          }
        } else walk(n);
      }
    }
  };
  walk(body);
  flush();
  return out;
}

/**
 * buf: ArrayBuffer/Uint8Array file .epub.
 * Mengembalikan { title, author, synopsis, cover: { bytes, type } | null, chapters: [{ num, title, paragraphs }] }.
 */
export async function readEpub(buf) {
  const entries = readZip(buf);
  const files = new Map(entries.filter((e) => !e.dir).map((e) => [normalizePath(e.name), e]));
  const read = async (path) => {
    const e = files.get(normalizePath(path));
    if (!e) throw new Error(`EPUB tidak lengkap: ${path} tidak ada.`);
    return e.read();
  };
  const readText = async (path) => decodeText(await read(path));

  const container = parseDoc(await readText('META-INF/container.xml'), 'application/xml');
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB tidak valid (rootfile tidak ditemukan).');
  const opf = parseDoc(await readText(opfPath), 'application/xml');
  const base = dirOf(opfPath);
  const resolve = (href, from = base) => normalizePath(from + decodeURIComponent(href.split('#')[0]));
  const metaText = (tag) => clean(byTag(opf, tag)[0]?.textContent || '');

  const manifest = new Map(
    byTag(opf, 'item').map((i) => [
      i.getAttribute('id'),
      { href: resolve(i.getAttribute('href') || ''), type: i.getAttribute('media-type') || '', props: (i.getAttribute('properties') || '').split(/\s+/) },
    ]),
  );
  const items = [...manifest.values()];

  // Judul dari daftar isi: nav (EPUB 3) lalu toc.ncx (EPUB 2).
  const labels = new Map();
  const nav = items.find((i) => i.props.includes('nav'));
  if (nav) {
    try {
      const doc = parseDoc(await readText(nav.href), 'application/xhtml+xml');
      for (const a of byTag(doc, 'a')) {
        const href = a.getAttribute('href');
        if (href && !labels.has(resolve(href, dirOf(nav.href)))) labels.set(resolve(href, dirOf(nav.href)), clean(a.textContent));
      }
    } catch {}
  }
  const ncx = items.find((i) => i.type === 'application/x-dtbncx+xml');
  if (ncx) {
    try {
      const doc = parseDoc(await readText(ncx.href), 'application/xml');
      for (const np of byTag(doc, 'navPoint')) {
        const src = byTag(np, 'content')[0]?.getAttribute('src');
        const text = byTag(np, 'text')[0]?.textContent;
        if (src && text && !labels.has(resolve(src, dirOf(ncx.href)))) labels.set(resolve(src, dirOf(ncx.href)), clean(text));
      }
    } catch {}
  }

  // Sampul: item ber-properti cover-image (EPUB 3) atau <meta name="cover" content="id"> (EPUB 2).
  const coverId = byTag(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverItem = items.find((i) => i.props.includes('cover-image')) || manifest.get(coverId);
  let cover = null;
  if (coverItem && coverItem.type.startsWith('image/')) {
    try {
      cover = { bytes: await read(coverItem.href), type: coverItem.type };
    } catch {}
  }

  const spine = byTag(opf, 'itemref')
    .map((r) => manifest.get(r.getAttribute('idref')))
    .filter((i) => i && /x?html/.test(i.type) && !i.props.includes('nav'));

  const chapters = [];
  let next = 1;
  for (const item of spine) {
    const doc = parseDoc(await readText(item.href), 'application/xhtml+xml');
    const body = byTag(doc, 'body')[0] || doc.documentElement;
    let paragraphs = paragraphsOf(body);
    const heading = byTag(body, '*').find((e) => /^h[1-6]$/i.test(e.localName));
    const headText = heading ? clean([...heading.childNodes].map((c) => c.textContent).join(' ')) : '';
    const label = labels.get(item.href) || '';
    // Judul dokumen tidak ikut jadi paragraf.
    if (headText && paragraphs[0] === headText) paragraphs = paragraphs.slice(1);
    const parsed = parseChapterTitle(label) || parseChapterTitle(headText);
    if (!parsed) {
      // Halaman sampul / judul / hak cipta sebelum chapter pertama: lewati bila pendek dan tanpa nomor.
      const chars = paragraphs.join('').length;
      if (!chapters.length && chars < 400) continue;
      if (!paragraphs.length) continue;
    }
    const num = parsed ? parsed.num : next;
    next = Math.floor(Math.max(next, num)) + 1;
    const title = parsed ? parsed.title : label || headText;
    chapters.push({ num, title, paragraphs });
  }

  return {
    title: metaText('title'),
    author: metaText('creator'),
    synopsis: clean(
      new DOMParser().parseFromString(metaText('description'), 'text/html').body?.textContent || metaText('description'),
    ),
    cover,
    chapters,
  };
}
