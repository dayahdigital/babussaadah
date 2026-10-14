// Pengaturan lembaga & versi aplikasi (aman masuk repo GitHub)

// Versi aplikasi. BUILD diganti otomatis saat deploy (kode commit), jadi mudah dicek versi mana yang tampil.
export const APP_VERSI = "2.0.1";
export const APP_BUILD = "__BUILD__";
export const HAK_CIPTA = "©SRISP 2026";

// Nilai bawaan identitas lembaga. Bisa diubah Super Admin di menu Profil Dayah.
export const LEMBAGA = {
  nama: "Dayah Babussa'adah",
  alamat: "Alamat Dayah Babussa'adah",
  bendahara: "Nama Bendahara"
};

// Domain internal untuk akun. Pengguna login dengan USERNAME saja;
// aplikasi mengubahnya diam-diam menjadi email internal (tidak pernah dikirimi email).
export const EMAIL_DOMAIN = "users.babussaadah.app";
