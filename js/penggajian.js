import {
  db, collection, getDocs, doc, setDoc, updateDoc, query, where, serverTimestamp, writeBatch
} from "./firebase.js";
import {
  requireAuth, AKSES, rupiah, thisMonth, namaBulan, today, toast, esc, downloadCSV, ambilTampilan,
  ambilConfigAbsensi, ambilJadwal, indeksJadwal, terjadwal, hariDari, hitungJadwalBulan
} from "./common.js";
const { profil } = await requireAuth(AKSES.penggajian);
const LEMBAGA = await ambilTampilan();   // nama, alamat, bendahara dari menu Profil Dayah

const inPeriode = document.getElementById("periode");
const tb = document.getElementById("tbGaji");
const modal = document.getElementById("modal");
const formAdj = document.getElementById("formAdj");
inPeriode.value = thisMonth();
let daftar = [];
let adjId = null;

// Angka selalu diperlakukan sebagai angka (data lama bisa tersimpan sebagai teks)
const N = (v) => Number(v) || 0;

// Total insentif kehadiran (dijumlah dari catatan absensi; cadangan: tarif × hadir)
const insentifDari = (g) => g.insentif != null ? N(g.insentif) : N(g.honorHadir) * N(g.hadir);

// Total tidak pernah minus: bila potongan melebihi pendapatan, total = 0
const hitungTotal = (g) => Math.max(0,
  N(g.gajiPokok) + N(g.tunjangan) + insentifDari(g) + N(g.bonus)
  - N(g.potonganAlpa) * N(g.alpa) - N(g.potonganLain));

async function muat() {
  const snap = await getDocs(query(collection(db, "gaji"), where("periode", "==", inPeriode.value)));
  daftar = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  tampil();
}

function tampil() {
  tb.innerHTML = daftar.length ? daftar.map(g => {
    const pot = N(g.potonganAlpa) * N(g.alpa) + N(g.potonganLain);
    return `<tr>
      <td><strong>${esc(g.nama)}</strong><br><small style="color:#6b7770">${esc(g.jabatan)}</small></td>
      <td class="num">${g.hadir}</td><td class="num">${g.alpa}${g.alpaOtomatis ? `<br><small title="Sesi terjadwal yang tidak diabsen">+${g.alpaOtomatis} tak diabsen</small>` : ""}</td>
      <td class="num">${rupiah(g.gajiPokok)}</td><td class="num">${rupiah(g.tunjangan)}</td>
      <td class="num">${rupiah(insentifDari(g))}</td><td class="num">${rupiah(g.bonus)}</td>
      <td class="num">${rupiah(pot)}</td><td class="num"><strong>${rupiah(g.total)}</strong></td>
      <td><span class="badge ${g.dibayar ? "b-lunas" : "b-belum"}">${g.dibayar ? "Dibayar" : "Belum"}</span></td>
      <td class="aksi">
        ${g.dibayar
          ? `<button class="btn btn-sm btn-sec" data-batal="${g.id}">Batalkan</button>`
          : `<button class="btn btn-sm btn-sec" data-adj="${g.id}">Bonus/Pot.</button>
             <button class="btn btn-sm" data-bayar="${g.id}">Bayar</button>`}
        <button class="btn btn-sm btn-sec" data-slip="${g.id}">Slip</button>
      </td></tr>`;
  }).join("") : `<tr><td colspan="11" class="empty">Belum dihitung untuk ${namaBulan(inPeriode.value)}.</td></tr>`;

  const total = daftar.reduce((s, g) => s + N(g.total), 0);
  const lunas = daftar.filter(g => g.dibayar).reduce((s, g) => s + N(g.total), 0);
  document.getElementById("sTotal").textContent = rupiah(total);
  document.getElementById("sLunas").textContent = rupiah(lunas);
  document.getElementById("sBelum").textContent = rupiah(total - lunas);
}

// Hitung gaji dari data guru + absensi bulan tsb. Yang sudah dibayar tidak diubah.
async function hitung() {
  const per = inPeriode.value;
  const alpaOtomatis = document.getElementById("alpaOtomatis").checked;
  const btn = document.getElementById("btnHitung");
  btn.disabled = true;
  try {
    const [guruSnap, absenSnap, cfg, jadwal] = await Promise.all([
      getDocs(query(collection(db, "guru"), where("aktif", "==", true))),
      getDocs(query(collection(db, "absensi"), where("bulan", "==", per))),
      ambilConfigAbsensi(),
      ambilJadwal()
    ]);
    const idx = indeksJadwal(jadwal);
    const rekap = {};
    absenSnap.docs.forEach(d => {
      const a = d.data();
      const r = rekap[a.guruId] ??= { H: 0, A: 0, insentif: 0, tercatat: 0 };
      if (a.status === "H") r.H++;
      if (a.status === "A") r.A++;
      r.insentif += N(a.insentif);   // insentif tercatat saat absensi
      const s = cfg.sesi.find(x => x.id === a.sesi);
      if (s && terjadwal(idx, a.guruId, s, hariDari(a.tanggal))) r.tercatat++;
    });
    const lama = Object.fromEntries(daftar.map(g => [g.guruId, g]));
    const b = writeBatch(db);
    let n = 0;
    for (const d of guruSnap.docs) {
      const gr = d.data();
      if (lama[d.id]?.dibayar) continue;
      const r = rekap[d.id] || { H: 0, A: 0, insentif: 0, tercatat: 0 };
      // Sesi terjadwal yang sama sekali tidak diabsen (opsional dihitung Alpa)
      const takDiabsen = alpaOtomatis ? Math.max(0, hitungJadwalBulan(cfg, idx, d.id, per) - r.tercatat) : 0;
      const g = {
        periode: per, guruId: d.id, nama: gr.nama, jabatan: gr.jabatan || "",
        gajiPokok: N(gr.gajiPokok), tunjangan: N(gr.tunjangan),
        honorHadir: N(gr.honorHadir), potonganAlpa: N(gr.potonganAlpa),
        hadir: r.H, alpa: r.A + takDiabsen, alpaOtomatis: takDiabsen, insentif: r.insentif,
        bonus: N(lama[d.id]?.bonus), potonganLain: N(lama[d.id]?.potonganLain),
        catatan: lama[d.id]?.catatan || "", dibayar: false, diubah: serverTimestamp()
      };
      g.total = hitungTotal(g);
      b.set(doc(db, "gaji", `${per}_${d.id}`), g);
      n++;
    }
    await b.commit();
    toast(`Gaji ${n} teungku dihitung`);
    muat();
  } catch (ex) { toast("Gagal menghitung: " + (ex.code || ex.message), "err"); }
  finally { btn.disabled = false; }
}

// Bayar: catat kas & tandai lunas dalam SATU transaksi (tidak bisa tercatat ganda)
async function bayar(g, tombol) {
  if (!confirm(`Bayar gaji ${g.nama} sebesar ${rupiah(g.total)}?\nAkan dicatat sebagai pengeluaran kas.`)) return;
  tombol.disabled = true;
  try {
    const kasRef = doc(collection(db, "kas"));
    const b = writeBatch(db);
    b.set(kasRef, {
      tanggal: today(), jenis: "keluar", kategori: "Gaji Guru",
      keterangan: `Gaji ${g.nama} — ${namaBulan(g.periode)}`, jumlah: N(g.total),
      sumber: "penggajian", gajiId: g.id, dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    b.update(doc(db, "gaji", g.id), { dibayar: true, tglBayar: today(), kasId: kasRef.id });
    await b.commit();
    toast("Gaji dibayar & tercatat di kas");
    muat();
  } catch (ex) { tombol.disabled = false; toast("Gagal: " + (ex.code || ex.message), "err"); }
}

async function batalBayar(g, tombol) {
  if (!confirm(`Batalkan pembayaran gaji ${g.nama}? Catatan kas terkait akan dihapus.`)) return;
  tombol.disabled = true;
  try {
    const b = writeBatch(db);
    if (g.kasId) b.delete(doc(db, "kas", g.kasId));
    b.update(doc(db, "gaji", g.id), { dibayar: false, tglBayar: null, kasId: null });
    await b.commit();
    toast("Pembayaran dibatalkan");
    muat();
  } catch (ex) { tombol.disabled = false; toast("Gagal: " + (ex.code || ex.message), "err"); }
}

function slip(g) {
  const pot = N(g.potonganAlpa) * N(g.alpa);
  const baris = (l, v, b) => `<tr><td>${l}</td><td style="text-align:right">${b ? "<b>" : ""}${v}${b ? "</b>" : ""}</td></tr>`;
  document.getElementById("slip").innerHTML = `<div class="slip">
    <h3>${esc(LEMBAGA.nama)}</h3><div class="sub">${esc(LEMBAGA.alamat)}<br><b>SLIP GAJI — ${namaBulan(g.periode).toUpperCase()}</b></div>
    <table style="width:100%">
      ${baris("Nama", esc(g.nama))}${baris("Jabatan", esc(g.jabatan))}
      ${baris("Jumlah hadir / alpa", `${g.hadir} / ${g.alpa}`)}
      <tr><td colspan="2"><hr></td></tr>
      ${baris("Gaji pokok", rupiah(g.gajiPokok))}${baris("Tunjangan", rupiah(g.tunjangan))}
      ${baris(`Insentif kehadiran (${g.hadir} kali hadir)`, rupiah(insentifDari(g)))}
      ${baris("Bonus", rupiah(g.bonus))}
      ${baris(`Potongan alpa (${g.alpa} × ${rupiah(g.potonganAlpa)})`, "− " + rupiah(pot))}
      ${baris("Potongan lain", "− " + rupiah(g.potonganLain))}
      <tr><td colspan="2"><hr></td></tr>
      ${baris("TOTAL DITERIMA", rupiah(g.total), true)}
      ${g.catatan ? baris("Catatan", esc(g.catatan)) : ""}
    </table>
    <div class="ttd"><div>Bendahara,<br><br><br><br><u>${esc(LEMBAGA.bendahara)}</u></div></div>
  </div>`;
  window.print();
}

tb.addEventListener("click", (e) => {
  const ds = e.target.dataset;
  const g = daftar.find(x => x.id === (ds.bayar || ds.batal || ds.adj || ds.slip));
  if (!g) return;
  if (ds.bayar) bayar(g, e.target);
  if (ds.batal) batalBayar(g, e.target);
  if (ds.slip) slip(g);
  if (ds.adj) {
    adjId = g.id;
    document.getElementById("adjJudul").textContent = "Bonus & Potongan — " + g.nama;
    formAdj.bonus.value = g.bonus || 0;
    formAdj.potonganLain.value = g.potonganLain || 0;
    formAdj.catatan.value = g.catatan || "";
    modal.classList.add("open");
  }
});

formAdj.addEventListener("submit", async (e) => {
  e.preventDefault();
  const g = { ...daftar.find(x => x.id === adjId) };
  g.bonus = N(formAdj.bonus.value);
  g.potonganLain = N(formAdj.potonganLain.value);
  try {
    await updateDoc(doc(db, "gaji", adjId), {
      bonus: g.bonus, potonganLain: g.potonganLain, catatan: formAdj.catatan.value.trim(), total: hitungTotal(g)
    });
    modal.classList.remove("open");
    toast("Tersimpan");
    muat();
  } catch (ex) { toast("Gagal: " + (ex.code || ex.message), "err"); }
});

document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("btnHitung").onclick = hitung;
inPeriode.onchange = muat;
document.getElementById("btnExport").onclick = () =>
  downloadCSV(`gaji-${inPeriode.value}.csv`, [
    [`Daftar Gaji Guru ${namaBulan(inPeriode.value)}`], [],
    ["Nama", "Jabatan", "Hadir", "Alpa", "Gaji Pokok", "Tunjangan", "Insentif Hadir", "Bonus", "Potongan", "Total", "Status"],
    ...daftar.map(g => [g.nama, g.jabatan, g.hadir, g.alpa, g.gajiPokok, g.tunjangan, insentifDari(g),
      N(g.bonus), N(g.potonganAlpa) * N(g.alpa) + N(g.potonganLain), N(g.total), g.dibayar ? "Dibayar" : "Belum"])
  ]);

muat();
