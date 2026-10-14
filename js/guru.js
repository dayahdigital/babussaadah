import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "./firebase.js";
import { requireAuth, AKSES, rupiah, toast, esc, ambilConfigAbsensi, SEMUA_HARI, HARI } from "./common.js";

await requireAuth(AKSES.guru);

const tb = document.getElementById("tbGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formGuru");
const grid = document.getElementById("gridJadwal");
const cfg = await ambilConfigAbsensi();
let daftar = [];
let editId = null;

// Semua kombinasi sesi:hari yang berjalan di dayah
const semuaSlot = cfg.sesi.flatMap(s => s.hari.map(h => `${s.id}:${h}`));
// Jadwal efektif seorang teungku (belum diatur = semua sesi dayah)
const jadwalDari = (g) => Array.isArray(g?.jadwal) ? g.jadwal.filter(x => semuaSlot.includes(x)) : semuaSlot;

function ringkasJadwal(g) {
  const j = jadwalDari(g);
  if (!j.length) return `<span class="badge b-out">Tidak ada</span>`;
  const perHari = SEMUA_HARI.map(h => [h, j.filter(x => x.endsWith(":" + h)).length]).filter(([, n]) => n);
  return `${j.length} sesi/minggu<br><small style="color:#6b7770">${perHari.map(([h, n]) => `${HARI[h].slice(0, 3)} ${n}`).join(" · ")}</small>`;
}

function isiGrid(jadwal) {
  grid.innerHTML = cfg.sesi.map(s => `<tr><td>${esc(s.nama)}</td>${SEMUA_HARI.map(h => {
    const slot = `${s.id}:${h}`;
    return s.hari.includes(h)
      ? `<td><input type="checkbox" class="slot" value="${slot}" ${jadwal.includes(slot) ? "checked" : ""}></td>`
      : `<td class="off"></td>`;
  }).join("")}</tr>`).join("");
  hitungSlot();
}
const hitungSlot = () =>
  document.getElementById("jmlJadwal").textContent = `(${grid.querySelectorAll(".slot:checked").length} sesi)`;
grid.addEventListener("change", hitungSlot);
document.getElementById("jdwSemua").onclick = () => { grid.querySelectorAll(".slot").forEach(c => c.checked = true); hitungSlot(); };
document.getElementById("jdwKosong").onclick = () => { grid.querySelectorAll(".slot").forEach(c => c.checked = false); hitungSlot(); };

async function muat() {
  const snap = await getDocs(collection(db, "guru"));
  daftar = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
  tampil();
}

function tampil() {
  const q = document.getElementById("cari").value.toLowerCase();
  const rows = daftar.filter(g => (g.nama + " " + (g.jabatan || "")).toLowerCase().includes(q));
  tb.innerHTML = rows.length ? rows.map(g => `<tr>
      <td><strong>${esc(g.nama)}</strong></td><td>${esc(g.nip)}</td><td>${esc(g.jabatan)}</td><td>${esc(g.hp)}</td>
      <td class="num">${rupiah(g.gajiPokok)}</td><td class="num">${rupiah(g.tunjangan)}</td>
      <td class="num">${rupiah(g.honorHadir)}</td>
      <td>${ringkasJadwal(g)}</td>
      <td><span class="badge ${g.aktif ? "b-in" : "b-out"}">${g.aktif ? "Aktif" : "Nonaktif"}</span></td>
      <td class="aksi">
        <button class="btn btn-sm btn-sec" data-edit="${g.id}">Ubah</button>
        <button class="btn btn-sm btn-red" data-hapus="${g.id}">Hapus</button>
      </td></tr>`).join("")
    : `<tr><td colspan="10" class="empty">Belum ada data guru.</td></tr>`;
}

function buka(g = null) {
  editId = g?.id || null;
  document.getElementById("modalJudul").textContent = g ? "Ubah Data Guru" : "Tambah Guru";
  form.reset();
  if (g) for (const k of ["nama", "nip", "jabatan", "hp", "gajiPokok", "tunjangan", "honorHadir", "potonganAlpa"])
    form[k].value = g[k] ?? "";
  form.aktif.value = String(g ? g.aktif : true);
  isiGrid(jadwalDari(g));
  modal.classList.add("open");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    nama: form.nama.value.trim(),
    nip: form.nip.value.trim(),
    jabatan: form.jabatan.value.trim(),
    hp: form.hp.value.trim(),
    aktif: form.aktif.value === "true",
    gajiPokok: Number(form.gajiPokok.value) || 0,
    tunjangan: Number(form.tunjangan.value) || 0,
    honorHadir: Number(form.honorHadir.value) || 0,
    potonganAlpa: Number(form.potonganAlpa.value) || 0,
    jadwal: [...grid.querySelectorAll(".slot:checked")].map(c => c.value),
    diubah: serverTimestamp()
  };
  try {
    if (editId) await updateDoc(doc(db, "guru", editId), data);
    else await addDoc(collection(db, "guru"), data);
    modal.classList.remove("open");
    toast("Data guru tersimpan");
    muat();
  } catch (ex) { toast("Gagal menyimpan: " + ex.code, "err"); }
});

tb.addEventListener("click", async (e) => {
  const idEdit = e.target.dataset.edit, idHapus = e.target.dataset.hapus;
  if (idEdit) buka(daftar.find(g => g.id === idEdit));
  if (idHapus) {
    const g = daftar.find(x => x.id === idHapus);
    if (!confirm(`Hapus ${g.nama}? Riwayat absensi & gaji tetap tersimpan.`)) return;
    await deleteDoc(doc(db, "guru", idHapus));
    toast("Data guru dihapus");
    muat();
  }
});

document.getElementById("btnTambah").onclick = () => buka();
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("cari").oninput = tampil;

muat();
