// Halaman teungku: absen dengan selfie live, izin/sakit, jadwal, riwayat, mukafaah.
// Jam & tanggal memakai waktu server; database juga memeriksa jam sesi, jadwal & selfie.
import { db, collection, getDocs, getDoc, doc, query, where, serverTimestamp, writeBatch, addDoc, deleteDoc } from "./firebase.js";
import {
  requireAuth, AKSES, today, thisMonth, namaBulan, tglIndo, tglPanjang, toast, esc, rupiah, aksi, tampilError,
  ambilConfigAbsensi, HARI, SEMUA_HARI, hariDari, terjadwal, ambilJadwal, indeksJadwal, idJadwal, jamSesi,
  waktuAbsen, jamSiap, sekarang, WIB_MS, lewatTengahMalam, tambahHari, badgeStatus, STATUS, catatLog, kirimNotif,
  gambarKecil, pesanError, ikon, teksJam, jamEntri, teksDurasi,
  periksaLokasiAbsen, jendelaPulang, statusPulang, teksJarak
} from "./common.js";
import { ambilSelfie } from "./kamera.js";

const { profil } = await requireAuth(AKSES.absenSaya);
document.getElementById("nama").textContent = profil.nama;
const pesan = document.getElementById("pesan");

if (!profil.guruId) {
  pesan.innerHTML = `<span class="error-box">Akun Anda belum ditautkan ke data teungku. Hubungi pengelola dayah.</span>`;
  document.getElementById("daftarSesi").innerHTML = "";
  throw Object.assign(new Error("guruId kosong"), { _sudahDitampilkan: true });
}

await jamSiap;   // tunggu jam server
let guru = (await getDoc(doc(db, "guru", profil.guruId))).data();
if (!guru) {
  pesan.innerHTML = `<span class="error-box">Data teungku Anda tidak ditemukan. Hubungi pengelola dayah.</span>`;
  throw Object.assign(new Error("data guru tidak ada"), { _sudahDitampilkan: true });
}
const cfg = await ambilConfigAbsensi();
let tgl = today();
const bln = thisMonth();
document.getElementById("bulanIni").textContent = namaBulan(bln);

const jadwalSaya = await ambilJadwal(profil.guruId);
const idx = indeksJadwal(jadwalSaya);
const entri = Object.fromEntries(jadwalSaya.map(e => [e.id, e]));
const dijadwal = (s, t) => terjadwal(idx, profil.guruId, s, hariDari(t));

// Jam server berjalan
const jamEl = document.getElementById("jamServer");
let riwayat = [];
const putarJam = () => {
  jamEl.innerHTML = ikon("jam", 15) + " " + new Date(sekarang() + WIB_MS).toISOString().slice(11, 16) + " WIB (jam server)";
  if (today() !== tgl) { tgl = today(); muat(); }
  else if (riwayat.length || document.querySelector("#daftarSesi .sesi-item")) tampil();   // tombol Hadir/Pulang ikut jam
};
putarJam(); setInterval(putarJam, 15000);

// Jadwal mingguan
document.getElementById("tbJadwal").innerHTML = SEMUA_HARI.map(h => {
  const list = cfg.sesi.filter(s => s.hari.includes(h) && idx.has(idJadwal(profil.guruId, s.id, h)));
  return `<tr ${h === hariDari(tgl) ? 'style="background:#f0f7f2;font-weight:600"' : ""}>
    <td>${HARI[h]}</td>
    <td>${list.length ? list.map(s => { const e = entri[idJadwal(profil.guruId, s.id, h)]; return `<div class="jdw-saya"><b>${esc(s.nama)} · ${teksJam(e, s)}</b><small>${esc(e?.kitab || "")}${jamEntri(e, s).ada ? "" : " · jam belum diatur"}</small></div>`; }).join("") : '<span class="muted">Tidak mengajar</span>'}</td></tr>`;
}).join("") + (jadwalSaya.length ? "" : `<tr><td colspan="2" class="empty">Anda belum memilih jadwal. <a href="jadwal-mengajar.html"><b>Atur jadwal →</b></a></td></tr>`);


// Sesi yang bisa diabsen sekarang: hari ini + sesi kemarin yang lewat tengah malam & masih terbuka
function sesiHariIni() {
  const hasil = [];
  for (const s of cfg.sesi) {
    if (s.hari.includes(hariDari(tgl)) && dijadwal(s, tgl)) hasil.push({ s, t: tgl });
    const kemarin = tambahHari(tgl, -1);
    if (lewatTengahMalam(s) && s.hari.includes(hariDari(kemarin)) && dijadwal(s, kemarin) && waktuAbsen(s, cfg, kemarin, entri[idJadwal(profil.guruId, s.id, hariDari(kemarin))]).boleh)
      hasil.push({ s, t: kemarin });
  }
  return hasil;
}

async function muat() {
  try {
    const snap = await getDocs(query(collection(db, "absensi"), where("guruId", "==", profil.guruId), where("bulan", "==", bln)));
    riwayat = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.tanggal + b.sesi).localeCompare(a.tanggal + a.sesi));
    tampil();
  } catch (ex) { tampilError(ex, "Gagal memuat absensi"); }
}

function tampil() {
  document.getElementById("judulHariIni").textContent = `Absen · ${tglPanjang(tgl)}`;
  const tercatat = Object.fromEntries(riwayat.map(a => [`${a.tanggal}_${a.sesi}`, a]));
  pesan.textContent = guru?.aktif === false ? "Status Anda nonaktif di Data Teungku."
    : cfg.guruMandiri ? `Tekan "Hadir", ambil selfie, lalu kirim. Mukafaah kehadiran: ${rupiah(guru.honorHadir)} per sesi.`
    : "Absen mandiri sedang dimatikan. Absensi diisi oleh operator.";
  const list = sesiHariIni();
  document.getElementById("daftarSesi").innerHTML = !list.length
    ? `<p class="empty">Hari ini (${HARI[hariDari(tgl)]}) tidak ada jadwal mengajar Anda.<br><a href="jadwal-mengajar.html">Atur jadwal mengajar →</a></p>`
    : list.map(({ s, t }) => {
      const a = tercatat[`${t}_${s.id}`];
      const e = entri[idJadwal(profil.guruId, s.id, hariDari(t))];
      const w = waktuAbsen(s, cfg, t, e);
      return `<div class="sesi-item">
        <div><b>${ikon(s.id === "pagi" ? "matahari" : "bulan", 16)} ${esc(s.nama)} · ${teksJam(e, s)}</b> <small>${teksDurasi(jamEntri(e, s).durasi)}${t !== tgl ? " · sesi " + tglIndo(t) : ""}</small>
          ${e?.kitab ? `<br><small>Kitab: <b>${esc(e.kitab)}</b>${e.materi ? " · Materi: " + esc(e.materi) : ""}${e.tempat ? " · Tempat: " + esc(e.tempat) : ""}${e.kelas ? " · Kelas: " + esc(e.kelas) : ""}</small>` : ""}
          ${a ? `<br><small>${a.sumber === "mandiri" ? "dicatat sendiri" : a.sumber === "izin" ? "dari pengajuan izin" : "dicatat operator"}${a.status === "H" ? " · " + rupiah(a.insentif) : ""}</small>` : ""}
          ${(() => { const pk = statusPulang(a, cfg); return pk.teks ? `<span class="pulang-ket ${pk.kode}">${pk.kode === "lewat" ? "⚠ " : ""}${pk.teks}</span>` : ""; })()}
          ${!a && cfg.guruMandiri ? `<br><small class="${w.boleh ? "" : "teks-peringatan"}">${w.pesan}</small>` : ""}</div>
        ${a && statusPulang(a, cfg).kode === "buka" && guru?.aktif !== false ? `<div class="aksi-absen">${badgeStatus(a.status)}<button class="btn btn-emas" data-pulang="${a.id}" data-sesi-p="${s.id}" data-tgl="${t}">${ikon("kamera", 16)} Pulang</button></div>`
          : a ? badgeStatus(a.status)
          : cfg.guruMandiri && guru?.aktif !== false ? `<button class="btn" data-sesi="${s.id}" data-tgl="${t}" ${w.boleh ? "" : "disabled"}>${ikon("kamera", 16)} Hadir</button>`
          : `<span class="muted kecil">belum diabsen</span>`}
      </div>`;
    }).join("");

  const hadir = riwayat.filter(a => a.status === "H");
  document.getElementById("sHadir").textContent = hadir.length + " sesi";
  document.getElementById("sIzin").textContent = riwayat.filter(a => a.status === "I" || a.status === "S").length + " sesi";
  document.getElementById("sInsentif").textContent = rupiah(hadir.reduce((x, a) => x + (Number(a.insentif) || 0), 0));
  document.getElementById("tbRiwayat").innerHTML = riwayat.length ? riwayat.map(a => `<tr>
      <td class="utama">${tglIndo(a.tanggal)}</td><td>${esc(a.sesiNama || a.sesi)}</td>
      <td>${badgeStatus(a.status)}${(() => { const pk = statusPulang(a, cfg); return pk.teks ? `<span class="pulang-ket ${pk.kode}">${pk.teks}</span>` : ""; })()}</td><td>${esc(a.materi || a.kitab || "–")}</td>
      <td class="num">${rupiah(a.insentif)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">Belum ada absensi bulan ini.</td></tr>`;
}

// ---------- Hadir: selfie + materi ----------
const modalHadir = document.getElementById("modalHadir");
const formHadir = document.getElementById("formHadir");
let hadirKini = null;

document.getElementById("daftarSesi").addEventListener("click", async (e) => {
  if (e.target.closest("[data-pulang]")) return absenPulang(e.target.closest("[data-pulang]"));
  const b = e.target.closest("[data-sesi]");
  if (!b) return;
  const s = cfg.sesi.find(x => x.id === b.dataset.sesi);
  const t = b.dataset.tgl;
  if (!navigator.onLine) return toast("Absen butuh internet agar jam & selfie bisa diperiksa server.", "err");
  const w = waktuAbsen(s, cfg, t, entri[idJadwal(profil.guruId, s.id, hariDari(t))]);
  if (!w.boleh) { toast(w.pesan, "err"); return tampil(); }
  let gps;
  try { gps = await cekGps(b); } catch { return; }
  const foto = await ambilSelfie({ judul: `Selfie hadir · ${s.nama}`, keterangan: "Pastikan wajah terlihat jelas. Foto ini wajib dan disimpan bersama absen." });
  if (!foto) return;
  const e2 = entri[idJadwal(profil.guruId, s.id, hariDari(t))];
  const j2 = jamEntri(e2, s);
  hadirKini = { s, t, foto, gps, kitab: e2?.kitab || "", kelas: e2?.kelas || "", tempat: e2?.tempat || "", jam: { jamMulai: j2.mulai, jamSelesai: j2.selesai, durasi: j2.durasi } };
  document.getElementById("judulHadir").textContent = `Hadir · ${s.nama} ${teksJam(e2, s)} · ${tglIndo(t)}`;
  document.getElementById("pvSelfie").src = foto;
  formHadir.kitab.value = e2?.kitab || "";
  formHadir.materi.value = e2?.materi || "";
  modalHadir.classList.add("open");
});
document.getElementById("btnBatalHadir").onclick = () => modalHadir.classList.remove("open");

formHadir.addEventListener("submit", (e) => {
  e.preventDefault();
  const { s, t, foto, gps, kitab, kelas, tempat, jam } = hadirKini;
  aksi(document.getElementById("btnKirimHadir"), async () => {
    guru = (await getDoc(doc(db, "guru", profil.guruId))).data() || guru;   // nilai terbaru (dicek server)
    const id = `${t}_${s.id}_${profil.guruId}`;
    const b = writeBatch(db);
    b.set(doc(db, "selfie", id), { guruId: profil.guruId, nama: guru.nama, tanggal: t, sesi: s.id, foto, waktu: serverTimestamp() });
    b.set(doc(db, "absensi", id), {
      tanggal: t, bulan: t.slice(0, 7), hari: hariDari(t), sesi: s.id, sesiNama: s.nama,
      guruId: profil.guruId, nama: guru.nama, status: "H", insentif: guru.honorHadir ?? 0,
      kitab, kelas, tempat, ...jam, materi: formHadir.materi.value.trim(), adaSelfie: true, keterangan: "",
      sumber: "mandiri", dicatatOleh: profil.username, waktu: serverTimestamp(),
      ...(gps.lokasi ? { lokasi: gps.lokasi, jarak: gps.jarak } : {})
    });
    // tanda "Teungku hadir" di menu Jadwal Teungku
    b.set(doc(db, "hadir_publik", id), { tanggal: t, sesi: s.id, guruId: profil.guruId, hari: hariDari(t), waktu: serverTimestamp() });
    try { await b.commit(); }
    catch (ex) {
      if (ex.code === "permission-denied") {
        const alasan = await alasanDitolak(s, t).catch(() => pesanError(ex));
        pesan.innerHTML = `<span class="error-box">⚠ Absen ditolak: ${esc(alasan)}</span>`;
        modalHadir.classList.remove("open");
        throw new Error("Absen ditolak: " + alasan);
      }
      throw ex;
    }
    catatLog("Absensi", "Hadir (mandiri)", `${t} ${s.nama}${formHadir.materi.value ? " · " + formHadir.materi.value : ""}`);
    modalHadir.classList.remove("open");
    toast(`Hadir tercatat · ${rupiah(guru.honorHadir)}`);
    muat();
  }, "Mengirim...");
});

// ---------- GPS ----------
async function cekGps(tombol) {
  if (!cfg.lokasi?.aktif) return { lokasi: null, jarak: null };
  const asli = tombol.innerHTML;
  tombol.disabled = true; tombol.innerHTML = `<span class="putar"></span> Memeriksa lokasi...`;
  try {
    const g = await periksaLokasiAbsen(cfg);
    toast(`Lokasi sesuai · ${teksJarak(g.jarak)} dari dayah`);
    return g;
  } catch (ex) {
    pesan.innerHTML = `<span class="error-box">⚠ ${esc(ex.message)}</span>`;
    toast(ex.message, "err");
    throw ex;
  } finally { tombol.disabled = false; tombol.innerHTML = asli; }
}

// ---------- Absen pulang: selfie selesai mengajar ----------
async function absenPulang(tombol) {
  const id = tombol.dataset.pulang, t = tombol.dataset.tgl;
  const s = cfg.sesi.find(x => x.id === tombol.dataset.sesiP);
  const a = riwayat.find(x => x.id === id);
  if (!s || !a) return;
  if (!navigator.onLine) return toast("Absen pulang butuh internet.", "err");
  const e = entri[idJadwal(profil.guruId, s.id, hariDari(t))];
  const w = jendelaPulang(s, t, cfg, e), now = sekarang();
  if (now < w.buka || now > w.tutup) { toast("Di luar waktu absen pulang.", "err"); return tampil(); }
  let gps;
  try { gps = await cekGps(tombol); } catch { return; }
  const foto = await ambilSelfie({ judul: `Selfie pulang · ${s.nama}`, keterangan: "Selfie tanda selesai mengajar." });
  if (!foto) return;
  aksi(tombol, async () => {
    const b = writeBatch(db);
    b.set(doc(db, "selfie", "pulang_" + id), { guruId: profil.guruId, nama: guru.nama, tanggal: t, sesi: s.id, jenis: "pulang", foto, waktu: serverTimestamp() });
    b.update(doc(db, "absensi", id), { waktuPulang: serverTimestamp(), ...(gps.lokasi ? { lokasiPulang: gps.lokasi, jarakPulang: gps.jarak } : {}) });
    try { await b.commit(); }
    catch (ex) {
      if (ex.code === "permission-denied") {
        const alasan = cfg.lokasi?.aktif ? "di luar waktu absen pulang atau di luar radius dayah" : "di luar waktu absen pulang";
        pesan.innerHTML = `<span class="error-box">⚠ Absen pulang ditolak: ${alasan}. Bila yakin benar, minta pengelola mem-Publish aturan database versi 3.3.0.</span>`;
        throw new Error("Absen pulang ditolak: " + alasan);
      }
      throw ex;
    }
    catatLog("Absensi", "Pulang (mandiri)", `${t} ${s.nama}`);
    toast("Absen pulang tercatat. Terima kasih, jazakallah khair.");
    muat();
  }, "Mengirim...");
}

// Penjelasan penyebab penolakan
async function alasanDitolak(s, t) {
  const g = (await getDoc(doc(db, "guru", profil.guruId))).data() || {};
  if (g.aktif !== true) return "status Anda nonaktif di Data Teungku.";
  const c = await ambilConfigAbsensi();
  if (!c.guruMandiri) return "absen mandiri sedang dimatikan oleh pengelola.";
  const sNow = c.sesi.find(x => x.id === s.id);
  const daftar = await ambilJadwal(profil.guruId);
  const w = waktuAbsen(sNow, c, t, daftar.find(x => x.sesi === s.id && x.hari === hariDari(t)));
  if (!w.boleh) return w.pesan + ".";
  const jdw = indeksJadwal(daftar);
  if (!terjadwal(jdw, profil.guruId, sNow, hariDari(t))) return `sesi ${s.nama} tidak ada di jadwal Anda hari ${HARI[hariDari(t)]}.`;
  const ada = await getDoc(doc(db, "absensi", `${t}_${s.id}_${profil.guruId}`)).catch(() => null);
  if (ada?.exists()) return "sesi ini sudah tercatat sebelumnya. Muat ulang halaman.";
  if (c.lokasi?.aktif) return "posisi GPS di luar radius dayah atau lokasi belum terbaca. Coba lagi di area dayah.";
  return "data tidak lolos pemeriksaan server. Kemungkinan aturan database (firestore.rules) belum versi 3.3.0 — minta pengelola mem-Publish ulang.";
}

// ---------- Izin & sakit ----------
const modalIzin = document.getElementById("modalIzin");
const formIzin = document.getElementById("formIzin");
let lampiran = "", izinSaya = [];
const STATUS_IZIN = { menunggu: ["b-belum", "⏳ Menunggu"], disetujui: ["b-in", "✔ Disetujui"], ditolak: ["b-out", "✖ Ditolak"] };

async function muatIzin() {
  try {
    const s = await getDocs(query(collection(db, "izin"), where("uid", "==", profil.uid)));
    izinSaya = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.dari || "").localeCompare(a.dari || ""));
    document.getElementById("daftarIzin").innerHTML = izinSaya.length ? izinSaya.slice(0, 10).map(z => `
      <div class="izin-kartu"><div class="kepala">
        <b>${STATUS[z.jenis]?.ikon || ""} ${STATUS[z.jenis]?.label || z.jenis} · ${tglIndo(z.dari)}${z.sampai !== z.dari ? " – " + tglIndo(z.sampai) : ""}</b>
        <span class="badge ${STATUS_IZIN[z.status]?.[0]}">${STATUS_IZIN[z.status]?.[1] || z.status}</span></div>
        <div class="kecil">${esc(z.alasan)} <span class="muted">· sesi ${(z.sesi || []).map(x => cfg.sesi.find(s => s.id === x)?.nama || x).join(", ")}</span></div>
        ${z.catatanPimpinan ? `<div class="kecil"><b>Catatan pimpinan:</b> ${esc(z.catatanPimpinan)}</div>` : ""}
        ${z.status === "menunggu" ? `<button class="btn btn-sm btn-sec" data-batal-izin="${z.id}" style="margin-top:6px">Batalkan pengajuan</button>` : ""}
      </div>`).join("") : `<p class="empty">Belum ada pengajuan.</p>`;
  } catch (ex) { tampilError(ex, "Gagal memuat izin"); }
}
document.getElementById("btnAjukan").onclick = () => {
  formIzin.reset(); lampiran = "";
  formIzin.dari.value = formIzin.sampai.value = today();
  formIzin.dari.min = formIzin.sampai.min = tambahHari(today(), -7);
  document.getElementById("cekSesiIzin").innerHTML = cfg.sesi.map(s =>
    `<label><input type="checkbox" value="${s.id}" checked><span>${esc(s.nama)}</span></label>`).join("");
  document.getElementById("pvLampiran").hidden = true;
  modalIzin.classList.add("open");
};
document.getElementById("btnBatalIzin").onclick = () => modalIzin.classList.remove("open");
document.getElementById("fileLampiran").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    lampiran = await gambarKecil(f, 900, 230000);
    const img = document.getElementById("pvLampiran");
    img.src = lampiran; img.hidden = false;
  } catch (ex) { tampilError(ex); }
};
formIzin.addEventListener("submit", (e) => {
  e.preventDefault();
  const sesi = [...document.querySelectorAll("#cekSesiIzin input:checked")].map(c => c.value);
  if (!sesi.length) return toast("Pilih minimal satu sesi", "err");
  if (formIzin.sampai.value < formIzin.dari.value) return toast("Tanggal 'sampai' harus setelah 'dari'", "err");
  aksi(document.getElementById("btnKirimIzin"), async () => {
    const data = {
      uid: profil.uid, guruId: profil.guruId, nama: guru.nama, jenis: formIzin.jenis.value,
      dari: formIzin.dari.value, sampai: formIzin.sampai.value, sesi, alasan: formIzin.alasan.value.trim(),
      status: "menunggu", waktu: serverTimestamp()
    };
    if (lampiran) data.lampiran = lampiran;
    await addDoc(collection(db, "izin"), data);
    const jenis = STATUS[data.jenis].label;
    catatLog("Izin", "Ajukan " + jenis, `${data.dari} s.d. ${data.sampai}: ${data.alasan}`);
    kirimNotif({ untukPeran: "pimpinan", judul: `Pengajuan ${jenis.toLowerCase()} baru`, isi: `${guru.nama}: ${tglIndo(data.dari)}${data.sampai !== data.dari ? " – " + tglIndo(data.sampai) : ""} · ${data.alasan}`, tautan: "izin.html" });
    modalIzin.classList.remove("open");
    toast("Pengajuan terkirim ke Pimpinan Dayah");
    muatIzin();
  }, "Mengirim...");
});
document.getElementById("daftarIzin").addEventListener("click", (e) => {
  const id = e.target.dataset.batalIzin;
  if (!id || !confirm("Batalkan pengajuan ini?")) return;
  aksi(e.target, async () => {
    await deleteDoc(doc(db, "izin", id));
    catatLog("Izin", "Batalkan pengajuan", id);
    toast("Pengajuan dibatalkan");
    muatIzin();
  });
});

// ---------- Mukafaah saya ----------
(async () => {
  const [y, m] = bln.split("-").map(Number);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const per = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    const s = await getDoc(doc(db, "gaji", `${per}_${profil.guruId}`)).catch(() => null);
    if (s?.exists()) rows.push({ id: s.id, ...s.data() });
  }
  if (!rows.length) return;
  document.getElementById("kartuMukafaah").hidden = false;
  document.getElementById("tbMukafaah").innerHTML = rows.map(g => `<tr>
    <td class="utama">${namaBulan(g.periode)}</td><td class="num"><b>${rupiah(g.total)}</b></td>
    <td><span class="badge ${g.dibayar ? "b-lunas" : "b-belum"}">${g.dibayar ? "✔ Diserahkan " + tglIndo(g.tglBayar) : "⏳ Belum diserahkan"}</span></td>
    <td class="aksi-sel">${g.dibayar ? `<button class="btn btn-sm btn-sec" data-slip="${g.id}">${ikon("pdf", 15)} Slip PDF</button>` : ""}</td></tr>`).join("");
  document.getElementById("tbMukafaah").addEventListener("click", async (e) => {
    const id = e.target.dataset.slip;
    if (!id) return;
    const g = rows.find(r => r.id === id);
    const L = await import("./laporan.js");
    aksi(e.target, () => L.slipMukafaah(g, { unduh: true }), "Membuat PDF...");
  });
})();

// Tombol absen buka/tutup mengikuti jam
setInterval(() => { if (!modalHadir.classList.contains("open")) tampil(); }, 60000);
muat();
muatIzin();
