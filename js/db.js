// Penyimpanan di IndexedDB.
// novels:   { id, title, author, lang, createdAt, updatedAt, mu, toc: [{num, title, n, u}], del: {num: waktu}, lastRead: {num, para, at} }
//           `u` = waktu chapter terakhir diubah, `del` = catatan chapter yang dihapus, `mu` = waktu ubah judul/pengarang.
//           Ketiganya dipakai sinkronisasi untuk memutuskan versi mana yang terbaru.
// chapters: { novelId, num, title, paragraphs: string[], u }   key: [novelId, num]
// meta:     { key: 'deletedNovels', value: { novelId: waktu } }

import { mergeNovel, maxMerge } from './merge.js';

const DB_NAME = 'baca-novel';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore('novels', { keyPath: 'id' });
          db.createObjectStore('chapters', { keyPath: ['novelId', 'num'] });
        }
        if (e.oldVersion < 2) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Tab lain membuka versi database yang lebih baru: tutup supaya tidak menghalanginya.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database sedang dipakai tab lain. Tutup tab lain lalu muat ulang.'));
    });
  }
  return dbp;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaksi dibatalkan.'));
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const range = (novelId, from = -Infinity, to = Infinity) => IDBKeyRange.bound([novelId, from], [novelId, to]);

function newId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Stempel waktu yang selalu naik, supaya dua perubahan berurutan tidak pernah punya `u` sama.
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export async function listNovels() {
  const db = await open();
  const all = await result(db.transaction('novels').objectStore('novels').getAll());
  return all.sort((a, b) => (b.lastRead?.at || b.updatedAt) - (a.lastRead?.at || a.updatedAt));
}

export async function getNovel(id) {
  const db = await open();
  return result(db.transaction('novels').objectStore('novels').get(id));
}

export async function createNovel(title) {
  const db = await open();
  const now = stamp();
  const novel = { id: newId(), title, author: '', createdAt: now, updatedAt: now, mu: now, toc: [], del: {}, lastRead: null };
  const tx = db.transaction('novels', 'readwrite');
  tx.objectStore('novels').put(novel);
  await done(tx);
  return novel;
}

async function patchNovel(id, fn) {
  const db = await open();
  const tx = db.transaction('novels', 'readwrite');
  const store = tx.objectStore('novels');
  let novel;
  store.get(id).onsuccess = (e) => {
    novel = e.target.result;
    if (novel) store.put(fn(novel) || novel);
  };
  await done(tx);
  return novel;
}

/** Ubah judul / pengarang / bahasa. */
export const updateMeta = (id, patch) => patchNovel(id, (n) => Object.assign(n, patch, { mu: stamp(), updatedAt: Date.now() }));

export const setLastRead = (id, lastRead) => patchNovel(id, (n) => void (n.lastRead = lastRead));

export async function deleteNovel(id) {
  const db = await open();
  const tx = db.transaction(['novels', 'chapters', 'meta'], 'readwrite');
  tx.objectStore('chapters').delete(range(id));
  tx.objectStore('novels').delete(id);
  const meta = tx.objectStore('meta');
  meta.get('deletedNovels').onsuccess = (e) => {
    const value = e.target.result?.value || {};
    value[id] = stamp();
    meta.put({ key: 'deletedNovels', value });
  };
  await done(tx);
}

export async function getChapter(novelId, num) {
  const db = await open();
  return result(db.transaction('chapters').objectStore('chapters').get([novelId, num]));
}

export async function getChapterRange(novelId, from, to) {
  const db = await open();
  return result(
    db
      .transaction('chapters')
      .objectStore('chapters')
      .getAll(range(novelId, from, to)),
  );
}

/** Menyimpan chapter (menimpa nomor yang sama) dan memperbarui daftar isi dalam satu transaksi. */
export async function saveChapters(novelId, items) {
  const db = await open();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  const novels = tx.objectStore('novels');
  const chapters = tx.objectStore('chapters');
  novels.get(novelId).onsuccess = (e) => {
    const novel = e.target.result;
    if (!novel) return tx.abort();
    const u = stamp();
    const toc = new Map(novel.toc.map((t) => [t.num, t]));
    novel.del ||= {};
    for (const it of items) {
      chapters.put({ novelId, num: it.num, title: it.title, paragraphs: it.paragraphs, u });
      toc.set(it.num, { num: it.num, title: it.title, n: it.paragraphs.length, u });
      delete novel.del[it.num];
    }
    novel.toc = [...toc.values()].sort((a, b) => a.num - b.num);
    novel.updatedAt = Date.now();
    novels.put(novel);
  };
  await done(tx);
}

export async function deleteChapters(novelId, from, to) {
  const db = await open();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  const novels = tx.objectStore('novels');
  tx.objectStore('chapters').delete(range(novelId, from, to));
  novels.get(novelId).onsuccess = (e) => {
    const novel = e.target.result;
    const now = stamp();
    novel.del ||= {};
    for (const t of novel.toc) if (t.num >= from && t.num <= to) novel.del[t.num] = now;
    novel.toc = novel.toc.filter((t) => t.num < from || t.num > to);
    novel.updatedAt = Date.now();
    novels.put(novel);
  };
  await done(tx);
}

// ---------- Untuk sinkronisasi ----------

export async function exportState() {
  const db = await open();
  const tx = db.transaction(['novels', 'meta']);
  const [novels, meta] = await Promise.all([
    result(tx.objectStore('novels').getAll()),
    result(tx.objectStore('meta').get('deletedNovels')),
  ]);
  return { novels, deletedNovels: meta?.value || {} };
}

/**
 * Menerapkan hasil sinkron. Di dalam transaksi data lokal dibaca ulang dan digabung sekali lagi,
 * jadi perubahan yang terjadi selama sinkron berjalan (mis. posisi baca) tidak hilang.
 * plan: { novels: [{ novel, puts: [chapter] }], removeIds: [id], deletedNovels }
 */
export async function applySync(plan) {
  const db = await open();
  const tx = db.transaction(['novels', 'chapters', 'meta'], 'readwrite');
  const novels = tx.objectStore('novels');
  const chapters = tx.objectStore('chapters');
  const meta = tx.objectStore('meta');

  meta.get('deletedNovels').onsuccess = (e) => {
    meta.put({ key: 'deletedNovels', value: maxMerge(e.target.result?.value, plan.deletedNovels) });
  };
  for (const id of plan.removeIds) {
    chapters.delete(range(id));
    novels.delete(id);
  }
  for (const { novel: incoming, puts } of plan.novels) {
    novels.get(incoming.id).onsuccess = (e) => {
      const current = e.target.result;
      const { novel, chapters: decided } = mergeNovel(current, incoming);
      const byNum = new Map(puts.map((p) => [p.num, p]));
      const localToc = new Map((current?.toc || []).map((t) => [t.num, t]));
      novel.toc = novel.toc.filter((t) => {
        const d = decided.get(t.num);
        if (d.from !== 'R') return true;
        const p = byNum.get(t.num);
        if (p && p.u === t.u) {
          chapters.put({ novelId: novel.id, num: p.num, title: p.title, paragraphs: p.paragraphs, u: p.u });
          return true;
        }
        // Isi versi baru tidak ikut terunduh: pertahankan versi lokal (kalau ada).
        const old = localToc.get(t.num);
        if (old) Object.assign(t, old);
        return !!old;
      });
      for (const [num, d] of decided) if (d.from === 'del' && d.l) chapters.delete([novel.id, num]);
      novels.put(novel);
    };
  }
  await done(tx);
}
