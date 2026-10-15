// Jadwal mengajar: teungku memilih sesi (Pagi/Malam) per hari + kitab, materi, kelas.
// Setiap tambah/ubah/hapus dicatat ke "riwayat_jadwal" (publik) dan log aktivitas.
// "sejak" menyimpan tanggal mulai berlaku agar rekap bulan lalu tidak berubah.
import { db, collection, getDocs, getDoc, doc, query, where, writeBatch, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, toast, esc, ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, idJadwal, HARI, SEMUA_HARI,
  jamSesi, today, aksi, tampilError, catatLog, kirimNotif, waktuIndo
} from "./common.js";

const { profil } = await requireAuth(AKSES.jadwal);
const isGuru = profil.role === "guru";
const tb = document.getElementById("tbJadwal");
const sel = document.getElementById("pilihGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formJadwal");
const cfg = await ambilConfigAbsensi();
const [pagi, malam] = cfg.sesi;
const sesiById = Object.fromEntries(cfg.sesi.map(s => [s.id, s]));
document.getElementById("thPagi").textContent = `🌅 ${pagi.nama} (${jamSesi(pagi)})`;
document.getElementById("thMalam").textContent = `🌙 ${malam.nama} (${jamSesi(malam)})`;

let guruList = [], guruId = null, entri = {}, edit = null;

if (isGuru) {
  if (!profil.guruId) { tb.innerHTML = `<tr><td colspan="3" class="empty">Akun belum ditautkan ke data teungku. Hubungi pengelola.</td></tr>`; throw Object.assign(new Error("guruId kosong"), { _sudahDitampilkan: true }); }
  const g = await getDoc(doc(db, "guru", profil.guruId));
  guruList = [{ id: profil.guruId, ...(g.data() || { nama: profil.nama }) }];
  guruId = profil.guruId;
  document.getElementById("keterangan").textContent =
    "Ketuk kotak untuk memilih sesi yang Anda ajar, lalu isi kitab & materinya. Tombol Hadir di menu Absen mengikuti jadwal ini.";
} else {
  try {
    const snap = await getDocs(query(collection(db, "guru"), where("aktif", "==", true)));
    guruList = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  } catch (ex) { tampilError(ex, "Gagal memuat data teungku"); }
  document.getElementById("pilihGuruWrap").hidden = false;
  sel.innerHTML = guruList.length ? guruList.map(g => `<option value="${g.id}">${esc(g.nama)}</option>`).join("") : `<option value="">Belum ada teungku aktif</option>`;
  guruId = guruList[0]?.id || null;
  sel.onchange = () => { guruId = sel.value; muat(); };
  document.getElementById("keterangan").textContent = "Pilih teungku untuk melihat atau mengubah jadwalnya. Teungku juga bisa mengatur jadwalnya sendiri.";
}
const guruNow = () => guruList.find(g => g.id === guruId);

ambilJadwal().then(semua => {
  const kitab = [...new Set(semua.map(e => e.kitab).filter(Boolean))].sort();
  document.getElementById("daftarKitab").innerHTML = kitab.map(k => `<option value="${esc(k)}">`).join("");
}).catch(() => {});

async function muat() {
  if (!guruId) { tb.innerHTML = `<tr><td colspan="3" class="empty">Belum ada teungku.</td></tr>`; return; }
  try {
    const [list, riw] = await Promise.all([ambilJadwal(guruId), ambilRiwayatJadwal(guruId)]);
    entri = Object.fromEntries(list.map(e => [e.id, e]));
    document.getElementById("judulJadwal").textContent = `Jadwal ${guruNow()?.nama || ""} · ${list.length} sesi per minggu`;
    tb.innerHTML = SEMUA_HARI.map(h => `<tr><th class="hari">${HARI[h]}</th>${sel_(pagi, h)}${sel_(malam, h)}</tr>`).join("");
    document.getElementById("daftarRiwayat").innerHTML = riw.length ? riw.slice(0, 50).map(itemRiwayat).join("") : `<li class="empty">Belum ada perubahan.</li>`;
  } catch (ex) { tampilError(ex, "Gagal memuat jadwal"); }
}
function sel_(s, h) {
  if (!s.hari.includes(h)) return `<td class="off-cell">Tidak ada sesi</td>`;
  const e = entri[idJadwal(guruId, s.id, h)];
  return e
    ? `<td><div class="slot isi" data-sesi="${s.id}" data-hari="${h}" role="button" tabindex="0">
         <b>📖 ${esc(e.kitab)}</b>${e.materi ? `<span>${esc(e.materi)}</span>` : ""}${e.kelas ? `<small>${esc(e.kelas)}</small>` : ""}</div></td>`
    : `<td><button class="slot kosong" data-sesi="${s.id}" data-hari="${h}">+ Pilih</button></td>`;
}
function itemRiwayat(r) {
  const t = { tambah: ["+", "tambah", "Menambah"], ubah: ["✎", "ubah", "Mengubah"], hapus: ["−", "hapus", "Menghapus"] }[r.aksi] || ["•", "ubah", "Mengubah"];
  const fmt = (x) => x ? `${esc(x.kitab)}${x.materi ? " · " + esc(x.materi) : ""}${x.kelas ? " · " + esc(x.kelas) : ""}` : "";
  return `<li><span class="tanda ${t[1]}">${t[0]}</span><div>
    ${t[2]} <b>${HARI[r.hari] || ""} · ${esc(sesiById[r.sesi]?.nama || r.sesi)}</b><br>
    ${r.aksi === "ubah" ? `<del>${fmt(r.sebelum)}</del> → <ins>${fmt(r.sesudah)}</ins>` : r.aksi === "hapus" ? `<del>${fmt(r.sebelum)}</del>` : `<ins>${fmt(r.sesudah)}</ins>`}
    <small>${waktuIndo(r.waktu)} · oleh ${esc(r.olehNama || "")}</small></div></li>`;
}

function buka(sesiId, hari) {
  edit = { sesi: sesiId, hari: Number(hari) };
  const s = sesiById[sesiId];
  const e = entri[idJadwal(guruId, sesiId, edit.hari)];
  document.getElementById("judulModal").textContent = `${HARI[edit.hari]} · ${s.nama} (${jamSesi(s)})`;
  form.kitab.value = e?.kitab || "";
  form.materi.value = e?.materi || "";
  form.kelas.value = e?.kelas || "";
  document.getElementById("btnHapus").hidden = !e;
  modal.classList.add("open");
  setTimeout(() => form.kitab.focus(), 50);
}
tb.addEventListener("click", (e) => { const el = e.target.closest("[data-sesi]"); if (el) buka(el.dataset.sesi, el.dataset.hari); });
tb.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset?.sesi) buka(e.target.dataset.sesi, e.target.dataset.hari); });

// Tulis jadwal + riwayat dalam satu batch
function tulis(b, aksiNama, sebelum, sesudah) {
  const id = idJadwal(guruId, edit.sesi, edit.hari);
  b.set(doc(collection(db, "riwayat_jadwal")), {
    guruId, namaGuru: guruNow()?.nama || profil.nama, sesi: edit.sesi, hari: edit.hari, aksi: aksiNama,
    sebelum: sebelum ? { kitab: sebelum.kitab || "", materi: sebelum.materi || "", kelas: sebelum.kelas || "" } : null,
    sesudah: sesudah ? { kitab: sesudah.kitab, materi: sesudah.materi, kelas: sesudah.kelas } : null,
    sejak: sebelum?.sejak || today(), tanggal: today(),
    oleh: profil.uid, olehNama: profil.nama, waktu: serverTimestamp()
  });
  return id;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const lama = entri[idJadwal(guruId, edit.sesi, edit.hari)];
  const baru = { kitab: form.kitab.value.trim(), materi: form.materi.value.trim(), kelas: form.kelas.value.trim() };
  if (lama && lama.kitab === baru.kitab && (lama.materi || "") === baru.materi && (lama.kelas || "") === baru.kelas) { modal.classList.remove("open"); return; }
  aksi(document.getElementById("btnSimpan"), async () => {
    const b = writeBatch(db);
    const id = tulis(b, lama ? "ubah" : "tambah", lama, baru);
    b.set(doc(db, "mengajar", id), {
      guruId, namaGuru: guruNow()?.nama || profil.nama, aktifGuru: guruNow()?.aktif !== false,
      sesi: edit.sesi, hari: edit.hari, ...baru, sejak: lama?.sejak || today(),
      diubahOleh: profil.nama, diubah: serverTimestamp()
    });
    await b.commit();
    const ket = `${guruNow()?.nama}: ${HARI[edit.hari]} ${sesiById[edit.sesi].nama} — ${baru.kitab}`;
    catatLog("Jadwal", lama ? "Ubah" : "Tambah", ket);
    if (isGuru) kirimNotif({ untukPeran: "admin", judul: "Jadwal mengajar diubah", isi: ket, tautan: "jadwal-mengajar.html" });
    modal.classList.remove("open");
    toast("Jadwal tersimpan");
    muat();
  });
});

document.getElementById("btnHapus").onclick = () => {
  const lama = entri[idJadwal(guruId, edit.sesi, edit.hari)];
  if (!confirm("Hapus jadwal di sesi ini? Sesi ini tidak muncul lagi di absensi mulai hari ini.")) return;
  aksi(document.getElementById("btnHapus"), async () => {
    const b = writeBatch(db);
    const id = tulis(b, "hapus", lama, null);
    b.delete(doc(db, "mengajar", id));
    await b.commit();
    const ket = `${guruNow()?.nama}: ${HARI[edit.hari]} ${sesiById[edit.sesi].nama} — ${lama.kitab}`;
    catatLog("Jadwal", "Hapus", ket);
    if (isGuru) kirimNotif({ untukPeran: "admin", judul: "Jadwal mengajar dihapus", isi: ket, tautan: "jadwal-mengajar.html" });
    modal.classList.remove("open");
    toast("Jadwal dihapus");
    muat();
  }, "Menghapus...");
};
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");

// Laporan semua jadwal
async function dataLaporan() {
  const semua = (await ambilJadwal()).filter(e => e.aktifGuru !== false)
    .sort((a, b) => a.hari - b.hari || cfg.sesi.findIndex(s => s.id === a.sesi) - cfg.sesi.findIndex(s => s.id === b.sesi) || (a.namaGuru || "").localeCompare(b.namaGuru || ""));
  return {
    judul: "JADWAL MENGAJAR TEUNGKU",
    sub: `Sesi ${pagi.nama} ${jamSesi(pagi)} · Sesi ${malam.nama} ${jamSesi(malam)} WIB`,
    kolom: ["No", "Hari", "Sesi", "Nama Teungku", "Kitab", "Materi / Bab", "Kelas"],
    baris: semua.map((e, i) => [i + 1, HARI[e.hari], sesiById[e.sesi]?.nama || e.sesi, e.namaGuru, e.kitab, e.materi || "-", e.kelas || "-"]),
    namaFile: "jadwal-mengajar"
  };
}
document.getElementById("btnPdf")?.addEventListener("click", (e) => aksi(e.target, async () => (await import("./laporan.js")).pdfTabel(await dataLaporan()), "Membuat PDF..."));
document.getElementById("btnExcel")?.addEventListener("click", (e) => aksi(e.target, async () => (await import("./laporan.js")).excelTabel(await dataLaporan()), "Membuat Excel..."));

muat();
