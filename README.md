# LumenRead

_(sebelumnya: Baca Novel)_ · by **LinTendo**

Aplikasi web (PWA) untuk membaca novel dari file teks. Jalan offline, tanpa server, tanpa akun.
Semua novel disimpan di **IndexedDB browser perangkat itu sendiri** dan tidak dikirim ke mana pun.

Repo ini hanya berisi kode. Jangan commit teks novel; `.gitignore` sudah menolak `*.txt`, `*.zip`, dan `*.epub`.

## Fitur

- **Impor**: tempel teks, satu atau beberapa file `.txt`, `.zip` berisi `.txt` (diurutkan menurut nama file), atau `.epub`.
  - Teks di *Tempel teks* disimpan sebagai draf sementara, jadi tidak hilang bila browser menutup aplikasi saat pindah ke aplikasi lain (mis. Notes) untuk menyalin.
  - **EPUB** (2 & 3): tiap dokumen di urutan baca = satu chapter. Judul dari daftar isi EPUB atau judul pertama di dokumen; nomor dari `Chapter 12`, `Chapter 12, Judul`, `Bab 12`, `Ch. 12`, `12.`; dokumen tanpa nomor diberi nomor berikutnya, halaman sampul/judul yang pendek dilewati. `<br>` memisah baris, `<hr>` jadi `---`. Judul, pengarang, sinopsis, dan sampul ikut diambil.
  - Teks dipotong per baris judul `Chapter N: Judul` (juga `Chapter N - Judul`, `Chapter N`, `Bab N: Judul`, nomor desimal seperti `10.5`).
    Setelah nomor wajib ada pemisah (`:`, `-`, `.`, `—`) atau akhir baris, supaya kalimat seperti "Chapter 5 was…" tidak dianggap judul.
  - Tiap baris yang tidak kosong = satu paragraf; baris kosong diabaikan.
  - File `.txt` tanpa baris judul dianggap satu chapter; nomornya diambil dari nama file (`012.txt`, `Chapter 12 - Judul.txt`).
  - **Pratinjau** sebelum disimpan: jumlah chapter/paragraf, cuplikan isi, peringatan (teks sebelum chapter pertama, nomor kembar, nomor yang hilang, chapter kosong). Nomor yang hilang diringkas jadi rentang (mis. `245–254`). Saat menambah ke novel yang sudah ada, nomor yang sudah ada di novel tidak dihitung hilang; yang dilaporkan hanya nomor yang belum ada di novel maupun di impor (di antara nomor impor, dan antara impor dengan chapter novel terdekat sebelum/sesudahnya). Chapter bisa dicentang/dilepas.
  - Kalau nomor chapter sudah ada di novel tujuan, aplikasi bertanya per chapter: **ganti** atau **lewati** (bawaan: lewati).
- **Perpustakaan**: cari judul/pengarang, urutkan (terakhir dibaca / judul / baru ditambah), status baca (*Sedang dibaca*, *Nanti*, *Selesai*) dengan filter. Status diubah lewat menu ⋯ di kartu novel. **Menu ⋯** bergaya mewah: kepala bersampul (judul serif, penulis, garis progres & posisi baca), status baca sebagai tiga kapsul berikon dalam satu baris, lalu aksi berkelompok dengan ikon: *Baca* (Daftar isi, Info novel), *Kelola* (Impor / tambah chapter, Rapikan TL note, Ekspor & compile, Edit judul & info), dan kelompok merah untuk menghapus. Warnanya ikut gaya halaman depan / tema baca. Tiap kartu punya tombol **Daftar isi** untuk langsung memilih chapter (atau bookmark) tanpa masuk ke layar baca dulu; tombol **+** untuk menambah chapter.
- **Gaya halaman depan** (Pengaturan → *Gaya halaman depan*): **Eclipse Neon** (bawaan: hitam pekat, aksen cyan; sampul novel yang sedang dibaca jadi lukisan latar bagian atas dengan bulan & bintang, judul novel besar, ▶ *Lanjut baca*, tombol daftar isi bulat, lingkaran progres), **Royal Eclipse** (susunan sama, ungu royal), **Aurora** (latar cahaya aurora cyan-ungu, sapaan "Mau baca apa malam ini?", kartu kaca berisi sampul), atau **Klasik** (warna mengikuti tema warna baca; susunan & navigasi sama dengan gaya lain). Gaya ini hanya untuk perpustakaan, info novel, dan dialog; layar baca tetap memakai tema warna baca. Di gaya baru, kartu daftar ringkas (sampul, status, posisi, progres, ▶ dan ⋯; *Daftar isi* ada di menu ⋯) dan novel di bagian atas tidak diulang di daftar kecuali saat mencari.
  - **Scroll ringan**: gradasi latar gaya baru ada di lapisan diam terpisah, bukan `background-attachment: fixed` (yang memaksa browser melukis ulang seluruh layar di setiap frame scroll). Terukur di Chromium dengan CPU diperlambat 4×: lukis ulang saat scroll turun dari ±350 kali per 3 detik jadi 0, sama dengan Klasik.
  - **Navigasi** (semua gaya, termasuk Klasik): di HP & iPad bar bawah **Rak · Cari · ✦ · Impor · Profil** (✦ = lanjut baca novel terakhir; *Cari* langsung ke kolom cari). Di laptop (≥ 1100px) bar atas & bawah diganti **sidebar** kiri: logo, menu, kartu *Sedang dibaca* dengan *Lanjut baca*, status sinkron. Tombol `/` di keyboard langsung ke kolom cari (petunjuk `/` di sidebar hanya tampil di perangkat ber-mouse/trackpad, tidak di iPad/HP layar sentuh). Saat rak kosong, *Cari* diredupkan; diketuk (atau `/`) memunculkan penjelasan dengan tombol *Impor*. Notifikasi di gaya baru berupa kaca gelap dan muncul di atas navigasi bawah. Bar atas rak & Profil (semua gaya) bening tanpa blur dan ikut tergulir bersama halaman (tidak menempel), karena Safari iPadOS/iOS memberi efek buram sendiri di tepi atas untuk header yang menempel; judul *LumenRead* memakai serif tanpa efek cahaya.
  - **Rak kosong** (semua gaya): tetap memakai susunan & navigasi halaman depan (dulu jatuh ke tampilan Klasik). Bagian atas: logo gerhana besar (Eclipse Neon & Royal) atau kartu kaca (Aurora), *Mulai rak bukumu*, tombol **Impor novel** dan **Ambil dari perangkat lain** (membuka sinkronisasi; tulisannya ikut status: *Mengambil dari sinkronisasi…*, *Sinkronisasi aktif*, *Sinkron gagal · coba lagi*). Di bawahnya *Rak buku* berisi slot sampul kosong, slot pertama = Impor, plus contoh format `Chapter 1: Judul`. Di gaya **Klasik** susunannya sama dengan warna tema baca (tombol Impor di bar atas disembunyikan karena sudah ada di bagian atas; di tema terang tanpa bintang).
  - **Profil** (`#/profil`, tombol *Profil*): nama & foto (hanya di perangkat ini, foto dikecilkan jadi 192×192), statistik (novel, chapter terbaca, selesai, bookmark), pilihan gaya halaman depan, akses Pengaturan, Impor, Sinkronisasi, penyimpanan, dan versi. Tombol sinkron & pengaturan ada di sini (bar atas hanya berisi judul, di semua gaya).
- **Halaman depan**: tampilan **Rak** (sampul + garis progres, di bawahnya chapter terakhir & persen; ketuk sampul untuk membuka halaman novel) atau **Daftar** (kartu dengan sampul, status, chapter terakhir, garis progres), dipilih lewat tombol daftar | rak di samping urutan. Kartu & cahaya di bawah sampul diberi rona warna khas sampul novel. Kolom cari selebar layar di HP; di tablet/laptop cari, urutan, dan tampilan satu baris, kartu 2 kolom di layar ≥ 1000px. Saringan status membungkus ke baris berikut (tidak digulir), dan tata letak kartu menyesuaikan bila ukuran huruf sistem diperbesar. Tombol ✦ di tengah navigasi bawah langsung melanjutkan novel yang terakhir dibaca.
- **Layar pembuka**: logo **K2 · Kristal Ukir** (gerhana dengan piringan cahaya dan huruf L serif berukir) di dalam cincin orbit, nama LumenRead, dan tanda pembuat "by LinTendo" (gaya Foil: gradasi khas cyan → ungu → pink dengan kilau logam, serif; huruf L & T berukir seperti L di logo; di tema terang memakai versi gelap) selama 2 detik saat aplikasi dibuka (sekali per sesi; tab yang dimuat ulang, mis. ditidurkan fitur hemat memori browser, langsung terbuka). Warnanya ikut gaya halaman depan (Eclipse Neon cyan, Royal Eclipse ungu, Aurora cyan-ungu; Klasik memakai Eclipse Neon), logo & nama sedikit di atas tengah layar. Kredit yang sama ada di bawah perpustakaan.
- **Logo**: ikon aplikasi (Android, iOS, favicon) = K2 · Kristal Ukir warna Eclipse Neon (`icons/`). Di dalam aplikasi (sidebar laptop, Profil, kredit, perpustakaan kosong) memakai logo **D · Gerhana** yang warnanya ikut aksen tema. Keduanya dibuat sebagai SVG di `js/logo.js`. Arsip semua konsep logo & desain ada di repo data (privat), folder `design/`.
- **Sampul**: otomatis dari EPUB, atau menu ⋯ kartu → *Edit judul & info novel* → *Pilih sampul* (di samping judul; *Hapus* untuk kembali ke sampul otomatis) (gambar dikecilkan jadi JPEG maks 1200×1800, ±300–600 KB, tajam untuk lukisan sampul di iPad & laptop retina; sampul lama tetap ukuran lamanya dan bisa dipilih ulang agar lebih tajam). Tanpa sampul, dibuat sampul berwarna berisi judul. Sampul ikut tersinkron dan ikut masuk saat compile EPUB (bersama sinopsis).
- **Info novel** saat sampul/judul diketuk di perpustakaan (atau menu ⋯ → *Info novel*), dua pilihan di Pengaturan → *Perpustakaan* → *Saat sampul diketuk*:
  - **Popup info** (bawaan): dari bawah di HP, di tengah layar di tablet/laptop. Sampul & judul, *Lanjut baca · Chapter N*, *Edit info*, *Daftar chapter*, *Detail lengkap*, ringkasan, genre, sinopsis.
  - **Halaman lengkap**: sampul dengan latar diburamkan, judul, judul asli, penulis, penerjemah, status baca; tombol *Lanjut baca* & *Edit info*; ringkasan jumlah & rentang chapter, status cerita, bookmark, persen terbaca; genre, sinopsis, sumber; lalu **daftar chapter** langsung di halaman (cari, urutan, 📍, tab bookmark, per halaman 100). Di layar lebar (≥ 980px): info di kiri, daftar chapter di kanan.
- **Chapter bolong** di info novel (popup & halaman lengkap): nomor chapter yang belum ada di antara chapter pertama dan terakhir, diringkas jadi rentang (mis. `100, 245–254, 280`), dengan tombol *Impor chapter* untuk mengisinya. Kalau lengkap: *✓ Tidak ada chapter bolong*. Chapter desimal (mis. 10.5) tidak dihitung.
- **Info novel**: judul asli, penulis, penerjemah, status cerita (Bersambung/Tamat/Hiatus), genre, sumber/tautan, sinopsis, sampul. Diubah lewat *Edit judul & info novel*; ikut tersinkron. Penulis & penerjemah tampil di kartu, dan pencarian perpustakaan juga mencari judul asli, penerjemah, dan genre.
- **Tampilan**: 12 tema latar (termasuk *Neon*: hitam #07070d dengan aksen cyan menyala senada ikon, bawaan di semua perangkat; dan *CL*: latar #151515, teks #f9f9f7) + tema kustom (pilih warna latar & teks, dengan peringatan kontras rendah). Warna aksen tiap tema mengikuti karakter temanya (kontras ≥ 5,6:1): Terang biru gelap safir `#1e4fae`, Kertas merah anggur `#7a2e38`, Sepia cokelat kayu `#7a4b1f`, Hijau hijau hutan `#2b6649`, Biru muda biru tua `#1d4a8c`, Abu grafit `#34465c`, CL tanah liat `#e08a64`, Senja ungu muda `#c9a6e0`, Biru malam biru es `#8cb8e8`, Gelap emas sampanye `#d6b67a`, Hitam perak-biru `#8fa3c7`, Neon cyan. Tema kustom: biru gelap/lembut otomatis.
  - **Ukuran huruf** lewat tombol A−/A+ atau garis bertitik (14–34px), **jenis huruf** dan **kecerahan teks** (Terang/Sedang/Redup/Sangat redup) dari menu pilihan, jarak baris, jarak antarparagraf (px), lebar teks (hanya tampil di layar lebar ≥ 480px; di HP teks sudah selebar layar), rata kiri-kanan.
  - Huruf *Noto Serif*, *Source Serif*, dan *Roboto* disertakan di aplikasi (`fonts/`), jadi tampil sama di semua perangkat dan tetap ada saat offline. Pilihan lain bergantung pada huruf perangkat.
  - **Bawaan meniru tampilan baca aplikasi Claude** (diukur dari tangkapan layar Android): Noto Serif 18px (teks Claude ±17px) tebal 450, jarak baris 1,5, jarak paragraf 16px, tepi 20px, rata kiri; tema bawaan Neon. Setelan tipografi lama otomatis pindah ke bawaan ini sekali saat pembaruan.
- **Kembalikan ke bawaan** (tombol di bawah Pengaturan): mengembalikan semua setelan tampilan; bisa dibatalkan lewat notifikasi. Novel, bookmark, posisi, kunci, dan sinkron tidak tersentuh.
- **Kecerahan**: peredup layar. Aplikasi web tidak bisa mengubah kecerahan layar asli, jadi ini lapisan gelap di atas halaman (hanya bisa lebih redup dari setelan perangkat).
- **Bookmark**: tandai posisi (chapter + paragraf) dengan catatan opsional; daftar bookmark, penanda di paragraf dan di daftar isi. Ikut tersinkron.
- **Cari teks** di semua chapter atau chapter yang sedang dibuka; ketuk hasil untuk lompat ke paragrafnya (kata yang dicari ditandai).
- **Layar baca bersih**: tidak ada bar selama membaca. **Ketuk teks** untuk membuka **panel baca** dari bawah layar; ketuk area gelap, tombol ✕, atau gulir untuk menutupnya.
  - Isi panel: judul novel, pilihan chapter (daftar semua chapter), posisi chapter & persen terbaca, baris tombol (‹ chapter sebelumnya, perpustakaan, tombol pilihan, ⋯, chapter berikutnya ›), lalu ukuran huruf, jenis huruf, kecerahan teks, jarak baris, dan jarak antarparagraf.
- **Tombol panel bisa diatur** (Pengaturan → *Tombol di panel layar baca*): pilih tombol yang tampil dan urutannya. Semua aksi tetap ada di menu ⋯.
- **Edit teks chapter**: lewat menu ⋯ di layar baca → *Edit teks chapter ini…* (sengaja dipisah dari tombol biasa). Tiap baris tidak kosong = satu paragraf. Menutup editor dengan perubahan yang belum disimpan selalu minta konfirmasi.
- **TL note**: di kotak *Tempel teks* dan editor chapter ada tombol **+ TL note**. Blok catatan format lama (mis. `TL: …`, `T/N`, `Catatan penerjemah:`, `> TL note …`) lalu ketuk: baris judulnya diganti `TL note Chapter N` (nomor diambil dari judul chapter terdekat di atasnya / chapter yang diedit), isinya tetap. Saat dibaca, `TL note Chapter N` sampai akhir chapter tampil sebagai kotak catatan; baris pemisah seperti `---` / `—-` tampil sebagai garis.
  - Format baku di akhir chapter: `…akhir cerita` → `---` → `TL note Chapter N` → isi catatan. **Satu catatan** ditulis sebagai paragraf biasa; **lebih dari satu**, tiap catatan (= tiap paragraf) diawali `- ` (tanda lama `•`, `*`, `–`, `1.`, `1)` ikut diganti). Penanda miring/tebal Markdown di catatan (`*judul*`, `**tebal**`) dibuang. Di layar baca tampil menjorok seperti daftar, di EPUB jadi daftar berpoin. Pemisah lama (`___`, `—-`, `***`, beberapa sekaligus) diganti satu `---`, dan `---` ditambahkan bila belum ada. Pemisah adegan di tengah cerita tidak disentuh.
  - Pratinjau impor menandai chapter yang punya TL note (**TL note**) dan yang formatnya dirapikan (**TL note dirapikan**), dengan tombol *Hanya ber-TL note* dan isi TL note lengkap saat baris dibuka.
  - Ekspor .zip (txt) dan EPUB selalu memakai format baku ini, termasuk chapter lama yang belum dirapikan.
  - Pemisah `---` sebelum TL note hanya ada di **teks** (impor, editor, file .txt). Di layar baca dan EPUB tidak muncul, karena kotak TL note sudah jadi pemisah; di pratinjau impor tampil apa adanya supaya formatnya bisa dicek. Pemisah adegan di tengah cerita (mis. `***`) tetap seperti aslinya di teks dan tampil sebagai garis di layar baca/EPUB.
  - **Otomatis**: saat impor dan saat menyimpan editor chapter, TL note di akhir chapter yang diawali judul khas (`TL`, `T/N`, `TN`, `Translator's note`, `Catatan penerjemah`, `Catatan TL`) langsung dirapikan, asalkan ada setelah baris pemisah atau di paruh kedua chapter. Judul umum seperti `Note:` hanya lewat tombol, supaya kalimat cerita tidak ikut berubah.
  - Chapter yang sudah tersimpan: menu ⋯ kartu novel → **Rapikan TL note semua chapter** (menampilkan chapter mana saja sebelum disimpan).
  - Pengingat chapter sebelumnya melewati TL note dan baris pemisah, jadi yang ditampilkan paragraf cerita terakhir.
- **Kunci sentuhan**: ikon gembok di layar baca. Kontrol disembunyikan dan tap diabaikan, hanya bisa scroll (kotak pengingat chapter sebelumnya tetap bisa dibuka/dilipat, slider jumlah paragrafnya digeser, dan TL note-nya dibuka). Pindah chapter dan membuka kunci harus dengan *menahan* tombol.
- **Kunci perubahan** (Pengaturan): mode baca-saja. Edit, hapus, ganti judul, dan impor yang menimpa chapter dimatikan sampai kunci dibuka.
- **Sinkronisasi** antarperangkat lewat repo GitHub **privat** milik sendiri (lihat di bawah).
- **Pengingat chapter sebelumnya**: di awal chapter tampil N paragraf terakhir chapter sebelumnya, bisa dilipat (jumlah diatur di Pengaturan; 0 = mati). Pilihan *Langsung terbuka* hanya tampil kalau pengingat menyala.
  - **Slider bertitik** di dalam kotak (di bawah judulnya) untuk mengubah jumlah paragraf langsung (1–10) tanpa membuka Pengaturan, dengan angka di bawah tiap titik (angkanya juga bisa diketuk/diklik; di tablet & laptop slidernya selebar maks. 480px di tengah); mematikan pengingat (0) tetap lewat Pengaturan.
  - Tombol **Tutup** di tengah bawah kotak untuk melipatnya tanpa menggulir ke atas; judul chapter yang sedang dibaca tetap di posisinya di layar.
  - Hanya kalau chapter sebelumnya punya TL note, judul kotak diberi tanda *ada TL note* dan di kanan bawah kotak ada tombol **TL note** (dengan jumlah catatannya) yang membuka isinya sebagai popup.
- **Posisi baca** disimpan otomatis (chapter + paragraf), tombol/panah ←/→ untuk pindah chapter.
- **Daftar isi**: tab *Chapter* dan *Bookmark*. Cari nomor/judul, balik urutan, tombol 📍 ke chapter yang sedang dibaca, 100 chapter per halaman dengan pilihan rentang (« ‹ 201–300 › »). Judul seperti `Water and Fire (Air dan Api)` tampil dua baris: bagian dalam kurung di baris kedua yang lebih kecil.
- **Bar pindah chapter** di awal dan akhir tiap chapter (ikut tergulir bersama teks): ‹ sebelumnya, daftar pilihan semua chapter, berikutnya ›.
- **Ekspor & compile** (menu ⋯ kartu novel): pilih format lalu rentang chapter.
  - Rentang: centang *Semua chapter* (bawaan), atau lepas centangnya untuk memilih dari–sampai chapter.
  - **EPUB** (EPUB 3 + `toc.ncx` untuk pembaca lama), dengan sampul & sinopsis.
  - **.zip (txt)**: satu file .txt per chapter, untuk arsip / cadangan / pindah perangkat. Hasilnya bisa diimpor ulang apa adanya.

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
- Isi repo data: `library.json` (daftar novel, daftar isi, posisi), `novels/<id>/<blok>.json` (isi chapter per 50 nomor), dan `covers/<id>.json` (sampul). Jangan diubah manual.

## Penting soal data

- Tanpa sinkronisasi, tiap perangkat punya perpustakaan sendiri; pindahkan lewat *Ekspor & compile* → *.zip (txt)* lalu impor di perangkat lain.
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
| `js/zip.js`, `js/epub.js`, `js/epubin.js` | Baca/tulis ZIP, susun EPUB, baca EPUB untuk impor |
| `fonts/` | Huruf Noto Serif, Source Serif 4, Roboto (semuanya SIL Open Font License, `fonts/LICENSE-*`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / offline |
