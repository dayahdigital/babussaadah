// Tampilan jadwal mengajar publik dengan beberapa model:
// roster (bawaan), kartu, papan pengumuman, tabel (seperti Excel), per kitab, per teungku, riwayat.
import { HARI, SEMUA_HARI, jamSesi, esc, ikon, today, tambahHari, hariDari, waktuIndo, teksJam, jamEntri, teksDurasi, titikJam,
  jendelaSesi, sekarang, WIB_MS } from "./common.js";

export const MODEL = [
  { id: "roster", label: "Roster", ikon: "roster" },
  { id: "kartu", label: "Kartu", ikon: "kartu" },
  { id: "papan", label: "Papan", ikon: "papan" },
  { id: "tabel", label: "Tabel", ikon: "tabel" },
  { id: "kitab", label: "Per kitab", ikon: "buku" },
  { id: "teungku", label: "Per teungku", ikon: "orang" },
  { id: "riwayat", label: "Riwayat", ikon: "riwayat" }
];

const HARI_PENDEK = ["Ahd", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ikonSesi = (id) => ikon(id === "pagi" ? "matahari" : "bulan", 18);
const fmtTgl = (t) => t.split("-").reverse().join("-");                 // 19-10-2026
// Tanggal terdekat (hari ini atau sesudahnya) untuk hari h
export const tanggalUntuk = (h) => tambahHari(today(), (h - hariDari(today()) + 7) % 7);
const urutHari = () => [...Array(7)].map((_, i) => (hariDari(today()) + i) % 7);   // mulai hari ini

// ---------- Status langsung (hari ini): lampu berkedip saat pengajian berlangsung ----------
// hadir: Map "tanggal_sesi_guruId" → waktu hadir (ms). Diisi dari koleksi publik hadir_publik.
let HADIR = new Map();
export const aturHadir = (m) => { HADIR = m; };
const jamKecil = (ms) => new Date(ms + WIB_MS).toISOString().slice(11, 16).replace(":", ".");
export function keadaan(e, sesi, tgl) {
  const w = jendelaSesi(sesi, tgl, null, e), now = sekarang();
  return { k: now < w.mulai ? "nanti" : now < w.selesai ? "jalan" : "selesai", w, hadir: HADIR.get(`${tgl}_${e.sesi}_${e.guruId}`) };
}
export function statusHTML(e, sesi, tgl) {
  if (!sesi || tgl !== today()) return "";
  const { k, w, hadir } = keadaan(e, sesi, tgl);
  const ket = k === "jalan" ? `<span class="ket jalan"><span class="lampu nyala"></span>Pengajian sedang berlangsung</span>`
    : k === "selesai" ? `<span class="ket selesai"><span class="lampu selesai"></span>Pengajian selesai</span>`
    : `<span class="ket nanti"><span class="lampu"></span>Dimulai pukul ${jamKecil(w.mulai)}</span>`;
  return `<div class="status-langsung">${ket}${hadir ? `<span class="lencana-hadir">✓ Teungku hadir${hadir > 1 ? " · " + jamKecil(hadir) : ""}</span>` : ""}</div>`;
}
// Daftar pengajian yang sedang berlangsung sekarang (termasuk sesi malam kemarin yang lewat tengah malam)
export function berlangsungHTML(cfg, jadwal) {
  const list = [];
  for (const t of [today(), tambahHari(today(), -1)]) {
    const h = hariDari(t);
    for (const e of jadwal) {
      const s = cfg.sesi.find(x => x.id === e.sesi);
      if (!s || e.hari !== h || !s.hari.includes(h)) continue;
      const st = keadaan(e, s, t);
      if (st.k === "jalan") list.push({ e, s, t, st });
    }
  }
  if (!list.length) return "";
  list.sort((a, b) => a.st.w.mulai - b.st.w.mulai);
  return `<div class="berlangsung" aria-live="polite"><h2><span class="lampu nyala"></span> Sedang berlangsung · ${list.length} pengajian</h2>
    ${list.map(({ e, s, t, st }) => `<div class="item"><span class="lampu nyala"></span><div>
      <b>${esc(e.kitab)}</b>${e.materi ? ` · ${esc(e.materi)}` : ""}
      <small>${esc(e.namaGuru)} · ${teksJam(e, s)} WIB · ${esc(e.tempat || "-")} · ${esc(e.kelas || "-")}</small>
      ${st.hadir ? `<span class="lencana-hadir">✓ Teungku hadir · ${jamKecil(st.hadir)}</span>` : ""}</div></div>`).join("")}</div>`;
}
// Tanda perubahan status (dipakai untuk menggambar ulang hanya bila ada yang berubah)
export function tandaStatus(cfg, jadwal) {
  const t = today(), h = hariDari(t);
  return jadwal.filter(e => e.hari === h).map(e => { const s = cfg.sesi.find(x => x.id === e.sesi); return s ? keadaan(e, s, t).k + (HADIR.has(`${t}_${e.sesi}_${e.guruId}`) ? "H" : "") : ""; }).join("|")
    + "#" + berlangsungHTML(cfg, jadwal).length;
}

const teksDurasiPendek = (m) => { const j = Math.floor(m / 60), r = m % 60; return [j ? `${j} jam` : "", r ? `${r} mnt` : ""].filter(Boolean).join(" "); };
export function entriHTML(e, { tanggal = null, siapa = true, sesi = null, statusTgl = null } = {}) {
  const j = sesi ? jamEntri(e, sesi) : null;
  return `<div class="entri">
    ${siapa ? `<div class="siapa">${ikon("orang", 16)} ${esc(e.namaGuru)}</div>` : ""}
    <dl class="rinci">
      ${tanggal ? `<dt>Tanggal</dt><dd>${HARI[hariDari(tanggal)]}, ${fmtTgl(tanggal)}</dd>` : ""}
      ${j && j.ada ? `<dt>Jam</dt><dd><span class="jam-entri">${ikon("jam", 14)} ${teksJam(e, sesi)} WIB</span></dd>
      <dt>Durasi</dt><dd>${teksDurasi(j.durasi)}</dd>` : j ? `<dt>Jam</dt><dd class="muted">Belum diatur teungku</dd>` : ""}
      <dt>Kitab</dt><dd class="kitab">${esc(e.kitab)}</dd>
      <dt>Materi/Bab</dt><dd>${esc(e.materi || "-")}</dd>
      <dt>Tempat</dt><dd>${esc(e.tempat || "-")}</dd>
      <dt>Kelas</dt><dd>${esc(e.kelas || "-")}</dd>
    </dl>${statusHTML(e, sesi, statusTgl || tanggal)}</div>`;
}

const urutEntri = (a, b) => (a.menitMulai ?? 0) - (b.menitMulai ?? 0) || (a.kelas || "").localeCompare(b.kelas || "") || (a.namaGuru || "").localeCompare(b.namaGuru || "");

function pemilihHari(hariAktif) {
  return `<div class="hari-pilih">${urutHari().map(h => {
    const t = tanggalUntuk(h);
    return `<button class="${h === hariAktif ? "aktif" : ""}" data-hari="${h}">
      <span class="panjang">${HARI[h]}</span><span class="pendek">${HARI_PENDEK[h]}</span><small>${t.slice(8)}/${t.slice(5, 7)}</small></button>`;
  }).join("")}</div>`;
}

// ---------- Model ----------
function roster(cfg, jadwal) {
  return `<div class="roster" style="--kolom:${cfg.sesi.length}">
    <div class="roster-kepala"><div>${ikon("kalender", 18)} Hari</div>
      ${cfg.sesi.map(s => `<div>${ikonSesi(s.id)} ${esc(s.nama)} <small>${jamSesi(s)}</small></div>`).join("")}</div>
    ${urutHari().map(h => {
      const t = tanggalUntuk(h);
      return `<div class="roster-baris ${t === today() ? "hari-ini" : ""}">
        <div class="roster-hari">${HARI[h]}<small>${fmtTgl(t)}</small>${t === today() ? '<span class="badge b-in">Hari ini</span>' : ""}</div>
        ${cfg.sesi.map(s => {
          if (!s.hari.includes(h)) return `<div class="roster-sel libur"><span class="label-sesi">${ikonSesi(s.id)} ${esc(s.nama)}</span><span class="kosong-kecil">Tidak ada sesi</span></div>`;
          const list = jadwal.filter(e => e.hari === h && e.sesi === s.id).sort(urutEntri);
          return `<div class="roster-sel"><span class="label-sesi">${ikonSesi(s.id)} ${esc(s.nama)} · ${jamSesi(s)}</span>
            ${list.length ? list.map(e => entriHTML(e, { sesi: s, statusTgl: t })).join("") : `<span class="kosong-kecil">Belum ada jadwal</span>`}</div>`;
        }).join("")}
      </div>`;
    }).join("")}
  </div>`;
}

function kartu(cfg, jadwal, h) {
  const t = tanggalUntuk(h);
  const sesi = cfg.sesi.filter(s => s.hari.includes(h));
  return pemilihHari(h) + (sesi.length ? sesi.map(s => {
    const list = jadwal.filter(e => e.hari === h && e.sesi === s.id).sort(urutEntri);
    return `<div class="card"><h2 class="judul-bagian">${ikonSesi(s.id)} Sesi ${esc(s.nama)} <small class="jam">${jamSesi(s)} WIB</small></h2>
      ${list.length ? `<div class="entri-list">${list.map(e => entriHTML(e, { tanggal: t, sesi: s })).join("")}</div>` : `<p class="kosong-kecil">Belum ada jadwal di sesi ini.</p>`}</div>`;
  }).join("") : `<div class="card empty">Tidak ada pengajian pada hari ${HARI[h]}.</div>`);
}

function papan(cfg, jadwal, h, namaDayah) {
  const t = tanggalUntuk(h);
  const sesi = cfg.sesi.filter(s => s.hari.includes(h));
  return pemilihHari(h) + `<div class="alat-tabel"><button class="btn btn-sm btn-sec" data-aksi="layar-penuh">${ikon("layarPenuh", 16)} Layar penuh (untuk TV)</button></div>
    <div class="papan" id="papanJadwal">
      <div class="papan-kepala"><h2>Jadwal Pengajian</h2><p>${esc(namaDayah)} · ${HARI[h]}, ${fmtTgl(t)}</p></div>
      ${sesi.length ? sesi.map(s => {
        const list = jadwal.filter(e => e.hari === h && e.sesi === s.id).sort(urutEntri);
        return `<div class="papan-sesi"><h3>${ikonSesi(s.id)} Sesi ${esc(s.nama)} · ${jamSesi(s)} WIB</h3>
          ${list.length ? list.map(e => `<div class="papan-item">
              <div class="kitab">${esc(e.kitab)} ${jamEntri(e, s).ada ? `<span class="jam-papan">· ${teksJam(e, s)}</span>` : ""}</div>
              <span><b>Teungku</b>${esc(e.namaGuru)}</span><span><b>Materi/Bab</b>${esc(e.materi || "-")}</span>
              <span><b>Tempat</b>${esc(e.tempat || "-")}</span><span><b>Kelas</b>${esc(e.kelas || "-")}</span>${statusHTML(e, s, t)}</div>`).join("")
            : `<p style="opacity:.7">Belum ada jadwal.</p>`}</div>`;
      }).join("") : `<p style="text-align:center">Tidak ada pengajian hari ini.</p>`}
    </div>`;
}

export function barisTabel(cfg, jadwal) {
  const idx = Object.fromEntries(urutHari().map((h, i) => [h, i]));
  return [...jadwal].sort((a, b) => idx[a.hari] - idx[b.hari] || cfg.sesi.findIndex(s => s.id === a.sesi) - cfg.sesi.findIndex(s => s.id === b.sesi) || urutEntri(a, b))
    .map(e => { const s = cfg.sesi.find(x => x.id === e.sesi); return { e, s, t: tanggalUntuk(e.hari) }; });
}
function tabel(cfg, jadwal) {
  const rows = barisTabel(cfg, jadwal);
  return `<div class="alat-tabel">
      <button class="btn btn-sm btn-sec" data-aksi="pdf">${ikon("pdf", 16)} Unduh PDF</button>
      <button class="btn btn-sm btn-sec" data-aksi="excel">${ikon("excel", 16)} Unduh Excel</button></div>
    <div class="card" style="padding:0;overflow:hidden"><table class="kartu-hp tabel-excel">
      <thead><tr><th>No</th><th>Hari</th><th>Tanggal</th><th>Sesi</th><th>Jam</th><th>Durasi</th><th>Teungku</th><th>Kitab</th><th>Materi/Bab</th><th>Tempat</th><th>Kelas</th></tr></thead>
      <tbody>${rows.length ? rows.map(({ e, s, t }, i) => `<tr>
        <td class="num">${i + 1}</td><td class="utama">${HARI[e.hari]}, ${fmtTgl(t)}</td><td>${fmtTgl(t)}</td><td>${esc(s?.nama || e.sesi)}</td>
        <td><b>${s && jamEntri(e, s).ada ? teksJam(e, s) : "belum diatur"}</b>${statusHTML(e, s, t)}</td><td>${s && jamEntri(e, s).ada ? teksDurasiPendek(jamEntri(e, s).durasi) : "-"}</td><td>${esc(e.namaGuru)}</td><td><b>${esc(e.kitab)}</b></td><td>${esc(e.materi || "-")}</td>
        <td>${esc(e.tempat || "-")}</td><td>${esc(e.kelas || "-")}</td></tr>`).join("")
        : `<tr><td colspan="11" class="empty">Belum ada jadwal.</td></tr>`}</tbody></table></div>`;
}

function perKitab(cfg, jadwal, cari = "") {
  const grup = {};
  jadwal.forEach(e => (grup[(e.kitab || "").trim()] ??= []).push(e));
  const q = cari.trim().toLowerCase();
  const nama = Object.keys(grup).sort((a, b) => a.localeCompare(b))
    .filter(k => !q || (k + " " + grup[k].map(e => `${e.materi} ${e.namaGuru} ${e.kelas} ${e.tempat}`).join(" ")).toLowerCase().includes(q));
  return `<div class="field"><label>Cari kitab / materi / teungku</label><input id="cariKitab" value="${esc(cari)}" placeholder="mis. Taqrib"></div>
    <p class="muted kecil">${nama.length} kitab diajarkan</p>
    ${nama.length ? nama.map(k => `<details class="kitab-item card" style="padding:0">
      <summary style="padding:12px 14px;display:flex;justify-content:space-between;gap:8px;cursor:pointer"><b>${ikon("buku", 16)} ${esc(k)}</b>
        <span class="badge b-in">${grup[k].length} sesi/minggu</span></summary>
      <div class="entri-list" style="padding:0 12px 12px">${grup[k].sort((a, b) => urutHari().indexOf(a.hari) - urutHari().indexOf(b.hari))
        .map(e => entriHTML(e, { tanggal: tanggalUntuk(e.hari), sesi: cfg.sesi.find(s => s.id === e.sesi) })).join("")}</div></details>`).join("")
      : `<p class="empty">Tidak ditemukan.</p>`}`;
}

function perTeungku(cfg, jadwal) {
  const g = {};
  jadwal.forEach(e => (g[e.guruId] ??= { nama: e.namaGuru, list: [] }).list.push(e));
  const list = Object.values(g).sort((a, b) => a.nama.localeCompare(b.nama));
  return list.length ? list.map(x => `<div class="card">
    <h2 class="judul-bagian">${ikon("orang", 18)} ${esc(x.nama)} <small class="jam">${x.list.length} sesi/minggu</small></h2>
    <div class="entri-list">${x.list.sort((a, b) => urutHari().indexOf(a.hari) - urutHari().indexOf(b.hari)).map(e => {
      const s = cfg.sesi.find(y => y.id === e.sesi);
      return entriHTML(e, { tanggal: tanggalUntuk(e.hari), siapa: false, sesi: s }).replace('<dl class="rinci">',
        `<div class="siapa">${ikonSesi(e.sesi)} Sesi ${esc(s?.nama || e.sesi)}</div><dl class="rinci">`);
    }).join("")}</div></div>`).join("") : `<div class="card empty">Belum ada jadwal.</div>`;
}

export function itemRiwayat(r, cfg) {
  const s = cfg.sesi.find(x => x.id === r.sesi);
  const t = { tambah: ["+", "tambah", "menambah"], ubah: ["✎", "ubah", "mengubah"], hapus: ["−", "hapus", "menghapus"] }[r.aksi] || ["•", "ubah", "mengubah"];
  const fmt = (x) => x ? `${x.mulai ? titikJam(x.mulai) + "–" + titikJam(x.selesai) + " · " : ""}${esc(x.kitab)}${x.materi ? " · " + esc(x.materi) : ""}${x.tempat ? " · " + esc(x.tempat) : ""}${x.kelas ? " · " + esc(x.kelas) : ""}` : "";
  return `<li><span class="tanda ${t[1]}">${t[0]}</span><div>
    <b>${esc(r.namaGuru)}</b> ${t[2]} jadwal <b>${HARI[r.hari] || ""} · ${esc(s?.nama || r.sesi)}</b><br>
    ${r.aksi === "ubah" ? `<del>${fmt(r.sebelum)}</del> → <ins>${fmt(r.sesudah)}</ins>` : r.aksi === "hapus" ? `<del>${fmt(r.sebelum)}</del>` : `<ins>${fmt(r.sesudah)}</ins>`}
    <small>${waktuIndo(r.waktu)}${r.olehNama && r.olehNama !== r.namaGuru ? " · oleh " + esc(r.olehNama) : ""}</small></div></li>`;
}

export function render(model, ctx) {
  const { cfg, jadwal, hari, cari, namaDayah, riwayat } = ctx;
  switch (model) {
    case "kartu": return kartu(cfg, jadwal, hari);
    case "papan": return papan(cfg, jadwal, hari, namaDayah);
    case "tabel": return tabel(cfg, jadwal);
    case "kitab": return perKitab(cfg, jadwal, cari);
    case "teungku": return perTeungku(cfg, jadwal);
    case "riwayat": return `<div class="card"><h2 class="judul-bagian">${ikon("riwayat", 18)} Riwayat perubahan jadwal</h2>
      <ul class="riwayat">${riwayat === null ? `<li class="empty"><span class="putar"></span>Memuat...</li>`
        : riwayat.length ? riwayat.slice(0, 150).map(r => itemRiwayat(r, cfg)).join("") : `<li class="empty">Belum ada perubahan jadwal.</li>`}</ul></div>`;
    default: return roster(cfg, jadwal);
  }
}

// Data laporan PDF/Excel jadwal (dipakai halaman depan & menu Jadwal)
export function dataLaporanJadwal(cfg, jadwal) {
  return {
    judul: "JADWAL MENGAJAR TEUNGKU", lanskap: true,
    sub: cfg.sesi.map(s => `Rentang sesi ${s.nama} ${jamSesi(s)} WIB`).join(" · "),
    kolom: ["No", "Hari", "Tanggal", "Sesi", "Jam", "Durasi", "Nama Teungku", "Kitab", "Materi / Bab", "Tempat", "Kelas"],
    baris: barisTabel(cfg, jadwal).map(({ e, s, t }, i) => [i + 1, HARI[e.hari], fmtTgl(t), s?.nama || e.sesi,
      s && jamEntri(e, s).ada ? teksJam(e, s) : "Belum diatur", s && jamEntri(e, s).ada ? `${jamEntri(e, s).durasi} menit` : "-", e.namaGuru, e.kitab, e.materi || "-", e.tempat || "-", e.kelas || "-"]),
    namaFile: "jadwal-mengajar"
  };
}
export { SEMUA_HARI };
