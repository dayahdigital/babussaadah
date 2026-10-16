// Absensi oleh Operator/Admin per tanggal & sesi. Jadwal yang berlaku pada tanggal itu menentukan daftar teungku.
import { db, collection, getDocs, getDoc, doc, setDoc, query, where, writeBatch, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, today, thisMonth, namaBulan, toast, esc, rupiah, aksi, tampilError, catatLog,
  ambilConfigAbsensi, HARI, SEMUA_HARI, hariDari, sesiPadaHari, ambilJadwal, ambilRiwayatJadwal, buatPeriode, jadwalPada,
  hitungJadwalBulan, idJadwal, jamSesi, jamSiap, STATUS, tglIndo, teksJam, jamEntri,
  ambilLokasi, cosLintang, teksJarak, statusPulang
} from "./common.js";

const { profil } = await requireAuth(AKSES.absensi);
const bolehAtur = AKSES.aturSesi.includes(profil.role);
await jamSiap;

const inTanggal = document.getElementById("tanggal");
const selSesi = document.getElementById("sesi");
const inBulan = document.getElementById("bulan");
const cbSemua = document.getElementById("tampilSemua");
const tbAbsen = document.getElementById("tbAbsen");
const tbRekap = document.getElementById("tbRekap");
inTanggal.value = today();
inTanggal.max = today();
inBulan.value = thisMonth();

let guru = [], awal = {}, rekapRows = [];
let cfg = await ambilConfigAbsensi();
const [jadwalAktif, riwayatJadwal] = await Promise.all([ambilJadwal(), ambilRiwayatJadwal()]);
const per = buatPeriode(jadwalAktif, riwayatJadwal);
const entriJadwal = Object.fromEntries(jadwalAktif.map(e => [e.id, e]));
const sesiTerpilih = () => cfg.sesi.find(s => s.id === selSesi.value);
const insentifUntuk = (g, st) => st === "H" ? Number(g.honorHadir) || 0 : 0;

function isiSesi() {
  const h = hariDari(inTanggal.value);
  document.getElementById("namaHari").textContent = "· " + HARI[h];
  const list = sesiPadaHari(cfg, h);
  const pilih = selSesi.value;
  selSesi.innerHTML = list.length ? list.map(s => `<option value="${s.id}">${esc(s.nama)} (${jamSesi(s)})</option>`).join("")
    : `<option value="">— tidak ada sesi hari ${HARI[h]} —</option>`;
  if (list.some(s => s.id === pilih)) selSesi.value = pilih;
}

async function muatGuru() {
  try {
    const snap = await getDocs(query(collection(db, "guru"), where("aktif", "==", true)));
    guru = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  } catch (ex) { tampilError(ex, "Gagal memuat data teungku"); }
}

async function muatHarian() {
  const tgl = inTanggal.value, s = sesiTerpilih(), h = hariDari(tgl);
  if (!s) { tbAbsen.innerHTML = `<tr><td colspan="6" class="empty">Tidak ada sesi pada hari ${HARI[h]}.</td></tr>`; hitungTotal(); return; }
  try {
    const snap = await getDocs(query(collection(db, "absensi"), where("tanggal", "==", tgl)));
    awal = {};
    snap.docs.forEach(d => { const a = d.data(); if (a.sesi === s.id) awal[a.guruId] = a; });
    const tampil = guru.filter(g => jadwalPada(per, g.id, s, tgl) || awal[g.id] || cbSemua.checked);
    const sembunyi = guru.length - tampil.length;
    tbAbsen.innerHTML = tampil.length ? tampil.map(g => {
      const a = awal[g.id];
      const luar = !jadwalPada(per, g.id, s, tgl);
      const e = entriJadwal[idJadwal(g.id, s.id, h)];
      return `<tr data-id="${g.id}">
        <td class="utama">${esc(g.nama)}${luar ? ' <span class="badge b-belum">di luar jadwal</span>' : ""}${e ? `<br><small class="muted">${teksJam(e, s)} · ${jamEntri(e, s).durasi} menit</small>` : ""}</td>
        <td>${esc(a?.kitab || e?.kitab || "–")}${(a?.materi || e?.materi) ? `<br><small class="muted">${esc(a?.materi || e?.materi)}</small>` : ""}</td>
        <td><div class="status-group">${Object.entries(STATUS).map(([k, v]) => `
          <label><input type="radio" name="st_${g.id}" value="${k}" ${a?.status === k ? "checked" : ""}><span class="${k}" title="${v.label}">${v.ikon} ${k}</span></label>`).join("")}</div>
          ${(() => { const pk = statusPulang(a, cfg); return pk.teks ? `<span class="pulang-ket ${pk.kode}">${pk.kode === "lewat" ? "⚠ " : ""}${pk.teks}</span>` : ""; })()}
          ${a?.jarak != null ? `<span class="pulang-ket">GPS: ${teksJarak(a.jarak)} dari dayah</span>` : ""}</td>
        <td class="num ins">–</td>
        <td><input class="ket" value="${esc(a?.keterangan || "")}" placeholder="${luar ? "mis. badal Tgk. ..." : "opsional"}"></td>
        <td>${a?.adaSelfie ? `<button class="btn btn-sm btn-sec" data-selfie="${tgl}_${s.id}_${g.id}">Hadir</button>${a?.waktuPulang ? ` <button class="btn btn-sm btn-sec" data-selfie="pulang_${tgl}_${s.id}_${g.id}">Pulang</button>` : ""}` : a?.sumber === "izin" ? '<span class="kecil muted">dari izin</span>' : "–"}</td></tr>`;
    }).join("") + (sembunyi && !cbSemua.checked ? `<tr><td colspan="6" class="empty">${sembunyi} teungku tidak terjadwal di sesi ini disembunyikan.</td></tr>` : "")
      : `<tr><td colspan="6" class="empty">Tidak ada teungku terjadwal di sesi ini.</td></tr>`;
    hitungTotal();
  } catch (ex) { tampilError(ex, "Gagal memuat absensi"); }
}

function hitungTotal() {
  let tot = 0;
  tbAbsen.querySelectorAll("tr[data-id]").forEach(tr => {
    const g = guru.find(x => x.id === tr.dataset.id);
    const st = tr.querySelector("input[type=radio]:checked")?.value;
    const a = awal[g.id];
    const n = !st ? 0 : (a && a.status === st && a.insentif != null) ? Number(a.insentif) : insentifUntuk(g, st);
    tr.querySelector(".ins").textContent = st ? rupiah(n) : "–";
    tot += n;
  });
  document.getElementById("totSesi").textContent = rupiah(tot);
}
tbAbsen.addEventListener("change", (e) => { if (e.target.type === "radio") hitungTotal(); });
tbAbsen.addEventListener("click", async (e) => {
  const id = e.target.dataset.selfie;
  if (!id) return;
  try {
    const s = await getDoc(doc(db, "selfie", id));
    if (!s.exists()) return toast("Foto selfie tidak ditemukan", "err");
    document.getElementById("fotoSelfie").src = s.data().foto;
    document.getElementById("ketSelfie").textContent = `${s.data().nama} · ${tglIndo(s.data().tanggal)} · ${s.data().waktu?.toDate?.().toLocaleTimeString("id-ID") || ""}`;
    document.getElementById("modalSelfie").classList.add("open");
  } catch (ex) { tampilError(ex); }
});
document.getElementById("modalSelfie").onclick = (e) => e.currentTarget.classList.remove("open");

function simpan() {
  const tgl = inTanggal.value, s = sesiTerpilih();
  if (!s) return toast("Tidak ada sesi pada tanggal ini", "err");
  const b = writeBatch(db);
  const ubah = [];
  tbAbsen.querySelectorAll("tr[data-id]").forEach(tr => {
    const id = tr.dataset.id;
    const st = tr.querySelector(`input[name="st_${id}"]:checked`)?.value;
    const ket = tr.querySelector(".ket").value.trim();
    const a = awal[id];
    if (!st || (a && a.status === st && (a.keterangan || "") === ket)) return;
    const g = guru.find(x => x.id === id);
    const e = entriJadwal[idJadwal(id, s.id, hariDari(tgl))];
    b.set(doc(db, "absensi", `${tgl}_${s.id}_${id}`), {
      ...(a || {}),
      tanggal: tgl, bulan: tgl.slice(0, 7), hari: hariDari(tgl), sesi: s.id, sesiNama: s.nama,
      guruId: id, nama: g.nama, status: st, insentif: (a && a.status === st) ? a.insentif : insentifUntuk(g, st),
      kitab: a?.kitab || e?.kitab || "", materi: a?.materi || e?.materi || "", kelas: a?.kelas || e?.kelas || "", tempat: a?.tempat || e?.tempat || "",
      jamMulai: a?.jamMulai || (e ? jamEntri(e, s).mulai : ""), jamSelesai: a?.jamSelesai || (e ? jamEntri(e, s).selesai : ""),
      durasi: a?.durasi ?? (e ? jamEntri(e, s).durasi : 0),
      terjadwal: jadwalPada(per, id, s, tgl), keterangan: ket,
      sumber: a?.sumber === "mandiri" && st === "H" ? "mandiri" : "operator",
      dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    // Tanda "hadir" di halaman web publik
    const idP = `${tgl}_${s.id}_${id}`;
    if (st === "H") b.set(doc(db, "hadir_publik", idP), { tanggal: tgl, sesi: s.id, guruId: id, hari: hariDari(tgl), waktu: a?.status === "H" && a.waktu ? a.waktu : serverTimestamp() });
    else if (a?.status === "H") b.delete(doc(db, "hadir_publik", idP));
    ubah.push(`${g.nama}: ${a?.status ? a.status + "→" : ""}${st}`);
  });
  if (!ubah.length) return toast("Tidak ada perubahan untuk disimpan", "info");
  aksi(document.getElementById("btnSimpan"), async () => {
    await b.commit();
    catatLog("Absensi", "Simpan absensi", `${tgl} ${s.nama}: ${ubah.join(", ")}`);
    toast(`Absensi ${ubah.length} teungku tersimpan`);
    await muatHarian();
    if (tgl.startsWith(inBulan.value)) muatRekap();
  });
}

let absenBulan = [];
async function muatRekap() {
  const bln = inBulan.value;
  try {
    const snap = await getDocs(query(collection(db, "absensi"), where("bulan", "==", bln)));
    absenBulan = snap.docs.map(d => d.data());
    const r = {};
    const baru = (id, nama) => ({ id, nama, jadwal: hitungJadwalBulan(cfg, per, id, bln), H: 0, I: 0, S: 0, A: 0, tercatat: 0, insentif: 0 });
    absenBulan.forEach(a => {
      r[a.guruId] ??= baru(a.guruId, a.nama);
      r[a.guruId][a.status]++;
      r[a.guruId].insentif += Number(a.insentif) || 0;
      const s = cfg.sesi.find(x => x.id === a.sesi);
      if (s && jadwalPada(per, a.guruId, s, a.tanggal)) r[a.guruId].tercatat++;
    });
    guru.forEach(g => { r[g.id] ??= baru(g.id, g.nama); });
    rekapRows = Object.values(r).sort((a, b) => a.nama.localeCompare(b.nama));
    const total = rekapRows.reduce((s, x) => s + x.insentif, 0);
    tbRekap.innerHTML = rekapRows.length ? rekapRows.map(x => {
      const belum = Math.max(0, x.jadwal - x.tercatat);
      return `<tr><td class="utama">${esc(x.nama)}</td><td class="num">${x.jadwal}</td><td class="num">${x.H}</td><td class="num">${x.I}</td>
        <td class="num">${x.S}</td><td class="num">${x.A}</td><td class="num">${belum ? `<span class="badge b-belum">${belum}</span>` : 0}</td>
        <td class="num">${x.jadwal ? Math.round(x.H / x.jadwal * 100) + "%" : "–"}</td><td class="num">${rupiah(x.insentif)}</td></tr>`;
    }).join("") + `<tr class="total"><td colspan="8">Total ${namaBulan(bln)}</td><td class="num">${rupiah(total)}</td></tr>`
      : `<tr><td colspan="9" class="empty">Tidak ada data.</td></tr>`;
  } catch (ex) { tampilError(ex, "Gagal memuat rekap"); }
}

// ---------- Laporan PDF & Excel ----------
const L = () => import("./laporan.js");
const dataRekap = () => ({
  judul: "REKAP ABSENSI TEUNGKU", sub: `Bulan ${namaBulan(inBulan.value)}`,
  kolom: ["No", "Nama Teungku", "Jadwal", "Hadir", "Izin", "Sakit", "Alpa", "Belum diabsen", "% Hadir", "Mukafaah Kehadiran"],
  baris: rekapRows.map((x, i) => [i + 1, x.nama, x.jadwal, x.H, x.I, x.S, x.A, Math.max(0, x.jadwal - x.tercatat),
    x.jadwal ? Math.round(x.H / x.jadwal * 100) + "%" : "-", { uang: x.insentif }]),
  total: ["", "JUMLAH", ...["jadwal", "H", "I", "S", "A"].map(k => rekapRows.reduce((s, x) => s + x[k], 0)), "", "", { uang: rekapRows.reduce((s, x) => s + x.insentif, 0) }],
  namaFile: `rekap-absensi-${inBulan.value}`, ttd: true
});
const dataRinci = () => {
  const rows = [...absenBulan].sort((a, b) => (a.tanggal + a.sesi + a.nama).localeCompare(b.tanggal + b.sesi + b.nama));
  return {
    judul: "DAFTAR ABSENSI TEUNGKU", sub: `Bulan ${namaBulan(inBulan.value)}`, lanskap: true,
    kolom: ["No", "Tanggal", "Hari", "Sesi", "Jam", "Nama Teungku", "Kitab", "Materi Ajar", "Status", "Pulang", "Keterangan", "Mukafaah"],
    baris: rows.map((a, i) => [i + 1, tglIndo(a.tanggal), HARI[hariDari(a.tanggal)], a.sesiNama || a.sesi,
      a.jamMulai ? `${a.jamMulai.replace(":", ".")}-${(a.jamSelesai || "").replace(":", ".")}` : "-", a.nama, a.kitab || "-", a.materi || "-",
      `${a.status} - ${STATUS[a.status]?.label || ""}`, statusPulang(a, cfg).teks || "-", a.keterangan || "", { uang: a.insentif || 0 }]),
    total: ["", "", "", "", "", "", "", "", "", "", "JUMLAH", { uang: rows.reduce((s, a) => s + (Number(a.insentif) || 0), 0) }],
    namaFile: `absensi-${inBulan.value}`, ttd: true
  };
};
document.getElementById("btnPdfRekap").onclick = (e) => aksi(e.target, async () => (await L()).pdfTabel(dataRekap()), "Membuat PDF...");
document.getElementById("btnPdfRinci").onclick = (e) => aksi(e.target, async () => (await L()).pdfTabel(dataRinci()), "Membuat PDF...");
document.getElementById("btnExcel").onclick = (e) => aksi(e.target, async () => (await L()).excelBuku(`absensi-${inBulan.value}`, [dataRekap(), dataRinci()]), "Membuat Excel...");

// ---------- Pengaturan sesi (Super Admin) ----------
function tampilAtur() {
  document.getElementById("daftarSesi").innerHTML = cfg.sesi.map(s => `
    <div class="sesi-atur" data-sesi="${s.id}">
      <div class="grid grid-3" style="margin-bottom:8px">
        <div class="field"><label>${s.id === "pagi" ? "🌅 Sesi pertama" : "🌙 Sesi kedua"} — nama</label><input class="namaSesi" value="${esc(s.nama)}" maxlength="30"></div>
        <div class="field"><label>Jam mulai</label><input type="time" class="mulai" value="${esc(s.mulai)}" required></div>
        <div class="field"><label>Jam selesai</label><input type="time" class="selesai" value="${esc(s.selesai)}" required></div>
      </div>
      <div class="hari-cek">${SEMUA_HARI.map(h => `<label><input type="checkbox" class="hariSesi" value="${h}" ${s.hari.includes(h) ? "checked" : ""}><span>${HARI[h]}</span></label>`).join("")}</div>
    </div>`).join("");
  document.getElementById("tolSebelum").value = cfg.toleransiSebelum;
  document.getElementById("tolSesudah").value = cfg.toleransiSesudah;
  document.getElementById("guruMandiri").checked = cfg.guruMandiri;
  document.getElementById("pulangSebelum").value = cfg.pulangSebelum;
  document.getElementById("pulangSesudah").value = cfg.pulangSesudah;
  const L = cfg.lokasi;
  document.getElementById("gpsAktif").checked = !!L.aktif;
  document.getElementById("gpsLat").value = Number.isFinite(L.lat) ? L.lat : "";
  document.getElementById("gpsLng").value = Number.isFinite(L.lng) ? L.lng : "";
  document.getElementById("gpsRadius").value = L.radius || 100;
  tampilPeta();
}
// Peta pratinjau (OpenStreetMap, tanpa kunci API)
function bacaKoordinat() {
  const n = (id) => parseFloat(String(document.getElementById(id).value).replace(",", "."));
  return { lat: n("gpsLat"), lng: n("gpsLng"), radius: parseInt(document.getElementById("gpsRadius").value) || 0 };
}
function tampilPeta() {
  const { lat, lng, radius } = bacaKoordinat();
  const sah = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  document.getElementById("petaWrap").hidden = !sah;
  document.getElementById("lnkPeta").hidden = !sah;
  if (!sah) return;
  const r = Math.max(radius, 50) * 3, dLat = r / 111320, dLng = r / (111320 * cosLintang(lat));
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}&layer=mapnik&marker=${lat},${lng}`;
  const peta = document.getElementById("petaLokasi");
  if (peta.src !== src) peta.src = src;
  document.getElementById("lnkPeta").href = `https://www.google.com/maps?q=${lat},${lng}`;
}
["gpsLat", "gpsLng", "gpsRadius"].forEach(id => document.getElementById(id)?.addEventListener("change", tampilPeta));
document.getElementById("btnLokasiSaya")?.addEventListener("click", (e) => aksi(e.target, async () => {
  const p = await ambilLokasi();
  document.getElementById("gpsLat").value = p.lat;
  document.getElementById("gpsLng").value = p.lng;
  document.getElementById("infoGps").textContent = `Akurasi ±${p.akurasi} m${p.akurasi > 30 ? " — kurang tepat, coba di tempat terbuka lalu ulangi" : ""}`;
  tampilPeta();
}, "Mencari lokasi..."));
if (bolehAtur) {
  tampilAtur();
  document.getElementById("btnSimpanAtur").onclick = (e) => {
    const sesi = [...document.querySelectorAll("[data-sesi].sesi-atur")].map(el => ({
      id: el.dataset.sesi, nama: el.querySelector(".namaSesi").value.trim() || (el.dataset.sesi === "pagi" ? "Pagi" : "Malam"),
      mulai: el.querySelector(".mulai").value, selesai: el.querySelector(".selesai").value,
      hari: [...el.querySelectorAll(".hariSesi:checked")].map(c => Number(c.value))
    }));
    if (sesi.some(s => !/^\d{2}:\d{2}$/.test(s.mulai) || !/^\d{2}:\d{2}$/.test(s.selesai))) return toast("Isi jam mulai dan selesai setiap sesi", "err");
    if (sesi.some(s => s.mulai === s.selesai)) return toast("Jam mulai dan selesai tidak boleh sama", "err");
    if (sesi.some(s => !s.hari.length)) return toast("Setiap sesi harus punya minimal satu hari", "err");
    const tolSeb = Math.min(240, Math.max(0, parseInt(document.getElementById("tolSebelum").value) || 0));
    const tolSes = Math.min(240, Math.max(0, parseInt(document.getElementById("tolSesudah").value) || 0));
    const pulSeb = Math.min(240, Math.max(0, parseInt(document.getElementById("pulangSebelum").value) || 0));
    const pulSes = Math.min(600, Math.max(0, parseInt(document.getElementById("pulangSesudah").value) || 0));
    const k = bacaKoordinat();
    const gpsAktif = document.getElementById("gpsAktif").checked;
    const adaKoordinat = Number.isFinite(k.lat) && Number.isFinite(k.lng) && Math.abs(k.lat) <= 90 && Math.abs(k.lng) <= 180;
    if (gpsAktif && !adaKoordinat) return toast("Isi lintang & bujur lokasi dayah (atau tekan 'Pakai lokasi saya sekarang').", "err");
    if (gpsAktif && (k.radius < 10 || k.radius > 5000)) return toast("Radius absen 10–5000 meter.", "err");
    const lokasi = adaKoordinat
      ? { aktif: gpsAktif, lat: k.lat, lng: k.lng, radius: k.radius || 100, cosLat: cosLintang(k.lat) }
      : { aktif: false, radius: k.radius || 100 };
    const data = {
      sesi, guruMandiri: document.getElementById("guruMandiri").checked, toleransiSebelum: tolSeb, toleransiSesudah: tolSes,
      pulangSebelum: pulSeb, pulangSesudah: pulSes, lokasi,
      jam: Object.fromEntries(sesi.map(s => [s.id, { mulai: s.mulai, selesai: s.selesai }])),   // dipakai aturan server
      diubah: serverTimestamp(), oleh: profil.username
    };
    aksi(e.target, async () => {
      await setDoc(doc(db, "config", "absensi"), data);
      catatLog("Pengaturan", "Ubah sesi", sesi.map(s => `${s.nama} ${s.mulai}-${s.selesai} [${s.hari.map(h => HARI[h].slice(0, 3)).join(",")}]`).join("; ") + ` · toleransi ${tolSeb}/${tolSes} mnt · pulang ${pulSeb}/${pulSes} mnt · GPS ${lokasi.aktif ? `${lokasi.lat},${lokasi.lng} r=${lokasi.radius} m` : "tidak wajib"} · mandiri ${data.guruMandiri ? "ya" : "tidak"}`);
      cfg = await ambilConfigAbsensi();
      toast("Pengaturan sesi tersimpan");
      isiSesi(); tampilAtur(); muatHarian(); muatRekap();
    });
  };
}

document.getElementById("btnSemuaHadir").onclick = () => { tbAbsen.querySelectorAll('input[value="H"]').forEach(r => r.checked = true); hitungTotal(); };
document.getElementById("btnSimpan").onclick = simpan;
inTanggal.onchange = () => { isiSesi(); muatHarian(); };
selSesi.onchange = muatHarian;
cbSemua.onchange = muatHarian;
inBulan.onchange = muatRekap;

isiSesi();
await muatGuru();
muatHarian();
muatRekap();
