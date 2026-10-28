// Jalankan: node --test tests/
// Data uji di sini sintetis; jangan menaruh teks novel asli di repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeading, splitChapters, buildImport, decodeText, numberFromName, missingNumbers, formatTlNote, headingBefore, isTlHead, isSeparator } from '../js/parse.js';
import { readZip, writeZip, crc32 } from '../js/zip.js';
import { buildEpub } from '../js/epub.js';

test('parseHeading: format yang diterima dan ditolak', () => {
  assert.deepEqual(parseHeading('Chapter 12: Awal'), { num: 12, title: 'Awal' });
  assert.deepEqual(parseHeading('chapter 3 - Judul: dengan titik dua'), { num: 3, title: 'Judul: dengan titik dua' });
  assert.deepEqual(parseHeading('Chapter 7'), { num: 7, title: '' });
  assert.deepEqual(parseHeading('Chapter 10.5: Sisipan'), { num: 10.5, title: 'Sisipan' });
  assert.deepEqual(parseHeading('Bab 4：Lebar'), { num: 4, title: 'Lebar' });
  assert.equal(parseHeading('Chapter 5 was the best one'), null);
  assert.equal(parseHeading('Di Chapter 5: dia pergi'), null);
});

test('splitChapters: baris kosong diabaikan, tiap baris = paragraf, pembuka dicatat', () => {
  const t = '﻿Pembuka\r\n\r\nChapter 1: A\r\n  satu  \r\n\r\n\r\ndua\n   \nChapter 2: B\ntiga';
  const { chapters, preamble } = splitChapters(t);
  assert.deepEqual(preamble, ['Pembuka']);
  assert.deepEqual(chapters, [
    { num: 1, title: 'A', paragraphs: ['satu', 'dua'] },
    { num: 2, title: 'B', paragraphs: ['tiga'] },
  ]);
});

test('buildImport: tempel tanpa judul chapter menghasilkan error', () => {
  assert.ok(buildImport([{ name: null, text: 'hanya teks\nbiasa' }]).error);
});

test('buildImport: nomor kembar, nomor hilang, file tanpa judul', () => {
  const r = buildImport([
    { name: 'a.txt', text: 'Chapter 1: A\nx\nChapter 3: C\ny\nChapter 1: A lagi\nz' },
    { name: 'dir/005 - Lima.txt', text: 'isi lima\nbaris dua' },
    { name: 'catatan.txt', text: 'tanpa nomor' },
  ]);
  const nums = r.items.map((i) => i.num);
  assert.deepEqual(nums, [1, 3, 1, 5, 6]);
  assert.deepEqual(
    r.items.map((i) => !!i.dup),
    [false, false, true, false, false],
  );
  assert.equal(r.items[3].title, 'Lima');
  assert.equal(r.items[4].autoNum, true);
  assert.ok(r.warnings.some((w) => w.includes('2, 4')));
});

test('numberFromName dan missingNumbers', () => {
  assert.equal(numberFromName('Vol 2 Chapter 15.txt'), 15);
  assert.equal(numberFromName('0042.txt'), 42);
  assert.equal(numberFromName('readme.txt'), null);
  assert.deepEqual(missingNumbers([1, 2, 5, 4.5]), [3, 4]);
});

test('decodeText: utf-8, utf-16 BOM, fallback windows-1252', () => {
  assert.equal(decodeText(new TextEncoder().encode('café')), 'café');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])), 'hi');
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])), 'café');
});

test('zip: tulis lalu baca kembali (deflate & stored)', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const big = 'Paragraf uji. '.repeat(500);
  const z = await writeZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'ç/ü.txt', data: big },
  ]);
  const entries = readZip(z);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['mimetype', 'ç/ü.txt'],
  );
  assert.equal(new TextDecoder().decode(await entries[0].read()), 'application/epub+zip');
  assert.equal(new TextDecoder().decode(await entries[1].read()), big);
  // mimetype harus di offset 30 dan tidak terkompresi (syarat EPUB).
  assert.equal(new TextDecoder().decode(z.subarray(38, 58)), 'application/epub+zip');
});

test('epub: struktur dasar dan escape XML', async () => {
  const data = await buildEpub({
    title: 'Uji <&>',
    author: 'Penulis',
    lang: 'id',
    chapters: [
      { num: 1, title: 'Satu & Dua', paragraphs: ['a < b', 'kontrol\u0001hilang'] },
      { num: 2, title: '', paragraphs: ['c'] },
    ],
  });
  const files = Object.fromEntries(await Promise.all(readZip(data).map(async (e) => [e.name, new TextDecoder().decode(await e.read())])));
  assert.equal(Object.keys(files)[0], 'mimetype');
  assert.ok(files['OEBPS/content.opf'].includes('<dc:title>Uji &lt;&amp;&gt;</dc:title>'));
  assert.ok(files['OEBPS/ch0001.xhtml'].includes('<p>a &lt; b</p>'));
  assert.ok(files['OEBPS/ch0001.xhtml'].includes('<p>kontrolhilang</p>'));
  assert.ok(files['OEBPS/nav.xhtml'].includes('Chapter 1: Satu &amp; Dua'));
  assert.ok(files['OEBPS/nav.xhtml'].includes('>Chapter 2<'));
});

test('TL note: format lama dirapikan jadi "TL note Chapter N"', () => {
  const f = (t, n = 207) => formatTlNote(t, n);
  assert.equal(f('TL: Jalan raja (王道) dan jalan tiran.'), 'TL note Chapter 207\nJalan raja (王道) dan jalan tiran.');
  assert.equal(f('T/N\nJalan raja.\nJalan tiran.'), 'TL note Chapter 207\nJalan raja.\nJalan tiran.');
  assert.equal(f("Translator's Note (Ch 207): isi"), 'TL note Chapter 207\nisi');
  assert.equal(f('Catatan penerjemah Bab 207:\n\nisi'), 'TL note Chapter 207\nisi');
  assert.equal(f('> TL note Chapter 206\n> isi'), 'TL note Chapter 207\nisi');
  assert.equal(f('TL Note - Chapter 207'), 'TL note Chapter 207');
  // Tanpa judul lama: judul ditambahkan di depan, isi tidak dibuang.
  assert.equal(f('Jalan raja (王道) dan jalan tiran.'), 'TL note Chapter 207\nJalan raja (王道) dan jalan tiran.');
  assert.equal(f('Tlah lama'), 'TL note Chapter 207\nTlah lama');
  // Pemisah di depan dipertahankan; pemisah antarparagraf editor.
  assert.equal(f('—-\nTL: isi'), '—-\nTL note Chapter 207\nisi');
  assert.equal(formatTlNote('TL: a\nb', 5, '\n\n'), 'TL note Chapter 5\n\na\n\nb');
  assert.equal(formatTlNote('', null), 'TL note Chapter ?');
});

test('TL note: deteksi judul, pemisah, dan nomor chapter terdekat', () => {
  assert.equal(isTlHead('TL note Chapter 207'), true);
  assert.equal(isTlHead('tl note chapter 10.5:'), true);
  assert.equal(isTlHead('TL note Chapter 207 berisi'), false);
  assert.equal(isSeparator('—-'), true);
  assert.equal(isSeparator('* * *'), true);
  assert.equal(isSeparator('-'), false);
  const t = 'Chapter 5: A\nisi\nChapter 6: B\nisi\nTL: x';
  assert.equal(headingBefore(t, t.length), 6);
  assert.equal(headingBefore(t, 12), 5);
  assert.equal(headingBefore('tanpa judul', 5), null);
});
