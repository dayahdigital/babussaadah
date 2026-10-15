// Backup & pemulihan data (Super Admin). Dipakai halaman Backup dan pengecekan otomatis di Beranda.
import { db, collection, getDocs, getDoc, doc, setDoc, writeBatch, serverTimestamp, Timestamp } from "./firebase.js";
import { today, toast, catatLog, profilAktif } from "./common.js";
import { APP_VERSI } from "./pengaturan.js";

export const KOLEKSI = ["config", "users", "usernames", "guru", "mengajar", "riwayat_jadwal", "absensi", "izin", "gaji",
  "kas", "ringkasan", "pengumuman", "notifikasi", "log"];
export const KOLEKSI_FOTO = ["bukti", "selfie"];

// Timestamp Firestore ↔ JSON
const keJSON = (v) => v instanceof Timestamp ? { __ts: v.toMillis() }
  : Array.isArray(v) ? v.map(keJSON)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keJSON(x)])) : v;
const dariJSON = (v) => v && typeof v === "object" && !Array.isArray(v) && "__ts" in v ? Timestamp.fromMillis(v.__ts)
  : Array.isArray(v) ? v.map(dariJSON)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dariJSON(x)])) : v;

export async function buatBackup({ denganFoto = false, kemajuan = () => {} } = {}) {
  const daftar = denganFoto ? [...KOLEKSI, ...KOLEKSI_FOTO] : KOLEKSI;
  const isi = {};
  let total = 0;
  for (const [i, k] of daftar.entries()) {
    kemajuan(`Membaca ${k} (${i + 1}/${daftar.length})...`);
    const s = await getDocs(collection(db, k));
    isi[k] = s.docs.map(d => ({ id: d.id, data: keJSON(d.data()) }));
    total += s.size;
  }
  const berkas = { aplikasi: "Dayah Babussa'adah", versi: APP_VERSI, dibuat: new Date().toISOString(), denganFoto, jumlahDokumen: total, koleksi: isi };
  const blob = new Blob([JSON.stringify(berkas)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-babussaadah-${today()}${denganFoto ? "-lengkap" : ""}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  await setDoc(doc(db, "config", "backup"), { terakhir: today(), terakhirWaktu: serverTimestamp(), oleh: profilAktif()?.nama || "", jumlahDokumen: total }, { merge: true });
  catatLog("Backup", "Unduh backup", `${total} dokumen${denganFoto ? " (dengan foto)" : ""}`);
  return { total, ukuran: blob.size };
}

export async function pulihkan(berkas, { kemajuan = () => {} } = {}) {
  if (!berkas?.koleksi) throw new Error("File bukan backup aplikasi ini.");
  let n = 0;
  for (const [k, docs] of Object.entries(berkas.koleksi)) {
    if (k === "log") continue;   // log tidak bisa ditulis ulang (dilindungi aturan)
    for (let i = 0; i < docs.length; i += 400) {
      const b = writeBatch(db);
      docs.slice(i, i + 400).forEach(d => b.set(doc(db, k, d.id), dariJSON(d.data)));
      await b.commit();
      n += Math.min(400, docs.length - i);
      kemajuan(`Memulihkan ${k}: ${n} dokumen...`);
    }
  }
  catatLog("Backup", "Pulihkan dari backup", `${n} dokumen dari file ${berkas.dibuat}`);
  return n;
}

// Backup otomatis: dipanggil saat Super Admin membuka Beranda
export async function cekBackupOtomatis() {
  try {
    const s = await getDoc(doc(db, "config", "backup"));
    const c = s.exists() ? s.data() : {};
    const interval = Number(c.intervalHari ?? 7);
    if (!interval) return;
    const lalu = c.terakhir ? (Date.parse(today()) - Date.parse(c.terakhir)) / 86400000 : Infinity;
    if (lalu < interval) return;
    toast("Backup otomatis sedang dibuat & diunduh...", "info");
    const { total } = await buatBackup();
    toast(`Backup otomatis selesai (${total} dokumen). Simpan file di tempat aman (mis. Google Drive).`);
  } catch (ex) { console.warn("Backup otomatis gagal", ex); }
}
