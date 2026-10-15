// Halaman depan (publik)
// Kiri : identitas dayah, login (cukup kata sandi setelah pertama kali), tombol Pengelola, petunjuk pasang aplikasi.
// Kanan: mading, jadwal mengajar dengan pilihan model tampilan. Kaki: teks berjalan.
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc, getDocs, collection } from "./firebase.js";
import {
  ambilProfil, ambilTampilan, tampilanCache, logoDayah, beranda, simpan, esc, PERAN, pasangFooter, pesanError,
  ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, jamSesi, today, tglPanjang, normUsername, usernameValid,
  siapkanHalamanPublik, sinkronJamHTTP, pasangAplikasi, ikon, sembunyikanPemuat, tampilError, aksi
} from "./common.js";
import { MODEL, render, dataLaporanJadwal } from "./jadwal-tampil.js";

siapkanHalamanPublik();
pasangFooter(document.getElementById("kakiKiri"));
const $ = (id) => document.getElementById(id);

// ===================== Identitas dayah =====================
let tampilan = tampilanCache();
function pasangTampilan(t) {
  tampilan = t;
  $("namaDayah").textContent = t.nama;
  $("namaArab").textContent = t.namaArab || "";
  $("namaArab").hidden = !t.namaArab;
  $("alamatDayah").textContent = t.alamat || "";
  $("taglineDayah").textContent = t.tagline || "";
  $("logoDayah").src = logoDayah(t);
  document.title = t.nama;
  if (t.foto) $("panelKiri").style.backgroundImage =
    `linear-gradient(to bottom, rgba(5,30,18,.6), rgba(5,30,18,.92)), url("${t.foto}")`;
}
pasangTampilan(tampilan);
ambilTampilan().then(pasangTampilan);

// Tanggal masehi & hijriah
const tglHari = new Date(Date.parse(today() + "T12:00:00Z"));
let hijri = "";
try { hijri = new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(tglHari).replace(/\s*(SH|AH|H)$/, "") + " H"; } catch { /* abaikan */ }
$("tanggalHariIni").textContent = tglPanjang(today()) + (hijri ? " · " + hijri : "");

// ===================== Login =====================
const form = $("formLogin"), err = $("err"), btn = $("btnMasuk");
let mode = "biasa", sedangLogin = false;
$("lihatSandi").innerHTML = ikon("mata", 18);
$("lihatSandi").onclick = () => form.password.type = form.password.type === "password" ? "text" : "password";
$("btnPengelola").innerHTML = `${ikon("kunci", 15)} Pengelola`;
if (new URLSearchParams(location.search).has("nonaktif")) err.textContent = "Akun Anda nonaktif. Hubungi pengelola dayah.";

const akunTersimpan = () => simpan.get("akunTersimpan");
function tampilLogin() {
  const a = mode === "biasa" ? akunTersimpan() : null;
  $("kotakLogin").classList.toggle("pengelola", mode === "pengelola");
  $("judulLogin").textContent = mode === "pengelola" ? "Ruang Pengelola" : a ? "Masuk" : "Masuk";
  $("subLogin").textContent = mode === "pengelola" ? "Masuk sebagai pengelola sistem" : a ? "Cukup masukkan kata sandi Anda" : "Untuk teungku & pengurus dayah";
  $("akunIngat").hidden = !a;
  $("boxUsername").hidden = !!a;
  form.username.required = !a;
  if (a) {
    $("inisial").textContent = (a.nama || a.u).replace(/^(tgk\.?|teungku|ustaz(ah)?)\s+/i, "").trim().charAt(0).toUpperCase();
    $("namaIngat").textContent = a.nama || a.u;
    $("userIngat").textContent = "@" + a.u;
    form.username.value = a.u;
  } else if (mode === "pengelola") form.username.value = "";
  $("btnBatalPengelola").hidden = mode !== "pengelola";
  $("btnPengelola").hidden = mode === "pengelola";
  $("kotakLogin").hidden = false;
  $("sudahMasuk").hidden = true;
  form.password.value = "";
  err.textContent = "";
}
tampilLogin();
$("btnGantiAkun").onclick = () => { simpan.del("akunTersimpan"); form.username.value = ""; tampilLogin(); form.username.focus(); };
$("btnPengelola").onclick = () => { mode = "pengelola"; tampilLogin(); form.username.focus(); $("kotakLogin").scrollIntoView({ behavior: "smooth", block: "center" }); };
$("btnBatalPengelola").onclick = () => { mode = "biasa"; tampilLogin(); };

getDoc(doc(db, "config", "setup")).then(s => { if (!s.exists()) $("infoSetup").hidden = false; }).catch(() => {});

onAuthStateChanged(auth, async (user) => {
  if (!user || sedangLogin) return;
  const p = await ambilProfil(user.uid).catch(() => null);
  if (!p?.aktif || p.dihapus) { await signOut(auth).catch(() => {}); return; }
  if (mode === "pengelola") return;
  $("kotakLogin").hidden = true;
  $("sudahMasuk").hidden = false;
  $("sudahMasukNama").textContent = `${p.nama} · ${PERAN[p.role] || p.role}`;
  $("btnKeAplikasi").href = beranda(p.role);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const u = normUsername(form.username.value);
  const salah = "Kata sandi salah.";
  if (!usernameValid(u)) { err.textContent = mode === "pengelola" ? "Username atau kata sandi salah." : "Username tidak dikenal."; return; }
  sedangLogin = true;
  btn.disabled = true; btn.innerHTML = `<span class="putar"></span>Memproses...`;
  try {
    const map = await getDoc(doc(db, "usernames", u));
    if (!map.exists()) throw { code: "auth/invalid-credential" };
    const cred = await signInWithEmailAndPassword(auth, map.data().email, form.password.value);
    const p = await ambilProfil(cred.user.uid);
    const isSA = p?.role === "superadmin";
    // Akun pengelola hanya lewat Ruang Pengelola; akun lain hanya lewat login biasa
    if (!p || (mode === "biasa" && isSA) || (mode === "pengelola" && !isSA)) {
      await signOut(auth); err.textContent = mode === "pengelola" ? "Username atau kata sandi salah." : salah; return;
    }
    if (!p.aktif || p.dihapus) { await signOut(auth); err.textContent = "Akun Anda nonaktif. Hubungi pengelola dayah."; return; }
    if (!isSA) simpan.set("akunTersimpan", { u, nama: p.nama });
    simpan.set("profil", { uid: cred.user.uid, ...p }, true);
    location.replace(beranda(p.role));
  } catch (ex) {
    const kode = ex?.code || "";
    err.textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(kode)
      ? (mode === "pengelola" || !akunTersimpan() ? "Username atau kata sandi salah." : salah) : pesanError(ex);
  } finally {
    sedangLogin = false;
    btn.disabled = false; btn.textContent = "Masuk";
  }
});

// ===================== Pasang aplikasi (PWA) =====================
const OS = {
  android: { label: "Android", ikon: "android", langkah: [
    "Buka situs ini di <b>Chrome</b>.", "Ketuk tombol <b>Pasang sekarang</b> di bawah, atau menu <b>⋮</b> → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.",
    "Ikon logo dayah muncul di layar utama HP."] },
  ios: { label: "iPhone", ikon: "apel", langkah: [
    "Buka situs ini di <b>Safari</b>.", "Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bawah layar.",
    "Pilih <b>Tambah ke Layar Utama</b> → <b>Tambah</b>."] },
  pc: { label: "Komputer", ikon: "monitor", langkah: [
    "Buka situs ini di <b>Chrome</b> atau <b>Edge</b>.", "Klik tombol <b>Pasang sekarang</b>, atau ikon <b>⊕ Instal</b> di ujung kanan kolom alamat.",
    "Aplikasi bisa dibuka dari menu Start / desktop."] }
};
const ua = navigator.userAgent;
let os = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : "pc";
function tampilPasang() {
  document.querySelectorAll(".pasang-tab button").forEach(b => {
    b.innerHTML = `${ikon(OS[b.dataset.os].ikon, 15)} ${OS[b.dataset.os].label}`;
    b.classList.toggle("aktif", b.dataset.os === os);
  });
  $("pasangIsi").innerHTML = `<ol class="pasang-langkah">${OS[os].langkah.map(l => `<li>${l}</li>`).join("")}</ol>`;
}
document.querySelector(".pasang-tab").onclick = (e) => { const b = e.target.closest("[data-os]"); if (b) { os = b.dataset.os; tampilPasang(); } };
$("btnPasang").onclick = pasangAplikasi;
tampilPasang();
if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) $("pasangKotak").hidden = true;

// ===================== Pengumuman: mading & teks berjalan =====================
$("judulMading").innerHTML = `${ikon("pin", 20)} Mading Dayah`;
const modalGambar = $("modalGambar");
modalGambar.addEventListener("click", () => modalGambar.classList.remove("open"));
$("mading").addEventListener("click", (e) => { if (e.target.tagName === "IMG") { $("gambarBesar").src = e.target.src; modalGambar.classList.add("open"); } });

function pasangMarquee(items) {
  const teks = items.length ? items : [
    `<b>Ahlan wa sahlan</b> di ${esc(tampilan.nama)}`,
    `${esc(tglPanjang(today()))}${hijri ? " · " + esc(hijri) : ""}`
  ];
  const jalur = $("jalurBerjalan");
  jalur.innerHTML = teks.map(t => `<span>${t}</span>`).join("");
  jalur.style.setProperty("--durasi", Math.max(20, jalur.textContent.length / 5.5) + "s");
  $("marquee").hidden = false;
  document.body.classList.add("ada-marquee");
}
getDocs(collection(db, "pengumuman")).then(snap => {
  const kini = today();
  const aktif = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.aktif !== false && (!p.mulai || p.mulai <= kini) && (!p.sampai || kini <= p.sampai))
    .sort((a, b) => (a.urutan || 0) - (b.urutan || 0) || (b.mulai || "").localeCompare(a.mulai || ""));
  pasangMarquee(aktif.filter(p => p.jenis === "berjalan").map(p => `<b>${esc(p.judul)}</b>${p.isi ? " — " + esc(p.isi) : ""}`));
  const mading = aktif.filter(p => p.jenis === "mading");
  if (mading.length) {
    $("madingWrap").hidden = false;
    $("mading").innerHTML = mading.map(p => `<article class="mading-item">
        ${p.gambar ? `<img src="${p.gambar}" alt="">` : ""}
        <div class="isi"><b>${esc(p.judul)}</b><p>${esc(p.isi || "")}</p>${p.mulai ? `<small>${esc(tglPanjang(p.mulai))}</small>` : ""}</div></article>`).join("");
  }
}).catch(() => pasangMarquee([]));

// ===================== Jadwal (pilihan model) =====================
const ctx = { cfg: null, jadwal: [], hari: null, cari: "", namaDayah: tampilan.nama, riwayat: null };
let model = simpan.get("modelJadwal") || "roster";
if (!MODEL.some(m => m.id === model)) model = "roster";

function gambarModel() {
  $("modelPilih").innerHTML = MODEL.map(m => `<button class="${m.id === model ? "aktif" : ""}" data-model="${m.id}">${ikon(m.ikon, 20)}${m.label}</button>`).join("");
}
function gambarJadwal() {
  ctx.namaDayah = tampilan.nama;
  $("isiJadwal").innerHTML = render(model, ctx);
}
$("modelPilih").onclick = async (e) => {
  const b = e.target.closest("[data-model]");
  if (!b) return;
  model = b.dataset.model;
  simpan.set("modelJadwal", model);
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
  const i = $("cariKitab"); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
});

gambarModel();
try {
  const [cfg, semua] = await Promise.all([ambilConfigAbsensi(), ambilJadwal()]);
  ctx.cfg = cfg;
  ctx.jadwal = semua.filter(e => e.aktifGuru !== false);
  ctx.hari = new Date(Date.parse(today() + "T00:00:00Z")).getUTCDay();
  $("pubSesi").innerHTML = cfg.sesi.map(s => `<span>${ikon(s.id === "pagi" ? "matahari" : "bulan", 16)} <b>${esc(s.nama)}</b> ${jamSesi(s)} WIB</span>`).join("");
  gambarJadwal();
  if (model === "riwayat") ambilRiwayatJadwal().then(r => { ctx.riwayat = r; gambarJadwal(); }).catch(() => {});
} catch (ex) {
  $("isiJadwal").innerHTML = `<div class="card"><p class="error-box">Jadwal gagal dimuat: ${esc(pesanError(ex))}</p>
    <button class="btn btn-sec" onclick="location.reload()">Coba lagi</button></div>`;
} finally {
  sembunyikanPemuat();
}
sinkronJamHTTP();
