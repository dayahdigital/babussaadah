// Halaman depan (publik): kiri = identitas & login, kanan = pengumuman, jadwal, kitab, riwayat.
// Login Super Admin terpisah: ketuk logo dayah 5 kali untuk membuka "Pintu Pengelola".
import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc, getDocs, collection
} from "./firebase.js";
import {
  ambilProfil, ambilTampilan, tampilanCache, beranda, simpan, esc, PERAN, pasangFooter, pesanError,
  ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, HARI, SEMUA_HARI, jamSesi, today, hariDari,
  normUsername, usernameValid, siapkanHalamanPublik, sinkronJamHTTP, pasangAplikasi, waktuIndo
} from "./common.js";

siapkanHalamanPublik();
pasangFooter(document.getElementById("kakiKiri"));
sinkronJamHTTP();

// ===================== Identitas dayah =====================
function pasangTampilan(t) {
  document.getElementById("namaDayah").textContent = t.nama;
  document.getElementById("alamatDayah").textContent = t.alamat || "";
  document.getElementById("taglineDayah").textContent = t.tagline || "";
  document.title = t.nama;
  if (t.logo) document.getElementById("logoWrap").innerHTML = `<img src="${t.logo}" alt="Logo ${esc(t.nama)}">`;
  if (t.foto) document.getElementById("panelKiri").style.backgroundImage =
    `linear-gradient(to bottom, rgba(5,30,18,.55), rgba(5,30,18,.9)), url("${t.foto}")`;
}
pasangTampilan(tampilanCache());
ambilTampilan().then(pasangTampilan);

document.getElementById("btnPasang").onclick = pasangAplikasi;

// ===================== Login =====================
const form = document.getElementById("formLogin");
const err = document.getElementById("err");
const btn = document.getElementById("btnMasuk");
let mode = "biasa";          // "biasa" | "pengelola"
let sedangLogin = false;

if (new URLSearchParams(location.search).has("nonaktif")) err.textContent = "Akun Anda nonaktif. Hubungi pengelola dayah.";
const terakhir = simpan.get("loginTerakhir");
if (terakhir) form.username.value = terakhir;

getDoc(doc(db, "config", "setup"))
  .then(s => { if (!s.exists()) document.getElementById("infoSetup").hidden = false; })
  .catch(() => {});

// Pintu pengelola: ketuk logo 5x dalam 3 detik
let ketukan = [];
document.getElementById("logoWrap").addEventListener("click", () => {
  const now = Date.now();
  ketukan = ketukan.filter(t => now - t < 3000).concat(now);
  if (ketukan.length >= 5) { ketukan = []; gantiMode(mode === "biasa" ? "pengelola" : "biasa"); }
});
function gantiMode(m) {
  mode = m;
  const kotak = document.getElementById("kotakLogin");
  kotak.classList.toggle("pengelola", m === "pengelola");
  document.getElementById("judulLogin").textContent = m === "pengelola" ? "🔐 Pintu Pengelola" : "Masuk";
  document.getElementById("subLogin").textContent = m === "pengelola" ? "Khusus Super Admin" : "Untuk teungku & pengurus dayah";
  document.getElementById("btnBatalPengelola").hidden = m !== "pengelola";
  document.getElementById("kotakLogin").hidden = false;
  document.getElementById("sudahMasuk").hidden = true;
  form.username.value = m === "pengelola" ? "" : (simpan.get("loginTerakhir") || "");
  form.password.value = "";
  err.textContent = "";
  form.username.focus();
}
document.getElementById("btnBatalPengelola").onclick = () => gantiMode("biasa");
document.getElementById("lihatSandi").onclick = () =>
  form.password.type = form.password.type === "password" ? "text" : "password";

onAuthStateChanged(auth, async (user) => {
  if (!user || sedangLogin) return;
  const p = await ambilProfil(user.uid).catch(() => null);
  if (!p?.aktif || p.dihapus) { await signOut(auth).catch(() => {}); return; }
  if (mode === "pengelola") return;
  document.getElementById("kotakLogin").hidden = true;
  document.getElementById("sudahMasuk").hidden = false;
  document.getElementById("sudahMasukNama").textContent = `${p.nama} · ${PERAN[p.role] || p.role}`;
  document.getElementById("btnKeAplikasi").href = beranda(p.role);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const u = normUsername(form.username.value);
  const salah = "Username atau kata sandi salah.";
  if (!usernameValid(u)) { err.textContent = salah; return; }
  sedangLogin = true;
  btn.disabled = true; btn.textContent = "Memproses...";
  try {
    const map = await getDoc(doc(db, "usernames", u));
    if (!map.exists()) throw { code: "auth/invalid-credential" };
    const cred = await signInWithEmailAndPassword(auth, map.data().email, form.password.value);
    const p = await ambilProfil(cred.user.uid);
    const isSA = p?.role === "superadmin";
    // Super Admin hanya lewat Pintu Pengelola; pengguna lain hanya lewat login biasa
    if (!p || (mode === "biasa" && isSA) || (mode === "pengelola" && !isSA)) {
      await signOut(auth); err.textContent = salah; return;
    }
    if (!p.aktif || p.dihapus) { await signOut(auth); err.textContent = "Akun Anda nonaktif. Hubungi pengelola dayah."; return; }
    if (!isSA) simpan.set("loginTerakhir", u);
    simpan.set("profil", { uid: cred.user.uid, ...p }, true);
    location.replace(beranda(p.role));
  } catch (ex) {
    err.textContent = pesanError(ex);
  } finally {
    sedangLogin = false;
    btn.disabled = false; btn.textContent = "Masuk";
  }
});

// ===================== Pengumuman: teks berjalan & mading =====================
const modalGambar = document.getElementById("modalGambar");
modalGambar.addEventListener("click", () => modalGambar.classList.remove("open"));
window.__lihatGambar = (src) => { document.getElementById("gambarBesar").src = src; modalGambar.classList.add("open"); };

getDocs(collection(db, "pengumuman")).then(snap => {
  const kini = today();
  const aktif = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.aktif !== false && (!p.mulai || p.mulai <= kini) && (!p.sampai || kini <= p.sampai))
    .sort((a, b) => (a.urutan || 0) - (b.urutan || 0) || (b.mulai || "").localeCompare(a.mulai || ""));
  const berjalan = aktif.filter(p => p.jenis === "berjalan");
  if (berjalan.length) {
    const teks = berjalan.map(p => `<span>📢 ${esc(p.judul)}${p.isi ? " — " + esc(p.isi) : ""}</span>`).join("");
    const jalur = document.getElementById("jalurBerjalan");
    jalur.innerHTML = teks;
    jalur.style.setProperty("--durasi", Math.max(18, jalur.textContent.length / 6) + "s");
    document.getElementById("teksBerjalan").hidden = false;
  }
  const mading = aktif.filter(p => p.jenis === "mading");
  if (mading.length) {
    document.getElementById("madingWrap").hidden = false;
    document.getElementById("mading").innerHTML = mading.map(p => `
      <article class="mading-item">
        ${p.gambar ? `<img src="${p.gambar}" alt="" onclick="__lihatGambar(this.src)">` : ""}
        <div class="isi"><b>${esc(p.judul)}</b><p>${esc(p.isi || "")}</p>
          ${p.mulai ? `<small>${new Date(p.mulai + "T00:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</small>` : ""}</div>
      </article>`).join("");
  }
}).catch(() => {});

// ===================== Jadwal publik =====================
const [cfg, semua] = await Promise.all([ambilConfigAbsensi(), ambilJadwal().catch(() => [])]);
const jadwal = semua.filter(e => e.aktifGuru !== false);
const sesiById = Object.fromEntries(cfg.sesi.map(s => [s.id, s]));
const urutSesi = (a, b) => cfg.sesi.findIndex(s => s.id === a.sesi) - cfg.sesi.findIndex(s => s.id === b.sesi);
const ikonSesi = (id) => id === "pagi" ? "🌅" : "🌙";

document.getElementById("pubSesi").innerHTML = cfg.sesi.map(s =>
  `<span>${ikonSesi(s.id)} <b>${esc(s.nama)}</b> ${jamSesi(s)} WIB</span>`).join("");

document.querySelector(".pub-tab").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  document.querySelectorAll(".pub-tab button").forEach(x => x.classList.toggle("aktif", x === b));
  ["jadwal", "kitab", "teungku", "riwayat"].forEach(t => document.getElementById("tab-" + t).hidden = t !== b.dataset.tab);
  if (b.dataset.tab === "riwayat") muatRiwayat();
});

let hariAktif = hariDari(today());
function tampilHari() {
  document.getElementById("hariPilih").innerHTML = SEMUA_HARI.map(h =>
    `<button class="${h === hariAktif ? "aktif" : ""}" data-hari="${h}">${HARI[h]}${h === hariDari(today()) ? " •" : ""}</button>`).join("");
  const sesiHari = cfg.sesi.filter(s => s.hari.includes(hariAktif));
  document.getElementById("jadwalHari").innerHTML = !sesiHari.length
    ? `<div class="card empty">Tidak ada pengajian pada hari ${HARI[hariAktif]}.</div>`
    : sesiHari.map(s => {
      const list = jadwal.filter(e => e.hari === hariAktif && e.sesi === s.id)
        .sort((a, b) => (a.kelas || "").localeCompare(b.kelas || "") || (a.namaGuru || "").localeCompare(b.namaGuru || ""));
      return `<div class="card">
        <h2>${ikonSesi(s.id)} Sesi ${esc(s.nama)} <small class="jam">${jamSesi(s)} WIB</small></h2>
        ${list.length ? `<div class="pub-list">${list.map(e => `
          <div class="pub-item">
            <div class="kitab">📖 ${esc(e.kitab)}</div>
            ${e.materi ? `<div class="materi">${esc(e.materi)}</div>` : ""}
            <div class="meta">👤 ${esc(e.namaGuru)}${e.kelas ? ` · 🏫 ${esc(e.kelas)}` : ""}</div>
          </div>`).join("")}</div>` : `<p class="empty">Belum ada jadwal di sesi ini.</p>`}
      </div>`;
    }).join("");
}
document.getElementById("hariPilih").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hari]");
  if (b) { hariAktif = Number(b.dataset.hari); tampilHari(); }
});
tampilHari();

function tampilKitab() {
  const q = document.getElementById("cariKitab").value.trim().toLowerCase();
  const grup = {};
  jadwal.forEach(e => (grup[(e.kitab || "").trim()] ??= []).push(e));
  const nama = Object.keys(grup).sort((a, b) => a.localeCompare(b))
    .filter(k => !q || (k + " " + grup[k].map(e => `${e.materi} ${e.namaGuru} ${e.kelas}`).join(" ")).toLowerCase().includes(q));
  document.getElementById("daftarKitab").innerHTML = nama.length ? `
    <p class="muted kecil" style="margin-top:0">${nama.length} kitab diajarkan</p>
    ${nama.map(k => `<details class="kitab-item">
        <summary><b>📖 ${esc(k)}</b> <span class="badge b-in">${grup[k].length} sesi/minggu</span></summary>
        <table class="kartu-hp"><thead><tr><th>Hari & sesi</th><th>Materi</th><th>Teungku</th></tr></thead><tbody>
        ${grup[k].sort((a, b) => a.hari - b.hari || urutSesi(a, b)).map(e => `<tr>
          <td>${HARI[e.hari]}, ${esc(sesiById[e.sesi]?.nama || e.sesi)}</td><td>${esc(e.materi || "–")}</td>
          <td>${esc(e.namaGuru)}${e.kelas ? ` · ${esc(e.kelas)}` : ""}</td></tr>`).join("")}
        </tbody></table></details>`).join("")}`
    : `<p class="empty">${jadwal.length ? "Tidak ditemukan." : "Belum ada kitab yang dijadwalkan."}</p>`;
}
document.getElementById("cariKitab").oninput = tampilKitab;
tampilKitab();

const perGuru = {};
jadwal.forEach(e => (perGuru[e.guruId] ??= { nama: e.namaGuru, list: [] }).list.push(e));
document.getElementById("daftarTeungku").innerHTML = Object.values(perGuru).length
  ? Object.values(perGuru).sort((a, b) => a.nama.localeCompare(b.nama)).map(g => `
    <div class="card">
      <h2>👤 ${esc(g.nama)} <small class="jam">${g.list.length} sesi/minggu</small></h2>
      <table class="kartu-hp"><thead><tr><th>Hari & sesi</th><th>Kitab</th><th>Materi</th><th>Kelas</th></tr></thead><tbody>
        ${g.list.sort((a, b) => a.hari - b.hari || urutSesi(a, b)).map(e => `<tr>
          <td class="utama">${HARI[e.hari]} · ${esc(sesiById[e.sesi]?.nama || e.sesi)}</td>
          <td><b>${esc(e.kitab)}</b></td><td>${esc(e.materi || "–")}</td><td>${esc(e.kelas || "–")}</td></tr>`).join("")}
      </tbody></table>
    </div>`).join("")
  : `<div class="card empty">Belum ada jadwal.</div>`;

// ===================== Riwayat perubahan jadwal (publik) =====================
let riwayatDimuat = false;
async function muatRiwayat() {
  if (riwayatDimuat) return;
  riwayatDimuat = true;
  const el = document.getElementById("daftarRiwayat");
  try {
    const list = (await ambilRiwayatJadwal()).slice(0, 150);
    el.innerHTML = list.length ? list.map(itemRiwayat).join("") : `<li class="empty">Belum ada perubahan jadwal.</li>`;
  } catch (ex) { el.innerHTML = `<li class="error-box">${esc(pesanError(ex))}</li>`; }
}
function itemRiwayat(r) {
  const tanda = { tambah: ["+", "tambah", "menambah"], ubah: ["✎", "ubah", "mengubah"], hapus: ["−", "hapus", "menghapus"] }[r.aksi] || ["•", "ubah", "mengubah"];
  const fmt = (x) => x ? `${esc(x.kitab)}${x.materi ? " · " + esc(x.materi) : ""}${x.kelas ? " · " + esc(x.kelas) : ""}` : "";
  return `<li><span class="tanda ${tanda[1]}">${tanda[0]}</span><div>
    <b>${esc(r.namaGuru)}</b> ${tanda[2]} jadwal <b>${HARI[r.hari] || ""} · ${esc(sesiById[r.sesi]?.nama || r.sesi)}</b><br>
    ${r.aksi === "ubah" ? `<del>${fmt(r.sebelum)}</del> → <ins>${fmt(r.sesudah)}</ins>` : r.aksi === "hapus" ? `<del>${fmt(r.sebelum)}</del>` : `<ins>${fmt(r.sesudah)}</ins>`}
    <small>${waktuIndo(r.waktu)}${r.olehNama && r.olehNama !== r.namaGuru ? " · oleh " + esc(r.olehNama) : ""}</small></div></li>`;
}
