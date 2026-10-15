import { db, doc, getDoc, setDoc } from "./firebase.js";
import { requireAuth, AKSES, aksi, toast, tglIndo, catatLog, tampilError } from "./common.js";
import { buatBackup, pulihkan } from "./cadangan.js";

await requireAuth(AKSES.backup);
const status = document.getElementById("status");
let berkas = null;

async function muatStatus() {
  try {
    const s = await getDoc(doc(db, "config", "backup"));
    const c = s.exists() ? s.data() : {};
    document.getElementById("interval").value = String(c.intervalHari ?? 7);
    status.innerHTML = c.terakhir
      ? `Backup terakhir: <b>${tglIndo(c.terakhir)}</b> oleh ${c.oleh || "-"} (${c.jumlahDokumen || "?"} dokumen).`
      : `<span class="teks-peringatan">Belum pernah backup. Disarankan unduh sekarang.</span>`;
  } catch (ex) { tampilError(ex); }
}
document.getElementById("btnSimpanInterval").onclick = (e) => aksi(e.target, async () => {
  const v = Number(document.getElementById("interval").value);
  await setDoc(doc(db, "config", "backup"), { intervalHari: v }, { merge: true });
  catatLog("Backup", "Ubah jadwal backup otomatis", v ? `setiap ${v} hari` : "dimatikan");
  toast("Pengaturan backup tersimpan");
});
document.getElementById("btnBackup").onclick = (e) => aksi(e.target, async () => {
  const el = document.getElementById("kemajuan");
  const { total, ukuran } = await buatBackup({ denganFoto: document.getElementById("denganFoto").checked, kemajuan: (t) => el.textContent = t });
  el.textContent = `Selesai: ${total} dokumen, ${(ukuran / 1024 / 1024).toFixed(2)} MB.`;
  muatStatus();
}, "Membuat backup...");
document.getElementById("fileBackup").onchange = async (e) => {
  const f = e.target.files[0];
  berkas = null;
  document.getElementById("btnPulihkan").disabled = true;
  if (!f) return;
  try {
    berkas = JSON.parse(await f.text());
    if (!berkas.koleksi) throw new Error("File bukan backup aplikasi ini.");
    document.getElementById("kemajuan2").textContent = `File backup ${new Date(berkas.dibuat).toLocaleString("id-ID")} · ${berkas.jumlahDokumen} dokumen · versi ${berkas.versi}`;
    document.getElementById("btnPulihkan").disabled = false;
  } catch (ex) { tampilError(ex, "File tidak bisa dibaca"); }
};
document.getElementById("btnPulihkan").onclick = (e) => {
  if (!berkas || !confirm("Pulihkan data dari file ini? Data dengan ID yang sama akan DITIMPA.")) return;
  if (prompt('Ketik PULIHKAN untuk melanjutkan') !== "PULIHKAN") return;
  aksi(e.target, async () => {
    const n = await pulihkan(berkas, { kemajuan: (t) => document.getElementById("kemajuan2").textContent = t });
    toast(`${n} dokumen dipulihkan`);
  }, "Memulihkan...");
};
muatStatus();
