import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "./firebase.js?v=2.0.2";
import { requireAuth, AKSES, rupiah, toast, esc, ambilJadwal, SEMUA_HARI, HARI } from "./common.js?v=2.0.2";
import { writeBatch, query, where } from "./firebase.js?v=2.0.2";

await requireAuth(AKSES.guru);

const tb = document.getElementById("tbGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formGuru");
let daftar = [];
let jadwal = [];
let editId = null;

// Ringkasan jadwal dari menu Jadwal Mengajar
function ringkasJadwal(g) {
  const j = jadwal.filter(e => e.guruId === g.id);
  if (!j.length) return `<a href="jadwal-mengajar.html" class="badge b-belum">Belum diatur</a>`;
  const perHari = SEMUA_HARI.map(h => [h, j.filter(e => e.hari === h).length]).filter(([, n]) => n);
  return `${j.length} sesi/minggu<br><small style="color:#6b7770">${perHari.map(([h, n]) => `${HARI[h].slice(0, 3)} ${n}`).join(" · ")}</small>`;
}

async function muat() {
  jadwal = await ambilJadwal().catch(() => []);
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
    diubah: serverTimestamp()
  };
  try {
    if (editId) {
      await updateDoc(doc(db, "guru", editId), data);
      // Nama & status aktif di jadwal publik ikut diperbarui
      const lama = daftar.find(x => x.id === editId);
      if (lama && (lama.nama !== data.nama || !!lama.aktif !== data.aktif)) {
        const js = await getDocs(query(collection(db, "mengajar"), where("guruId", "==", editId)));
        if (!js.empty) {
          const b = writeBatch(db);
          js.docs.forEach(d => b.update(d.ref, { namaGuru: data.nama, aktifGuru: data.aktif }));
          await b.commit();
        }
      }
    } else await addDoc(collection(db, "guru"), data);
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
    if (!confirm(`Hapus ${g.nama}? Jadwal mengajarnya ikut dihapus; riwayat absensi & gaji tetap tersimpan.`)) return;
    const b = writeBatch(db);
    jadwal.filter(e => e.guruId === idHapus).forEach(e => b.delete(doc(db, "mengajar", e.id)));
    b.delete(doc(db, "guru", idHapus));
    await b.commit();
    toast("Data guru dihapus");
    muat();
  }
});

document.getElementById("btnTambah").onclick = () => buka();
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("cari").oninput = tampil;

muat();
