// Beranda staf: ringkasan hari ini, pengajian per sesi, grafik kehadiran & kas 6 bulan.
import { db, collection, getDocs, getDoc, doc, query, where } from "./firebase.js";
import {
  requireAuth, AKSES, rupiah, formatAngka, today, thisMonth, namaBulan, tglPanjang, esc, tampilError, jamSiap,
  ambilConfigAbsensi, ambilJadwal, HARI, hariDari, jamSesi, badgeStatus, ikon, teksJam, statusPulang
} from "./common.js";

const { profil } = await requireAuth(AKSES.dashboard);
await jamSiap;
const keuangan = AKSES.kas.includes(profil.role);
const tgl = today(), bln = thisMonth();
document.getElementById("nama").textContent = profil.nama;
document.getElementById("tanggalHariIni").textContent = tglPanjang(tgl);

// 6 bulan terakhir (termasuk bulan ini)
const [y, m] = bln.split("-").map(Number);
const bulan6 = [...Array(6)].map((_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
const labelBulan = (b) => new Date(b + "-01T00:00:00Z").toLocaleDateString("id-ID", { month: "short", timeZone: "UTC" });
const singkat = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " jt" : n >= 1e3 ? Math.round(n / 1e3) + " rb" : String(n);

// ---------- Grafik batang (SVG, satu sumbu, tanda tipis, tooltip saat disorot) ----------
function grafikBatang(el, { label, seri, format = (v) => v, maks = null }) {
  const W = Math.max(300, Math.round(el.clientWidth || 640)), H = 220, kiri = 52, bawah = 26, atas = 10, kanan = 8;   // teks tetap 11px
  const lebarArea = W - kiri - kanan, tinggiArea = H - atas - bawah;
  const nilaiMaks = maks ?? Math.max(1, ...seri.flatMap(s => s.nilai));
  const langkah = [0, 0.25, 0.5, 0.75, 1].map(f => nilaiMaks * f);
  const kelompok = lebarArea / label.length;
  const lebarBatang = Math.min(28, (kelompok - 14) / seri.length - 2);
  const yPos = (v) => atas + tinggiArea - (v / nilaiMaks) * tinggiArea;
  let svg = `<svg class="grafik" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(seri.map(s => s.nama).join(" dan "))} per bulan">`;
  langkah.forEach(v => {
    svg += `<line x1="${kiri}" x2="${W - kanan}" y1="${yPos(v)}" y2="${yPos(v)}" stroke="#e6ebe7" stroke-width="1"/>
      <text x="${kiri - 6}" y="${yPos(v) + 4}" text-anchor="end">${esc(format(Math.round(v), true))}</text>`;
  });
  label.forEach((lb, i) => {
    const x0 = kiri + i * kelompok + (kelompok - (lebarBatang + 2) * seri.length) / 2;
    seri.forEach((s, j) => {
      const v = s.nilai[i], x = x0 + j * (lebarBatang + 2), yy = yPos(v), h = Math.max(0, atas + tinggiArea - yy);
      const r = Math.min(4, h, lebarBatang / 2);
      // batang dengan sudut atas membulat 4px, menempel di garis dasar
      svg += `<g><title>${esc(lb)} · ${esc(s.nama)}: ${esc(format(v))}</title>
        <rect x="${x - 2}" y="${atas}" width="${lebarBatang + 4}" height="${tinggiArea}" fill="transparent"/>
        ${h > 0 ? `<path d="M${x},${atas + tinggiArea} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + lebarBatang - r} Q${x + lebarBatang},${yy} ${x + lebarBatang},${yy + r} V${atas + tinggiArea} Z" fill="${s.warna}"/>` : ""}</g>`;
    });
    svg += `<text x="${kiri + i * kelompok + kelompok / 2}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`;
  });
  svg += `<line x1="${kiri}" x2="${W - kanan}" y1="${atas + tinggiArea}" y2="${atas + tinggiArea}" stroke="#b9c4bc"/></svg>`;
  const legenda = seri.length > 1 ? `<div class="legenda-grafik">${seri.map(s => `<span><i style="background:${s.warna}"></i>${esc(s.nama)}</span>`).join("")}</div>` : "";
  const tabel = `<details class="kecil" style="margin-top:6px"><summary>Lihat angka</summary>
    <table class="kartu-hp"><thead><tr><th>Bulan</th>${seri.map(s => `<th class="num">${esc(s.nama)}</th>`).join("")}</tr></thead>
    <tbody>${label.map((lb, i) => `<tr><td>${esc(lb)}</td>${seri.map(s => `<td class="num">${esc(format(s.nilai[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  el.innerHTML = svg + legenda + tabel;
}

// ---------- Ringkasan & pengajian hari ini ----------
(async () => {
  try {
    const [guruSnap, absenSnap, cfg, jadwal] = await Promise.all([
      getDocs(query(collection(db, "guru"), where("aktif", "==", true))),
      getDocs(query(collection(db, "absensi"), where("tanggal", "==", tgl))),
      ambilConfigAbsensi(), ambilJadwal()
    ]);
    const h = hariDari(tgl);
    const aktif = new Set(guruSnap.docs.map(d => d.id));
    const absen = Object.fromEntries(absenSnap.docs.map(d => [`${d.data().sesi}_${d.data().guruId}`, d.data()]));
    const terjadwalHariIni = jadwal.filter(e => e.hari === h && aktif.has(e.guruId) && cfg.sesi.find(s => s.id === e.sesi)?.hari.includes(h));
    document.getElementById("sGuru").textContent = aktif.size;
    document.getElementById("sHadir").textContent = `${terjadwalHariIni.filter(e => absen[`${e.sesi}_${e.guruId}`]?.status === "H").length} / ${terjadwalHariIni.length}`;
    document.getElementById("hariIni").innerHTML = cfg.sesi.filter(s => s.hari.includes(h)).map(s => {
      const list = terjadwalHariIni.filter(e => e.sesi === s.id).sort((a, b) => (a.menitMulai ?? 0) - (b.menitMulai ?? 0) || a.namaGuru.localeCompare(b.namaGuru));
      return `<b>${ikon(s.id === "pagi" ? "matahari" : "bulan", 16)} ${esc(s.nama)} <small class="jam">${jamSesi(s)}</small></b>` + (list.length ? list.map(e => {
        const a = absen[`${s.id}_${e.guruId}`];
        return `<div class="baris"><span>${esc(e.namaGuru)} <small class="muted">· ${teksJam(e, s)} · ${esc(e.kitab)}</small></span><span style="text-align:right">${a ? badgeStatus(a.status) : '<span class="badge b-belum">⏳ Belum</span>'}${(() => { const pk = statusPulang(a, cfg); return pk.teks ? `<span class="pulang-ket ${pk.kode}">${pk.kode === "lewat" ? "⚠ " : ""}${pk.teks}</span>` : ""; })()}</span></div>`;
      }).join("") : `<p class="muted kecil">Tidak ada jadwal.</p>`);
    }).join("") || `<p class="empty">Tidak ada pengajian hari ${HARI[h]}.</p>`;
  } catch (ex) { tampilError(ex, "Gagal memuat ringkasan"); }
})();

if (document.getElementById("sIzin")) getDocs(query(collection(db, "izin"), where("status", "==", "menunggu")))
  .then(s => document.getElementById("sIzin").textContent = s.size).catch(() => {});

// ---------- Kehadiran 6 bulan ----------
(async () => {
  try {
    const s = await getDocs(query(collection(db, "absensi"), where("bulan", "in", bulan6)));
    const per = Object.fromEntries(bulan6.map(b => [b, { H: 0, total: 0 }]));
    s.docs.forEach(d => { const a = d.data(); if (per[a.bulan]) { per[a.bulan].total++; if (a.status === "H") per[a.bulan].H++; } });
    grafikBatang(document.getElementById("grafikHadir"), {
      label: bulan6.map(labelBulan), maks: 100,
      seri: [{ nama: "% Hadir dari sesi tercatat", warna: "#198754", nilai: bulan6.map(b => per[b].total ? Math.round(per[b].H / per[b].total * 100) : 0) }],
      format: (v) => v + "%"
    });
  } catch (ex) { document.getElementById("grafikHadir").innerHTML = `<p class="error-box">${esc(ex.message)}</p>`; }
})();

// ---------- Keuangan ----------
if (keuangan) (async () => {
  try {
    const [ring, kas, gaji] = await Promise.all([
      getDoc(doc(db, "ringkasan", "kas")),
      getDocs(query(collection(db, "kas"), where("tanggal", ">=", `${bulan6[0]}-01`), where("tanggal", "<=", `${bln}-31`))),
      getDocs(query(collection(db, "gaji"), where("periode", "==", bln)))
    ]);
    const r = ring.exists() ? ring.data() : null;
    document.getElementById("sSaldo").textContent = r ? rupiah((r.masuk || 0) - (r.keluar || 0)) : "–";
    const per = Object.fromEntries(bulan6.map(b => [b, { masuk: 0, keluar: 0 }]));
    kas.docs.forEach(d => { const k = d.data(); const b = (k.tanggal || "").slice(0, 7); if (per[b]) per[b][k.jenis === "masuk" ? "masuk" : "keluar"] += Number(k.jumlah) || 0; });
    document.getElementById("sMasuk").textContent = rupiah(per[bln].masuk);
    document.getElementById("sKeluar").textContent = rupiah(per[bln].keluar);
    document.getElementById("sMukafaah").textContent = rupiah(gaji.docs.reduce((s, d) => s + (Number(d.data().total) || 0), 0));
    grafikBatang(document.getElementById("grafikKas"), {
      label: bulan6.map(labelBulan),
      seri: [
        { nama: "Pemasukan", warna: "#198754", nilai: bulan6.map(b => per[b].masuk) },
        { nama: "Pengeluaran", warna: "#c9a227", nilai: bulan6.map(b => per[b].keluar) }
      ],
      format: (v, sumbu) => sumbu ? singkat(v) : rupiah(v)
    });
  } catch (ex) { tampilError(ex, "Gagal memuat data keuangan"); }
})();

// Backup otomatis (Super Admin)
if (profil.role === "superadmin") import("./cadangan.js").then(m => m.cekBackupOtomatis());
