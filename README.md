# Baca Novel

Aplikasi web (PWA) untuk membaca novel dari file teks. Jalan offline, tanpa server, tanpa akun.
Semua novel disimpan di **IndexedDB browser perangkat itu sendiri** dan tidak dikirim ke mana pun.

Repo ini hanya berisi kode. Jangan commit teks novel; `.gitignore` sudah menolak `*.txt`, `*.zip`, dan `*.epub`.

## Fitur

- **Impor**: tempel teks, satu atau beberapa file `.txt`, atau `.zip` berisi `.txt` (diurutkan menurut nama file).
  - Teks dipotong per baris judul `Chapter N: Judul` (juga `Chapter N - Judul`, `Chapter N`, `Bab N: Judul`, nomor desimal seperti `10.5`).
    Setelah nomor wajib ada pemisah (`:`, `-`, `.`, `—`) atau akhir baris, supaya kalimat seperti "Chapter 5 was…" tidak dianggap judul.
  - Tiap baris yang tidak kosong = satu paragraf; baris kosong diabaikan.
  - File `.txt` tanpa baris judul dianggap satu chapter; nomornya diambil dari nama file (`012.txt`, `Chapter 12 - Judul.txt`).
  - **Pratinjau** sebelum disimpan: jumlah chapter/paragraf, cuplikan isi, peringatan (teks sebelum chapter pertama, nomor kembar, nomor yang hilang, chapter kosong). Chapter bisa dicentang/dilepas.
  - Kalau nomor chapter sudah ada di novel tujuan, aplikasi bertanya per chapter: **ganti** atau **lewati** (bawaan: lewati).
- **Tampilan**: tema terang/sepia/gelap, jenis huruf, ukuran, jarak baris, lebar teks, rata kiri-kanan.
- **Pengingat chapter sebelumnya**: di awal chapter tampil N paragraf terakhir chapter sebelumnya, bisa dilipat (jumlah diatur di menu Tampilan; 0 = mati).
- **Posisi baca** disimpan otomatis (chapter + paragraf), **daftar isi** dengan pencarian, tombol/panah ←/→ untuk pindah chapter.
- **Compile EPUB** dari rentang chapter (EPUB 3 + `toc.ncx` untuk pembaca lama).
- **Ekspor .zip (txt)**: cadangan / pindah ke perangkat lain. Hasilnya bisa diimpor ulang apa adanya.

## Penting soal data

- Data **tidak tersinkron** antarperangkat. HP, iPad, dan laptop masing-masing punya perpustakaan sendiri; pindahkan lewat *Ekspor .zip (txt)* lalu impor di perangkat lain.
- **iPhone/iPad (Safari)**: tambahkan ke Layar Utama (Bagikan → *Add to Home Screen*). Safari bisa menghapus data situs yang tidak dibuka selama 7 hari jika *tidak* dipasang di Layar Utama.
- Menghapus data situs/riwayat browser akan menghapus novel. Rutin ekspor cadangan untuk novel yang penting.

## Hosting di GitHub Pages

Tidak perlu build. Setelah kode ada di branch `main`:

1. Buka **Settings → Pages** di repo.
2. *Source*: **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
3. Tunggu sebentar; aplikasi ada di `https://<username>.github.io/<nama-repo>/`.

Semua path relatif, jadi aplikasi jalan di subfolder Pages. File `.nojekyll` mencegah Jekyll memproses repo.

## Pengembangan

```sh
python3 -m http.server 8000     # lalu buka http://localhost:8000
node --test tests/*.test.mjs    # unit test parser, zip, dan EPUB
```

- Tanpa dependensi dan tanpa build: HTML, CSS, dan ES module biasa. ZIP dibaca/ditulis sendiri (`js/zip.js`) memakai `DecompressionStream`/`CompressionStream` bawaan browser.
- Butuh browser modern: Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 113+.
- **Setiap kali mengubah file aplikasi, naikkan `VERSION` di `sw.js`**. Kalau tidak, perangkat yang sudah memasang aplikasi tetap memakai versi lama dari cache. Setelah versi baru terdeteksi, aplikasi menawarkan tombol *Muat ulang*.

| File | Isi |
| --- | --- |
| `index.html`, `css/app.css` | Kerangka halaman dan gaya (tema lewat `data-theme`) |
| `js/app.js` | Antarmuka: perpustakaan, impor/pratinjau/konflik, pembaca, pengaturan, ekspor |
| `js/parse.js` | Dekode teks, potong chapter, susun hasil impor |
| `js/db.js` | Penyimpanan IndexedDB |
| `js/zip.js`, `js/epub.js` | Baca/tulis ZIP, susun EPUB |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / offline |
