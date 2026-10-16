// Kas: hanya memuat bulan terpilih (cepat), saldo dari ringkasan/kas, bukti foto di koleksi "bukti".
// Catatan dari Mukafaah terkunci; hanya Super Admin yang bisa membatalkan (lewat menu ini atau Mukafaah).
import {
  db, collection, getDocs, getDoc, doc, setDoc, query, where, orderBy, writeBatch, serverTimestamp, increment, deleteField
} from "./firebase.js";
import {
  requireAuth, AKSES, ISTILAH, rupiah, today, thisMonth, namaBulan, tglIndo, toast, esc, aksi, tampilError, catatLog,
  nilaiUang, setUang, gambarKecil, jamSiap, isSuper
} from "./common.js";

const { profil } = await requireAuth(AKSES.kas);
const isSA = isSuper(profil.role);
await jamSiap;

const KATEGORI_BAWAAN = {
  masuk: ["Infaq / Sedekah", "Donatur", "Wakaf", "Bantuan Pemerintah", "Usaha Dayah", "Lainnya"],
  keluar: [ISTILAH.kategoriKas, "Operasional", "Listrik & Air", "Konsumsi / Dapur", "Pembangunan", "Perlengkapan", "Kegiatan Santri", "Lainnya"]
};
const KUNCI = [ISTILAH.kategoriKas, "Gaji Guru"];
const form = document.getElementById("formKas");
const selJenis = document.getElementById("jenis");
const selKat = document.getElementById("kategori");
const inBulan = document.getElementById("bulan");
const tb = document.getElementById("tbKas");
form.tanggal.value = today();
inBulan.value = thisMonth();
let bulanIni = [], tampilRows = [], editId = null, bukti = "", buktiDiubah = false;
const N = (v) => Number(v) || 0;

let KATEGORI = await (async () => {
  const s = await getDoc(doc(db, "config", "kas")).catch(() => null);
  const d = s?.exists() ? s.data() : {};
  return {
    masuk: d.masuk?.length ? d.masuk : [...KATEGORI_BAWAAN.masuk],
    keluar: d.keluar?.length ? [...new Set([ISTILAH.kategoriKas, ...d.keluar])] : [...KATEGORI_BAWAAN.keluar]
  };
})();
function isiKategori(pilih = null) {
  const list = KATEGORI[selJenis.value].filter(k => k !== ISTILAH.kategoriKas || isSA);
  if (pilih && !list.includes(pilih)) list.push(pilih);
  selKat.innerHTML = list.map(k => `<option>${esc(k)}</option>`).join("");
  if (pilih) selKat.value = pilih;
}
selJenis.onchange = () => isiKategori();
isiKategori();

// ---------- Saldo dari ringkasan ----------
async function muatSaldo() {
  try {
    const s = await getDoc(doc(db, "ringkasan", "kas"));
    const d = s.exists() ? s.data() : null;
    document.getElementById("sSaldo").textContent = d ? rupiah(N(d.masuk) - N(d.keluar)) : "belum dihitung";
    if (!d) toast("Saldo belum pernah dihitung. Tekan 'Hitung ulang' sekali.", "info");
  } catch (ex) { tampilError(ex, "Gagal memuat saldo"); }
}
document.getElementById("btnHitungUlang").onclick = (e) => {
  if (!confirm("Hitung ulang saldo dari seluruh transaksi kas? (membaca semua data, cukup sesekali)")) return;
  aksi(e.target, async () => {
    const s = await getDocs(collection(db, "kas"));
    let masuk = 0, keluar = 0;
    s.docs.forEach(d => { const k = d.data(); if (k.jenis === "masuk") masuk += N(k.jumlah); else keluar += N(k.jumlah); });
    await setDoc(doc(db, "ringkasan", "kas"), { masuk, keluar, dihitungUlang: serverTimestamp() });
    catatLog("Kas", "Hitung ulang saldo", `masuk ${rupiah(masuk)}, keluar ${rupiah(keluar)}, saldo ${rupiah(masuk - keluar)}`);
    toast(`Saldo: ${rupiah(masuk - keluar)} (${s.size} transaksi)`);
    muatSaldo();
  }, "Menghitung...");
};

// ---------- Transaksi per bulan ----------
const rentang = (awal, akhir) => query(collection(db, "kas"), where("tanggal", ">=", awal), where("tanggal", "<=", akhir), orderBy("tanggal", "desc"));
async function ambilRentang(awal, akhir) {
  const s = await getDocs(rentang(awal, akhir));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function muat() {
  const b = inBulan.value;
  try { bulanIni = await ambilRentang(`${b}-01`, `${b}-31`); tampil(); }
  catch (ex) { tampilError(ex, "Gagal memuat kas"); }
}
function tampil() {
  const fj = document.getElementById("fJenis").value;
  const q = document.getElementById("cari").value.toLowerCase();
  const masuk = bulanIni.filter(k => k.jenis === "masuk").reduce((s, k) => s + N(k.jumlah), 0);
  const keluar = bulanIni.filter(k => k.jenis === "keluar").reduce((s, k) => s + N(k.jumlah), 0);
  const lbl = namaBulan(inBulan.value);
  document.getElementById("lblPeriode1").textContent = document.getElementById("lblPeriode2").textContent = "· " + lbl;
  document.getElementById("sMasuk").textContent = rupiah(masuk);
  document.getElementById("sKeluar").textContent = rupiah(keluar);
  tampilRows = bulanIni.filter(k => (!fj || k.jenis === fj) && `${k.keterangan} ${k.kategori}`.toLowerCase().includes(q));
  tb.innerHTML = tampilRows.length ? tampilRows.map(k => {
    const terkunci = k.sumber === "penggajian";
    return `<tr>
      <td>${tglIndo(k.tanggal)}</td><td class="utama">${esc(k.keterangan)}</td><td>${esc(k.kategori)}</td>
      <td><span class="badge ${k.jenis === "masuk" ? "b-in" : "b-out"}">${k.jenis === "masuk" ? "↓ Masuk" : "↑ Keluar"}</span></td>
      <td class="num"><b>${rupiah(k.jumlah)}</b></td>
      <td>${k.adaBukti ? `<button class="btn btn-sm btn-sec" data-bukti="${k.id}">🧾 Lihat</button>` : "–"}</td>
      <td class="aksi-sel">${terkunci
        ? (isSA ? `<div class="aksi"><span class="kunci">🔒 dari Mukafaah</span><button class="btn btn-sm btn-red" data-batal-gaji="${k.id}">Batalkan</button></div>` : `<span class="kunci">🔒 dari Mukafaah</span>`)
        : `<div class="aksi tulis"><button class="btn btn-sm btn-sec" data-ubah="${k.id}">Ubah</button><button class="btn btn-sm btn-red" data-hapus="${k.id}">Hapus</button></div>`}</td></tr>`;
  }).join("") + `<tr class="total"><td colspan="4">Selisih ${lbl}</td><td class="num">${rupiah(masuk - keluar)}</td><td colspan="2"></td></tr>`
    : `<tr><td colspan="7" class="empty">Tidak ada transaksi.</td></tr>`;

  document.getElementById("judulRekap").textContent = lbl;
  for (const [jenis, el] of [["masuk", "rekapMasuk"], ["keluar", "rekapKeluar"]]) {
    const r = {};
    bulanIni.filter(k => k.jenis === jenis).forEach(k => r[k.kategori] = (r[k.kategori] || 0) + N(k.jumlah));
    const rows = Object.entries(r).sort((a, b) => b[1] - a[1]);
    document.getElementById(el).innerHTML = rows.length ? rows.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${rupiah(n)}</td></tr>`).join("")
      : `<tr><td colspan="2" class="empty">–</td></tr>`;
  }
}

// ---------- Bukti foto ----------
function pvBukti() {
  const img = document.getElementById("pvBukti");
  img.hidden = !bukti; img.src = bukti || "";
  document.getElementById("hapusBukti").hidden = !bukti;
}
document.getElementById("fileBukti").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { bukti = await gambarKecil(f, 1200, 280000); buktiDiubah = true; pvBukti(); }
  catch (ex) { tampilError(ex); }
};
document.getElementById("hapusBukti").onclick = () => { bukti = ""; buktiDiubah = true; document.getElementById("fileBukti").value = ""; pvBukti(); };

// ---------- Simpan / ubah ----------
async function modeUbah(k) {
  editId = k?.id || null;
  bukti = ""; buktiDiubah = false;
  document.getElementById("fileBukti").value = "";
  document.getElementById("judulForm").textContent = k ? "Ubah transaksi" : "Catat transaksi";
  document.getElementById("btnSimpanKas").textContent = k ? "Simpan perubahan" : "Simpan";
  document.getElementById("btnBatalUbah").hidden = !k;
  if (k) {
    form.tanggal.value = k.tanggal; selJenis.value = k.jenis; isiKategori(k.kategori);
    setUang(form.jumlah, k.jumlah); form.keterangan.value = k.keterangan;
    if (k.adaBukti) bukti = (await getDoc(doc(db, "bukti", k.id)).catch(() => null))?.data()?.foto || "";
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  } else { form.jumlah.value = ""; form.keterangan.value = ""; }
  pvBukti();
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const jumlah = nilaiUang(form.jumlah);
  if (!(jumlah > 0)) return toast("Jumlah harus lebih dari 0", "err");
  const data = { tanggal: form.tanggal.value, jenis: form.jenis.value, kategori: form.kategori.value, jumlah, keterangan: form.keterangan.value.trim() };
  aksi(document.getElementById("btnSimpanKas"), async () => {
    const b = writeBatch(db);
    const lama = editId ? bulanIni.find(k => k.id === editId) : null;
    const ref = editId ? doc(db, "kas", editId) : doc(collection(db, "kas"));
    const adaBukti = buktiDiubah ? !!bukti : !!lama?.adaBukti;
    if (lama) b.update(ref, { ...data, adaBukti, diubahOleh: profil.username, diubah: serverTimestamp() });
    else b.set(ref, { ...data, adaBukti, sumber: "manual", dicatatOleh: profil.username, waktu: serverTimestamp() });
    if (buktiDiubah) bukti ? b.set(doc(db, "bukti", ref.id), { foto: bukti, kasId: ref.id, waktu: serverTimestamp() }) : lama?.adaBukti && b.delete(doc(db, "bukti", ref.id));
    // ringkasan saldo
    const delta = { masuk: 0, keluar: 0 };
    if (lama) delta[lama.jenis] -= N(lama.jumlah);
    delta[data.jenis] += jumlah;
    b.set(doc(db, "ringkasan", "kas"), { masuk: increment(delta.masuk), keluar: increment(delta.keluar) }, { merge: true });
    await b.commit();
    catatLog("Kas", lama ? "Ubah transaksi" : "Catat transaksi",
      lama ? `${lama.keterangan}: ${lama.jenis} ${rupiah(lama.jumlah)} → ${data.jenis} ${rupiah(jumlah)} (${data.kategori})` : `${data.jenis} ${rupiah(jumlah)} · ${data.kategori} · ${data.keterangan}`);
    toast(lama ? "Transaksi diperbarui" : "Transaksi tersimpan");
    await modeUbah(null);
    if (!data.tanggal.startsWith(inBulan.value)) inBulan.value = data.tanggal.slice(0, 7);
    muat(); muatSaldo();
  });
});
document.getElementById("btnBatalUbah").onclick = () => modeUbah(null);

tb.addEventListener("click", async (e) => {
  const ds = e.target.dataset;
  if (ds.ubah) modeUbah(bulanIni.find(k => k.id === ds.ubah));
  if (ds.bukti) {
    try {
      const s = await getDoc(doc(db, "bukti", ds.bukti));
      if (!s.exists()) return toast("Foto bukti tidak ditemukan", "err");
      document.getElementById("fotoBukti").src = s.data().foto;
      document.getElementById("modalBukti").classList.add("open");
    } catch (ex) { tampilError(ex); }
  }
  if (ds.hapus) {
    const k = bulanIni.find(x => x.id === ds.hapus);
    if (!confirm(`Hapus transaksi "${k.keterangan}" ${rupiah(k.jumlah)}?`)) return;
    aksi(e.target, async () => {
      const b = writeBatch(db);
      b.delete(doc(db, "kas", k.id));
      if (k.adaBukti) b.delete(doc(db, "bukti", k.id));
      b.set(doc(db, "ringkasan", "kas"), { [k.jenis]: increment(-N(k.jumlah)) }, { merge: true });
      await b.commit();
      catatLog("Kas", "Hapus transaksi", `${k.tanggal} ${k.jenis} ${rupiah(k.jumlah)} · ${k.kategori} · ${k.keterangan}`);
      if (editId === k.id) modeUbah(null);
      toast("Transaksi dihapus"); muat(); muatSaldo();
    }, "Menghapus...");
  }
  if (ds.batalGaji) {      // Super Admin: batalkan penyerahan mukafaah dari sini
    const k = bulanIni.find(x => x.id === ds.batalGaji);
    if (!confirm(`Batalkan penyerahan mukafaah ini?\n${k.keterangan} ${rupiah(k.jumlah)}\nStatus mukafaah kembali "belum diserahkan".`)) return;
    aksi(e.target, async () => {
      const b = writeBatch(db);
      b.delete(doc(db, "kas", k.id));
      b.set(doc(db, "ringkasan", "kas"), { keluar: increment(-N(k.jumlah)) }, { merge: true });
      if (k.gajiId) b.update(doc(db, "gaji", k.gajiId), { dibayar: false, tglBayar: null, kasId: null });
      await b.commit();
      catatLog("Mukafaah", "Batalkan penyerahan (dari Kas)", `${k.keterangan} ${rupiah(k.jumlah)}`);
      toast("Penyerahan mukafaah dibatalkan"); muat(); muatSaldo();
    }, "Membatalkan...");
  }
});
document.getElementById("modalBukti").onclick = (e) => e.currentTarget.classList.remove("open");

// ---------- Kelola kategori ----------
const mKat = document.getElementById("modalKategori");
let draf = null;
function tampilKategori() {
  for (const [jenis, el] of [["masuk", "katMasuk"], ["keluar", "katKeluar"]]) {
    document.getElementById(el).innerHTML = draf[jenis].map((k, i) => {
      const kunci = KUNCI.includes(k.asal);
      const dipakai = bulanIni.filter(t => t.jenis === jenis && t.kategori === k.asal).length;
      return `<div class="kat-baris"><input value="${esc(k.nama)}" data-jenis="${jenis}" data-i="${i}" ${kunci ? "disabled" : ""}>
        <small>${dipakai ? dipakai + "×" : ""}</small>${kunci ? "🔒" : `<button class="btn btn-sm btn-red" data-hapus-kat="${jenis}:${i}" aria-label="Hapus">✕</button>`}</div>`;
    }).join("");
  }
}
document.getElementById("btnKategori").onclick = () => {
  draf = { masuk: KATEGORI.masuk.map(k => ({ asal: k, nama: k })), keluar: KATEGORI.keluar.map(k => ({ asal: k, nama: k })) };
  tampilKategori(); mKat.classList.add("open");
};
mKat.addEventListener("input", (e) => { const { jenis, i } = e.target.dataset; if (jenis) draf[jenis][Number(i)].nama = e.target.value; });
mKat.addEventListener("click", (e) => {
  const { hapusKat, tambah } = e.target.dataset;
  if (hapusKat) { const [j, i] = hapusKat.split(":"); draf[j].splice(Number(i), 1); tampilKategori(); }
  if (tambah) {
    const inp = document.getElementById(tambah === "masuk" ? "baruMasuk" : "baruKeluar");
    const nama = inp.value.trim();
    if (!nama) return;
    if (draf[tambah].some(k => k.nama.toLowerCase() === nama.toLowerCase())) return toast("Kategori sudah ada", "err");
    draf[tambah].push({ asal: null, nama }); inp.value = ""; tampilKategori();
  }
  if (e.target.hasAttribute("data-tutup") || e.target === mKat) mKat.classList.remove("open");
});
document.getElementById("btnSimpanKategori").onclick = (e) => {
  const bersih = {};
  for (const j of ["masuk", "keluar"]) {
    draf[j].forEach(k => k.nama = k.nama.trim());
    if (draf[j].some(k => !k.nama)) return toast("Nama kategori tidak boleh kosong", "err");
    const n = draf[j].map(k => k.nama.toLowerCase());
    if (new Set(n).size !== n.length) return toast("Ada nama kategori yang kembar", "err");
    bersih[j] = draf[j].map(k => k.nama);
  }
  aksi(e.target, async () => {
    const ganti = draf.masuk.concat(draf.keluar).filter(k => k.asal && k.asal !== k.nama);
    let n = 0;
    for (const k of ganti) {   // perbarui transaksi lama (semua bulan)
      const s = await getDocs(query(collection(db, "kas"), where("kategori", "==", k.asal)));
      for (let i = 0; i < s.docs.length; i += 450) {
        const b = writeBatch(db);
        s.docs.slice(i, i + 450).forEach(d => { b.update(d.ref, { kategori: k.nama }); n++; });
        await b.commit();
      }
    }
    await setDoc(doc(db, "config", "kas"), { ...bersih, diubahOleh: profil.username, diubah: serverTimestamp() });
    catatLog("Kas", "Ubah kategori", `Masuk: ${bersih.masuk.join(", ")} | Keluar: ${bersih.keluar.join(", ")}${ganti.length ? " | ganti nama: " + ganti.map(k => `${k.asal}→${k.nama}`).join(", ") : ""}`);
    KATEGORI = bersih; isiKategori(); mKat.classList.remove("open");
    toast(n ? `Kategori tersimpan · ${n} transaksi diperbarui` : "Kategori tersimpan");
    muat();
  });
};

// ---------- Laporan ----------
const L = () => import("./laporan.js");
function dataLap(rows, judulPeriode, nama) {
  const urut = [...rows].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  let saldo = 0;
  const masuk = urut.filter(k => k.jenis === "masuk").reduce((s, k) => s + N(k.jumlah), 0);
  const keluar = urut.filter(k => k.jenis === "keluar").reduce((s, k) => s + N(k.jumlah), 0);
  return {
    judul: "LAPORAN KAS PEMASUKAN DAN PENGELUARAN", sub: judulPeriode, lanskap: true,
    kolom: ["No", "Tanggal", "Keterangan", "Kategori", "Pemasukan", "Pengeluaran", "Selisih Berjalan"],
    baris: urut.map((k, i) => {
      saldo += (k.jenis === "masuk" ? 1 : -1) * N(k.jumlah);
      return [i + 1, tglIndo(k.tanggal), k.keterangan, k.kategori, k.jenis === "masuk" ? { uang: N(k.jumlah) } : "", k.jenis === "keluar" ? { uang: N(k.jumlah) } : "", { uang: saldo }];
    }),
    total: ["", "", "JUMLAH", "", { uang: masuk }, { uang: keluar }, { uang: masuk - keluar }],
    namaFile: nama, ttd: true
  };
}
document.getElementById("btnPdf").onclick = (e) => aksi(e.target, async () => (await L()).pdfTabel(dataLap(bulanIni, `Bulan ${namaBulan(inBulan.value)}`, `kas-${inBulan.value}`)), "Membuat PDF...");
document.getElementById("btnExcel").onclick = (e) => aksi(e.target, async () => (await L()).excelTabel(dataLap(bulanIni, `Bulan ${namaBulan(inBulan.value)}`, `kas-${inBulan.value}`)), "Membuat Excel...");
document.getElementById("btnPdfTahun").onclick = (e) => aksi(e.target, async () => {
  const th = inBulan.value.slice(0, 4);
  const rows = await ambilRentang(`${th}-01-01`, `${th}-12-31`);
  await (await L()).pdfTabel(dataLap(rows, `Tahun ${th}`, `kas-${th}`));
}, "Membuat PDF...");

inBulan.onchange = muat;
document.getElementById("fJenis").onchange = tampil;
document.getElementById("cari").oninput = tampil;
muat();
muatSaldo();
