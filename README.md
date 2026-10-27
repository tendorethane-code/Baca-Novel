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
- **Perpustakaan**: cari judul/pengarang, urutkan (terakhir dibaca / judul / baru ditambah), status baca (*Sedang dibaca*, *Nanti*, *Selesai*) dengan filter. Status diubah lewat menu ⋯ di kartu novel.
- **Tampilan**: 11 tema latar (termasuk *Claude*: latar #151515, teks #f9f9f7) + tema kustom (pilih warna latar & teks, dengan peringatan kontras rendah).
  - **Ukuran huruf** lewat tombol A−/A+ atau garis bertitik (14–34px), **jenis huruf** dan **kecerahan teks** (Terang/Sedang/Redup/Sangat redup) dari menu pilihan, jarak baris, jarak antarparagraf (px), lebar teks, rata kiri-kanan.
  - Huruf *Noto Serif*, *Source Serif*, dan *Roboto* disertakan di aplikasi (`fonts/`), jadi tampil sama di semua perangkat dan tetap ada saat offline. Pilihan lain bergantung pada huruf perangkat.
  - **Bawaan meniru tampilan baca aplikasi Claude** (diukur dari tangkapan layar Android): Noto Serif 17px tebal 450, jarak baris 1,5, jarak paragraf 16px, tepi 20px, rata kiri; di mode gelap memakai tema Claude. Setelan tipografi lama otomatis pindah ke bawaan ini sekali saat pembaruan.
- **Kembalikan ke bawaan** (tombol di bawah Pengaturan): mengembalikan semua setelan tampilan; bisa dibatalkan lewat notifikasi. Novel, bookmark, posisi, kunci, dan sinkron tidak tersentuh.
- **Kecerahan**: peredup layar. Aplikasi web tidak bisa mengubah kecerahan layar asli, jadi ini lapisan gelap di atas halaman (hanya bisa lebih redup dari setelan perangkat).
- **Bookmark**: tandai posisi (chapter + paragraf) dengan catatan opsional; daftar bookmark, penanda di paragraf dan di daftar isi. Ikut tersinkron.
- **Cari teks** di semua chapter atau chapter yang sedang dibuka; ketuk hasil untuk lompat ke paragrafnya (kata yang dicari ditandai).
- **Tombol bar bisa diatur** (Pengaturan → *Tombol di bar layar baca*): pilih tombol yang tampil dan urutannya. Semua aksi tetap ada di menu ⋯.
- **Edit teks chapter**: lewat menu ⋯ di layar baca → *Edit teks chapter ini…* (sengaja dipisah dari tombol biasa). Tiap baris tidak kosong = satu paragraf. Menutup editor dengan perubahan yang belum disimpan selalu minta konfirmasi.
- **Kunci sentuhan**: ikon gembok di layar baca. Kontrol disembunyikan dan tap diabaikan, hanya bisa scroll. Pindah chapter dan membuka kunci harus dengan *menahan* tombol.
- **Kunci perubahan** (Pengaturan): mode baca-saja. Edit, hapus, ganti judul, dan impor yang menimpa chapter dimatikan sampai kunci dibuka.
- **Sinkronisasi** antarperangkat lewat repo GitHub **privat** milik sendiri (lihat di bawah).
- **Pengingat chapter sebelumnya**: di awal chapter tampil N paragraf terakhir chapter sebelumnya, bisa dilipat (jumlah diatur di menu Tampilan; 0 = mati).
- **Posisi baca** disimpan otomatis (chapter + paragraf), **daftar isi** dengan pencarian, tombol/panah ←/→ untuk pindah chapter.
- **Compile EPUB** dari rentang chapter (EPUB 3 + `toc.ncx` untuk pembaca lama).
- **Ekspor .zip (txt)**: cadangan / pindah ke perangkat lain. Hasilnya bisa diimpor ulang apa adanya.

## Sinkronisasi

Novel, chapter, hasil edit, hapusan, posisi baca, bookmark, dan status baca bisa disamakan di semua perangkat lewat repo GitHub **privat**
yang **terpisah** dari repo kode ini. Pengaturan tampilan dan kunci tidak ikut (tiap perangkat boleh beda).

1. Buat repo baru di <https://github.com/new>, misalnya `baca-novel-data`, pilih **Private**.
2. Buat token di <https://github.com/settings/personal-access-tokens/new>:
   *Repository access* → **Only select repositories** → repo data tadi;
   *Permissions → Repository permissions* → **Contents: Read and write**. Salin tokennya.
3. Di aplikasi, ketuk ikon panah melingkar → isi repo dan token → *Hubungkan*.
4. Di perangkat lain, ulangi langkah 2–3. Paling mudah buat token baru langsung di perangkat itu (token hanya ditampilkan sekali, dan tiap token bisa dicabut sendiri-sendiri).

Catatan:
- Aplikasi menolak repo publik.
- Token disimpan di browser tiap perangkat dan hanya dikirim ke `api.github.com`. Karena hanya bisa mengakses repo data, kebocoran token tidak membuka repo lain. Saat token kedaluwarsa, buat yang baru dan hubungkan ulang.
- Aturan bentrok: versi chapter yang lebih baru menang, posisi baca yang paling baru menang, hapusan menang kalau lebih baru dari versi mana pun.
- Impor novel di **satu** perangkat saja; novel yang sama diimpor terpisah di dua perangkat akan jadi dua novel.
- Isi repo data: `library.json` (daftar novel, daftar isi, posisi) dan `novels/<id>/<blok>.json` (isi chapter per 50 nomor). Jangan diubah manual.

## Penting soal data

- Tanpa sinkronisasi, tiap perangkat punya perpustakaan sendiri; pindahkan lewat *Ekspor .zip (txt)* lalu impor di perangkat lain.
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
- Service worker memakai strategi *jaringan dulu*: saat online, file aplikasi selalu diambil versi terbaru (dan salinan offline diperbarui); saat offline dipakai salinan terakhir. Tidak ada nomor versi yang perlu dinaikkan. Kalau menambah file baru, daftarkan di `FILES` dalam `sw.js` supaya ikut tersedia offline.

| File | Isi |
| --- | --- |
| `index.html`, `css/app.css` | Kerangka halaman dan gaya (warna tema diisi lewat variabel CSS dari `js/app.js`) |
| `js/app.js` | Antarmuka: perpustakaan, impor/pratinjau/konflik, pembaca, pengaturan, ekspor |
| `js/parse.js` | Dekode teks, potong chapter, susun hasil impor |
| `js/db.js` | Penyimpanan IndexedDB |
| `js/merge.js`, `js/sync.js` | Aturan gabung data antarperangkat, sinkron ke repo GitHub privat |
| `js/zip.js`, `js/epub.js` | Baca/tulis ZIP, susun EPUB |
| `fonts/` | Huruf Noto Serif, Source Serif 4, Roboto (semuanya SIL Open Font License, `fonts/LICENSE-*`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / offline |
