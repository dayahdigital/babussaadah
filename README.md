# Sistem Administrasi Dayah Babussa'adah

Aplikasi web untuk **penggajian guru, absensi guru, dan kas pemasukan/pengeluaran**.
Frontend HTML + JavaScript terpisah, di-hosting di **GitHub Pages**, data disimpan di **Firebase** (Authentication + Firestore).

## Struktur

```
index.html          Login (username + sandi) → js/login.js
setup.html          Buat Super Admin pertama → js/setup.js
dashboard.html      Ringkasan                → js/dashboard.js
pengguna.html       Kelola pengguna (S.Admin)→ js/pengguna.js
akun.html           Ganti kata sandi sendiri → js/akun.js
guru.html           Data guru, tarif, jadwal → js/guru.js
absensi.html        Absensi per sesi & rekap → js/absensi.js
absen-saya.html     Absen mandiri teungku    → js/absen-saya.js
penggajian.html     Hitung gaji, bayar, slip → js/penggajian.js
kas.html            Kas masuk & keluar       → js/kas.js
js/pengaturan.js       Nama lembaga, alamat, bendahara  ← EDIT DI SINI
js/firebase-config.js  Config Firebase (TIDAK diunggah ke GitHub)
js/firebase-config.example.js  Contoh bentuk config
js/firebase.js         Inisialisasi Firebase
js/common.js           Login guard, peran, menu, jadwal, helper
.github/workflows/deploy.yml   Deploy otomatis ke GitHub Pages
.gitignore             Mengecualikan js/firebase-config.js
css/style.css
firestore.rules        Aturan keamanan database
```

## 1. Siapkan Firebase (proyek `dayahdigital`)

1. **Build → Authentication → Get started → Email/Password → Enable.** Akun dibuat dari dalam aplikasi, jadi tidak perlu menambah user di Console.
2. **Build → Firestore Database → Create database** (lokasi `asia-southeast2` Jakarta).
3. Tab **Rules**: salin isi `firestore.rules` → **Publish**.
4. Edit `js/pengaturan.js`: alamat dayah dan nama bendahara.

## 2. Keamanan API key (supaya tidak di-flag)

Config Firebase web (`apiKey`, dll.) **memang dirancang terlihat di browser**. Ia hanya pengenal proyek, bukan kata sandi; data dijaga oleh login dan `firestore.rules`. Yang biasanya memicu peringatan adalah pemindai rahasia GitHub/Google saat key tersimpan di repo publik. Karena itu:

**a. Key tidak disimpan di repo.** `js/firebase-config.js` ada di `.gitignore`. Saat deploy, file itu dibuat dari **Secret** GitHub.

**b. Batasi key hanya untuk situs Anda** (pengaman yang sebenarnya). Google Cloud Console → proyek `dayahdigital` → **APIs & Services → Credentials** → klik **Browser key (auto created by Firebase)**:
- *Application restrictions* → **Websites**, tambahkan:
  - `https://USERNAME.github.io/*`
  - `https://dayahdigital.firebaseapp.com/*`
  - `http://localhost/*` dan `http://127.0.0.1/*` (uji di komputer)
- *API restrictions* → **Restrict key**, centang:
  - Identity Toolkit API
  - Token Service API
  - Cloud Firestore API
- **Save** (berlaku dalam beberapa menit).

## 3. Upload ke GitHub & aktifkan GitHub Pages

1. Buat repo baru (mis. `babussaadah`), unggah semua isi folder **kecuali `js/firebase-config.js`**. Pastikan folder `.github` ikut terunggah (folder ini tersembunyi di sebagian komputer). Dengan git, `.gitignore` otomatis mengecualikan file config:
   ```bash
   git init && git add . && git commit -m "Aplikasi administrasi Dayah Babussa'adah"
   git branch -M main
   git remote add origin https://github.com/USERNAME/babussaadah.git
   git push -u origin main
   ```
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_CONFIG`
   - Secret (satu baris JSON):
     ```
     {"apiKey":"AIzaSyAesgUQDDj02za_t8c-M0bS1BfigYi-AYI","authDomain":"dayahdigital.firebaseapp.com","projectId":"dayahdigital","storageBucket":"dayahdigital.firebasestorage.app","messagingSenderId":"1063252068248","appId":"1:1063252068248:web:7247d625903539aa494ded"}
     ```
3. Repo → **Settings → Pages → Source: GitHub Actions**.
4. Tab **Actions** → *Deploy ke GitHub Pages* → **Run workflow**. Selanjutnya berjalan otomatis setiap ada perubahan. Aplikasi tersedia di `https://USERNAME.github.io/babussaadah/`.
5. Firebase → **Authentication → Settings → Authorized domains → Add domain** → `USERNAME.github.io`.

## 4. Login & Super Admin

Pengguna login dengan **username + kata sandi** (tanpa email). Di balik layar, username diubah menjadi email internal `@users.babussaadah.app` yang tidak pernah dikirimi email.

**Setup pertama kali:** buka aplikasi → muncul tautan *Lakukan setup awal* → isi nama, username, kata sandi → akun **Super Admin** pertama dibuat dan Anda langsung masuk. Setelah itu halaman setup terkunci (dijaga oleh `firestore.rules`).

| Peran | Akses |
|---|---|
| **Super Admin** | Semua menu + **Pengguna**: tambah akun, ubah peran, reset sandi, nonaktifkan, hapus |
| **Admin** | Data Guru, Absensi, Penggajian, Kas |
| **Bendahara** | Penggajian, Kas |
| **Operator Absensi** | Absensi semua teungku |
| **Teungku / Guru** | Halaman **Absen Saya**: tombol *Hadir* per sesi & melihat insentifnya sendiri |

Semua peran bisa mengganti kata sandinya sendiri di **Akun Saya**. Jika ada yang lupa sandi, Super Admin menekan **Reset Sandi** dan memberikan sandi baru. Aplikasi selalu menjaga minimal satu Super Admin aktif dan tidak mengizinkan Super Admin menurunkan peran atau menonaktifkan dirinya sendiri.

Batasan akses tidak hanya menyembunyikan menu; aturan database (`firestore.rules`) juga menolak baca/tulis dari peran yang tidak berhak.

## 5. Model absensi & insentif

Absensi dicatat **per teungku, per tanggal, per sesi** (mis. Ba'da Subuh, Ba'da Zuhur, Ba'da Magrib — diatur Admin di bagian *Pengaturan absensi*; bila dayah menghitung per hari, cukup satu sesi "Harian"). Ada dua cara mengisi, bisa dipakai bersamaan:

**Jadwal berbeda tiap hari** diatur di dua tingkat:

- **Hari berjalannya sesi** (menu *Absensi → Pengaturan sesi & hari*). Contoh: Ba'da Subuh setiap hari, Ba'da Zuhur hanya Senin–Kamis, Ahad hanya Ba'da Subuh.
- **Jadwal mengajar tiap teungku** (menu *Data Guru* → Ubah → kotak centang sesi × hari). Contoh: Tgk. A mengajar Senin 2 sesi, Ahad 1 sesi. Teungku yang jadwalnya belum diatur dianggap mengajar semua sesi.

Dengan begitu form absensi hanya menampilkan sesi yang berjalan pada tanggal itu dan teungku yang terjadwal di sesi tersebut. Untuk **badal/pengganti**, centang *Tampilkan juga teungku yang tidak terjadwal*; barisnya ditandai *di luar jadwal* dan tetap mendapat insentif bila Hadir. Rekap bulanan menampilkan **Jadwal** (jumlah sesi yang seharusnya diajar sampai hari ini), **Belum diabsen**, dan **% Hadir**.

Bila hari sebuah sesi ditambah belakangan, centang juga hari baru itu di jadwal teungku yang mengajarnya.

Cara mengisi absensi (bisa dipakai bersamaan):

1. **Operator/Admin** mengisi H/I/S/A untuk teungku yang terjadwal di menu *Absensi*.
2. **Teungku login sendiri** (akun peran *Teungku / Guru* yang ditautkan ke data gurunya) lalu menekan **Hadir** di menu *Absen Saya*. Bisa dimatikan di Pengaturan absensi.

**Insentif dihitung saat absensi dicatat**: setiap kehadiran (status H) menyimpan `insentif` = tarif *Insentif per kehadiran* teungku tersebut saat itu. Rekap bulanan menampilkan total insentif tiap teungku, dan *Penggajian* menjumlahkan insentif ini — jadi bila tarif diubah di tengah bulan, kehadiran sebelumnya tetap memakai tarif lama.

Pengaman absen mandiri (dijaga `firestore.rules`, bukan hanya tampilan): teungku hanya bisa mencatat **dirinya sendiri**, hanya status **Hadir**, hanya untuk **tanggal hari ini (WIB)**, hanya untuk **sesi yang ada di jadwalnya hari itu**, dengan insentif **sama dengan tarifnya**, dan **tidak bisa mengubah atau menghapus** catatan setelah tersimpan. Koreksi (mis. ternyata tidak mengajar) dilakukan Operator/Admin; baris yang diisi sendiri ditandai *mandiri*.

## 6. Alur pemakaian

1. **Data Guru** — tambahkan teungku beserta gaji pokok, tunjangan, insentif per kehadiran, dan potongan per alpa.
2. **Pengguna** (Super Admin) — buat akun peran *Teungku / Guru* untuk teungku yang akan absen sendiri, tautkan ke datanya.
3. **Absensi** — atur sesi; operator mengisi/koreksi per sesi, teungku bisa absen sendiri. Rekap & total insentif bulanan otomatis.
4. **Penggajian** — pilih bulan → *Hitung dari Absensi*. Tambahkan bonus/potongan lain bila ada → *Bayar* (otomatis tercatat sebagai pengeluaran kas kategori "Gaji Guru") → *Slip* untuk mencetak slip gaji.
5. **Kas** — catat pemasukan (SPP, infaq, donatur, dll.) dan pengeluaran. Filter per bulan, unduh CSV untuk Excel.

Rumus gaji:
`Gaji Pokok + Tunjangan + Total Insentif Kehadiran + Bonus − (Potongan/Alpa × Alpa) − Potongan Lain`

## Catatan

- Mencoba di komputer sendiri: file harus dibuka lewat server (bukan klik dua kali), mis. `npx serve .` atau ekstensi *Live Server* di VS Code. Tambahkan `localhost` di Authorized domains jika belum ada.
- Untuk uji di komputer, `js/firebase-config.js` sudah berisi config `dayahdigital`. Jangan unggah file itu ke GitHub.
- Paket gratis Firebase (Spark) cukup untuk skala dayah.
