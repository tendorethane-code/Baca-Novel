// ZIP minimal tanpa library: baca (stored + deflate) dan tulis (deflate bila didukung, selain itu stored).
// Dekompresi memakai DecompressionStream('deflate-raw') bawaan browser.

const enc = new TextEncoder();

let CRC_TABLE;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data, transform) {
  const stream = new Blob([data]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeName(bytes, flags) {
  if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Mengembalikan [{ name, size, dir, read(): Promise<Uint8Array> }] */
export function readZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Bukan file zip yang valid.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff || count === 0xffff) throw new Error('Format ZIP64 belum didukung.');

  const entries = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur zip rusak.');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = decodeName(bytes.subarray(p + 46, p + 46 + nameLen), flags);
    const e = { flags, method, compSize, localOff, name };
    entries.push({ name, size, dir: name.endsWith('/'), read: () => extract(bytes, dv, e) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extract(bytes, dv, e) {
  if (e.flags & 1) throw new Error(`${e.name}: file zip terenkripsi tidak didukung.`);
  const off = e.localOff;
  if (dv.getUint32(off, true) !== 0x04034b50) throw new Error(`${e.name}: header zip rusak.`);
  const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
  const data = bytes.subarray(start, start + e.compSize);
  if (e.method === 0) return data;
  if (e.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung dekompresi zip.');
    return pipe(data, new DecompressionStream('deflate-raw'));
  }
  throw new Error(`${e.name}: metode kompresi ${e.method} tidak didukung.`);
}

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * files: [{ name, data: Uint8Array|string, store?: boolean }]
 * `store: true` memaksa tanpa kompresi (wajib untuk file `mimetype` di EPUB).
 */
export async function writeZip(files) {
  const canDeflate = typeof CompressionStream !== 'undefined';
  const { time, date } = dosDateTime(new Date());
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(raw);
    let data = raw;
    let method = 0;
    if (!f.store && canDeflate && raw.length > 64) {
      const z = await pipe(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) {
        data = z;
        method = 8;
      }
    }
    const flags = /[^\x20-\x7e]/.test(f.name) ? 0x800 : 0;

    const lh = new Uint8Array(30 + nameB.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, method, true);
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, raw.length, true);
    l.setUint16(26, nameB.length, true);
    lh.set(nameB, 30);
    chunks.push(lh, data);

    const ch = new Uint8Array(46 + nameB.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, method, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nameB.length, true);
    c.setUint32(42, offset, true);
    ch.set(nameB, 46);
    central.push(ch);

    offset += lh.length + data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  return concat([...chunks, ...central, end]);
}
