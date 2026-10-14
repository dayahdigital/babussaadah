// Kas pemasukan & pengeluaran: catat, ubah, hapus, filter, rekap per kategori, kelola kategori.
import {
  db, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, doc, writeBatch, serverTimestamp
} from "./firebase.js?v=2.0.2";
import { requireAuth, AKSES, rupiah, today, thisMonth, namaBulan, tglIndo, toast, esc, downloadCSV } from "./common.js?v=2.0.2";

const { profil } = await requireAuth(AKSES.kas);

// Kategori bawaan (dipakai sampai Bendahara/Admin menyimpan kategorinya sendiri)
const KATEGORI_BAWAAN = {
  masuk: ["SPP Santri", "Infaq / Sedekah", "Donatur", "Wakaf", "Bantuan Pemerintah", "Usaha Dayah", "Lainnya"],
  keluar: ["Gaji Guru", "Operasional", "Listrik & Air", "Konsumsi / Dapur", "Pembangunan", "Perlengkapan", "Kegiatan Santri", "Lainnya"]
};
const KUNCI = { keluar: ["Gaji Guru"] };   // dipakai otomatis oleh Penggajian

const form = document.getElementById("formKas");
const selJenis = document.getElementById("jenis");
const selKat = document.getElementById("kategori");
const inBulan = document.getElementById("bulan");
const tb = document.getElementById("tbKas");
form.tanggal.value = today();
inBulan.value = thisMonth();
let semua = [];
let tampilRows = [];
let editId = null;

let KATEGORI = await (async () => {
  const s = await getDoc(doc(db, "config", "kas")).catch(() => null);
  const d = s?.exists() ? s.data() : {};
  return {
    masuk: d.masuk?.length ? d.masuk : [...KATEGORI_BAWAAN.masuk],
    keluar: d.keluar?.length ? [...new Set([...KUNCI.keluar, ...d.keluar])] : [...KATEGORI_BAWAAN.keluar]
  };
})();

function isiKategori(pilih = null) {
  const list = [...KATEGORI[selJenis.value]];
  if (pilih && !list.includes(pilih)) list.push(pilih);   // kategori lama yang sudah dihapus
  selKat.innerHTML = list.map(k => `<option>${esc(k)}</option>`).join("");
  if (pilih) selKat.value = pilih;
}
selJenis.onchange = () => isiKategori();
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
  const masuk = periode.filter(k => k.jenis === "masuk").reduce((s, k) => s + Number(k.jumlah || 0), 0);
  const keluar = periode.filter(k => k.jenis === "keluar").reduce((s, k) => s + Number(k.jumlah || 0), 0);
  document.getElementById("sMasuk").textContent = rupiah(masuk);
  document.getElementById("sKeluar").textContent = rupiah(keluar);
  document.getElementById("sSaldo").textContent = rupiah(saldo);

  tampilRows = periode.filter(k => (!fj || k.jenis === fj) &&
    `${k.keterangan} ${k.kategori}`.toLowerCase().includes(q));

  tb.innerHTML = tampilRows.length ? tampilRows.map(k => `<tr>
      <td style="white-space:nowrap">${tglIndo(k.tanggal)}</td><td>${esc(k.keterangan)}</td><td>${esc(k.kategori)}</td>
      <td><span class="badge ${k.jenis === "masuk" ? "b-in" : "b-out"}">${k.jenis === "masuk" ? "Masuk" : "Keluar"}</span></td>
      <td class="num">${rupiah(k.jumlah)}</td>
      <td>${k.sumber === "penggajian"
        ? `<small style="color:#6b7770">dari Penggajian</small>`
        : `<div class="aksi"><button class="btn btn-sm btn-sec" data-ubah="${k.id}">Ubah</button>
           <button class="btn btn-sm btn-red" data-hapus="${k.id}">Hapus</button></div>`}</td></tr>`).join("")
    + `<tr><td colspan="4"><b>Selisih periode</b></td><td class="num"><b>${rupiah(masuk - keluar)}</b></td><td></td></tr>`
    : `<tr><td colspan="6" class="empty">Tidak ada transaksi.</td></tr>`;

  // Rekap per kategori
  document.getElementById("judulRekap").textContent = bln ? namaBulan(bln) : "semua periode";
  for (const [jenis, el] of [["masuk", "rekapMasuk"], ["keluar", "rekapKeluar"]]) {
    const r = {};
    periode.filter(k => k.jenis === jenis).forEach(k => r[k.kategori] = (r[k.kategori] || 0) + Number(k.jumlah || 0));
    const rows = Object.entries(r).sort((a, b) => b[1] - a[1]);
    document.getElementById(el).innerHTML = rows.length
      ? rows.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${rupiah(n)}</td></tr>`).join("")
      : `<tr><td colspan="2" class="empty">–</td></tr>`;
  }
}

// ---------- Catat / ubah transaksi ----------
function modeUbah(k) {
  editId = k?.id || null;
  document.getElementById("judulForm").textContent = k ? "Ubah transaksi" : "Catat transaksi";
  document.getElementById("btnSimpanKas").textContent = k ? "Simpan perubahan" : "Simpan";
  document.getElementById("btnBatalUbah").hidden = !k;
  if (k) {
    form.tanggal.value = k.tanggal; selJenis.value = k.jenis; isiKategori(k.kategori);
    form.jumlah.value = k.jumlah; form.keterangan.value = k.keterangan;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    form.jumlah.value = ""; form.keterangan.value = "";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const jumlah = Number(form.jumlah.value);
  if (!(jumlah > 0)) return toast("Jumlah harus lebih dari 0", "err");
  const data = {
    tanggal: form.tanggal.value, jenis: form.jenis.value, kategori: form.kategori.value,
    jumlah, keterangan: form.keterangan.value.trim()
  };
  try {
    if (editId) {
      await updateDoc(doc(db, "kas", editId), { ...data, diubahOleh: profil.username, diubah: serverTimestamp() });
      toast("Transaksi diperbarui");
    } else {
      await addDoc(collection(db, "kas"), { ...data, sumber: "manual", dicatatOleh: profil.username, waktu: serverTimestamp() });
      toast("Transaksi tersimpan");
    }
    modeUbah(null);
    muat();
  } catch (ex) { toast("Gagal menyimpan: " + ex.code, "err"); }
});
document.getElementById("btnBatalUbah").onclick = () => modeUbah(null);

tb.addEventListener("click", async (e) => {
  const { ubah, hapus } = e.target.dataset;
  if (ubah) modeUbah(semua.find(k => k.id === ubah));
  if (hapus) {
    if (!confirm("Hapus transaksi ini?")) return;
    await deleteDoc(doc(db, "kas", hapus));
    if (editId === hapus) modeUbah(null);
    toast("Transaksi dihapus");
    muat();
  }
});

// ---------- Kelola kategori ----------
const mKat = document.getElementById("modalKategori");
let draf = null;   // { masuk: [{asal, nama}], keluar: [...] }

function tampilKategori() {
  for (const [jenis, el] of [["masuk", "katMasuk"], ["keluar", "katKeluar"]]) {
    document.getElementById(el).innerHTML = draf[jenis].map((k, i) => {
      const kunci = (KUNCI[jenis] || []).includes(k.asal);
      const dipakai = semua.filter(t => t.jenis === jenis && t.kategori === k.asal).length;
      return `<div class="kat-baris">
        <input value="${esc(k.nama)}" data-jenis="${jenis}" data-i="${i}" ${kunci ? "disabled" : ""}>
        <small>${dipakai ? dipakai + "×" : ""}</small>
        ${kunci ? `<span title="Dipakai Penggajian">🔒</span>`
                : `<button class="btn btn-sm btn-red" data-hapus-kat="${jenis}:${i}" title="Hapus">✕</button>`}
      </div>`;
    }).join("");
  }
}

document.getElementById("btnKategori").onclick = () => {
  draf = {
    masuk: KATEGORI.masuk.map(k => ({ asal: k, nama: k })),
    keluar: KATEGORI.keluar.map(k => ({ asal: k, nama: k }))
  };
  tampilKategori();
  mKat.classList.add("open");
};
mKat.addEventListener("input", (e) => {
  const { jenis, i } = e.target.dataset;
  if (jenis) draf[jenis][Number(i)].nama = e.target.value;
});
mKat.addEventListener("click", (e) => {
  const { hapusKat, tambah } = e.target.dataset;
  if (hapusKat) {
    const [jenis, i] = hapusKat.split(":");
    const k = draf[jenis][Number(i)];
    const n = semua.filter(t => t.jenis === jenis && t.kategori === k.asal).length;
    if (n && !confirm(`"${k.asal}" dipakai ${n} transaksi. Transaksi lama tetap memakai nama ini. Hapus dari daftar?`)) return;
    draf[jenis].splice(Number(i), 1);
    tampilKategori();
  }
  if (tambah) {
    const inp = document.getElementById(tambah === "masuk" ? "baruMasuk" : "baruKeluar");
    const nama = inp.value.trim();
    if (!nama) return;
    if (draf[tambah].some(k => k.nama.toLowerCase() === nama.toLowerCase())) return toast("Kategori sudah ada", "err");
    draf[tambah].push({ asal: null, nama });
    inp.value = "";
    tampilKategori();
  }
  if (e.target.hasAttribute("data-tutup")) mKat.classList.remove("open");
});

document.getElementById("btnSimpanKategori").onclick = async () => {
  const bersih = {};
  for (const jenis of ["masuk", "keluar"]) {
    draf[jenis].forEach(k => k.nama = k.nama.trim());
    if (draf[jenis].some(k => !k.nama)) return toast("Nama kategori tidak boleh kosong", "err");
    const nama = draf[jenis].map(k => k.nama.toLowerCase());
    if (new Set(nama).size !== nama.length) return toast("Ada nama kategori yang kembar", "err");
    bersih[jenis] = draf[jenis].map(k => k.nama);
  }
  const btn = document.getElementById("btnSimpanKategori");
  btn.disabled = true;
  try {
    // Ganti nama → perbarui transaksi lama (maks. 450 per batch)
    const ganti = [];
    for (const jenis of ["masuk", "keluar"])
      draf[jenis].filter(k => k.asal && k.asal !== k.nama).forEach(k =>
        semua.filter(t => t.jenis === jenis && t.kategori === k.asal).forEach(t => ganti.push([t.id, k.nama])));
    for (let i = 0; i < ganti.length; i += 450) {
      const b = writeBatch(db);
      ganti.slice(i, i + 450).forEach(([id, nama]) => b.update(doc(db, "kas", id), { kategori: nama }));
      await b.commit();
    }
    await setDoc(doc(db, "config", "kas"), { ...bersih, diubahOleh: profil.username, diubah: serverTimestamp() });
    KATEGORI = bersih;
    isiKategori();
    mKat.classList.remove("open");
    toast(ganti.length ? `Kategori tersimpan · ${ganti.length} transaksi diperbarui` : "Kategori tersimpan");
    muat();
  } catch (ex) { toast("Gagal menyimpan kategori: " + (ex.code || ex.message), "err"); }
  finally { btn.disabled = false; }
};

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
