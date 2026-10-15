// Kelola pengumuman: teks berjalan & mading di halaman depan
import { db, collection, getDocs, addDoc, setDoc, deleteDoc, doc, serverTimestamp } from "./firebase.js";
import { requireAuth, AKSES, toast, esc, today, tglIndo, aksi, catatLog, gambarKecil, tampilError } from "./common.js";

const { profil } = await requireAuth(AKSES.pengumuman);
const tb = document.getElementById("tb");
const modal = document.getElementById("modal");
const form = document.getElementById("form");
let daftar = [], editId = null, gambar = "";

async function muat() {
  try {
    const s = await getDocs(collection(db, "pengumuman"));
    daftar = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.mulai || "").localeCompare(a.mulai || ""));
    const kini = today();
    tb.innerHTML = daftar.length ? daftar.map(p => {
      const tayang = p.aktif !== false && (!p.mulai || p.mulai <= kini) && (!p.sampai || kini <= p.sampai);
      return `<tr>
        <td class="utama">${esc(p.judul)}</td>
        <td>${p.jenis === "mading" ? "📌 Mading" : "📢 Teks berjalan"}</td>
        <td>${tglIndo(p.mulai)}${p.sampai ? " – " + tglIndo(p.sampai) : " – seterusnya"}</td>
        <td><span class="badge ${tayang ? "b-in" : "b-belum"}">${tayang ? "Sedang tayang" : p.aktif === false ? "Disembunyikan" : "Tidak tayang"}</span></td>
        <td class="aksi-sel"><button class="btn btn-sm btn-sec" data-ubah="${p.id}">Ubah</button></td></tr>`;
    }).join("") : `<tr><td colspan="5" class="empty">Belum ada pengumuman.</td></tr>`;
  } catch (ex) { tampilError(ex, "Gagal memuat pengumuman"); }
}

function aturJenis() { document.getElementById("boxGambar").hidden = form.jenis.value !== "mading"; }
form.jenis.onchange = aturJenis;
function pvGambar() {
  const img = document.getElementById("pvGambar");
  img.hidden = !gambar; img.src = gambar || "";
  document.getElementById("hapusGambar").hidden = !gambar;
}
function buka(p = null) {
  editId = p?.id || null;
  form.reset();
  document.getElementById("judulModal").textContent = p ? "Ubah pengumuman" : "Pengumuman baru";
  form.jenis.value = p?.jenis || "berjalan";
  form.judul.value = p?.judul || "";
  form.isi.value = p?.isi || "";
  form.mulai.value = p?.mulai || today();
  form.sampai.value = p?.sampai || "";
  form.urutan.value = p?.urutan ?? 0;
  form.aktif.value = String(p ? p.aktif !== false : true);
  gambar = p?.gambar || "";
  document.getElementById("btnHapus").hidden = !p;
  aturJenis(); pvGambar();
  modal.classList.add("open");
}
document.getElementById("fileGambar").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { gambar = await gambarKecil(f, 1000, 240000); pvGambar(); }
  catch (ex) { tampilError(ex); }
};
document.getElementById("hapusGambar").onclick = () => { gambar = ""; document.getElementById("fileGambar").value = ""; pvGambar(); };

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (form.sampai.value && form.sampai.value < form.mulai.value) return toast("Tanggal 'sampai' harus setelah 'mulai'", "err");
  const data = {
    jenis: form.jenis.value, judul: form.judul.value.trim(), isi: form.isi.value.trim(),
    gambar: form.jenis.value === "mading" ? gambar : "",
    mulai: form.mulai.value, sampai: form.sampai.value, urutan: Number(form.urutan.value) || 0,
    aktif: form.aktif.value === "true", diubahOleh: profil.nama, diubah: serverTimestamp()
  };
  aksi(document.getElementById("btnSimpan"), async () => {
    if (editId) await setDoc(doc(db, "pengumuman", editId), data, { merge: true });
    else await addDoc(collection(db, "pengumuman"), data);
    catatLog("Pengumuman", editId ? "Ubah" : "Tambah", `${data.jenis}: ${data.judul}`);
    modal.classList.remove("open");
    toast("Pengumuman tersimpan");
    muat();
  });
});
document.getElementById("btnHapus").onclick = () => {
  const p = daftar.find(x => x.id === editId);
  if (!confirm(`Hapus pengumuman "${p.judul}"?`)) return;
  aksi(document.getElementById("btnHapus"), async () => {
    await deleteDoc(doc(db, "pengumuman", editId));
    catatLog("Pengumuman", "Hapus", p.judul);
    modal.classList.remove("open");
    toast("Pengumuman dihapus");
    muat();
  }, "Menghapus...");
};
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("btnTambah").onclick = () => buka();
tb.addEventListener("click", (e) => { const id = e.target.dataset.ubah; if (id) buka(daftar.find(p => p.id === id)); });
muat();
