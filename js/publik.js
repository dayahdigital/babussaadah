// Halaman publik (tanpa login): jadwal mengajar, kitab & materi, per teungku.
// Hanya membaca data yang memang publik: config/tampilan, config/absensi, koleksi mengajar.
import {
  ambilTampilan, tampilanCache, ambilConfigAbsensi, ambilJadwal, HARI, SEMUA_HARI, jamSesi,
  esc, today, hariDari, pasangFooter
} from "./common.js";

pasangFooter();

// ---------- Identitas dayah ----------
function pasangTampilan(t) {
  document.getElementById("pubNama").textContent = t.nama;
  document.getElementById("pubAlamat").textContent = t.alamat || "";
  document.getElementById("pubTagline").textContent = t.tagline || "";
  document.title = `${t.nama} — Jadwal Mengajar & Kitab`;
  if (t.logo) document.getElementById("pubLogo").innerHTML = `<img src="${t.logo}" alt="Logo">`;
  if (t.foto) document.getElementById("hero").style.backgroundImage =
    `linear-gradient(to bottom, rgba(5,30,18,.55), rgba(5,30,18,.88)), url("${t.foto}")`;
}
pasangTampilan(tampilanCache());
ambilTampilan().then(pasangTampilan);

// ---------- Data ----------
const [cfg, semua] = await Promise.all([
  ambilConfigAbsensi(),
  ambilJadwal().catch(() => [])
]);
const jadwal = semua.filter(e => e.aktifGuru !== false);
const sesiById = Object.fromEntries(cfg.sesi.map(s => [s.id, s]));
const urutSesi = (a, b) => cfg.sesi.findIndex(s => s.id === a.sesi) - cfg.sesi.findIndex(s => s.id === b.sesi);

document.getElementById("pubSesi").innerHTML = cfg.sesi.map(s =>
  `<span>${s.id === "pagi" ? "🌅" : "🌙"} <b>${esc(s.nama)}</b> ${jamSesi(s)} WIB</span>`).join("");

// ---------- Tab ----------
document.querySelector(".pub-tab").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  document.querySelectorAll(".pub-tab button").forEach(x => x.classList.toggle("aktif", x === b));
  ["jadwal", "kitab", "teungku"].forEach(t => document.getElementById("tab-" + t).hidden = t !== b.dataset.tab);
});

// ---------- 1. Jadwal per hari ----------
let hariAktif = hariDari(today());
function tampilHari() {
  document.getElementById("hariPilih").innerHTML = SEMUA_HARI.map(h =>
    `<button class="${h === hariAktif ? "aktif" : ""}" data-hari="${h}">${HARI[h]}${h === hariDari(today()) ? " •" : ""}</button>`).join("");

  const sesiHari = cfg.sesi.filter(s => s.hari.includes(hariAktif));
  if (!sesiHari.length) {
    document.getElementById("jadwalHari").innerHTML = `<div class="card empty">Tidak ada pengajian pada hari ${HARI[hariAktif]}.</div>`;
    return;
  }
  document.getElementById("jadwalHari").innerHTML = sesiHari.map(s => {
    const list = jadwal.filter(e => e.hari === hariAktif && e.sesi === s.id)
      .sort((a, b) => (a.kelas || "").localeCompare(b.kelas || "") || a.namaGuru.localeCompare(b.namaGuru));
    return `<div class="card">
      <h2>${s.id === "pagi" ? "🌅" : "🌙"} Sesi ${esc(s.nama)} <small class="jam">${jamSesi(s)} WIB</small></h2>
      ${list.length ? `<div class="pub-list">${list.map(e => `
        <div class="pub-item">
          <div class="kitab">📖 ${esc(e.kitab)}</div>
          ${e.materi ? `<div class="materi">${esc(e.materi)}</div>` : ""}
          <div class="meta">👤 ${esc(e.namaGuru)}${e.kelas ? ` · 🏫 ${esc(e.kelas)}` : ""}</div>
        </div>`).join("")}</div>`
        : `<p class="empty">Belum ada jadwal di sesi ini.</p>`}
    </div>`;
  }).join("");
}
document.getElementById("hariPilih").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hari]");
  if (b) { hariAktif = Number(b.dataset.hari); tampilHari(); }
});
tampilHari();

// ---------- 2. Kitab & materi ----------
function tampilKitab() {
  const q = document.getElementById("cariKitab").value.trim().toLowerCase();
  const grup = {};
  jadwal.forEach(e => (grup[e.kitab.trim()] ??= []).push(e));
  const nama = Object.keys(grup).sort((a, b) => a.localeCompare(b))
    .filter(k => !q || (k + " " + grup[k].map(e => `${e.materi} ${e.namaGuru} ${e.kelas}`).join(" ")).toLowerCase().includes(q));
  document.getElementById("daftarKitab").innerHTML = nama.length ? `
    <p style="color:#6b7770;font-size:13px;margin-top:0">${nama.length} kitab diajarkan</p>
    ${nama.map(k => {
      const list = grup[k].sort((a, b) => a.hari - b.hari || urutSesi(a, b));
      return `<details class="kitab-item">
        <summary><b>📖 ${esc(k)}</b> <span class="badge b-in">${list.length} sesi/minggu</span></summary>
        <table><tbody>${list.map(e => `<tr>
          <td>${HARI[e.hari]}, ${esc(sesiById[e.sesi]?.nama || e.sesi)}</td>
          <td>${esc(e.materi || "–")}</td>
          <td>${esc(e.namaGuru)}${e.kelas ? `<br><small>${esc(e.kelas)}</small>` : ""}</td></tr>`).join("")}
        </tbody></table>
      </details>`;
    }).join("")}`
    : `<p class="empty">${jadwal.length ? "Tidak ditemukan." : "Belum ada kitab yang dijadwalkan."}</p>`;
}
document.getElementById("cariKitab").oninput = tampilKitab;
tampilKitab();

// ---------- 3. Per teungku ----------
const perGuru = {};
jadwal.forEach(e => (perGuru[e.guruId] ??= { nama: e.namaGuru, list: [] }).list.push(e));
const guruUrut = Object.values(perGuru).sort((a, b) => a.nama.localeCompare(b.nama));
document.getElementById("daftarTeungku").innerHTML = guruUrut.length ? guruUrut.map(g => `
  <div class="card">
    <h2>👤 ${esc(g.nama)} <small class="jam">${g.list.length} sesi/minggu</small></h2>
    <div class="table-wrap"><table><tbody>
      ${g.list.sort((a, b) => a.hari - b.hari || urutSesi(a, b)).map(e => `<tr>
        <td style="white-space:nowrap">${HARI[e.hari]} · ${esc(sesiById[e.sesi]?.nama || e.sesi)}</td>
        <td><b>${esc(e.kitab)}</b>${e.materi ? `<br><small>${esc(e.materi)}</small>` : ""}</td>
        <td>${esc(e.kelas || "")}</td></tr>`).join("")}
    </tbody></table></div>
  </div>`).join("")
  : `<div class="card empty">Belum ada jadwal.</div>`;
