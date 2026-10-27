// Penyimpanan di IndexedDB.
// novels:   { id, title, author, createdAt, updatedAt, toc: [{num, title, n}], lastRead: {num, para, at} }
// chapters: { novelId, num, title, paragraphs: string[] }   key: [novelId, num]

const DB_NAME = 'baca-novel';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('novels', { keyPath: 'id' });
        db.createObjectStore('chapters', { keyPath: ['novelId', 'num'] });
      };
      req.onsuccess = () => resolve(req.result);
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
  const now = Date.now();
  const novel = { id: newId(), title, author: '', createdAt: now, updatedAt: now, toc: [], lastRead: null };
  const tx = db.transaction('novels', 'readwrite');
  tx.objectStore('novels').put(novel);
  await done(tx);
  return novel;
}

export async function updateNovel(id, patch) {
  const db = await open();
  const tx = db.transaction('novels', 'readwrite');
  const store = tx.objectStore('novels');
  let novel;
  store.get(id).onsuccess = (e) => {
    novel = e.target.result;
    if (novel) store.put(Object.assign(novel, patch));
  };
  await done(tx);
  return novel;
}

export const setLastRead = (id, lastRead) => updateNovel(id, { lastRead });

export async function deleteNovel(id) {
  const db = await open();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  tx.objectStore('chapters').delete(range(id));
  tx.objectStore('novels').delete(id);
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
    const toc = new Map(novel.toc.map((t) => [t.num, t]));
    for (const it of items) {
      chapters.put({ novelId, num: it.num, title: it.title, paragraphs: it.paragraphs });
      toc.set(it.num, { num: it.num, title: it.title, n: it.paragraphs.length });
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
    novel.toc = novel.toc.filter((t) => t.num < from || t.num > to);
    novel.updatedAt = Date.now();
    novels.put(novel);
  };
  await done(tx);
}
