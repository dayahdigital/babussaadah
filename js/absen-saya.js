// Halaman teungku: absen mandiri per sesi + lihat insentif sendiri.
// Aturan Firestore memastikan teungku hanya bisa mencatat HADIR untuk dirinya sendiri,
// hanya untuk tanggal hari ini (WIB), dengan insentif sesuai tarifnya, dan tidak bisa mengubahnya lagi.
import { db, collection, getDocs, getDoc, setDoc, doc, query, where, serverTimestamp } from "./firebase.js?v=2.0.2";
import {
  requireAuth, AKSES, today, thisMonth, namaBulan, tglIndo, toast, esc, rupiah,
  ambilConfigAbsensi, HARI, SEMUA_HARI, hariDari, terjadwal, selisihJam,
  ambilJadwal, indeksJadwal, idJadwal, jamSesi, waktuAbsen
} from "./common.js?v=2.0.2";

const { profil } = await requireAuth(AKSES.absenSaya);
document.getElementById("nama").textContent = profil.nama;

const pesan = document.getElementById("pesan");
const LABEL = { H: "Hadir", I: "Izin", S: "Sakit", A: "Alpa" };
const BADGE = { H: "b-in", I: "b-belum", S: "b-belum", A: "b-out" };

if (!profil.guruId) {
  pesan.textContent = "Akun Anda belum ditautkan ke data teungku. Hubungi Super Admin.";
  throw new Error("guruId kosong");
}

const guruSnap = await getDoc(doc(db, "guru", profil.guruId));
let guru = guruSnap.data();
if (!guru) {
  pesan.textContent = "Data teungku yang ditautkan ke akun Anda tidak ditemukan. Hubungi Super Admin.";
  throw new Error("data guru tidak ada");
}
const cfg = await ambilConfigAbsensi();
const tgl = today();
const bln = thisMonth();
const hariIniNo = hariDari(tgl);
document.getElementById("judulHariIni").textContent = `Absen hari ini · ${HARI[hariIniNo]}, ${tglIndo(tgl)}`;
document.getElementById("bulanIni").textContent = namaBulan(bln);

// Jadwal mingguan teungku ini (dipilih sendiri di menu Jadwal Mengajar)
const jadwalSaya = await ambilJadwal(profil.guruId);
const idx = indeksJadwal(jadwalSaya);
const entri = Object.fromEntries(jadwalSaya.map(e => [e.id, e]));
const dijadwal = (s, h) => terjadwal(idx, profil.guruId, s, h);
document.getElementById("tbJadwal").innerHTML = SEMUA_HARI.map(h => {
  const list = cfg.sesi.filter(s => dijadwal(s, h));
  return `<tr ${h === hariIniNo ? 'style="background:#f0f7f2;font-weight:600"' : ""}>
    <td style="width:80px">${HARI[h]}</td>
    <td>${list.length ? list.map(s => `${esc(s.nama)}: ${esc(entri[idJadwal(profil.guruId, s.id, h)]?.kitab || "")}`).join("<br>")
      : '<span style="color:#6b7770">Tidak mengajar</span>'}</td></tr>`;
}).join("") + (jadwalSaya.length ? "" :
  `<tr><td colspan="2" class="empty">Anda belum memilih jadwal. <a href="jadwal-mengajar.html"><b>Atur jadwal mengajar →</b></a></td></tr>`);

let riwayat = [];

async function muat() {
  const snap = await getDocs(query(collection(db, "absensi"),
    where("guruId", "==", profil.guruId), where("bulan", "==", bln)));
  riwayat = snap.docs.map(d => d.data())
    .sort((a, b) => (b.tanggal + b.sesi).localeCompare(a.tanggal + a.sesi));
  tampil();
}

function tampil() {
  const hariIni = Object.fromEntries(riwayat.filter(a => a.tanggal === tgl).map(a => [a.sesi || "harian", a]));

  pesan.textContent = !guru?.aktif ? "Status Anda nonaktif di data teungku."
    : cfg.guruMandiri ? `Tekan "Hadir" untuk setiap sesi yang Anda ajar. Insentif: ${rupiah(guru.honorHadir)} per kehadiran.`
    : "Absen mandiri sedang dimatikan. Absensi diisi oleh operator.";

  // Sesi hari ini = yang terjadwal untuk teungku ini + yang sudah dicatat operator (mis. badal)
  const sesiHariIni = cfg.sesi.filter(s => dijadwal(s, hariIniNo) || hariIni[s.id]);
  if (!sesiHariIni.length) {
    document.getElementById("daftarSesi").innerHTML =
      `<div class="empty">Hari ini (${HARI[hariIniNo]}) tidak ada jadwal mengajar Anda.
       <br><a href="jadwal-mengajar.html">Atur jadwal mengajar →</a></div>`;
  } else document.getElementById("daftarSesi").innerHTML = sesiHariIni.map(s => {
    const a = hariIni[s.id];
    const e = entri[idJadwal(profil.guruId, s.id, hariIniNo)];
    const w = waktuAbsen(s);
    return `<div class="sesi-item">
      <div><b>${esc(s.nama)}</b> <small>${jamSesi(s)}</small>
        ${e?.kitab ? `<br><small>📖 ${esc(e.kitab)}${e.materi ? " · " + esc(e.materi) : ""}</small>` : ""}
        ${a ? `<br><small>${a.sumber === "mandiri" ? "dicatat sendiri" : "dicatat operator"}${a.status === "H" ? " · " + rupiah(a.insentif) : ""}</small>` : ""}
        ${!a && cfg.guruMandiri && !w.boleh ? `<br><small class="teks-peringatan">${w.pesan}</small>` : ""}</div>
      ${a ? `<span class="badge ${BADGE[a.status]}">${LABEL[a.status]}</span>`
          : cfg.guruMandiri && guru?.aktif ? `<button class="btn" data-sesi="${s.id}" ${w.boleh ? "" : "disabled"}>Hadir</button>`
          : `<span style="color:#6b7770;font-size:13px">belum diabsen</span>`}
    </div>`;
  }).join("");

  const hadir = riwayat.filter(a => a.status === "H");
  document.getElementById("sHadir").textContent = hadir.length + " kali";
  document.getElementById("sInsentif").textContent = rupiah(hadir.reduce((s, a) => s + (Number(a.insentif) || 0), 0));

  document.getElementById("tbRiwayat").innerHTML = riwayat.length ? riwayat.map(a => `<tr>
      <td>${tglIndo(a.tanggal)}</td><td>${esc(a.sesiNama || "Harian")}</td>
      <td><span class="badge ${BADGE[a.status]}">${LABEL[a.status]}</span></td>
      <td class="num">${rupiah(a.insentif)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">Belum ada absensi bulan ini.</td></tr>`;
}

// Cari tahu alasan penolakan, agar pesannya jelas (bukan sekadar "ditolak")
async function alasanDitolak(s) {
  const skew = await selisihJam();
  if (Math.abs(skew) > 5 * 60 * 1000)
    return `Jam HP Anda selisih ${Math.round(Math.abs(skew) / 60000)} menit dari jam sebenarnya. ` +
      "Aktifkan \"Tanggal & waktu otomatis\" di pengaturan HP, lalu coba lagi.";
  const g = (await getDoc(doc(db, "guru", profil.guruId))).data() || {};
  if (g.aktif !== true) return "Status Anda nonaktif di Data Guru. Hubungi Admin.";
  const c = await ambilConfigAbsensi();
  if (!c.guruMandiri) return "Absen mandiri sedang dimatikan oleh Admin.";
  const sNow = c.sesi.find(x => x.id === s.id);
  const jdw = indeksJadwal(await ambilJadwal(profil.guruId));
  if (!sNow || !terjadwal(jdw, profil.guruId, sNow, hariDari(today())))
    return `Sesi ${s.nama} tidak ada di jadwal Anda hari ini. Minta operator mencatat bila Anda badal.`;
  const snap = await getDocs(query(collection(db, "absensi"),
    where("guruId", "==", profil.guruId), where("bulan", "==", today().slice(0, 7))));
  if (snap.docs.some(d => d.id === `${today()}_${s.id}_${profil.guruId}`))
    return "Sesi ini sudah dicatat operator. Muat ulang halaman untuk melihatnya.";
  return "Semua data Anda sudah benar, jadi kemungkinan aturan database (firestore.rules) " +
    "di Firebase belum diperbarui. Minta Super Admin mem-Publish firestore.rules versi terbaru.";
}

document.getElementById("daftarSesi").addEventListener("click", async (e) => {
  const sesiId = e.target.dataset.sesi;
  if (!sesiId) return;
  if (today() !== tgl) { location.reload(); return; }   // halaman dibuka sejak kemarin
  const s = cfg.sesi.find(x => x.id === sesiId);
  const w = waktuAbsen(s);
  if (!w.boleh) { toast(w.pesan, "err"); tampil(); return; }
  if (!confirm(`Catat HADIR untuk sesi ${s.nama} hari ini?`)) return;
  e.target.disabled = true;
  e.target.textContent = "Menyimpan...";
  try {
    // Ambil tarif terbaru (bisa saja baru diubah Admin) — harus sama persis dengan yang dicek server
    guru = (await getDoc(doc(db, "guru", profil.guruId))).data() || guru;
    await setDoc(doc(db, "absensi", `${tgl}_${sesiId}_${profil.guruId}`), {
      tanggal: tgl, bulan: bln, hari: hariIniNo, sesi: sesiId, sesiNama: s.nama,
      guruId: profil.guruId, nama: guru.nama, status: "H",
      insentif: guru.honorHadir ?? 0, keterangan: "",
      sumber: "mandiri", dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    toast(`Hadir tercatat · insentif ${rupiah(guru.honorHadir)}`);
    muat();
  } catch (ex) {
    e.target.disabled = false;
    e.target.textContent = "Hadir";
    if (ex.code !== "permission-denied") return toast("Gagal: " + (ex.code || ex.message), "err");
    const alasan = await alasanDitolak(s).catch(() => "Ditolak oleh server.");
    pesan.innerHTML = `<span class="error-box">⚠ ${esc(alasan)}</span>`;
    toast("Absen ditolak — lihat keterangan di atas", "err");
  }
});

muat();

// Perbarui status tombol (buka/tutup sesuai jam sesi) setiap menit
setInterval(() => { if (!document.querySelector("#daftarSesi button:focus")) tampil(); }, 60 * 1000);

// Gaji bulan ini & bulan lalu (bila sudah dihitung bendahara)
(async () => {
  const [y, m] = bln.split("-").map(Number);
  const lalu = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const rows = [];
  for (const per of [bln, lalu]) {
    const s = await getDoc(doc(db, "gaji", `${per}_${profil.guruId}`)).catch(() => null);
    if (s?.exists()) rows.push(s.data());
  }
  if (!rows.length) return;
  document.getElementById("kartuGaji").hidden = false;
  document.getElementById("tbGaji").innerHTML = rows.map(g => `<tr>
    <td>${namaBulan(g.periode)}</td>
    <td class="num"><b>${rupiah(g.total)}</b></td>
    <td><span class="badge ${g.dibayar ? "b-lunas" : "b-belum"}">${g.dibayar ? "Dibayar " + tglIndo(g.tglBayar) : "Belum dibayar"}</span></td></tr>`).join("");
})();
