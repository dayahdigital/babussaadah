// Jadwal Teungku (internal): Pimpinan, Super Admin & Teungku.
// Model tampilan: roster, kartu, papan, tabel, per kitab, per teungku, riwayat.
// Lampu berkedip saat pengajian berlangsung & tanda "Teungku hadir" (realtime).
import { db, collection, query, where, onSnapshot } from "./firebase.js";
import {
  requireAuth, AKSES, ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, ambilTampilan, tampilanCache, jamSesi,
  today, tambahHari, tglPanjang, simpan, esc, ikon, aksi, tampilError, pesanError
} from "./common.js";
import { MODEL, render, dataLaporanJadwal, aturHadir, berlangsungHTML, tandaStatus } from "./jadwal-tampil.js";

await requireAuth(AKSES.lihatJadwal);
const $ = (id) => document.getElementById(id);
let tampilan = tampilanCache();

const tglHari = new Date(Date.parse(today() + "T12:00:00Z"));
let hijri = "";
try { hijri = new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(tglHari).replace(/\s*(SH|AH|H)$/, "") + " H"; } catch { /* abaikan */ }
$("tanggalHariIni").textContent = tglPanjang(today()) + (hijri ? " · " + hijri : "");

const ctx = { cfg: null, jadwal: [], hari: null, cari: "", namaDayah: tampilan.nama, riwayat: null };
// Model bawaan diatur Super Admin (Profil Dayah); pilihan pengguna berlaku selama halaman dibuka.
const modelValid = (m) => MODEL.some(x => x.id === m) ? m : "roster";
let model = modelValid(simpan.get("modelJadwal", true) || tampilan.modelJadwal);
ambilTampilan().then(t => {
  tampilan = t;
  if (!simpan.get("modelJadwal", true) && modelValid(t.modelJadwal) !== model) { model = modelValid(t.modelJadwal); gambarModel(); if (ctx.cfg) gambarJadwal(); }
}).catch(() => {});

function gambarModel() {
  const m = MODEL.find(x => x.id === model);
  $("btnTampilan").innerHTML = `${ikon(m.ikon, 16)} Tampilan: ${m.label} <span aria-hidden="true">${$("modelPilih").hidden ? "▾" : "▴"}</span>`;
  $("modelPilih").innerHTML = MODEL.map(m => `<button class="${m.id === model ? "aktif" : ""}" data-model="${m.id}">${ikon(m.ikon, 20)}${m.label}</button>`).join("");
}
function gambarJadwal() {
  ctx.namaDayah = tampilan.nama;
  const cari = document.activeElement?.id === "cariKitab" ? document.activeElement.selectionStart : null;
  $("isiJadwal").innerHTML = render(model, ctx);
  if (ctx.cfg) $("langsung").innerHTML = berlangsungHTML(ctx.cfg, ctx.jadwal);
  if (cari !== null) { const i = $("cariKitab"); i?.focus(); i?.setSelectionRange(cari, cari); }
}
$("btnTampilan").onclick = () => {
  const buka = $("modelPilih").hidden;
  $("modelPilih").hidden = !buka;
  $("btnTampilan").setAttribute("aria-expanded", String(buka));
  gambarModel();
};
$("modelPilih").onclick = async (e) => {
  const b = e.target.closest("[data-model]");
  if (!b) return;
  model = b.dataset.model;
  simpan.set("modelJadwal", model, true);
  $("modelPilih").hidden = true; $("btnTampilan").setAttribute("aria-expanded", "false");
  gambarModel(); gambarJadwal();
  if (model === "riwayat" && ctx.riwayat === null) {
    try { ctx.riwayat = await ambilRiwayatJadwal(); } catch (ex) { ctx.riwayat = []; tampilError(ex, "Gagal memuat riwayat"); }
    gambarJadwal();
  }
};
$("isiJadwal").addEventListener("click", (e) => {
  const h = e.target.closest("[data-hari]");
  if (h) { ctx.hari = Number(h.dataset.hari); gambarJadwal(); return; }
  const a = e.target.closest("[data-aksi]");
  if (!a) return;
  if (a.dataset.aksi === "layar-penuh") $("papanJadwal")?.requestFullscreen?.().catch(() => {});
  if (a.dataset.aksi === "pdf") aksi(a, async () => (await import("./laporan.js")).pdfTabel(dataLaporanJadwal(ctx.cfg, ctx.jadwal)), "Membuat PDF...");
  if (a.dataset.aksi === "excel") aksi(a, async () => (await import("./laporan.js")).excelTabel(dataLaporanJadwal(ctx.cfg, ctx.jadwal)), "Membuat Excel...");
});
$("isiJadwal").addEventListener("input", (e) => {
  if (e.target.id !== "cariKitab") return;
  ctx.cari = e.target.value;
  gambarJadwal();
});

// Status langsung: hadir (realtime) & lampu berlangsung (dicek tiap 20 detik)
let tandaTerakhir = "";
function cekStatus() {
  if (!ctx.cfg) return;
  const t = tandaStatus(ctx.cfg, ctx.jadwal);
  if (t !== tandaTerakhir) { tandaTerakhir = t; gambarJadwal(); }
}

gambarModel();
try {
  const [cfg, semua] = await Promise.all([ambilConfigAbsensi(), ambilJadwal()]);
  ctx.cfg = cfg;
  ctx.jadwal = semua.filter(e => e.aktifGuru !== false);
  ctx.hari = new Date(Date.parse(today() + "T00:00:00Z")).getUTCDay();
  $("pubSesi").innerHTML = cfg.sesi.map(s => `<span>${ikon(s.id === "pagi" ? "matahari" : "bulan", 16)} <b>${esc(s.nama)}</b> ${jamSesi(s)} WIB</span>`).join("");
  gambarJadwal();
  tandaTerakhir = tandaStatus(cfg, ctx.jadwal);
  onSnapshot(query(collection(db, "hadir_publik"), where("tanggal", "in", [today(), tambahHari(today(), -1)])), (snap) => {
    aturHadir(new Map(snap.docs.map(d => [d.id, d.data().waktu?.toMillis?.() || 1])));
    cekStatus();
  }, () => { /* tanpa status hadir bila gagal */ });
  setInterval(cekStatus, 20000);
  if (model === "riwayat") ambilRiwayatJadwal().then(r => { ctx.riwayat = r; gambarJadwal(); }).catch(() => {});
} catch (ex) {
  $("isiJadwal").innerHTML = `<div class="card"><p class="error-box">Jadwal gagal dimuat: ${esc(pesanError(ex))}</p>
    <button class="btn btn-sec" onclick="location.reload()">Coba lagi</button></div>`;
}
