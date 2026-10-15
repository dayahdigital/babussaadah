import { db, collection, getDocs, query, where } from "./firebase.js";
import { requireAuth, AKSES, thisMonth, namaBulan, esc, PERAN, aksi, tampilError, waktuIndo } from "./common.js";

await requireAuth(AKSES.log);
const inBulan = document.getElementById("bulan");
const selModul = document.getElementById("modul");
inBulan.value = thisMonth();
let semua = [], tampilRows = [];

async function muat() {
  const b = inBulan.value;
  try {
    const s = await getDocs(query(collection(db, "log"), where("tanggal", ">=", `${b}-01`), where("tanggal", "<=", `${b}-31`)));
    semua = s.docs.map(d => d.data()).sort((a, c) => (c.waktu?.toMillis?.() || 0) - (a.waktu?.toMillis?.() || 0));
    const modul = [...new Set(semua.map(l => l.modul))].sort();
    const pilih = selModul.value;
    selModul.innerHTML = `<option value="">Semua (${semua.length})</option>` + modul.map(m => `<option>${esc(m)}</option>`).join("");
    if (modul.includes(pilih)) selModul.value = pilih;
    tampil();
  } catch (ex) { tampilError(ex, "Gagal memuat log"); }
}
function tampil() {
  const m = selModul.value, q = document.getElementById("cari").value.toLowerCase();
  tampilRows = semua.filter(l => (!m || l.modul === m) && `${l.nama} ${l.username} ${l.aksi} ${l.detail}`.toLowerCase().includes(q));
  document.getElementById("daftar").innerHTML = tampilRows.length ? tampilRows.slice(0, 500).map(l => `
    <div class="log-baris"><div class="waktu">${waktuIndo(l.waktu) || l.tanggal}</div>
      <div><span class="modul">${esc(l.modul)}</span><b>${esc(l.aksi)}</b> — ${esc(l.detail)}
        <div class="kecil muted">oleh ${esc(l.nama)} (@${esc(l.username)} · ${esc(PERAN[l.peran] || l.peran)})</div></div></div>`).join("")
    : `<p class="empty">Tidak ada aktivitas.</p>`;
}
const dataLap = () => ({
  judul: "LOG AKTIVITAS APLIKASI", sub: `Bulan ${namaBulan(inBulan.value)}${selModul.value ? " · modul " + selModul.value : ""}`, lanskap: true,
  kolom: ["No", "Waktu", "Pengguna", "Peran", "Modul", "Aksi", "Rincian"],
  baris: tampilRows.map((l, i) => [i + 1, waktuIndo(l.waktu) || l.tanggal, l.nama, PERAN[l.peran] || l.peran, l.modul, l.aksi, l.detail]),
  namaFile: `log-${inBulan.value}`
});
document.getElementById("btnPdf").onclick = (e) => aksi(e.target, async () => (await import("./laporan.js")).pdfTabel(dataLap()), "Membuat PDF...");
document.getElementById("btnExcel").onclick = (e) => aksi(e.target, async () => (await import("./laporan.js")).excelTabel(dataLap()), "Membuat Excel...");
inBulan.onchange = muat;
selModul.onchange = tampil;
document.getElementById("cari").oninput = tampil;
muat();
