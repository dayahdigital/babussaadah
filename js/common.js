// =====================================================================
//  Modul bersama: login & peran, navigasi, jam server, pesan error,
//  log aktivitas, notifikasi, format uang, status HISA, PWA.
// =====================================================================
import {
  auth, db, onAuthStateChanged, signOut, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  collection, query, where, onSnapshot, serverTimestamp, arrayUnion
} from "./firebase.js";
import { LEMBAGA, EMAIL_DOMAIN, APP_VERSI, APP_BUILD, HAK_CIPTA, ISTILAH } from "./pengaturan.js";
export { ISTILAH };

// ---------------------------------------------------------------------
// Peran & hak akses (harus sejalan dengan firestore.rules)
// ---------------------------------------------------------------------
export const PERAN = {
  superadmin: "Super Admin",
  pimpinan: "Pimpinan Dayah",
  admin: "Admin",
  bendahara: "Bendahara",
  operator: "Operator Absensi",
  guru: "Teungku"
};

export const AKSES = {
  dashboard: ["superadmin", "admin", "bendahara", "operator"],
  teungku: ["superadmin", "admin"],
  absensi: ["superadmin", "admin", "operator"],
  absenSaya: ["guru"],
  jadwal: ["superadmin", "admin", "guru"],
  mukafaah: ["superadmin", "admin", "bendahara"],
  kas: ["superadmin", "admin", "bendahara"],
  izin: ["pimpinan", "superadmin"],
  pengumuman: ["superadmin", "admin"],
  pengguna: ["superadmin"],
  lembaga: ["superadmin"],
  log: ["superadmin"],
  backup: ["superadmin"],
  aturSesi: ["superadmin"]
};
export const STAF = ["superadmin", "admin", "bendahara", "operator"];
export const beranda = (role) => role === "guru" ? "absen-saya.html" : role === "pimpinan" ? "izin.html" : "dashboard.html";

// ---------------------------------------------------------------------
// Ikon (SVG garis sederhana)
// ---------------------------------------------------------------------
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  cek: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  orang: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/>',
  absen: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  dompet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
  kas: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  izin: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 15l2 2 4-4"/>',
  toa: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  pengguna: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  gedung: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
  log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  backup: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  bantuan: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
  akun: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2 3.2-3 5.5-3s4.3 1 5.5 3"/>',
  keluar: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  lonceng: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pasang: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2z"/>',
  kamera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  matahari: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bulan: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  buku: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M19 19v2H6"/>',
  lokasi: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  kelas: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
  jam: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>',
  roster: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
  kartu: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>',
  papan: '<rect x="3" y="3" width="18" height="13" rx="1.5"/><path d="M7 21l3-5M17 21l-3-5M7 8h10M7 11h6"/>',
  tabel: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>',
  riwayat: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  android: '<path d="M6 10a6 6 0 0 1 12 0v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M8 4l1.5 2.5M16 4l-1.5 2.5M10 10h.01M14 10h.01"/>',
  apel: '<path d="M16 3c-1.5.2-3 1.5-3 3 1.6.1 3-1.3 3-3z"/><path d="M12 8c-1-.6-2-.9-3-.9-2.5 0-4 2.2-4 5 0 3.6 2.4 8 4.4 8 1 0 1.6-.6 2.6-.6s1.6.6 2.6.6c2 0 4.4-4.4 4.4-8 0-2.8-1.6-5-4-5-1 0-2 .3-3 .9z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  kunci: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  layarPenuh: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  mata: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  bagikan: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
  tambahKotak: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  titikTiga: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  unduh: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'
};
export const ikon = (n, ukuran = 20) =>
  `<svg class="ikon" width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

const MENU = [
  { href: "dashboard.html", label: "Beranda", ikon: "home", roles: AKSES.dashboard },
  { href: "absen-saya.html", label: "Absen", ikon: "cek", roles: AKSES.absenSaya },
  { href: "izin.html", label: "Izin & Sakit", ikon: "izin", roles: AKSES.izin },
  { href: "absensi.html", label: "Absensi", ikon: "absen", roles: AKSES.absensi },
  { href: "jadwal-mengajar.html", label: "Jadwal", ikon: "kalender", roles: AKSES.jadwal },
  { href: "teungku.html", label: "Data Teungku", ikon: "orang", roles: AKSES.teungku },
  { href: "mukafaah.html", label: "Mukafaah", ikon: "dompet", roles: AKSES.mukafaah },
  { href: "kas.html", label: "Kas", ikon: "kas", roles: AKSES.kas },
  { href: "pengumuman.html", label: "Pengumuman", ikon: "toa", roles: AKSES.pengumuman },
  { href: "pengguna.html", label: "Pengguna", ikon: "pengguna", roles: AKSES.pengguna },
  { href: "lembaga.html", label: "Profil Dayah", ikon: "gedung", roles: AKSES.lembaga },
  { href: "log.html", label: "Log Aktivitas", ikon: "log", roles: AKSES.log },
  { href: "backup.html", label: "Backup", ikon: "backup", roles: AKSES.backup },
  { href: "panduan.html", label: "Panduan", ikon: "bantuan" },
  { href: "akun.html", label: "Akun Saya", ikon: "akun" }
];

// ---------------------------------------------------------------------
// Penyimpanan lokal (aman bila diblokir browser)
// ---------------------------------------------------------------------
export const simpan = {
  get(k, sesi = false) { try { return JSON.parse((sesi ? sessionStorage : localStorage).getItem(k)); } catch { return null; } },
  set(k, v, sesi = false) { try { (sesi ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
  del(k, sesi = false) { try { (sesi ? sessionStorage : localStorage).removeItem(k); } catch { /* abaikan */ } }
};

// ---------------------------------------------------------------------
// Tampilan dayah (logo, foto, nama, alamat, pejabat penanda tangan)
// ---------------------------------------------------------------------
export const LOGO_BAWAAN = "icons/logo-dayah.png";
export function tampilanCache() {
  return { ...LEMBAGA, tagline: "", logo: "", foto: "", tema: "hijau", modelJadwal: "roster", namaArab: "داية باب السعادة", ...(simpan.get("tampilan") || {}) };
}
export const logoDayah = (t) => t?.logo || LOGO_BAWAAN;
export function pasangTema(tema) {
  if (tema && tema !== "hijau") document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  const warna = { hijau: "#145a32", biru: "#1e3a5f", krem: "#3f5f2a" }[tema || "hijau"];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", warna);
}
pasangTema(tampilanCache().tema);

// Layar loading (dipasang di HTML, disembunyikan saat halaman siap)
export function sembunyikanPemuat() {
  const p = document.getElementById("pemuat");
  if (p && !p.classList.contains("hilang")) { p.classList.add("hilang"); setTimeout(() => p.remove(), 500); }
}
export async function ambilTampilan() {
  try {
    const s = await getDoc(doc(db, "config", "tampilan"));
    const d = s.exists() ? s.data() : {};
    const t = {
      nama: d.nama || LEMBAGA.nama, alamat: d.alamat || LEMBAGA.alamat,
      bendahara: d.bendahara || LEMBAGA.bendahara, pimpinan: d.pimpinan || LEMBAGA.pimpinan,
      tagline: d.tagline || "", logo: d.logo || "", foto: d.foto || "",
      tema: d.tema || "hijau", modelJadwal: d.modelJadwal || "roster", namaArab: d.namaArab ?? "داية باب السعادة"
    };
    simpan.set("tampilan", t);
    pasangTema(t.tema);
    return t;
  } catch { return tampilanCache(); }
}

// ---------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------
export const normUsername = (s) => String(s || "").trim().toLowerCase();
export const usernameValid = (u) => /^[a-z0-9._]{3,20}$/.test(u);
export const buatEmail = (u) => `${u}.${Math.random().toString(36).slice(2, 8)}@${EMAIL_DOMAIN}`;

// ---------------------------------------------------------------------
// JAM SERVER — semua tanggal & jam memakai waktu server, bukan jam HP
// ---------------------------------------------------------------------
export const WIB_MS = 7 * 3600 * 1000;
const HARI_MS = 86400000;
let _offset = Number(simpan.get("offsetJam")) || 0;   // server - perangkat (ms)
export const sekarang = () => Date.now() + _offset;
export const selisihJamPerangkat = () => _offset;
export const today = () => new Date(sekarang() + WIB_MS).toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);

// Lewat header "Date" dari server situs (untuk pengunjung tanpa login)
export async function sinkronJamHTTP() {
  try {
    const t0 = Date.now();
    const r = await fetch(location.origin + location.pathname, { method: "HEAD", cache: "no-store" });
    const t1 = Date.now();
    const d = Date.parse(r.headers.get("date"));
    if (!isNaN(d)) { _offset = d + 500 - (t0 + t1) / 2; simpan.set("offsetJam", _offset); }
  } catch { /* tetap pakai offset lama */ }
  return _offset;
}
// Lewat Firestore (paling akurat, sama dengan jam yang dipakai aturan database)
export async function sinkronJamServer(uid) {
  try {
    const ref = doc(db, "jam", uid);
    const t0 = Date.now();
    await setDoc(ref, { t: serverTimestamp() });
    const t1 = Date.now();
    const s = await getDoc(ref);
    const t = s.data()?.t?.toMillis?.();
    if (t) { _offset = t - (t0 + t1) / 2; simpan.set("offsetJam", _offset); return _offset; }
  } catch { /* lanjut ke cara HTTP */ }
  return sinkronJamHTTP();
}
export let jamSiap = Promise.resolve(_offset);

// ---------------------------------------------------------------------
// Sesi mengajar: Pagi & Malam (nama, jam, hari, toleransi diatur Super Admin)
// ---------------------------------------------------------------------
export const SESI_BAWAAN = [
  { id: "pagi", nama: "Pagi", mulai: "07:30", selesai: "11:30", hari: [0, 1, 2, 3, 4, 5, 6] },
  { id: "malam", nama: "Malam", mulai: "20:00", selesai: "22:00", hari: [0, 1, 2, 3, 4, 5, 6] }
];

export async function ambilConfigAbsensi() {
  const s = await getDoc(doc(db, "config", "absensi")).catch(() => null);
  const d = s?.exists() ? s.data() : {};
  const tersimpan = Object.fromEntries((d.sesi || []).map(x => [x.id, x]));
  const sesi = SESI_BAWAAN.map(b => {
    const x = { ...b, ...(tersimpan[b.id] || {}) };
    if (!Array.isArray(x.hari)) x.hari = [...b.hari];
    return x;
  });
  return {
    sesi,
    guruMandiri: d.guruMandiri !== false,
    toleransiSebelum: Number.isFinite(d.toleransiSebelum) ? d.toleransiSebelum : 30,
    toleransiSesudah: Number.isFinite(d.toleransiSesudah) ? d.toleransiSesudah : 30
  };
}

const keMs = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h * 60 + (m || 0)) * 60000; };
const jamDariMs = (ms) => new Date(ms + WIB_MS).toISOString().slice(11, 16);
export const lewatTengahMalam = (s) => keMs(s.selesai) <= keMs(s.mulai);
export const jamSesi = (s) => `${s.mulai}–${s.selesai}${lewatTengahMalam(s) ? " (+1 hari)" : ""}`;

// Jendela waktu sebuah sesi pada tanggal tertentu (ms, UTC)
export function jendelaSesi(sesi, tgl, cfg) {
  const [y, m, d] = tgl.split("-").map(Number);
  const awal = Date.UTC(y, m - 1, d) - WIB_MS;
  const mulai = awal + keMs(sesi.mulai);
  const selesai = awal + keMs(sesi.selesai) + (lewatTengahMalam(sesi) ? HARI_MS : 0);
  return {
    mulai, selesai,
    buka: mulai - (cfg?.toleransiSebelum ?? 30) * 60000,
    tutup: selesai + (cfg?.toleransiSesudah ?? 30) * 60000
  };
}
export const tambahHari = (tgl, n) => {
  const [y, m, d] = tgl.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// Status tombol absen untuk sesi pada tanggal itu
export function waktuAbsen(sesi, cfg, tgl = today()) {
  const w = jendelaSesi(sesi, tgl, cfg), now = sekarang();
  if (now < w.buka) return { boleh: false, pesan: `Absen dibuka pukul ${jamDariMs(w.buka)} WIB` };
  if (now > w.tutup) return { boleh: false, pesan: `Waktu absen sudah lewat (ditutup ${jamDariMs(w.tutup)} WIB)` };
  return { boleh: true, pesan: `Absen terbuka sampai pukul ${jamDariMs(w.tutup)} WIB` };
}
export const sesiSudahSelesai = (sesi, tgl, cfg) => sekarang() > jendelaSesi(sesi, tgl, cfg).selesai;

// ---------------------------------------------------------------------
// Jadwal mengajar & riwayatnya
// ---------------------------------------------------------------------
export const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const SEMUA_HARI = [0, 1, 2, 3, 4, 5, 6];
export const hariDari = (tgl) => { const [y, m, d] = tgl.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const idJadwal = (guruId, sesiId, hari) => `${guruId}_${sesiId}_${hari}`;

export async function ambilJadwal(guruId = null) {
  const q = guruId ? query(collection(db, "mengajar"), where("guruId", "==", guruId)) : collection(db, "mengajar");
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function ambilRiwayatJadwal(guruId = null) {
  const q = guruId ? query(collection(db, "riwayat_jadwal"), where("guruId", "==", guruId)) : collection(db, "riwayat_jadwal");
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.waktu?.toMillis?.() || 0) - (a.waktu?.toMillis?.() || 0));
}
export const indeksJadwal = (entri) => new Set(entri.map(e => idJadwal(e.guruId, e.sesi, e.hari)));
export const sesiPadaHari = (cfg, hari) => cfg.sesi.filter(s => s.hari.includes(hari));
export const terjadwal = (idx, guruId, sesi, hari) => sesi.hari.includes(hari) && idx.has(idJadwal(guruId, sesi.id, hari));

// Periode berlaku tiap slot jadwal (agar rekap bulan lalu tidak berubah saat jadwal diganti)
export function buatPeriode(jadwal, riwayat) {
  const per = {};
  const tambah = (k, a, b) => (per[k] ??= []).push([a || "0000-00-00", b || null]);
  jadwal.forEach(e => tambah(e.id, e.sejak, null));
  riwayat.filter(r => r.aksi === "hapus").forEach(r => tambah(idJadwal(r.guruId, r.sesi, r.hari), r.sejak, r.tanggal));
  return per;
}
export function jadwalPada(per, guruId, sesi, tgl) {
  const h = hariDari(tgl);
  if (!sesi.hari.includes(h)) return false;
  return (per[idJadwal(guruId, sesi.id, h)] || []).some(([a, b]) => a <= tgl && (!b || tgl < b));
}
export function hitungJadwalBulan(cfg, per, guruId, bln) {
  const [y, m] = bln.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const kini = today();
  let n = 0;
  for (let d = 1; d <= akhir; d++) {
    const tgl = `${bln}-${String(d).padStart(2, "0")}`;
    if (tgl > kini) break;
    n += cfg.sesi.filter(s => jadwalPada(per, guruId, s, tgl) && sesiSudahSelesai(s, tgl, cfg)).length;
  }
  return n;
}

// ---------------------------------------------------------------------
// Status absensi HISA (ikon + teks, tidak hanya warna)
// ---------------------------------------------------------------------
export const STATUS = {
  H: { label: "Hadir", ikon: "✔", kelas: "st-h" },
  I: { label: "Izin", ikon: "✉", kelas: "st-i" },
  S: { label: "Sakit", ikon: "✚", kelas: "st-s" },
  A: { label: "Alpa", ikon: "✖", kelas: "st-a" }
};
export const badgeStatus = (st) => {
  const s = STATUS[st];
  return s ? `<span class="badge ${s.kelas}"><b>${s.ikon}</b> ${st} · ${s.label}</span>` : "–";
};

// ---------------------------------------------------------------------
// Pesan error yang menjelaskan penyebab
// ---------------------------------------------------------------------
export function pesanError(ex) {
  const c = ex?.code || "";
  const M = {
    "permission-denied": "Ditolak server: akun Anda tidak berhak melakukan ini, atau data tidak memenuhi syarat (mis. di luar jam sesi, data sudah dikunci).",
    "unavailable": "Tidak terhubung ke server. Periksa internet Anda lalu coba lagi.",
    "failed-precondition": "Server menolak karena kondisi data belum sesuai. Muat ulang halaman lalu coba lagi.",
    "not-found": "Data tidak ditemukan — mungkin sudah dihapus orang lain. Muat ulang halaman.",
    "already-exists": "Data ini sudah ada.",
    "resource-exhausted": "Kuota harian Firebase habis. Coba lagi besok atau hubungi Super Admin.",
    "unauthenticated": "Sesi login berakhir. Silakan masuk lagi.",
    "deadline-exceeded": "Server terlalu lama menjawab (sinyal lemah). Coba lagi.",
    "invalid-argument": "Data tidak valid: " + (ex?.message || ""),
    "auth/network-request-failed": "Tidak ada koneksi internet.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    "auth/invalid-credential": "Username atau kata sandi salah.",
    "auth/wrong-password": "Username atau kata sandi salah.",
    "auth/user-not-found": "Username atau kata sandi salah.",
    "auth/weak-password": "Kata sandi terlalu lemah (minimal 6 karakter).",
    "auth/requires-recent-login": "Demi keamanan, keluar lalu masuk lagi sebelum mengganti kata sandi.",
    "auth/email-already-in-use": "Akun dengan username ini sudah ada."
  };
  if (M[c]) return M[c];
  if (ex instanceof Error && !c) return ex.message;
  return "Terjadi kesalahan" + (c ? ` (${c})` : "") + (ex?.message ? `: ${ex.message}` : ".");
}
export function tampilError(ex, konteks = "") {
  console.error(konteks, ex);
  toast((konteks ? konteks + ": " : "") + pesanError(ex), "err");
}
// Jalankan aksi dengan tombol terkunci + pesan error jelas + peringatan sinyal lemah
export async function aksi(tombol, fn, labelProses = "Menyimpan...") {
  const label = tombol?.innerHTML;
  if (tombol) { tombol.disabled = true; tombol.innerHTML = `<span class="putar"></span>${labelProses}`; }
  const lambat = setTimeout(() => toast(navigator.onLine ? "Sinyal lemah, masih mencoba..." : "Offline — akan dikirim saat sinyal kembali", "info"), 8000);
  try { return await fn(); }
  catch (ex) {
    tampilError(ex);
    try { ex._sudahDitampilkan = true; } catch { /* abaikan */ }
    return Promise.reject(ex);
  }
  finally { clearTimeout(lambat); if (tombol) { tombol.disabled = false; tombol.innerHTML = label; } }
}
function bannerError(teks) {
  sembunyikanPemuat();
  let el = document.getElementById("gangguan");
  if (!el) { el = document.createElement("div"); el.id = "gangguan"; el.className = "gangguan"; document.body.prepend(el); }
  el.innerHTML = `<span>⚠ ${esc(teks)}</span> <button class="btn btn-sm" onclick="location.reload()">Muat ulang</button>
    <button class="btn btn-sm btn-sec" onclick="this.parentElement.remove()">Tutup</button>`;
}
let _errorTerpasang = false;
export function pasangPenangkapError() {
  if (_errorTerpasang) return;
  _errorTerpasang = true;
  window.addEventListener("unhandledrejection", (e) => { if (!e.reason?._sudahDitampilkan) bannerError(pesanError(e.reason)); });
  window.addEventListener("error", (e) => { if (e.message && !/ResizeObserver/.test(e.message)) bannerError("Halaman bermasalah: " + e.message); });
  window.addEventListener("offline", () => toast("Anda offline. Data yang tampil mungkin belum terbaru.", "info"));
  window.addEventListener("online", () => toast("Kembali online"));
}

// ---------------------------------------------------------------------
// Login & profil
// ---------------------------------------------------------------------
let _profil = null;
export const profilAktif = () => _profil;

export async function ambilProfil(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}
export async function keluar() {
  simpan.del("profil", true);
  await signOut(auth).catch(() => {});
  location.replace("./");
}

// Panggil di setiap halaman yang butuh login. roles = peran yang boleh membuka halaman.
export function requireAuth(roles = null) {
  pasangPenangkapError();
  pasangPWA();
  pasangPengamat();
  const cache = simpan.get("profil", true);
  if (cache) renderNav(cache);
  pasangFooter();

  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) { simpan.del("profil", true); return location.replace("./"); }
      let profil;
      try { profil = await ambilProfil(user.uid); }
      catch (ex) {
        if (cache?.uid === user.uid) profil = cache;   // sinyal lemah: pakai data sesi
        else { bannerError("Tidak bisa memuat akun Anda: " + pesanError(ex)); return; }
      }
      if (!profil || !profil.aktif || profil.dihapus) {
        simpan.del("profil", true);
        await signOut(auth).catch(() => {});
        return location.replace("./?nonaktif=1");
      }
      // Akun teungku tertutup otomatis bila data teungkunya sudah dihapus
      if (profil.role === "guru") {
        const g = await getDoc(doc(db, "guru", profil.guruId || "-")).catch(() => null);
        if (g && !g.exists()) {
          simpan.del("profil", true);
          await signOut(auth).catch(() => {});
          return location.replace("./?nonaktif=1");
        }
      }
      if (roles && !roles.includes(profil.role)) return location.replace(beranda(profil.role));
      _profil = profil;
      simpan.set("profil", profil, true);
      if (!cache || JSON.stringify(cache) !== JSON.stringify(profil)) renderNav(profil);
      document.querySelectorAll("[data-roles]").forEach(el => {
        if (!el.dataset.roles.split(",").includes(profil.role)) el.remove();
      });
      jamSiap = sinkronJamServer(user.uid);
      mulaiNotifikasi(profil);
      setTimeout(sembunyikanPemuat, 150);
      resolve({ user, profil });
    });
  });
}

// ---------------------------------------------------------------------
// Navigasi: atas (komputer) + bawah (HP, tanpa geser-geser)
// ---------------------------------------------------------------------
function renderNav(profil) {
  const el = document.getElementById("navbar");
  if (!el) return;
  const t = tampilanCache();
  const now = location.pathname.split("/").pop() || "dashboard.html";
  const menu = MENU.filter(m => !m.roles || m.roles.includes(profil.role));
  el.innerHTML = `
    <div class="nav-atas">
      <a class="brand" href="${beranda(profil.role)}">
        <img src="${logoDayah(t)}" alt="" class="${t.logo ? "" : "bulat"}">
        <div><strong>${esc(t.nama)}</strong><small>${esc(PERAN[profil.role] || "")} · ${esc(profil.nama)}</small></div>
      </a>
      <div class="nav-user">
        <button class="btn-ikon" id="btnLonceng" aria-label="Notifikasi">${ikon("lonceng", 22)}<span class="titik" id="jmlNotif" hidden></span></button>
        <button class="btn btn-ghost btn-sm hanya-pc" id="btnLogout">${ikon("keluar", 16)} Keluar</button>
      </div>
    </div>
    <nav class="nav-tab">
      ${menu.map(m => `<a href="${m.href}" class="${m.href === now ? "active" : ""}">${ikon(m.ikon, 16)} ${m.label}</a>`).join("")}
    </nav>
    <div class="panel-notif" id="panelNotif" hidden></div>`;
  document.getElementById("btnLogout").onclick = keluar;
  document.getElementById("btnLonceng").onclick = bukaPanelNotif;

  // Navigasi bawah HP: 4 menu utama + "Menu" untuk sisanya
  document.getElementById("navBawah")?.remove();
  document.getElementById("lembarMenu")?.remove();
  const utama = menu.filter(m => !["panduan.html", "akun.html"].includes(m.href)).slice(0, 4);
  const nb = document.createElement("nav");
  nb.id = "navBawah";
  nb.className = "nav-bawah";
  nb.innerHTML = utama.map(m => `<a href="${m.href}" class="${m.href === now ? "active" : ""}">${ikon(m.ikon, 22)}<span>${m.label}</span></a>`).join("")
    + `<button id="btnMenuBawah" class="${utama.some(m => m.href === now) ? "" : "active"}">${ikon("menu", 22)}<span>Menu</span></button>`;
  document.body.appendChild(nb);
  const lm = document.createElement("div");
  lm.id = "lembarMenu";
  lm.className = "lembar";
  lm.hidden = true;
  lm.innerHTML = `<div class="lembar-isi">
      <div class="lembar-pegangan"></div>
      <div class="lembar-kepala"><b>${esc(profil.nama)}</b><small>${esc(PERAN[profil.role] || "")}</small></div>
      <div class="lembar-grid">
        ${menu.map(m => `<a href="${m.href}" class="${m.href === now ? "active" : ""}">${ikon(m.ikon, 24)}<span>${m.label}</span></a>`).join("")}
        <button id="btnPasangLembar" class="tombol-pasang" hidden>${ikon("pasang", 24)}<span>Pasang Aplikasi</span></button>
        <button id="btnKeluarLembar">${ikon("keluar", 24)}<span>Keluar</span></button>
      </div>
    </div>`;
  document.body.appendChild(lm);
  document.getElementById("btnMenuBawah").onclick = () => { lm.hidden = false; };
  lm.addEventListener("click", (e) => { if (e.target === lm) lm.hidden = true; });
  document.getElementById("btnKeluarLembar").onclick = keluar;
  document.getElementById("btnPasangLembar").onclick = pasangAplikasi;
  if (_promptPasang) document.getElementById("btnPasangLembar").hidden = false;
  document.body.classList.add("ada-nav-bawah");
  el.querySelector(".nav-tab a.active")?.scrollIntoView({ block: "nearest", inline: "center" });
}

// ---------------------------------------------------------------------
// Kaki halaman: versi & hak cipta
// ---------------------------------------------------------------------
export const teksVersi = () => `Versi ${APP_VERSI}${APP_BUILD.startsWith("__") ? "" : " · build " + APP_BUILD}`;
export function pasangFooter(target = document.body) {
  if (document.getElementById("kaki")) return;
  const f = document.createElement("footer");
  f.id = "kaki";
  f.className = "kaki";
  f.innerHTML = `${teksVersi()} · ${HAK_CIPTA} · <a href="panduan.html">Panduan</a>`;
  target.appendChild(f);
}

// ---------------------------------------------------------------------
// LOG AKTIVITAS — setiap perubahan dicatat (siapa, kapan, apa)
// ---------------------------------------------------------------------
export function catatLog(modul, aksiNama, detail = "") {
  if (!_profil) return Promise.resolve();
  return addDoc(collection(db, "log"), {
    uid: _profil.uid, username: _profil.username || "", nama: _profil.nama || "", peran: _profil.role,
    modul, aksi: aksiNama, detail: String(detail).slice(0, 600),
    tanggal: today(), waktu: serverTimestamp()
  }).catch(ex => console.warn("Log gagal", ex));
}

// ---------------------------------------------------------------------
// NOTIFIKASI (di dalam aplikasi + notifikasi sistem saat aplikasi terbuka)
// ---------------------------------------------------------------------
export function kirimNotif({ untukUid = null, untukPeran = null, judul, isi = "", tautan = "" }) {
  if (!untukUid && !untukPeran) return Promise.resolve();
  return addDoc(collection(db, "notifikasi"), {
    untukUid, untukPeran, judul: String(judul).slice(0, 120), isi: String(isi).slice(0, 400), tautan,
    dari: _profil?.nama || "", dibacaOleh: [], waktu: serverTimestamp()
  }).catch(ex => console.warn("Notifikasi gagal", ex));
}
let _notif = { a: [], b: [] }, _notifAwal = true, _uid = null;
function mulaiNotifikasi(profil) {
  _uid = profil.uid;
  const gabung = () => {
    const semua = [..._notif.a, ..._notif.b].sort((x, y) => (y.waktu?.toMillis?.() || 0) - (x.waktu?.toMillis?.() || 0));
    const belum = semua.filter(n => !(n.dibacaOleh || []).includes(_uid));
    const titik = document.getElementById("jmlNotif");
    if (titik) { titik.hidden = !belum.length; titik.textContent = belum.length > 9 ? "9+" : belum.length; }
    if (!_notifAwal && belum.length && "Notification" in window && Notification.permission === "granted") {
      const n = belum[0];
      if (!n._diumumkan) {
        n._diumumkan = true;
        navigator.serviceWorker?.ready.then(r => r.showNotification(n.judul, { body: n.isi, icon: "icons/icon-192.png", data: n.tautan }))
          .catch(() => new Notification(n.judul, { body: n.isi }));
      }
    }
    _notifAwal = false;
    window.__notif = semua;
    if (!document.getElementById("panelNotif")?.hidden) gambarPanelNotif();
  };
  const sub = (q, k) => onSnapshot(q, (s) => { _notif[k] = s.docs.map(d => ({ id: d.id, ...d.data() })); gabung(); }, () => {});
  sub(query(collection(db, "notifikasi"), where("untukUid", "==", profil.uid)), "a");
  sub(query(collection(db, "notifikasi"), where("untukPeran", "==", profil.role)), "b");
}
function gambarPanelNotif() {
  const p = document.getElementById("panelNotif");
  const list = (window.__notif || []).slice(0, 30);
  const izinNotif = "Notification" in window && Notification.permission === "default";
  p.innerHTML = `<div class="panel-kepala"><b>Notifikasi</b>
      ${izinNotif ? `<button class="btn btn-sm btn-sec" id="btnIzinNotif">Aktifkan notifikasi HP</button>` : ""}</div>
    ${list.length ? list.map(n => {
      const dibaca = (n.dibacaOleh || []).includes(_uid);
      return `<a class="notif ${dibaca ? "" : "baru"}" data-id="${n.id}" href="${esc(n.tautan || "#")}">
        <b>${esc(n.judul)}</b><span>${esc(n.isi)}</span>
        <small>${n.waktu?.toDate ? n.waktu.toDate().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : ""}${n.dari ? " · " + esc(n.dari) : ""}</small></a>`;
    }).join("") : `<p class="empty">Belum ada notifikasi.</p>`}`;
  document.getElementById("btnIzinNotif")?.addEventListener("click", async () => {
    await Notification.requestPermission();
    gambarPanelNotif();
  });
  p.querySelectorAll(".notif.baru").forEach(a => a.addEventListener("click", () => {
    updateDoc(doc(db, "notifikasi", a.dataset.id), { dibacaOleh: arrayUnion(_uid) }).catch(() => {});
  }));
}
function bukaPanelNotif(e) {
  e.stopPropagation();
  const p = document.getElementById("panelNotif");
  p.hidden = !p.hidden;
  if (!p.hidden) {
    gambarPanelNotif();
    const tutup = (ev) => { if (!p.contains(ev.target)) { p.hidden = true; document.removeEventListener("click", tutup); } };
    setTimeout(() => document.addEventListener("click", tutup), 0);
    // tandai semua terbaca setelah dibuka 2 detik
    setTimeout(() => (window.__notif || []).filter(n => !(n.dibacaOleh || []).includes(_uid)).slice(0, 20)
      .forEach(n => updateDoc(doc(db, "notifikasi", n.id), { dibacaOleh: arrayUnion(_uid) }).catch(() => {})), 2000);
  }
}

// ---------------------------------------------------------------------
// PWA: service worker + tombol pasang aplikasi
// ---------------------------------------------------------------------
let _promptPasang = null, _pwaTerpasang = false;
export function pasangPWA() {
  if (_pwaTerpasang) return;
  _pwaTerpasang = true;
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _promptPasang = e;
    document.querySelectorAll(".tombol-pasang").forEach(b => b.hidden = false);
    document.dispatchEvent(new Event("bisa-install"));
  });
  window.addEventListener("appinstalled", () => {
    _promptPasang = null;
    document.querySelectorAll(".tombol-pasang,.tombol-install").forEach(b => b.hidden = true);
    toast("Aplikasi terpasang. Buka dari layar utama / desktop.");
  });
}
export const bisaInstallLangsung = () => !!_promptPasang;
export const sudahTerpasang = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Menampilkan dialog install bawaan browser. Mengembalikan false bila browser tidak menyediakannya.
export async function pasangAplikasi() {
  if (!_promptPasang) { toast("Buka menu browser lalu pilih 'Tambahkan ke Layar utama' / 'Install app'.", "info"); return false; }
  const p = _promptPasang;
  p.prompt();
  const { outcome } = await p.userChoice.catch(() => ({}));
  _promptPasang = null;
  if (outcome === "accepted") document.querySelectorAll(".tombol-pasang,.tombol-install").forEach(b => b.hidden = true);
  return true;
}

// ---------------------------------------------------------------------
// Uang dengan pemisah ribuan titik (1.250.000)
// ---------------------------------------------------------------------
export const formatAngka = (n) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
export const rupiah = (n) => "Rp " + formatAngka(n);
export const nilaiUang = (el) => Number(String(el?.value || "").replace(/\D/g, "")) || 0;
export const setUang = (el, n) => { el.value = n ? formatAngka(n) : ""; };
function pasangInputUang(el) {
  if (el.dataset.uangSiap) return;
  el.dataset.uangSiap = "1";
  el.type = "text";
  el.inputMode = "numeric";
  el.autocomplete = "off";
  if (el.value) setUang(el, Number(String(el.value).replace(/\D/g, "")));
  el.addEventListener("input", () => {
    const dariKanan = el.value.length - (el.selectionStart ?? el.value.length);
    const n = Number(el.value.replace(/\D/g, "")) || 0;
    el.value = n ? formatAngka(n) : "";
    const pos = Math.max(0, el.value.length - dariKanan);
    try { el.setSelectionRange(pos, pos); } catch { /* abaikan */ }
  });
}

// Tabel → kartu di HP: tiap sel diberi label dari judul kolom
function labelTabel(tabel) {
  const judul = [...tabel.querySelectorAll("thead th")].map(th => th.textContent.trim());
  tabel.querySelectorAll("tbody tr").forEach(tr => {
    [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-label") && judul[i]) td.setAttribute("data-label", judul[i]); });
  });
}
let _pengamat = false;
function pasangPengamat() {
  if (_pengamat) return;
  _pengamat = true;
  const proses = (root) => {
    root.querySelectorAll?.("input.uang").forEach(pasangInputUang);
    root.querySelectorAll?.("table.kartu-hp").forEach(labelTabel);
  };
  const jalan = () => {
    proses(document);
    new MutationObserver((ms) => ms.forEach(m => {
      const t = m.target.closest?.("table.kartu-hp");
      if (t) labelTabel(t);
      m.addedNodes.forEach(n => n.nodeType === 1 && proses(n));
    })).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", jalan); else jalan();
}
export const siapkanHalamanPublik = () => { pasangPenangkapError(); pasangPWA(); pasangPengamat(); };

// ---------------------------------------------------------------------
// Format tanggal & lain-lain
// ---------------------------------------------------------------------
export const namaBulan = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
};
export const tglIndo = (s) => !s ? "" :
  new Date(s + "T00:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const tglPanjang = (s) => !s ? "" :
  new Date(s + "T00:00:00Z").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const waktuIndo = (ts) => ts?.toDate ? ts.toDate().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";

export function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.setAttribute("role", type === "err" ? "alert" : "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, type === "err" ? 7000 : 3000);
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Perkecil gambar sebelum disimpan (agar ringan & muat di Firestore)
export function perkecilGambar(file, maxSisi, kualitas = 0.8, tipe = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, maxSisi / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * skala);
      c.height = Math.round(img.height * skala);
      const ctx = c.getContext("2d");
      if (tipe === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(tipe, kualitas));
    };
    img.onerror = () => reject(new Error("File bukan gambar yang valid"));
    img.src = URL.createObjectURL(file);
  });
}
// Perkecil sampai di bawah batas ukuran (karakter base64)
export async function gambarKecil(file, maxSisi, batas, tipe = "image/jpeg") {
  for (const [f, q] of [[1, 0.78], [0.8, 0.7], [0.6, 0.62], [0.45, 0.55], [0.32, 0.5]]) {
    const url = await perkecilGambar(file, Math.round(maxSisi * f), q, tipe);
    if (url.length <= batas) return url;
  }
  throw new Error("Gambar terlalu besar, coba foto lain.");
}

// Nomor WhatsApp Indonesia → format 62xxxx
export const nomorWA = (hp) => {
  let n = String(hp || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (n.startsWith("8")) n = "62" + n;
  return n;
};

export { LEMBAGA };
