// Absensi oleh Operator/Admin: per tanggal, per sesi.
// Hanya sesi yang berjalan pada hari itu, dan hanya teungku yang terjadwal di sesi itu.
// Insentif = tarif "insentif per kehadiran" teungku (disimpan saat absensi dicatat).
import { db, collection, getDocs, doc, setDoc, query, where, writeBatch, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, today, thisMonth, namaBulan, toast, esc, rupiah, downloadCSV,
  ambilConfigAbsensi, HARI, SEMUA_HARI, hariDari, sesiPadaHari, terjadwal, hitungJadwalBulan
} from "./common.js";

const { profil } = await requireAuth(AKSES.absensi);
const bolehAtur = ["superadmin", "admin"].includes(profil.role);

const inTanggal = document.getElementById("tanggal");
const selSesi = document.getElementById("sesi");
const inBulan = document.getElementById("bulan");
const cbSemua = document.getElementById("tampilSemua");
const tbAbsen = document.getElementById("tbAbsen");
const tbRekap = document.getElementById("tbRekap");
inTanggal.value = today();
inBulan.value = thisMonth();

const STATUS = ["H", "I", "S", "A"];
let guru = [];
let cfg = await ambilConfigAbsensi();
let awal = {};       // absensi tersimpan untuk tanggal+sesi terpilih
let rekapRows = [];

const sesiTerpilih = () => cfg.sesi.find(s => s.id === selSesi.value);
const insentifUntuk = (g, st) => st === "H" ? Number(g.honorHadir) || 0 : 0;

function isiSesi() {
  const h = hariDari(inTanggal.value);
  document.getElementById("namaHari").textContent = "· " + HARI[h];
  const list = sesiPadaHari(cfg, h);
  const pilih = selSesi.value;
  selSesi.innerHTML = list.length
    ? list.map(s => `<option value="${s.id}">${esc(s.nama)}</option>`).join("")
    : `<option value="">— tidak ada sesi hari ${HARI[h]} —</option>`;
  if (list.some(s => s.id === pilih)) selSesi.value = pilih;
}

async function muatGuru() {
  const snap = await getDocs(query(collection(db, "guru"), where("aktif", "==", true)));
  guru = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
}

async function muatHarian() {
  const tgl = inTanggal.value, s = sesiTerpilih(), h = hariDari(tgl);
  if (!s) {
    tbAbsen.innerHTML = `<tr><td colspan="6" class="empty">Tidak ada sesi pengajian pada hari ${HARI[h]}.
      ${bolehAtur ? "Atur hari sesi di bagian Pengaturan." : ""}</td></tr>`;
    hitungTotalSesi();
    return;
  }
  const snap = await getDocs(query(collection(db, "absensi"), where("tanggal", "==", tgl)));
  awal = {};
  snap.docs.forEach(d => { const a = d.data(); if ((a.sesi || "harian") === s.id) awal[a.guruId] = a; });

  const tampil = guru.filter(g => terjadwal(g, s, h) || awal[g.id] || cbSemua.checked);
  const disembunyikan = guru.length - tampil.length;

  tbAbsen.innerHTML = tampil.length ? tampil.map((g, i) => {
    const a = awal[g.id];
    const luar = !terjadwal(g, s, h);
    return `<tr data-id="${g.id}">
      <td>${i + 1}</td>
      <td>${esc(g.nama)}<br><small style="color:#6b7770">${rupiah(g.honorHadir)}/hadir</small>
        ${luar ? '<br><span class="badge b-belum">di luar jadwal</span>' : ""}</td>
      <td><div class="status-group">${STATUS.map(st => `
        <label><input type="radio" name="st_${g.id}" value="${st}" ${a?.status === st ? "checked" : ""}><span class="${st}">${st}</span></label>`).join("")}
      </div></td>
      <td class="num ins">–</td>
      <td><input class="ket" value="${esc(a?.keterangan || "")}" placeholder="${luar ? "mis. badal Tgk. ..." : "opsional"}"></td>
      <td>${a?.sumber === "mandiri" ? '<span class="badge b-in">mandiri</span>' : ""}</td></tr>`;
  }).join("") + (disembunyikan && !cbSemua.checked
      ? `<tr><td colspan="6" class="empty">${disembunyikan} teungku tidak terjadwal di sesi ini disembunyikan.</td></tr>` : "")
    : `<tr><td colspan="6" class="empty">Tidak ada teungku terjadwal di sesi ini.
        Centang "Tampilkan juga teungku yang tidak terjadwal" untuk badal.</td></tr>`;
  hitungTotalSesi();
}

// Insentif per baris & total saat status dipilih
function hitungTotalSesi() {
  let tot = 0;
  tbAbsen.querySelectorAll("tr[data-id]").forEach(tr => {
    const g = guru.find(x => x.id === tr.dataset.id);
    const st = tr.querySelector("input[type=radio]:checked")?.value;
    const a = awal[g.id];
    // Catatan lama yang tidak diubah memakai insentif yang tersimpan (tarif saat itu)
    const n = !st ? 0 : (a && a.status === st && a.insentif != null) ? Number(a.insentif) : insentifUntuk(g, st);
    tr.querySelector(".ins").textContent = st ? rupiah(n) : "–";
    tot += n;
  });
  document.getElementById("totSesi").textContent = rupiah(tot);
}
tbAbsen.addEventListener("change", (e) => { if (e.target.type === "radio") hitungTotalSesi(); });

async function simpan() {
  const tgl = inTanggal.value, s = sesiTerpilih();
  if (!s) return toast("Tidak ada sesi pada tanggal ini", "err");
  const batch = writeBatch(db);
  let n = 0;
  tbAbsen.querySelectorAll("tr[data-id]").forEach(tr => {
    const id = tr.dataset.id;
    const st = tr.querySelector(`input[name="st_${id}"]:checked`)?.value;
    const ket = tr.querySelector(".ket").value.trim();
    const a = awal[id];
    if (!st || (a && a.status === st && (a.keterangan || "") === ket)) return; // tidak berubah
    const g = guru.find(x => x.id === id);
    batch.set(doc(db, "absensi", `${tgl}_${s.id}_${id}`), {
      tanggal: tgl, bulan: tgl.slice(0, 7), sesi: s.id, sesiNama: s.nama,
      guruId: id, nama: g.nama, status: st, insentif: insentifUntuk(g, st),
      terjadwal: terjadwal(g, s, hariDari(tgl)),
      keterangan: ket, sumber: "operator", dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    n++;
  });
  if (!n) return toast("Tidak ada perubahan untuk disimpan", "err");
  try {
    await batch.commit();
    toast(`Absensi ${n} teungku tersimpan`);
    await muatHarian();
    if (tgl.startsWith(inBulan.value)) muatRekap();
  } catch (ex) { toast("Gagal menyimpan: " + ex.code, "err"); }
}

async function muatRekap() {
  const bln = inBulan.value;
  const snap = await getDocs(query(collection(db, "absensi"), where("bulan", "==", bln)));
  const r = {};
  const baru = (id, nama) => {
    const g = guru.find(x => x.id === id);
    return { nama, jadwal: g ? hitungJadwalBulan(cfg, g, bln) : 0, H: 0, I: 0, S: 0, A: 0, tercatat: 0, insentif: 0 };
  };
  snap.docs.forEach(d => {
    const a = d.data();
    r[a.guruId] ??= baru(a.guruId, a.nama);
    r[a.guruId][a.status]++;
    r[a.guruId].insentif += Number(a.insentif) || 0;
    // hitung sesi terjadwal yang sudah punya catatan (badal di luar jadwal tidak mengurangi "belum diabsen")
    const g = guru.find(x => x.id === a.guruId);
    const s = cfg.sesi.find(x => x.id === (a.sesi || "harian"));
    if (g && s && terjadwal(g, s, hariDari(a.tanggal))) r[a.guruId].tercatat++;
  });
  guru.forEach(g => { r[g.id] ??= baru(g.id, g.nama); });
  rekapRows = Object.values(r).sort((a, b) => a.nama.localeCompare(b.nama));
  const total = rekapRows.reduce((s, x) => s + x.insentif, 0);
  tbRekap.innerHTML = rekapRows.length ? rekapRows.map(x => {
    const belum = Math.max(0, x.jadwal - x.tercatat);
    return `<tr>
      <td>${esc(x.nama)}</td><td class="num">${x.jadwal}</td><td class="num">${x.H}</td><td class="num">${x.I}</td>
      <td class="num">${x.S}</td><td class="num">${x.A}</td>
      <td class="num">${belum ? `<span class="badge b-belum">${belum}</span>` : 0}</td>
      <td class="num">${x.jadwal ? Math.round(x.H / x.jadwal * 100) + "%" : "–"}</td>
      <td class="num">${rupiah(x.insentif)}</td></tr>`;
  }).join("")
    + `<tr><td colspan="8"><b>Total insentif ${namaBulan(bln)}</b></td><td class="num"><b>${rupiah(total)}</b></td></tr>`
    : `<tr><td colspan="9" class="empty">Tidak ada data.</td></tr>`;
}

// ---------- Pengaturan sesi & hari (Admin & Super Admin) ----------
function tampilAtur() {
  document.getElementById("daftarSesi").innerHTML = cfg.sesi.map((s, i) => `
    <tr data-sesi="${s.id}">
      <td><input class="namaSesi" value="${esc(s.nama)}" placeholder="mis. Ba'da Subuh"></td>
      ${SEMUA_HARI.map(h => `<td><input type="checkbox" class="hariSesi" value="${h}" ${s.hari.includes(h) ? "checked" : ""}></td>`).join("")}
      <td><button class="btn btn-sm btn-red" data-hapus-sesi="${i}" ${cfg.sesi.length <= 1 ? "disabled" : ""}>Hapus</button></td>
    </tr>`).join("");
  document.getElementById("guruMandiri").checked = cfg.guruMandiri;
}
const bacaFormSesi = () => [...document.querySelectorAll("[data-sesi]")].map(tr => ({
  id: tr.dataset.sesi,
  nama: tr.querySelector(".namaSesi").value.trim() || "Tanpa nama",
  hari: [...tr.querySelectorAll(".hariSesi:checked")].map(c => Number(c.value))
}));

if (bolehAtur) {
  tampilAtur();
  document.getElementById("btnTambahSesi").onclick = () => {
    cfg.sesi = [...bacaFormSesi(), { id: "s" + Date.now().toString(36), nama: "", hari: [...SEMUA_HARI] }];
    tampilAtur();
  };
  document.getElementById("daftarSesi").addEventListener("click", (e) => {
    const i = e.target.dataset.hapusSesi;
    if (i === undefined) return;
    if (!confirm("Hapus sesi ini? Riwayat absensinya tetap tersimpan.")) return;
    cfg.sesi = bacaFormSesi().filter((_, k) => k !== Number(i));
    tampilAtur();
  });
  document.getElementById("btnSimpanAtur").onclick = async () => {
    const sesi = bacaFormSesi();
    if (sesi.some(s => !s.hari.length)) return toast("Setiap sesi harus punya minimal satu hari", "err");
    cfg = { sesi, guruMandiri: document.getElementById("guruMandiri").checked };
    try {
      await setDoc(doc(db, "config", "absensi"), { ...cfg, diubah: serverTimestamp(), oleh: profil.username });
      toast("Pengaturan absensi tersimpan");
      isiSesi(); tampilAtur(); muatHarian(); muatRekap();
    } catch (ex) { toast("Gagal: " + ex.code, "err"); }
  };
}

document.getElementById("btnSemuaHadir").onclick = () => {
  tbAbsen.querySelectorAll('input[value="H"]').forEach(r => r.checked = true);
  hitungTotalSesi();
};
document.getElementById("btnSimpan").onclick = simpan;
document.getElementById("btnExport").onclick = () =>
  downloadCSV(`rekap-absensi-${inBulan.value}.csv`, [
    [`Rekap Absensi & Insentif ${namaBulan(inBulan.value)}`], [],
    ["Nama", "Jadwal", "Hadir", "Izin", "Sakit", "Alpa", "Belum diabsen", "Total Insentif"],
    ...rekapRows.map(x => [x.nama, x.jadwal, x.H, x.I, x.S, x.A, Math.max(0, x.jadwal - x.tercatat), x.insentif])
  ]);
inTanggal.onchange = () => { isiSesi(); muatHarian(); };
selSesi.onchange = muatHarian;
cbSemua.onchange = muatHarian;
inBulan.onchange = muatRekap;

isiSesi();
await muatGuru();
muatHarian();
muatRekap();
