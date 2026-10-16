// Data Teungku: identitas, mukafaah pokok, tunjangan, nilai per kehadiran, potongan alpa.
// Menghapus teungku juga menutup akun loginnya dan menghapus jadwalnya.
import { db, collection, getDocs, addDoc, updateDoc, doc, query, where, writeBatch, serverTimestamp, deleteField } from "./firebase.js";
import { requireAuth, AKSES, isSuper, rupiah, toast, esc, aksi, tampilError, catatLog, kirimNotif, ambilJadwal, SEMUA_HARI, HARI, nilaiUang, setUang } from "./common.js";

const { profil } = await requireAuth(AKSES.teungku);
const isSA = isSuper(profil.role);
const tb = document.getElementById("tbGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formGuru");
const UANG = ["gajiPokok", "tunjangan", "honorHadir", "potonganAlpa"];
let daftar = [], jadwal = [], editId = null;

function ringkasJadwal(g) {
  const j = jadwal.filter(e => e.guruId === g.id);
  if (!j.length) return `<span class="badge b-belum">Belum diatur</span>`;
  const perHari = SEMUA_HARI.map(h => [h, j.filter(e => e.hari === h).length]).filter(([, n]) => n);
  return `${j.length} sesi/minggu <small class="muted">(${perHari.map(([h, n]) => `${HARI[h].slice(0, 3)} ${n}`).join(", ")})</small>`;
}

async function muat() {
  try {
    [jadwal, daftar] = await Promise.all([
      ambilJadwal().catch(() => []),
      getDocs(collection(db, "guru")).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama)))
    ]);
    tampil();
  } catch (ex) { tampilError(ex, "Gagal memuat data teungku"); }
}
function tampil() {
  const q = document.getElementById("cari").value.toLowerCase();
  const rows = daftar.filter(g => `${g.nama} ${g.jabatan || ""}`.toLowerCase().includes(q));
  tb.innerHTML = rows.length ? rows.map(g => `<tr>
      <td class="utama">${esc(g.nama)}</td><td>${esc(g.jabatan || "–")}</td><td>${esc(g.hp || "–")}</td>
      <td class="num">${rupiah(g.gajiPokok)}</td><td class="num">${rupiah(g.tunjangan)}</td><td class="num">${rupiah(g.honorHadir)}</td>
      <td>${ringkasJadwal(g)}</td>
      <td>${g.usernameAkun ? `<span class="badge b-biru">@${esc(g.usernameAkun)}</span>` : '<span class="muted kecil">belum ada</span>'}</td>
      <td><span class="badge ${g.aktif ? "b-in" : "b-out"}">${g.aktif ? "✔ Aktif" : "✖ Nonaktif"}</span></td>
      <td class="aksi-sel"><button class="btn btn-sm btn-sec tulis" data-edit="${g.id}">Ubah</button></td></tr>`).join("")
    : `<tr><td colspan="10" class="empty">Belum ada data teungku.</td></tr>`;
}

function buka(g = null) {
  editId = g?.id || null;
  document.getElementById("modalJudul").textContent = g ? "Ubah Data Teungku" : "Tambah Teungku";
  form.reset();
  for (const k of ["nama", "nip", "jabatan", "hp"]) form[k].value = g?.[k] ?? "";
  UANG.forEach(k => setUang(form[k], g?.[k] || 0));
  form.aktif.value = String(g ? g.aktif : true);
  document.getElementById("btnHapus").hidden = !g;
  modal.classList.add("open");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    nama: form.nama.value.trim(), nip: form.nip.value.trim(), jabatan: form.jabatan.value.trim(), hp: form.hp.value.trim(),
    aktif: form.aktif.value === "true", ...Object.fromEntries(UANG.map(k => [k, nilaiUang(form[k])])), diubah: serverTimestamp()
  };
  aksi(document.getElementById("btnSimpan"), async () => {
    if (editId) {
      const lama = daftar.find(x => x.id === editId);
      await updateDoc(doc(db, "guru", editId), data);
      if (lama.nama !== data.nama || !!lama.aktif !== data.aktif) {
        const js = await getDocs(query(collection(db, "mengajar"), where("guruId", "==", editId)));
        if (!js.empty) { const b = writeBatch(db); js.docs.forEach(d => b.update(d.ref, { namaGuru: data.nama, aktifGuru: data.aktif })); await b.commit(); }
      }
      const beda = ["nama", "jabatan", "hp", "aktif", ...UANG].filter(k => String(lama[k] ?? "") !== String(data[k] ?? ""))
        .map(k => `${k}: ${lama[k] ?? "-"} → ${data[k]}`);
      catatLog("Teungku", "Ubah data", `${data.nama}${beda.length ? " · " + beda.join(", ") : ""}`);
    } else {
      await addDoc(collection(db, "guru"), data);
      catatLog("Teungku", "Tambah", data.nama);
    }
    modal.classList.remove("open");
    toast("Data teungku tersimpan");
    muat();
  });
});

// Hapus: data + jadwal; akun login ditutup (Super Admin langsung, Admin otomatis terblokir karena data hilang)
document.getElementById("btnHapus").onclick = () => {
  const g = daftar.find(x => x.id === editId);
  if (!confirm(`Hapus ${g.nama}?\n\n• Jadwal mengajarnya dihapus\n• Akun loginnya ditutup\n• Riwayat absensi & mukafaah tetap tersimpan`)) return;
  aksi(document.getElementById("btnHapus"), async () => {
    const b = writeBatch(db);
    jadwal.filter(e => e.guruId === g.id).forEach(e => b.delete(doc(db, "mengajar", e.id)));
    b.delete(doc(db, "guru", g.id));
    if (isSA && g.uidAkun) {
      b.update(doc(db, "users", g.uidAkun), { aktif: false, dihapus: true, guruId: deleteField() });
      if (g.usernameAkun) b.delete(doc(db, "usernames", g.usernameAkun));
    }
    await b.commit();
    catatLog("Teungku", "Hapus", `${g.nama}${g.usernameAkun ? " · akun @" + g.usernameAkun + " ditutup" : ""}`);
    if (!isSA && g.uidAkun) kirimNotif({ untukPeran: "superadmin", judul: "Teungku dihapus", isi: `${g.nama} dihapus oleh ${profil.nama}. Akun @${g.usernameAkun} sudah terblokir; rapikan di menu Pengguna bila perlu.`, tautan: "pengguna.html" });
    modal.classList.remove("open");
    toast("Teungku dihapus & akun loginnya ditutup");
    muat();
  }, "Menghapus...");
};

// Laporan
const dataLap = () => ({
  judul: "DATA TEUNGKU", sub: `Jumlah: ${daftar.length} teungku (${daftar.filter(g => g.aktif).length} aktif)`, lanskap: true,
  kolom: ["No", "Nama Teungku", "NIP/NIY", "Jabatan", "No. HP", "Mukafaah Pokok", "Tunjangan", "Nilai per Kehadiran", "Potongan per Alpa", "Jadwal / Minggu", "Status"],
  baris: daftar.map((g, i) => [i + 1, g.nama, g.nip || "-", g.jabatan || "-", g.hp || "-", { uang: g.gajiPokok || 0 }, { uang: g.tunjangan || 0 },
    { uang: g.honorHadir || 0 }, { uang: g.potonganAlpa || 0 }, jadwal.filter(e => e.guruId === g.id).length + " sesi", g.aktif ? "Aktif" : "Nonaktif"]),
  namaFile: "data-teungku", ttd: true
});
document.getElementById("btnPdf").onclick = (e) => aksi(e.target, async () => (await import("./laporan.js")).pdfTabel(dataLap()), "Membuat PDF...");
document.getElementById("btnExcel").onclick = (e) => aksi(e.target, async () => (await import("./laporan.js")).excelTabel(dataLap()), "Membuat Excel...");

tb.addEventListener("click", (e) => { const id = e.target.dataset.edit; if (id) buka(daftar.find(g => g.id === id)); });
document.getElementById("btnTambah").onclick = () => buka();
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("cari").oninput = tampil;
muat();
