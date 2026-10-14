# Sistem Administrasi Dayah Babussa'adah — Versi 2.0.0

©SRISP 2026

Aplikasi web untuk **jadwal mengajar, absensi teungku, penggajian, dan kas** Dayah Babussa'adah.
HTML + JavaScript terpisah, di-hosting di **GitHub Pages** (`dayahbabussaadah.web.id`), data di **Firebase** (Authentication + Firestore).

## Halaman

| Alamat | Untuk | Isi |
|---|---|---|
| `/` (index.html) | **Semua pengunjung, tanpa login** | Jadwal mengajar per hari, kitab & materi, jadwal per teungku, jam sesi |
| `login.html` | Pengguna | Login: pilih nama dari dropdown + kata sandi |
| `setup.html` | Sekali saja | Membuat Super Admin pertama |
| `dashboard.html` | Staf | Ringkasan |
| `jadwal-mengajar.html` | Teungku, Admin, Super Admin | Memilih sesi Pagi/Malam per hari + kitab, materi, kelas |
| `absen-saya.html` | Teungku | Tombol Hadir, jadwal saya, insentif, gaji saya |
| `absensi.html` | Operator, Admin, Super Admin | Absensi per sesi, rekap bulanan, pengaturan jam sesi (Super Admin) |
| `guru.html` | Admin, Super Admin | Data teungku & tarif |
| `penggajian.html` | Bendahara, Admin, Super Admin | Hitung gaji, bayar, slip |
| `kas.html` | Bendahara, Admin, Super Admin | Kas masuk/keluar, kategori, rekap |
| `pengguna.html` | Super Admin | Akun & peran |
| `lembaga.html` | Super Admin | Profil dayah: logo, foto, nama, alamat, bendahara |
| `akun.html` | Semua pengguna | Ganti kata sandi |

Setiap halaman `xxx.html` punya file `js/xxx.js` sendiri. File bersama: `js/common.js` (login, peran, menu, sesi, jadwal), `js/firebase.js`, `js/pengaturan.js` (versi & nilai bawaan), `css/style.css`.

## 1. Siapkan Firebase (proyek `dayahdigital`)

1. **Authentication → Sign-in method → Email/Password → Enable.**
2. **Firestore Database** sudah dibuat (lokasi `asia-southeast2`).
3. **Firestore → Rules**: salin seluruh isi `firestore.rules` → **Publish**. *Wajib diulang setiap ada versi baru.*
4. **Authentication → Settings → Authorized domains**: `dayahbabussaadah.web.id` dan `dayahdigital.github.io`.

## 2. Keamanan API key

Config Firebase web memang terlihat di browser; ia hanya pengenal proyek. Data dijaga oleh login dan `firestore.rules`.
- `js/firebase-config.js` **tidak** disimpan di repo (`.gitignore`). Saat deploy, file itu dibuat dari Secret GitHub `FIREBASE_CONFIG`.
- Batasi key di Google Cloud → **Credentials → Browser key**: *Websites* `https://dayahbabussaadah.web.id/*`, `https://dayahdigital.github.io/*`, `https://dayahdigital.firebaseapp.com/*`; *API restrictions*: Identity Toolkit API, Token Service API, Cloud Firestore API.

## 3. Deploy ke GitHub Pages

1. Unggah semua isi folder ke repo (folder `.github` harus ikut).
2. **Settings → Secrets and variables → Actions** → secret `FIREBASE_CONFIG` berisi config sebagai satu baris JSON.
3. **Settings → Pages → Source: GitHub Actions**; *Custom domain*: `dayahbabussaadah.web.id`, centang *Enforce HTTPS*.
4. Setiap perubahan otomatis dideploy. Kode build tampil di kaki halaman: `Versi 2.0.0 (abcd1234) · ©SRISP 2026`, dan browser otomatis memakai file terbaru.

## 4. Peran

| Peran | Akses |
|---|---|
| **Super Admin** | Semua menu, kelola pengguna, profil dayah, jam & hari sesi |
| **Admin** | Jadwal mengajar semua teungku, Data Guru, Absensi, Penggajian, Kas |
| **Bendahara** | Penggajian, Kas (termasuk kategori) |
| **Operator Absensi** | Absensi semua teungku |
| **Teungku / Guru** | Jadwal mengajarnya sendiri, Absen Saya (tombol Hadir), insentif & status gajinya |

Akun dibuat Super Admin di menu **Pengguna**; akun teungku ditautkan ke data gurunya.

## 5. Sesi, jadwal & absensi

- Mengajar dibagi **dua sesi: Pagi dan Malam**. **Super Admin** mengatur jam mulai/selesai dan hari berjalannya di *Absensi → Pengaturan sesi Pagi & Malam*.
- **Teungku memilih jadwalnya sendiri** di *Jadwal Mengajar*: untuk tiap hari, sesi Pagi dan/atau Malam beserta **kitab, materi/bab, dan kelas**. Admin juga bisa mengatur jadwal teungku mana pun.
- Jadwal ini menentukan absensi: operator hanya melihat teungku yang terjadwal di sesi itu (badal bisa ditampilkan), dan tombol **Hadir** teungku hanya muncul untuk sesi di jadwalnya.
- Tombol Hadir aktif dari **30 menit sebelum** sesi mulai sampai **30 menit setelah** sesi selesai.
- **Insentif** dihitung dan disimpan saat absensi dicatat (tarif *Insentif per kehadiran* teungku saat itu).
- Pengaman di database: teungku hanya bisa mencatat Hadir **untuk dirinya, hari ini (WIB), sesi yang ada di jadwalnya**, dengan insentif sesuai tarif, dan tidak bisa mengubahnya lagi. Jika ditolak, aplikasi menampilkan alasannya.
- Jadwal (nama teungku, kitab, materi, kelas) tampil **publik** di halaman depan. Data gaji tidak pernah publik.

## 6. Penggajian & kas

- `Total = Gaji Pokok + Tunjangan + Insentif Kehadiran + Bonus − Potongan Alpa × Alpa − Potongan Lain` (tidak pernah minus).
- Opsi *Hitung sesi terjadwal yang tidak diabsen sebagai Alpa* — untuk sesi di jadwal yang sama sekali tidak dicatat.
- **Bayar** mencatat pengeluaran kas "Gaji Guru" dan menandai lunas sekaligus (tidak bisa tercatat ganda).
- **Kategori kas** bisa ditambah, diganti nama, dan dihapus (*Kas → Kelola kategori*). Ganti nama ikut memperbarui transaksi lama. "Gaji Guru" dikunci karena dipakai Penggajian.
- Transaksi kas bisa **diubah** dan dihapus; ada rekap per kategori. Semua laporan bisa diunduh CSV.

## Catatan

- Uji di komputer sendiri: salin `js/firebase-config.example.js` menjadi `js/firebase-config.js`, isi config, lalu jalankan lewat server lokal (mis. `npx serve .`).
- Paket gratis Firebase (Spark) cukup untuk skala dayah; gambar profil disimpan di Firestore sehingga tidak butuh Firebase Storage.
