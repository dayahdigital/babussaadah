// Halaman depan (publik)
// Kiri : identitas dayah, login (cukup kata sandi setelah pertama kali), tombol Install, tulisan Pengelola di kaki.
// Kanan: mading, jadwal mengajar dengan pilihan model tampilan. Kaki: teks berjalan.
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc, getDocs, collection } from "./firebase.js";
import {
  ambilProfil, ambilTampilan, tampilanCache, logoDayah, beranda, simpan, esc, PERAN, pasangFooter, pesanError,
  ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, jamSesi, today, tglPanjang, normUsername, usernameValid,
  siapkanHalamanPublik, sinkronJamHTTP, pasangAplikasi, bisaInstallLangsung, sudahTerpasang, toast, ikon, sembunyikanPemuat, tampilError, aksi
} from "./common.js";
import { MODEL, render, dataLaporanJadwal } from "./jadwal-tampil.js";

siapkanHalamanPublik();
pasangFooter(document.getElementById("kakiKiri"));
// Pintu Super Admin: tulisan kecil di samping "Panduan"
document.querySelector("#kakiKiri .kaki")?.insertAdjacentHTML("beforeend", ` · <a class="lnk-pengelola" id="btnPengelola" href="#" role="button">Pengelola</a>`);
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
  $("kotakLogin").hidden = false;
  $("sudahMasuk").hidden = true;
  form.password.value = "";
  err.textContent = "";
}
tampilLogin();
$("btnGantiAkun").onclick = () => { simpan.del("akunTersimpan"); form.username.value = ""; tampilLogin(); form.username.focus(); };
$("btnPengelola").onclick = (e) => { e.preventDefault(); mode = "pengelola"; tampilLogin(); form.username.focus(); $("kotakLogin").scrollIntoView({ behavior: "smooth", block: "center" }); };
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

// ===================== Install aplikasi (PWA) =====================
// Android & komputer (Chrome/Edge/Samsung Internet): tombol langsung membuka dialog install bawaan browser.
// iPhone/iPad: Apple tidak mengizinkan tombol install, jadi ditampilkan 2 langkah singkat.
const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);
const dalamAplikasiLain = /FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)|TikTok|Telegram/i.test(ua);
const btnInstall = $("btnInstall"), modalInstall = $("modalInstall");
$("installKet").textContent = isIOS ? "Untuk iPhone / iPad" : isAndroid ? "Ketuk sekali, langsung terpasang" : "Klik sekali, langsung terpasang";
if (sudahTerpasang()) btnInstall.hidden = true;
const simbol = (n) => `<span class="simbol">${ikon(n, 16)}</span>`;
function tampilPetunjuk() {
  let sub, langkah;
  if (isIOS) {
    sub = "Di iPhone, Apple hanya mengizinkan lewat tombol Bagikan Safari.";
    langkah = [`Ketuk tombol <b>Bagikan</b> ${simbol("bagikan")} di bawah layar Safari.`,
      `Gulir, pilih <b>Tambah ke Layar Utama</b> ${simbol("tambahKotak")}.`, "Ketuk <b>Tambah</b>. Logo dayah muncul di layar utama."];
  } else if (dalamAplikasiLain) {
    sub = "Anda membuka link dari aplikasi lain (WhatsApp/Facebook/dll.).";
    langkah = [`Ketuk menu ${simbol("titikTiga")} di pojok kanan atas.`, "Pilih <b>Buka di Chrome</b> / <b>Buka di browser</b>.",
      "Di Chrome, ketuk lagi tombol <b>Install Aplikasi</b>."];
  } else {
    sub = "Browser ini belum menampilkan tombol install otomatis.";
    langkah = [isAndroid ? `Ketuk menu ${simbol("titikTiga")} Chrome di pojok kanan atas.` : `Klik ikon install ${simbol("unduh")} di ujung kanan kolom alamat, atau menu ${simbol("titikTiga")}.`,
      "Pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.",
      "Bila tidak ada pilihan itu, buka situs ini di <b>Chrome</b> atau <b>Edge</b>. Bila aplikasi sudah terpasang, buka dari layar utama."];
  }
  $("installSub").textContent = sub;
  $("installIsi").innerHTML = `<ol class="install-langkah">${langkah.map(l => `<li><div>${l}</div></li>`).join("")}</ol>`;
  modalInstall.classList.add("open");
}
btnInstall.onclick = async () => {
  if (!isIOS && bisaInstallLangsung()) { await pasangAplikasi(); return; }
  if (!isIOS && !dalamAplikasiLain) {
    // Dialog install kadang baru siap 1–2 detik setelah halaman dibuka
    btnInstall.disabled = true;
    await new Promise(r => { const t = setTimeout(r, 1500); document.addEventListener("bisa-install", () => { clearTimeout(t); r(); }, { once: true }); });
    btnInstall.disabled = false;
    if (bisaInstallLangsung()) { await pasangAplikasi(); return; }
  }
  tampilPetunjuk();
};
$("btnTutupInstall").onclick = () => modalInstall.classList.remove("open");
modalInstall.addEventListener("click", (e) => { if (e.target === modalInstall) modalInstall.classList.remove("open"); });
$("btnSalinLink").onclick = async () => {
  try { await navigator.clipboard.writeText(location.origin + location.pathname.replace(/index\.html$/, "")); toast("Link disalin. Tempel di Chrome / Safari."); }
  catch { toast(location.origin, "info"); }
};

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
// Tampilan bawaan diatur Super Admin (Profil Dayah). Pilihan pengunjung hanya berlaku selama halaman dibuka.
const modelValid = (m) => MODEL.some(x => x.id === m) ? m : "roster";
let model = modelValid(simpan.get("modelJadwal", true) || tampilan.modelJadwal);
ambilTampilan().then(t => { if (!simpan.get("modelJadwal", true) && modelValid(t.modelJadwal) !== model) { model = modelValid(t.modelJadwal); gambarModel(); if (ctx.cfg) gambarJadwal(); } }).catch(() => {});

function gambarModel() {
  const m = MODEL.find(x => x.id === model);
  $("btnTampilan").innerHTML = `${ikon(m.ikon, 16)} Tampilan: ${m.label} <span aria-hidden="true">${$("modelPilih").hidden ? "▾" : "▴"}</span>`;
  $("modelPilih").innerHTML = MODEL.map(m => `<button class="${m.id === model ? "aktif" : ""}" data-model="${m.id}">${ikon(m.ikon, 20)}${m.label}</button>`).join("");
}
function gambarJadwal() {
  ctx.namaDayah = tampilan.nama;
  $("isiJadwal").innerHTML = render(model, ctx);
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
