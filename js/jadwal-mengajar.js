// Jadwal mengajar: teungku memilih sesi (Pagi/Malam) per hari, JAM MENGAJAR di dalam rentang sesi
// (rentang diatur Super Admin), lalu kitab, materi, tempat, kelas.
// Setiap tambah/ubah/hapus dicatat ke "riwayat_jadwal" (internal) dan log aktivitas.
// "sejak" menyimpan tanggal mulai berlaku agar rekap bulan lalu tidak berubah.
import { db, collection, getDocs, getDoc, doc, query, where, writeBatch, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, toast, esc, ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, idJadwal, HARI, SEMUA_HARI,
  jamSesi, today, aksi, ikon, tampilError, catatLog, kirimNotif, waktuIndo,
  rentangSesi, jamEntri, formatJam, titikJam, teksJam, teksDurasi, LANGKAH_MENIT, konfirmasi
} from "./common.js";

const { profil } = await requireAuth(AKSES.jadwal);
const isGuru = profil.role === "guru";
const tb = document.getElementById("tbJadwal");
const sel = document.getElementById("pilihGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formJadwal");
const cfg = await ambilConfigAbsensi();
const [pagi, malam] = cfg.sesi;
const sesiById = Object.fromEntries(cfg.sesi.map(s => [s.id, s]));
document.getElementById("thPagi").innerHTML = `${ikon("matahari", 16)} ${esc(pagi.nama)} (${jamSesi(pagi)})`;
document.getElementById("thMalam").innerHTML = `${ikon("bulan", 16)} ${esc(malam.nama)} (${jamSesi(malam)})`;

let guruList = [], guruId = null, entri = {}, edit = null, semuaJadwal = [];

if (isGuru) {
  if (!profil.guruId) { tb.innerHTML = `<tr><td colspan="3" class="empty">Akun belum ditautkan ke data teungku. Hubungi pengelola.</td></tr>`; throw Object.assign(new Error("guruId kosong"), { _sudahDitampilkan: true }); }
  const g = await getDoc(doc(db, "guru", profil.guruId));
  guruList = [{ id: profil.guruId, ...(g.data() || { nama: profil.nama }) }];
  guruId = profil.guruId;
  document.getElementById("keterangan").textContent =
    "Ketuk kotak untuk memilih sesi yang Anda ajar, lalu isi kitab & materinya. Tombol Hadir di menu Absen mengikuti jadwal ini.";
} else {
  try {
    const snap = await getDocs(query(collection(db, "guru"), where("aktif", "==", true)));
    guruList = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  } catch (ex) { tampilError(ex, "Gagal memuat data teungku"); }
  document.getElementById("pilihGuruWrap").hidden = false;
  sel.innerHTML = guruList.length ? guruList.map(g => `<option value="${g.id}">${esc(g.nama)}</option>`).join("") : `<option value="">Belum ada teungku aktif</option>`;
  guruId = guruList[0]?.id || null;
  sel.onchange = () => { guruId = sel.value; muat(); };
  document.getElementById("keterangan").textContent = "Pilih teungku untuk melihat atau mengubah jadwalnya. Teungku juga bisa mengatur jadwalnya sendiri.";
}
const guruNow = () => guruList.find(g => g.id === guruId);

ambilJadwal().then(semua => {
  semuaJadwal = semua;
  const kitab = [...new Set(semua.map(e => e.kitab).filter(Boolean))].sort();
  document.getElementById("daftarKitab").innerHTML = kitab.map(k => `<option value="${esc(k)}">`).join("");
}).catch(() => {});

async function muat() {
  if (!guruId) { tb.innerHTML = `<tr><td colspan="3" class="empty">Belum ada teungku.</td></tr>`; return; }
  try {
    const [list, riw] = await Promise.all([ambilJadwal(guruId), ambilRiwayatJadwal(guruId)]);
    entri = Object.fromEntries(list.map(e => [e.id, e]));
    document.getElementById("judulJadwal").textContent = `Jadwal ${guruNow()?.nama || ""} · ${list.length} sesi per minggu`;
    tb.innerHTML = SEMUA_HARI.map(h => `<tr><th class="hari">${HARI[h]}</th>${sel_(pagi, h)}${sel_(malam, h)}</tr>`).join("");
    document.getElementById("daftarRiwayat").innerHTML = riw.length ? riw.slice(0, 50).map(itemRiwayat).join("") : `<li class="empty">Belum ada perubahan.</li>`;
  } catch (ex) { tampilError(ex, "Gagal memuat jadwal"); }
}
function sel_(s, h) {
  if (!s.hari.includes(h)) return `<td class="off-cell">Tidak ada sesi</td>`;
  const e = entri[idJadwal(guruId, s.id, h)];
  const j = e ? jamEntri(e, s) : null;
  return e
    ? `<td><div class="slot isi" data-sesi="${s.id}" data-hari="${h}" role="button" tabindex="0">
         <span class="jam-slot ${j.ada && !j.diLuarSesi ? "" : "lama"}">${ikon("jam", 13)} ${teksJam(e, s)} · ${j.durasi} mnt</span>
         ${!j.ada ? `<small class="teks-peringatan">Jam belum dipilih, ketuk untuk mengatur</small>` : j.diLuarSesi ? `<small class="teks-peringatan">Di luar jam sesi terbaru, ketuk untuk mengatur</small>` : ""}
         <b>${esc(e.kitab)}</b>${e.materi ? `<span>${esc(e.materi)}</span>` : ""}${(e.tempat || e.kelas) ? `<small>${[e.tempat, e.kelas].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</div></td>`
    : `<td><button class="slot kosong" data-sesi="${s.id}" data-hari="${h}">+ Pilih</button></td>`;
}
function itemRiwayat(r) {
  const t = { tambah: ["+", "tambah", "Menambah"], ubah: ["✎", "ubah", "Mengubah"], hapus: ["−", "hapus", "Menghapus"] }[r.aksi] || ["•", "ubah", "Mengubah"];
  const fmt = (x) => x ? `${x.mulai ? titikJam(x.mulai) + "–" + titikJam(x.selesai) + " · " : ""}${esc(x.kitab)}${x.materi ? " · " + esc(x.materi) : ""}${x.tempat ? " · " + esc(x.tempat) : ""}${x.kelas ? " · " + esc(x.kelas) : ""}` : "";
  return `<li><span class="tanda ${t[1]}">${t[0]}</span><div>
    ${t[2]} <b>${HARI[r.hari] || ""} · ${esc(sesiById[r.sesi]?.nama || r.sesi)}</b><br>
    ${r.aksi === "ubah" ? `<del>${fmt(r.sebelum)}</del> → <ins>${fmt(r.sesudah)}</ins>` : r.aksi === "hapus" ? `<del>${fmt(r.sebelum)}</del>` : `<ins>${fmt(r.sesudah)}</ins>`}
    <small>${waktuIndo(r.waktu)} · oleh ${esc(r.olehNama || "")}</small></div></li>`;
}

function buka(sesiId, hari) {
  edit = { sesi: sesiId, hari: Number(hari) };
  const s = sesiById[sesiId];
  const e = entri[idJadwal(guruId, sesiId, edit.hari)];
  document.getElementById("judulModal").textContent = `${HARI[edit.hari]} · Sesi ${s.nama}`;
  isiPilihanJam(s, e);
  form.kitab.value = e?.kitab || "";
  form.materi.value = e?.materi || "";
  form.kelas.value = e?.kelas || "";
  form.tempat.value = e?.tempat || "";
  document.getElementById("btnHapus").hidden = !e;
  modal.classList.add("open");
  setTimeout(() => form.kitab.focus(), 50);
}
tb.addEventListener("click", (e) => { const el = e.target.closest("[data-sesi]"); if (el) buka(el.dataset.sesi, el.dataset.hari); });
tb.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset?.sesi) buka(e.target.dataset.sesi, e.target.dataset.hari); });

// ---------- Pilihan jam mengajar (di dalam rentang sesi, kelipatan 15 menit) ----------
const selMulai = document.getElementById("jamMulai"), selSelesai = document.getElementById("jamSelesai");
const opsiJam = (a, b, pilih) => {
  const o = [];
  for (let m = a; m <= b; m += LANGKAH_MENIT) o.push(`<option value="${m}" ${m === pilih ? "selected" : ""}>${titikJam(formatJam(m))}${m >= 1440 ? " (lewat tengah malam)" : ""}</option>`);
  return o.join("");
};
function isiPilihanJam(s, e) {
  const r = rentangSesi(s);
  const j = jamEntri(e, s);
  const bulat = (m) => r.awal + Math.round((m - r.awal) / LANGKAH_MENIT) * LANGKAH_MENIT;
  let a = e && j.ada && !j.diLuarSesi ? j.menitMulai : r.awal;
  let b = e && j.ada && !j.diLuarSesi ? j.menitSelesai : Math.min(r.awal + 120, r.akhir);
  a = Math.min(Math.max(bulat(a), r.awal), r.akhir - LANGKAH_MENIT);
  b = Math.min(Math.max(bulat(b), a + LANGKAH_MENIT), r.akhir);
  document.getElementById("infoRentang").innerHTML = `${ikon("info", 14)} Sesi ${esc(s.nama)} ditetapkan pukul <b>${titikJam(s.mulai)}–${titikJam(s.selesai)}</b>${r.akhir > 1440 ? " (+1 hari)" : ""}. Pilih jam mengajar Anda di dalam rentang ini.`;
  selMulai.innerHTML = opsiJam(r.awal, r.akhir - LANGKAH_MENIT, a);
  isiSelesai(b);
}
function isiSelesai(pilih) {
  const s = sesiById[edit.sesi], r = rentangSesi(s);
  const a = Number(selMulai.value);
  const b = Math.max(Number.isFinite(pilih) ? pilih : Number(selSelesai.value) || 0, a + LANGKAH_MENIT);
  selSelesai.innerHTML = opsiJam(a + LANGKAH_MENIT, r.akhir, Math.min(b, r.akhir));
  tampilDurasi();
}
function tampilDurasi() {
  const d = Number(selSelesai.value) - Number(selMulai.value);
  const el = document.getElementById("infoDurasi");
  el.classList.toggle("salah", !(d > 0));
  el.innerHTML = d > 0 ? `${ikon("jam", 16)} Durasi: ${teksDurasi(d)}` : "Jam selesai harus sesudah jam mulai";
}
selMulai.onchange = () => isiSelesai(Number(selSelesai.value));
selSelesai.onchange = tampilDurasi;

// Peringatan bila kelas/tempat yang sama dipakai teungku lain pada jam yang bertabrakan
function bentrok(baru) {
  const kunci = (x) => [(x.kelas || "").trim().toLowerCase(), (x.tempat || "").trim().toLowerCase()];
  const [kB, tB] = kunci(baru);
  return semuaJadwal.filter(x => x.guruId !== guruId && x.hari === edit.hari && x.aktifGuru !== false).filter(x => {
    const s = sesiById[x.sesi]; if (!s) return false;
    const j = jamEntri(x, s);
    const tumpang = j.menitMulai < baru.menitSelesai && baru.menitMulai < j.menitSelesai;
    const [k, t] = kunci(x);
    return tumpang && ((kB && k === kB) || (tB && t === tB));
  });
}

// Tulis jadwal + riwayat dalam satu batch
function tulis(b, aksiNama, sebelum, sesudah) {
  const id = idJadwal(guruId, edit.sesi, edit.hari);
  b.set(doc(collection(db, "riwayat_jadwal")), {
    guruId, namaGuru: guruNow()?.nama || profil.nama, sesi: edit.sesi, hari: edit.hari, aksi: aksiNama,
    sebelum: sebelum ? { kitab: sebelum.kitab || "", materi: sebelum.materi || "", tempat: sebelum.tempat || "", kelas: sebelum.kelas || "", mulai: sebelum.mulai || "", selesai: sebelum.selesai || "" } : null,
    sesudah: sesudah ? { kitab: sesudah.kitab, materi: sesudah.materi, tempat: sesudah.tempat, kelas: sesudah.kelas, mulai: sesudah.mulai, selesai: sesudah.selesai } : null,
    sejak: sebelum?.sejak || today(), tanggal: today(),
    oleh: profil.uid, olehNama: profil.nama, waktu: serverTimestamp()
  });
  return id;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const lama = entri[idJadwal(guruId, edit.sesi, edit.hari)];
  const mM = Number(selMulai.value), mS = Number(selSelesai.value);
  if (!(mS > mM)) return toast("Jam selesai harus sesudah jam mulai.", "err");
  const baru = {
    kitab: form.kitab.value.trim(), materi: form.materi.value.trim(), tempat: form.tempat.value.trim(), kelas: form.kelas.value.trim(),
    mulai: formatJam(mM), selesai: formatJam(mS), menitMulai: mM, menitSelesai: mS, durasi: mS - mM
  };
  if (lama && ["kitab", "materi", "tempat", "kelas", "menitMulai", "menitSelesai"].every(k => (lama[k] ?? "") === baru[k])) { modal.classList.remove("open"); return; }
  aksi(document.getElementById("btnSimpan"), async () => {
    const tabrak = bentrok(baru);
    if (tabrak.length && !(await konfirmasi({
      judul: "Jadwal bertabrakan", ya: "Tetap simpan", tidak: "Ubah dulu", ikonNama: "jam",
      isi: tabrak.map(x => `${x.namaGuru}: ${teksJam(x, sesiById[x.sesi])} · ${x.tempat || "-"} · ${x.kelas || "-"}`).join("; ")
        + ". Kelas/tempat yang sama sudah dipakai pada jam itu."
    }))) return;
    const b = writeBatch(db);
    const id = tulis(b, lama ? "ubah" : "tambah", lama, baru);
    b.set(doc(db, "mengajar", id), {
      guruId, namaGuru: guruNow()?.nama || profil.nama, aktifGuru: guruNow()?.aktif !== false,
      sesi: edit.sesi, hari: edit.hari, ...baru, sejak: lama?.sejak || today(),
      diubahOleh: profil.nama, diubah: serverTimestamp()
    });
    await b.commit();
    const ket = `${guruNow()?.nama}: ${HARI[edit.hari]} ${sesiById[edit.sesi].nama} ${titikJam(baru.mulai)}–${titikJam(baru.selesai)} (${baru.durasi} menit) — ${baru.kitab}`;
    catatLog("Jadwal", lama ? "Ubah" : "Tambah", ket);
    if (isGuru) kirimNotif({ untukPeran: "admin", judul: "Jadwal mengajar diubah", isi: ket, tautan: "jadwal-mengajar.html" });
    modal.classList.remove("open");
    toast("Jadwal tersimpan");
    const i = semuaJadwal.findIndex(x => x.id === id);
    const simpanLokal = { id, guruId, namaGuru: guruNow()?.nama, sesi: edit.sesi, hari: edit.hari, ...baru };
    if (i >= 0) semuaJadwal[i] = simpanLokal; else semuaJadwal.push(simpanLokal);
    muat();
  });
});

document.getElementById("btnHapus").onclick = () => {
  const lama = entri[idJadwal(guruId, edit.sesi, edit.hari)];
  if (!confirm("Hapus jadwal di sesi ini? Sesi ini tidak muncul lagi di absensi mulai hari ini.")) return;
  aksi(document.getElementById("btnHapus"), async () => {
    const b = writeBatch(db);
    const id = tulis(b, "hapus", lama, null);
    b.delete(doc(db, "mengajar", id));
    await b.commit();
    const ket = `${guruNow()?.nama}: ${HARI[edit.hari]} ${sesiById[edit.sesi].nama} — ${lama.kitab}`;
    catatLog("Jadwal", "Hapus", ket);
    if (isGuru) kirimNotif({ untukPeran: "admin", judul: "Jadwal mengajar dihapus", isi: ket, tautan: "jadwal-mengajar.html" });
    modal.classList.remove("open");
    toast("Jadwal dihapus");
    muat();
  }, "Menghapus...");
};
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");

// Laporan semua jadwal
async function dataLaporan() {
  const { dataLaporanJadwal } = await import("./jadwal-tampil.js");
  return dataLaporanJadwal(cfg, (await ambilJadwal()).filter(e => e.aktifGuru !== false));
}
document.getElementById("btnPdf")?.addEventListener("click", (e) => aksi(e.target, async () => (await import("./laporan.js")).pdfTabel(await dataLaporan()), "Membuat PDF..."));
document.getElementById("btnExcel")?.addEventListener("click", (e) => aksi(e.target, async () => (await import("./laporan.js")).excelTabel(await dataLaporan()), "Membuat Excel..."));

muat();
