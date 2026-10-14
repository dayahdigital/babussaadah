import {
  db, collection, getDocs, doc, setDoc, updateDoc, addDoc, deleteDoc, query, where, serverTimestamp
} from "./firebase.js";
import { requireAuth, AKSES, rupiah, thisMonth, namaBulan, today, toast, esc, downloadCSV } from "./common.js";
import { LEMBAGA } from "./pengaturan.js";

const { profil } = await requireAuth(AKSES.penggajian);

const inPeriode = document.getElementById("periode");
const tb = document.getElementById("tbGaji");
const modal = document.getElementById("modal");
const formAdj = document.getElementById("formAdj");
inPeriode.value = thisMonth();
let daftar = [];
let adjId = null;

// Total insentif kehadiran (dijumlah dari catatan absensi; cadangan: tarif × hadir)
const insentifDari = (g) => g.insentif ?? (g.honorHadir || 0) * g.hadir;

const hitungTotal = (g) =>
  g.gajiPokok + g.tunjangan + insentifDari(g) + (g.bonus || 0)
  - g.potonganAlpa * g.alpa - (g.potonganLain || 0);

async function muat() {
  const snap = await getDocs(query(collection(db, "gaji"), where("periode", "==", inPeriode.value)));
  daftar = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  tampil();
}

function tampil() {
  tb.innerHTML = daftar.length ? daftar.map(g => {
    const pot = g.potonganAlpa * g.alpa + (g.potonganLain || 0);
    return `<tr>
      <td><strong>${esc(g.nama)}</strong><br><small style="color:#6b7770">${esc(g.jabatan)}</small></td>
      <td class="num">${g.hadir}</td><td class="num">${g.alpa}</td>
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

  const total = daftar.reduce((s, g) => s + g.total, 0);
  const lunas = daftar.filter(g => g.dibayar).reduce((s, g) => s + g.total, 0);
  document.getElementById("sTotal").textContent = rupiah(total);
  document.getElementById("sLunas").textContent = rupiah(lunas);
  document.getElementById("sBelum").textContent = rupiah(total - lunas);
}

// Hitung gaji dari data guru + absensi bulan tsb. Yang sudah dibayar tidak diubah.
async function hitung() {
  const per = inPeriode.value;
  const [guruSnap, absenSnap] = await Promise.all([
    getDocs(query(collection(db, "guru"), where("aktif", "==", true))),
    getDocs(query(collection(db, "absensi"), where("bulan", "==", per)))
  ]);
  const rekap = {};
  absenSnap.docs.forEach(d => {
    const a = d.data();
    rekap[a.guruId] ??= { H: 0, A: 0, insentif: 0 };
    if (a.status === "H") rekap[a.guruId].H++;
    if (a.status === "A") rekap[a.guruId].A++;
    rekap[a.guruId].insentif += Number(a.insentif) || 0;   // insentif tercatat saat absensi
  });
  const lama = Object.fromEntries(daftar.map(g => [g.guruId, g]));
  let n = 0;
  for (const d of guruSnap.docs) {
    const gr = d.data();
    if (lama[d.id]?.dibayar) continue;
    const g = {
      periode: per, guruId: d.id, nama: gr.nama, jabatan: gr.jabatan || "",
      gajiPokok: gr.gajiPokok || 0, tunjangan: gr.tunjangan || 0,
      honorHadir: gr.honorHadir || 0, potonganAlpa: gr.potonganAlpa || 0,
      hadir: rekap[d.id]?.H || 0, alpa: rekap[d.id]?.A || 0, insentif: rekap[d.id]?.insentif || 0,
      bonus: lama[d.id]?.bonus || 0, potonganLain: lama[d.id]?.potonganLain || 0,
      catatan: lama[d.id]?.catatan || "", dibayar: false, diubah: serverTimestamp()
    };
    g.total = hitungTotal(g);
    await setDoc(doc(db, "gaji", `${per}_${d.id}`), g);
    n++;
  }
  toast(`Gaji ${n} guru dihitung`);
  muat();
}

async function bayar(g) {
  if (!confirm(`Bayar gaji ${g.nama} sebesar ${rupiah(g.total)}?\nAkan dicatat sebagai pengeluaran kas.`)) return;
  const kasRef = await addDoc(collection(db, "kas"), {
    tanggal: today(), jenis: "keluar", kategori: "Gaji Guru",
    keterangan: `Gaji ${g.nama} — ${namaBulan(g.periode)}`, jumlah: g.total,
    sumber: "penggajian", gajiId: g.id, dicatatOleh: profil.username, waktu: serverTimestamp()
  });
  await updateDoc(doc(db, "gaji", g.id), { dibayar: true, tglBayar: today(), kasId: kasRef.id });
  toast("Gaji dibayar & tercatat di kas");
  muat();
}

async function batalBayar(g) {
  if (!confirm(`Batalkan pembayaran gaji ${g.nama}? Catatan kas terkait akan dihapus.`)) return;
  if (g.kasId) await deleteDoc(doc(db, "kas", g.kasId));
  await updateDoc(doc(db, "gaji", g.id), { dibayar: false, tglBayar: null, kasId: null });
  toast("Pembayaran dibatalkan");
  muat();
}

function slip(g) {
  const pot = g.potonganAlpa * g.alpa;
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
  if (ds.bayar) bayar(g);
  if (ds.batal) batalBayar(g);
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
  g.bonus = Number(formAdj.bonus.value) || 0;
  g.potonganLain = Number(formAdj.potonganLain.value) || 0;
  await updateDoc(doc(db, "gaji", adjId), {
    bonus: g.bonus, potonganLain: g.potonganLain, catatan: formAdj.catatan.value.trim(), total: hitungTotal(g)
  });
  modal.classList.remove("open");
  toast("Tersimpan");
  muat();
});

document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
document.getElementById("btnHitung").onclick = hitung;
inPeriode.onchange = muat;
document.getElementById("btnExport").onclick = () =>
  downloadCSV(`gaji-${inPeriode.value}.csv`, [
    [`Daftar Gaji Guru ${namaBulan(inPeriode.value)}`], [],
    ["Nama", "Jabatan", "Hadir", "Alpa", "Gaji Pokok", "Tunjangan", "Insentif Hadir", "Bonus", "Potongan", "Total", "Status"],
    ...daftar.map(g => [g.nama, g.jabatan, g.hadir, g.alpa, g.gajiPokok, g.tunjangan, insentifDari(g),
      g.bonus, g.potonganAlpa * g.alpa + (g.potonganLain || 0), g.total, g.dibayar ? "Dibayar" : "Belum"])
  ]);

muat();
