# Sistem Administrasi Dayah Babussa'adah — Versi 3.1.1

©SRISP 2026 · Situs: `dayahbabussaadah.web.id` · GitHub Pages + Firebase (Authentication + Firestore)

## Isi aplikasi

| Halaman | Untuk | Isi |
|---|---|---|
| `index.html` (halaman depan) | Semua pengunjung | Teks berjalan, mading, jadwal mengajar per hari / kitab / teungku, riwayat perubahan jadwal, login |
| `dashboard.html` | Staf | Ringkasan hari ini, pengajian per sesi, grafik kehadiran & kas 6 bulan, backup otomatis |
| `absen-saya.html` | Teungku | Absen dengan **selfie live** (jam server), izin/sakit, jadwal, riwayat, mukafaah & slip |
| `izin.html` | Pimpinan Dayah | Menyetujui / menolak izin & sakit |
| `absensi.html` | Operator, Admin | Absensi per sesi (HISA), selfie, rekap, PDF/Excel; **Super Admin**: jam & hari sesi, toleransi |
| `jadwal-mengajar.html` | Teungku, Admin | Pilih sesi Pagi/Malam + kitab, materi, kelas; riwayat perubahan |
| `teungku.html` | Admin | Data teungku, mukafaah pokok, nilai per kehadiran |
| `mukafaah.html` | Bendahara, Admin | Hitung, serahkan (terkunci), slip PDF islami, kirim WhatsApp |
| `kas.html` | Bendahara, Admin | Kas per bulan, bukti foto, kategori, laporan bulanan/tahunan |
| `pengumuman.html` | Admin | Teks berjalan & mading |
| `pengguna.html`, `lembaga.html`, `log.html`, `backup.html` | Super Admin | Akun, profil dayah, log aktivitas, backup |
| `panduan.html` | Semua | Panduan per peran |
| `setup.html` | Sekali | Super Admin pertama |

Setiap halaman `xxx.html` punya `js/xxx.js`. Modul bersama: `js/common.js`, `js/laporan.js` (PDF/Excel), `js/kamera.js` (selfie), `js/cadangan.js` (backup). Pustaka PDF/Excel ada di `js/vendor/` (MIT). PWA: `manifest.webmanifest`, `sw.js`, `icons/`.

## Baru di 3.1.1
- Satu tombol **Install Aplikasi** (Android/PC langsung muncul dialog install; iPhone menampilkan 2 langkah karena aturan Apple).
- Masuk Super Admin: tulisan **Pengelola** di samping *Panduan*.
- Pilihan model jadwal disembunyikan di tombol **Tampilan**; model bawaan diatur Super Admin di *Profil Dayah*.
- **Penting:** folder `icons/` wajib ikut diunggah (logo memuat, ikon aplikasi, dan syarat tombol install).

## Baru di 3.1.0
- Halaman depan baru: logo dayah, nama Arab, animasi memuat, petunjuk **Pasang aplikasi** (Android / iPhone / Komputer) di bawah kotak masuk.
- **Masuk cukup kata sandi**: username diisi sekali per perangkat, lalu diingat. *Ganti akun* untuk perangkat bersama.
- Super Admin masuk lewat tombol **Pengelola** di bawah halaman depan (tidak lagi ketuk 5×).
- Jadwal publik punya 7 model tampilan: **Roster** (bawaan), Kartu, Papan pengumuman (bisa layar penuh untuk TV), Tabel ala Excel (+PDF/Excel), Per kitab, Per teungku, Riwayat. Setiap entri menulis Tanggal, Kitab, Materi/Bab, Tempat, Kelas.
- Kolom baru **Tempat** pada jadwal mengajar.
- Teks berjalan pindah ke kaki halaman, selalu terlihat saat digulir.
- Panduan hanya menampilkan bagian sesuai peran yang masuk.
- **Tema warna** (Hijau Zamrud / Biru Malam / Krem Kitab) dan nama Arab diatur di *Profil Dayah*.
- Perbaikan tampilan terpotong saat digulir; ikon gambar menggantikan emoji (rapi di Windows 7).

## Peran

| Peran | Akses |
|---|---|
| **Super Admin** | Semua. Masuk lewat **Pintu Pengelola**: di halaman depan **ketuk logo dayah 5 kali**. Login biasa menolak akun Super Admin. Hanya Super Admin yang bisa mengubah/membatalkan mukafaah yang sudah diserahkan. |
| **Pimpinan Dayah** | Menyetujui izin & sakit |
| **Admin** | Teungku, Jadwal, Absensi, Mukafaah, Kas, Pengumuman |
| **Bendahara** | Mukafaah, Kas |
| **Operator Absensi** | Absensi |
| **Teungku** | Absen (selfie wajib), jadwal sendiri, izin/sakit, mukafaah & slip sendiri |

## Memasang / memperbarui

1. Unggah **semua** isi folder ke repo (termasuk `js/firebase-config.js`, `js/vendor/`, `icons/`, `sw.js`, `manifest.webmanifest`). Hapus file lama yang tidak ada lagi: `js/login.js`, `js/publik.js`, `js/guru.js`, `js/penggajian.js`.
2. **Firebase → Firestore → Rules**: salin seluruh `firestore.rules` (baris 2: *versi 3.0.0*) → **Publish**. *Wajib.*
3. **Super Admin → Absensi → Pengaturan sesi → Simpan** sekali, agar jam sesi tersimpan untuk pemeriksaan server.
4. **Super Admin → Pengguna**: buka sekali (merapikan data login lama), buat akun **Pimpinan Dayah**, dan **Super Admin kedua** sebagai cadangan.
5. Isi **Profil Dayah** (logo, alamat, nama pimpinan & bendahara — dipakai di laporan).

**Nomor build otomatis (opsional, disarankan):** Settings → Pages → Source: **GitHub Actions**. Workflow `.github/workflows/deploy.yml` mengisi nomor build (tampil di kaki halaman: `Versi 3.1.0 · build 12`). Tanpa ini tetap jalan dengan "Deploy from a branch".

Pembaruan file otomatis sampai ke HP: service worker selalu mengambil file terbaru saat online (tidak perlu `?v=`).

## Absensi
- Dua sesi (nama bebas, default Pagi & Malam). Jam mulai/selesai bebas; bila selesai < mulai, sesi berakhir esok hari.
- **Jam server**, bukan jam HP. Database menolak absen di luar jendela sesi (± toleransi yang diatur Super Admin), sesi yang tidak ada di jadwal teungku, tanpa selfie, atau selfie lama.
- Persetujuan izin tidak pernah menimpa catatan Hadir.
- Jadwal punya **tanggal berlaku**, jadi rekap bulan lalu tidak berubah ketika jadwal diganti. Semua perubahan jadwal tercatat dan terlihat publik.

## Keuangan
- `Mukafaah = pokok + tunjangan + mukafaah kehadiran + bonus − potongan alpa × alpa − potongan lain` (tidak pernah minus).
- **Serahkan** = catat kas "Mukafaah Teungku" + kunci, dalam satu transaksi.
- Kas memuat per bulan; saldo dari `ringkasan/kas` (tombol *Hitung ulang* bila perlu). Bukti foto disimpan kecil (≤ ±280 KB) di Firestore.
- Semua kolom uang otomatis bertitik (1.250.000).

## Keamanan & catatan
- Log aktivitas tidak bisa diubah/dihapus siapa pun.
- Daftar username tidak bisa dibaca publik.
- **Hapus pengguna / reset sandi**: akun lama ditutup dan disembunyikan di aplikasi. Akun login lamanya masih tersisa di *Firebase Console → Authentication* (aplikasi tanpa server tidak bisa menghapusnya); boleh dihapus manual di sana, tidak berbahaya bila dibiarkan.
- **Notifikasi** muncul di lonceng 🔔 dan sebagai notifikasi HP selama aplikasi terbuka/di latar. Notifikasi saat aplikasi tertutup penuh butuh server (paket Blaze).
- **Backup otomatis** berjalan saat Super Admin membuka Beranda sesuai jadwal (default 7 hari) dan mengunduh file `.json`. Simpan di tempat aman — berisi data mukafaah & akun.
- Aturan database belum diuji di emulator Firebase (tidak bisa diunduh di lingkungan pengembangan); uji alur penting setelah Publish.
