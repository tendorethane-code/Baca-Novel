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
    const { chapters, preamble } = splitChapters(src.text);
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
