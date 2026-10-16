// Pengaturan lembaga, istilah & versi aplikasi (aman masuk repo GitHub)

// Nomor versi. BUILD diisi otomatis oleh GitHub Actions (nomor build), mis. "3.0.0 · build 57".
export const APP_VERSI = "3.4.0";
export const APP_BUILD = "__BUILD__";
export const HAK_CIPTA = "©SRISP 2026";

// Istilah yang dipakai di seluruh aplikasi, slip & laporan
export const ISTILAH = {
  teungku: "Teungku",
  mukafaah: "Mukafaah",
  pokok: "Mukafaah pokok",
  tunjangan: "Tunjangan",
  kehadiran: "Mukafaah kehadiran",
  nilaiHadir: "Nilai per kehadiran",
  potonganAlpa: "Potongan per alpa",
  kategoriKas: "Mukafaah Teungku"     // kategori kas otomatis saat mukafaah diserahkan
};

// Nilai bawaan identitas lembaga. Bisa diubah Super Admin di menu Profil Dayah.
export const LEMBAGA = {
  nama: "Dayah Babussa'adah",
  alamat: "Alamat Dayah Babussa'adah",
  bendahara: "Nama Bendahara",
  pimpinan: "Nama Pimpinan Dayah"
};

// Domain internal untuk akun. Pengguna login dengan USERNAME saja;
// aplikasi mengubahnya diam-diam menjadi email internal (tidak pernah dikirimi email).
export const EMAIL_DOMAIN = "users.babussaadah.app";
