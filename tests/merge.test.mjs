// Jalankan: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNovel, novelActivity, maxMerge } from '../js/merge.js';

const novel = (over) => ({ id: 'n1', title: 'A', createdAt: 1, updatedAt: 1, mu: 1, toc: [], del: {}, lastRead: null, ...over });
const ch = (num, u, title = `T${num}`) => ({ num, title, n: 1, u });

test('chapter: versi lebih baru menang, versi sama ditandai same', () => {
  const L = novel({ toc: [ch(1, 10), ch(2, 30), ch(3, 5)] });
  const R = novel({ toc: [ch(1, 10), ch(2, 20), ch(3, 50, 'baru'), ch(4, 7)] });
  const { novel: m, chapters } = mergeNovel(L, R);
  assert.deepEqual(
    [...chapters].map(([n, c]) => `${n}:${c.from}`),
    ['1:same', '2:L', '3:R', '4:R'],
  );
  assert.equal(m.toc.find((t) => t.num === 3).title, 'baru');
  assert.deepEqual(
    m.toc.map((t) => t.num),
    [1, 2, 3, 4],
  );
});

test('hapusan menang bila lebih baru; impor ulang setelah hapus menghidupkan lagi', () => {
  const L = novel({ toc: [ch(1, 10)], del: { 2: 40 } });
  const R = novel({ toc: [ch(1, 10), ch(2, 30)] });
  let r = mergeNovel(L, R);
  assert.equal(r.chapters.get(2).from, 'del');
  assert.equal(r.chapters.get(2).r, true);
  assert.deepEqual(r.novel.del, { 2: 40 });
  assert.deepEqual(
    r.novel.toc.map((t) => t.num),
    [1],
  );

  r = mergeNovel(novel({ toc: [ch(2, 50)] }), novel({ del: { 2: 40 } }));
  assert.equal(r.chapters.get(2).from, 'L');
  assert.deepEqual(r.novel.del, {});
});

test('posisi baca & metadata: yang terbaru menang', () => {
  const L = novel({ title: 'Lama', mu: 5, lastRead: { num: 3, para: 1, at: 100 } });
  const R = novel({ title: 'Baru', mu: 9, lastRead: { num: 9, para: 4, at: 90 } });
  const { novel: m } = mergeNovel(L, R);
  assert.equal(m.title, 'Baru');
  assert.deepEqual(m.lastRead, { num: 3, para: 1, at: 100 });
});

test('novel hanya ada di satu sisi', () => {
  const { novel: m, chapters } = mergeNovel(undefined, novel({ toc: [ch(1, 3)] }));
  assert.equal(m.id, 'n1');
  assert.equal(chapters.get(1).from, 'R');
  assert.equal(mergeNovel(novel({ toc: [ch(1, 3)] }), undefined).chapters.get(1).from, 'L');
});

test('data lama tanpa stempel waktu memakai updatedAt', () => {
  const L = novel({ updatedAt: 70, toc: [{ num: 1, title: 'x', n: 1 }] });
  const R = novel({ toc: [ch(1, 60)] });
  assert.equal(mergeNovel(L, R).chapters.get(1).from, 'L');
});

test('novelActivity & maxMerge', () => {
  assert.equal(novelActivity(novel({ mu: 3, toc: [ch(1, 8)] })), 8);
  assert.deepEqual(maxMerge({ a: 1, b: 5 }, { a: 3, c: 2 }), { a: 3, b: 5, c: 2 });
});
