import { db, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "./firebase.js";
import { requireAuth, AKSES, rupiah, today, thisMonth, namaBulan, tglIndo, toast, esc, downloadCSV } from "./common.js";

const { profil } = await requireAuth(AKSES.kas);

const KATEGORI = {
  masuk: ["SPP Santri", "Infaq / Sedekah", "Donatur", "Wakaf", "Bantuan Pemerintah", "Usaha Dayah", "Lainnya"],
  keluar: ["Gaji Guru", "Operasional", "Listrik & Air", "Konsumsi / Dapur", "Pembangunan", "Perlengkapan", "Kegiatan Santri", "Lainnya"]
};

const form = document.getElementById("formKas");
const selJenis = document.getElementById("jenis");
const selKat = document.getElementById("kategori");
const inBulan = document.getElementById("bulan");
const tb = document.getElementById("tbKas");
form.tanggal.value = today();
inBulan.value = thisMonth();
let semua = [];
let tampilRows = [];

const isiKategori = () =>
  selKat.innerHTML = KATEGORI[selJenis.value].map(k => `<option>${k}</option>`).join("");
selJenis.onchange = isiKategori;
isiKategori();

async function muat() {
  const snap = await getDocs(collection(db, "kas"));
  semua = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  tampil();
}

function tampil() {
  const bln = inBulan.value, fj = document.getElementById("fJenis").value;
  const q = document.getElementById("cari").value.toLowerCase();
  const saldo = semua.reduce((s, k) => s + (k.jenis === "masuk" ? 1 : -1) * Number(k.jumlah || 0), 0);

  const periode = semua.filter(k => !bln || k.tanggal?.startsWith(bln));
  const masuk = periode.filter(k => k.jenis === "masuk").reduce((s, k) => s + Number(k.jumlah), 0);
  const keluar = periode.filter(k => k.jenis === "keluar").reduce((s, k) => s + Number(k.jumlah), 0);
  document.getElementById("sMasuk").textContent = rupiah(masuk);
  document.getElementById("sKeluar").textContent = rupiah(keluar);
  document.getElementById("sSaldo").textContent = rupiah(saldo);

  tampilRows = periode.filter(k => (!fj || k.jenis === fj) &&
    (k.keterangan + " " + k.kategori).toLowerCase().includes(q));

  tb.innerHTML = tampilRows.length ? tampilRows.map(k => `<tr>
      <td>${tglIndo(k.tanggal)}</td><td>${esc(k.keterangan)}</td><td>${esc(k.kategori)}</td>
      <td><span class="badge ${k.jenis === "masuk" ? "b-in" : "b-out"}">${k.jenis === "masuk" ? "Masuk" : "Keluar"}</span></td>
      <td class="num">${rupiah(k.jumlah)}</td>
      <td>${k.sumber === "penggajian"
        ? `<small style="color:#6b7770">dari Penggajian</small>`
        : `<button class="btn btn-sm btn-red" data-hapus="${k.id}">Hapus</button>`}</td></tr>`).join("")
    + `<tr><td colspan="4"><b>Selisih periode</b></td><td class="num"><b>${rupiah(masuk - keluar)}</b></td><td></td></tr>`
    : `<tr><td colspan="6" class="empty">Tidak ada transaksi.</td></tr>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "kas"), {
      tanggal: form.tanggal.value, jenis: form.jenis.value, kategori: form.kategori.value,
      jumlah: Number(form.jumlah.value), keterangan: form.keterangan.value.trim(),
      sumber: "manual", dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    toast("Transaksi tersimpan");
    form.jumlah.value = ""; form.keterangan.value = "";
    muat();
  } catch (ex) { toast("Gagal menyimpan: " + ex.code, "err"); }
});

tb.addEventListener("click", async (e) => {
  const id = e.target.dataset.hapus;
  if (!id || !confirm("Hapus transaksi ini?")) return;
  await deleteDoc(doc(db, "kas", id));
  toast("Transaksi dihapus");
  muat();
});

inBulan.onchange = tampil;
document.getElementById("fJenis").onchange = tampil;
document.getElementById("cari").oninput = tampil;
document.getElementById("btnExport").onclick = () =>
  downloadCSV(`kas-${inBulan.value || "semua"}.csv`, [
    [`Laporan Kas ${inBulan.value ? namaBulan(inBulan.value) : "Semua"}`], [],
    ["Tanggal", "Keterangan", "Kategori", "Jenis", "Jumlah", "Dicatat oleh"],
    ...tampilRows.map(k => [k.tanggal, k.keterangan, k.kategori, k.jenis === "masuk" ? "Pemasukan" : "Pengeluaran", k.jumlah, k.dicatatOleh])
  ]);

muat();
