// Halaman teungku: absen mandiri per sesi + lihat insentif sendiri.
// Aturan Firestore memastikan teungku hanya bisa mencatat HADIR untuk dirinya sendiri,
// hanya untuk tanggal hari ini (WIB), dengan insentif sesuai tarifnya, dan tidak bisa mengubahnya lagi.
import { db, collection, getDocs, getDoc, setDoc, doc, query, where, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, today, thisMonth, namaBulan, tglIndo, toast, esc, rupiah,
  ambilConfigAbsensi, HARI, SEMUA_HARI, hariDari, terjadwal
} from "./common.js";

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
const guru = guruSnap.data();
const cfg = await ambilConfigAbsensi();
const tgl = today();
const bln = thisMonth();
const hariIniNo = hariDari(tgl);
document.getElementById("judulHariIni").textContent = `Absen hari ini · ${HARI[hariIniNo]}, ${tglIndo(tgl)}`;
document.getElementById("bulanIni").textContent = namaBulan(bln);

// Jadwal mingguan teungku ini
document.getElementById("tbJadwal").innerHTML = SEMUA_HARI.map(h => {
  const list = cfg.sesi.filter(s => terjadwal(guru, s, h));
  return `<tr ${h === hariIniNo ? 'style="background:#f0f7f2;font-weight:600"' : ""}>
    <td style="width:90px">${HARI[h]}</td>
    <td>${list.length ? list.map(s => esc(s.nama)).join(" · ") : '<span style="color:#6b7770">Libur</span>'}</td>
    <td class="num">${list.length ? list.length + " sesi" : ""}</td></tr>`;
}).join("");

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
  const sesiHariIni = cfg.sesi.filter(s => terjadwal(guru, s, hariIniNo) || hariIni[s.id]);
  if (!sesiHariIni.length) {
    document.getElementById("daftarSesi").innerHTML =
      `<div class="empty">Hari ini (${HARI[hariIniNo]}) tidak ada jadwal mengajar Anda.</div>`;
  } else document.getElementById("daftarSesi").innerHTML = sesiHariIni.map(s => {
    const a = hariIni[s.id];
    return `<div class="sesi-item">
      <div><b>${esc(s.nama)}</b>${a ? `<br><small>${a.sumber === "mandiri" ? "dicatat sendiri" : "dicatat operator"}${a.status === "H" ? " · " + rupiah(a.insentif) : ""}</small>` : ""}</div>
      ${a ? `<span class="badge ${BADGE[a.status]}">${LABEL[a.status]}</span>`
          : cfg.guruMandiri && guru?.aktif ? `<button class="btn" data-sesi="${s.id}">Hadir</button>`
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

document.getElementById("daftarSesi").addEventListener("click", async (e) => {
  const sesiId = e.target.dataset.sesi;
  if (!sesiId) return;
  const s = cfg.sesi.find(x => x.id === sesiId);
  if (!confirm(`Catat HADIR untuk sesi ${s.nama} hari ini?`)) return;
  e.target.disabled = true;
  try {
    await setDoc(doc(db, "absensi", `${tgl}_${sesiId}_${profil.guruId}`), {
      tanggal: tgl, bulan: bln, sesi: sesiId, sesiNama: s.nama,
      guruId: profil.guruId, nama: guru.nama, status: "H",
      insentif: Number(guru.honorHadir) || 0, keterangan: "",
      sumber: "mandiri", dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    toast(`Hadir tercatat · insentif ${rupiah(guru.honorHadir)}`);
    muat();
  } catch (ex) {
    e.target.disabled = false;
    toast(ex.code === "permission-denied"
      ? "Ditolak. Pastikan tanggal & jam HP benar, atau sesi ini sudah diabsen operator."
      : "Gagal: " + ex.code, "err");
  }
});

muat();
