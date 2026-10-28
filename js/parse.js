// Pemrosesan teks: dekode, potong per chapter, dan susun hasil impor.
// Modul murni (tanpa DOM) supaya bisa diuji dengan `node --test`.

// Baris judul: "Chapter 12: Judul", "Chapter 12 - Judul", "Chapter 12" (juga "Bab 12: ...").
// Setelah nomor wajib ada pemisah atau akhir baris, supaya kalimat biasa seperti
// "Chapter 5 was the best" tidak dianggap judul.
const HEADING_RE = /^(?:chapter|bab)\s+(\d+(?:\.\d+)?)(?:\s*[:：.\-–—]\s*(.*?))?\s*$/i;

export function parseHeading(line) {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { num: Number(m[1]), title: (m[2] || '').trim() };
}

// ---------- TL note ----------
// Format baku di akhir chapter:
//   …akhir cerita
//   ---
//   TL note Chapter N
//   isi catatan…           ← satu catatan: paragraf biasa
//   - catatan pertama      ← lebih dari satu: tiap catatan (= tiap paragraf) diawali "- "
//   - catatan kedua
export const TL_SEP = '---';

// Tanda daftar lama di awal catatan: "-", "–", "—", "•", "*", "·", "1.", "1)", "(1)".
const BULLET_RE = /^(?:[-–—•*·]|\(?\d{1,3}[.)])\s+/;

/** Buang penanda miring/tebal Markdown yang mengapit teks: "*judul*", "**tebal**" → "judul", "tebal". */
export const stripEmphasis = (s) =>
  s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '$1').replace(/\*(?=[^\s*])(?:[^*\n]*?[^\s*])?\*/g, (m) => m.slice(1, -1));

/** Catatan TL: satu → apa adanya tanpa tanda; lebih dari satu → masing-masing "- ". Penanda miring "*…*" dibuang. */
export function formatTlItems(lines) {
  const items = lines.map((l) => stripEmphasis(l.replace(BULLET_RE, '').trim())).filter(Boolean);
  return items.length > 1 ? items.map((x) => `- ${x}`) : items;
}
const TL_HEAD_RE = /^tl note chapter\s+\d+(?:\.\d+)?\s*:?$/i;
export const isTlHead = (line) => TL_HEAD_RE.test(line.trim());

// Baris pemisah seperti "---", "—-", "***".
export const isSeparator = (line) => /^(?:[-—–_*=~•·]\s*){2,}$/.test(line.trim());

// Awal catatan format lama: "TL:", "T/N", "TN -", "TL Note (Ch 207):", "Translator's note", "Catatan penerjemah Bab 5:", "Note:".
// Mengembalikan sisa baris (isi catatan, bisa kosong), atau null bila baris itu bukan awal catatan.
function stripOldTlHead(line) {
  const m = /^(?:tl|t\/n|tn|translator'?s?|catatan|note|n\.?b\.?)(?=$|[\s:：\-–—.(\[])/i.exec(line);
  if (!m) return null;
  return line
    .slice(m[0].length)
    .replace(/^\s*(?:notes?|penerjemah|tl)\b/i, '')
    .replace(/^\s*[:：\-–—.]+/, '')
    .replace(/^\s*[(\[]?\s*(?:chapter|ch\.?|bab)\s*\d+(?:\.\d+)?\s*[)\]]?/i, '')
    .replace(/^\s*[:：\-–—.]+/, '')
    .trim();
}

/**
 * Rapikan TL note yang diblok: baris judul lama (bila ada) diganti "TL note Chapter N", isi catatan tetap.
 * Tanda kutip ">" di awal baris dan baris kosong dibuang; baris pemisah di depan dipertahankan.
 * `joiner`: pemisah antarbaris hasil ("\n", atau "\n\n" di editor chapter).
 */
export function formatTlNote(text, num, joiner = '\n') {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^\s*>\s?/, '').trim())
    .filter(Boolean);
  // Pemisah di depan blok (mis. "___", "—-") dibakukan jadi satu "---".
  let lead = [];
  while (lines.length && isSeparator(lines[0])) {
    lines.shift();
    lead = [TL_SEP];
  }
  if (lines.length) {
    const rest = stripOldTlHead(lines[0]);
    if (rest !== null) {
      lines.shift();
      if (rest) lines.unshift(rest);
    }
  }
  return [...lead, `TL note Chapter ${num ?? '?'}`, ...formatTlItems(lines)].join(joiner);
}

// Judul catatan yang cukup khas untuk dikenali otomatis tanpa diblok. "Note:" / "Catatan:" saja terlalu umum
// (bisa kalimat cerita), jadi hanya dirapikan lewat tombol + TL note.
const AUTO_TL_RE = /^(?:>\s*)?(?:tl|t\/n|tn|translator'?s?\s+notes?|catatan\s+(?:penerjemah|tl))(?=$|[\s:：\-–—.(\[])/i;

/**
 * Rapikan TL note di akhir chapter tanpa perlu diblok (dipakai saat impor, simpan editor, ekspor, dan "Rapikan TL note").
 * Catatan dikenali bila diawali judul khas (lihat AUTO_TL_RE) dan ada di akhir chapter: tepat setelah baris pemisah
 * atau di paruh kedua chapter. Hasilnya selalu "…cerita / --- / TL note Chapter N / isi": judul dengan nomor salah
 * dibetulkan, pemisah lama ("___", "—-", "***", beberapa sekaligus) diganti satu "---", dan "---" ditambahkan bila
 * belum ada. Mengembalikan daftar paragraf baru, atau null bila tidak ada yang berubah.
 */
export function autoTlNote(paragraphs, num) {
  const i = findTlNote(paragraphs);
  if (i < 0) return null;
  const story = paragraphs.slice(0, i);
  while (story.length && isSeparator(story[story.length - 1])) story.pop();
  const note = formatTlNote(paragraphs.slice(i).join('\n'), num).split('\n');
  const out = story.length ? [...story, TL_SEP, ...note] : note;
  return out.length === paragraphs.length && out.every((x, k) => x === paragraphs[k]) ? null : out;
}

/** Paragraf dengan TL note yang sudah dibakukan (untuk ekspor .txt & EPUB; chapter lama yang belum dirapikan ikut rapi). */
export const tidyParagraphs = (paragraphs, num) => autoTlNote(paragraphs, num) || paragraphs;

/** Indeks awal TL note (judul baku, atau judul lama yang khas di akhir chapter), atau -1. */
export function findTlNote(paragraphs) {
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (isTlHead(p)) return i;
    if (AUTO_TL_RE.test(p) && (i >= paragraphs.length / 2 || (i > 0 && isSeparator(paragraphs[i - 1])))) return i;
  }
  return -1;
}

/** Nomor dari judul chapter terdekat sebelum posisi `pos` (untuk teks tempel berisi banyak chapter). */
export function headingBefore(text, pos) {
  const lines = text.slice(0, pos).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const h = parseHeading(lines[i].trim());
    if (h) return h.num;
  }
  return null;
}

// Tiap baris tidak kosong = satu paragraf; baris kosong (atau spasi saja) diabaikan.
export function splitLines(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function splitChapters(text) {
  const chapters = [];
  const preamble = [];
  let cur = null;
  for (const line of splitLines(text)) {
    const h = parseHeading(line);
    if (h) {
      cur = { num: h.num, title: h.title, paragraphs: [] };
      chapters.push(cur);
    } else if (cur) {
      cur.paragraphs.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { chapters, preamble };
}

export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a, b) => collator.compare(a, b);

export function baseName(path) {
  return path
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
}

// Nomor dari nama file: utamakan angka setelah "chapter/ch/bab", kalau tidak ada pakai angka pertama.
export function numberFromName(name) {
  const base = baseName(name);
  const m = /(?:chapter|chap|ch|bab)[\s._-]*(\d+(?:\.\d+)?)/i.exec(base) || /(\d+(?:\.\d+)?)/.exec(base);
  return m ? Number(m[1]) : null;
}

function titleFromName(name) {
  return baseName(name)
    .replace(/(?:chapter|chap|ch|bab)?[\s._-]*\d+(?:\.\d+)?/i, '')
    .replace(/^[\s._:\-–—]+|[\s._:\-–—]+$/g, '')
    .replace(/[_]+/g, ' ');
}

const snippet = (s, n = 60) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * sources: [{ name: string|null, text: string }]  (name null = teks tempelan)
 * Hasil: { items: [{num, title, paragraphs, source, dup, autoNum}], warnings: string[], error?: string }
 */
export function buildImport(sources) {
  const items = [];
  const warnings = [];
  const unnumbered = [];

  for (const src of sources) {
    const label = src.name || 'Teks tempelan';
    // Sumber yang sudah terpotong per chapter (mis. EPUB) dipakai apa adanya.
    const { chapters, preamble } = src.chapters ? { chapters: src.chapters, preamble: [] } : splitChapters(src.text);
    if (chapters.length) {
      for (const c of chapters) items.push({ ...c, source: src.name });
      if (preamble.length) {
        warnings.push(`${label}: ${preamble.length} baris sebelum chapter pertama diabaikan ("${snippet(preamble[0])}").`);
      }
    } else if (src.name) {
      // File tanpa baris judul: seluruh isi file = satu chapter, nomor dari nama file.
      const paragraphs = splitLines(src.text);
      if (!paragraphs.length) {
        warnings.push(`${label}: file kosong, dilewati.`);
        continue;
      }
      const item = { num: numberFromName(src.name), title: titleFromName(src.name), paragraphs, source: src.name };
      if (item.num == null) unnumbered.push(item);
      items.push(item);
    }
  }

  if (!items.length) {
    const pasteOnly = sources.every((s) => !s.name);
    return {
      items,
      warnings,
      error: pasteOnly
        ? 'Tidak ditemukan baris judul seperti "Chapter 1: Judul". Tiap chapter harus diawali baris seperti itu.'
        : 'Tidak ada chapter yang bisa diimpor.',
    };
  }

  if (unnumbered.length) {
    let next = Math.floor(Math.max(0, ...items.filter((i) => i.num != null).map((i) => i.num))) + 1;
    for (const it of unnumbered) {
      it.num = next++;
      it.autoNum = true;
    }
    warnings.push(`${unnumbered.length} file tanpa nomor chapter diberi nomor otomatis (ditandai "nomor otomatis").`);
  }

  // TL note: dirapikan otomatis; it.tl = 'ok' (sudah benar) / 'fixed' (dirapikan), supaya bisa dicek di pratinjau.
  for (const it of items) {
    const fixed = autoTlNote(it.paragraphs, it.num);
    if (fixed) it.paragraphs = fixed;
    if (it.paragraphs.some(isTlHead)) it.tl = fixed ? 'fixed' : 'ok';
  }
  const withTl = items.filter((i) => i.tl);
  if (withTl.length) {
    const list = (arr) => arr.slice(0, 20).map((i) => i.num).join(', ') + (arr.length > 20 ? `, … (+${arr.length - 20})` : '');
    const fixedTl = withTl.filter((i) => i.tl === 'fixed');
    warnings.push(
      `TL note ada di ${withTl.length} chapter (${list(withTl)}).` +
        (fixedTl.length ? ` Format ${fixedTl.length} chapter dirapikan otomatis: ${list(fixedTl)}.` : ' Semua formatnya sudah benar.'),
    );
  }

  const seen = new Set();
  let dupCount = 0;
  for (const it of items) {
    it.dup = seen.has(it.num);
    if (it.dup) dupCount++;
    seen.add(it.num);
  }
  if (dupCount) warnings.push(`${dupCount} chapter punya nomor kembar di dalam impor ini; hanya satu per nomor yang bisa disimpan.`);

  const empty = items.filter((i) => !i.paragraphs.length).length;
  if (empty) warnings.push(`${empty} chapter tidak punya isi (hanya judul).`);

  const missing = missingNumbers([...seen]);
  if (missing.length) {
    const shown = missing.slice(0, 15).join(', ') + (missing.length > 15 ? `, … (+${missing.length - 15})` : '');
    warnings.push(`Nomor yang tidak ada di impor ini: ${shown}.`);
  }

  return { items, warnings };
}

export function missingNumbers(nums) {
  const ints = nums.filter(Number.isInteger).sort((a, b) => a - b);
  if (ints.length < 2) return [];
  const have = new Set(ints);
  const out = [];
  for (let n = ints[0]; n <= ints[ints.length - 1]; n++) if (!have.has(n)) out.push(n);
  return out;
}

export function chapterLabel(num, title) {
  return title ? `Chapter ${num}: ${title}` : `Chapter ${num}`;
}
