// Migrasi v4.0.0 — aman, idempoten, dan dijalankan eksplisit oleh Super Admin.
// Tidak berisi kredensial live. Jalankan dari UI atau gunakan Firebase Admin SDK di lingkungan deploy.
import { db, collection, getDocs, writeBatch, doc, serverTimestamp } from "./firebase.js";
import { unitIdAktif } from "./common.js";

export const KOLEKSI_OPERASIONAL_V4 = [
  "guru", "mengajar", "riwayat_jadwal", "absensi", "selfie", "hadir_publik", "izin",
  "gaji", "kas", "bukti", "ringkasan", "pengumuman", "notifikasi", "log", "config"
];

export async function backfillUnitInduk({ dryRun = false, onProgress = () => {} } = {}) {
  let ditemukan = 0, diubah = 0;
  for (const nama of KOLEKSI_OPERASIONAL_V4) {
    const snap = await getDocs(collection(db, nama));
    const perlu = snap.docs.filter(d => !d.data()?.unitId);
    ditemukan += perlu.length;
    if (!dryRun) {
      for (let i = 0; i < perlu.length; i += 400) {
        const batch = writeBatch(db);
        perlu.slice(i, i + 400).forEach(d => batch.update(doc(db, nama, d.id), {
          unitId: "unit-induk", migrasiV4: true, migrasiV4Pada: serverTimestamp()
        }));
        if (perlu.length) { await batch.commit(); diubah += Math.min(400, perlu.length - i); }
      }
    }
    onProgress({ nama, ditemukan: perlu.length, diubah: dryRun ? 0 : perlu.length });
  }
  return { ditemukan, diubah, unitId: unitIdAktif() };
}

// CLI/documentation helper: file ini sengaja tidak mengeksekusi migrasi otomatis.
export const CATATAN_MIGRASI = "Migrasi live memerlukan login Super Admin dan Rules v4 yang sudah dipublish.";
