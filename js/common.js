// Fungsi bersama: penjaga login & peran, navigasi, tampilan dayah, format rupiah, notifikasi
import { auth, db, onAuthStateChanged, signOut, doc, getDoc, getDocs, collection, query, where } from "./firebase.js?v=2.0.2";
import { LEMBAGA, EMAIL_DOMAIN, APP_VERSI, APP_BUILD, HAK_CIPTA } from "./pengaturan.js?v=2.0.2";

// ---------- Peran & hak akses ----------
export const PERAN = {
  superadmin: "Super Admin",
  admin: "Admin",
  bendahara: "Bendahara",
  operator: "Operator Absensi",
  guru: "Teungku / Guru"
};

// Halaman mana boleh dibuka oleh peran apa (harus sejalan dengan firestore.rules)
export const AKSES = {
  dashboard: ["superadmin", "admin", "bendahara", "operator"],
  guru: ["superadmin", "admin"],
  absensi: ["superadmin", "admin", "operator"],
  absenSaya: ["guru"],
  penggajian: ["superadmin", "admin", "bendahara"],
  kas: ["superadmin", "admin", "bendahara"],
  pengguna: ["superadmin"],
  lembaga: ["superadmin"],
  jadwal: ["superadmin", "admin", "guru"],       // atur jadwal mengajar (teungku: miliknya sendiri)
  aturSesi: ["superadmin"]                       // jam & hari sesi Pagi / Malam
};
// Peran staf (bukan teungku)
export const STAF = ["superadmin", "admin", "bendahara", "operator"];

// Halaman awal tiap peran
export const beranda = (role) => role === "guru" ? "absen-saya.html" : "dashboard.html";

const MENU = [
  { href: "dashboard.html", label: "Dashboard", roles: AKSES.dashboard },
  { href: "absen-saya.html", label: "Absen Saya", roles: AKSES.absenSaya },
  { href: "jadwal-mengajar.html", label: "Jadwal Mengajar", roles: AKSES.jadwal },
  { href: "guru.html", label: "Data Guru", roles: AKSES.guru },
  { href: "absensi.html", label: "Absensi", roles: AKSES.absensi },
  { href: "penggajian.html", label: "Penggajian", roles: AKSES.penggajian },
  { href: "kas.html", label: "Kas", roles: AKSES.kas },
  { href: "pengguna.html", label: "Pengguna", roles: AKSES.pengguna },
  { href: "lembaga.html", label: "Profil Dayah", roles: AKSES.lembaga },
  { href: "akun.html", label: "Akun Saya" }
];

// ---------- Penyimpanan lokal (aman bila diblokir browser) ----------
export const simpan = {
  get(k, sesi = false) {
    try { return JSON.parse((sesi ? sessionStorage : localStorage).getItem(k)); } catch { return null; }
  },
  set(k, v, sesi = false) {
    try { (sesi ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch { /* abaikan */ }
  },
  del(k, sesi = false) {
    try { (sesi ? sessionStorage : localStorage).removeItem(k); } catch { /* abaikan */ }
  }
};

// ---------- Tampilan dayah (logo, foto, nama, alamat) ----------
// Disimpan di config/tampilan oleh Super Admin (menu Profil Dayah), disalin ke localStorage
// agar logo & nama langsung tampil tanpa menunggu server.
export function tampilanCache() {
  return { nama: LEMBAGA.nama, alamat: LEMBAGA.alamat, bendahara: LEMBAGA.bendahara, tagline: "", ...(simpan.get("tampilan") || {}) };
}
export async function ambilTampilan() {
  try {
    const s = await getDoc(doc(db, "config", "tampilan"));
    const d = s.exists() ? s.data() : {};
    const t = {
      nama: d.nama || LEMBAGA.nama, alamat: d.alamat || LEMBAGA.alamat,
      bendahara: d.bendahara || LEMBAGA.bendahara, tagline: d.tagline || "",
      logo: d.logo || "", foto: d.foto || ""
    };
    simpan.set("tampilan", t);
    return t;
  } catch { return tampilanCache(); }
}

// ---------- Username ----------
export const normUsername = (s) => String(s || "").trim().toLowerCase();
export const usernameValid = (u) => /^[a-z0-9._]{3,20}$/.test(u);
// Email internal unik per akun (akhiran acak agar username bisa dipakai ulang / direset)
export const buatEmail = (u) => `${u}.${Math.random().toString(36).slice(2, 8)}@${EMAIL_DOMAIN}`;

// ---------- Sesi mengajar: Pagi & Malam ----------
// Jam & hari diatur Super Admin (config/absensi). Jam dalam WIB, format "HH:MM".
export const SESI_BAWAAN = [
  { id: "pagi",  nama: "Pagi",  mulai: "07:30", selesai: "11:30", hari: [0, 1, 2, 3, 4, 5, 6] },
  { id: "malam", nama: "Malam", mulai: "20:00", selesai: "22:00", hari: [0, 1, 2, 3, 4, 5, 6] }
];
// Teungku boleh menekan Hadir mulai 30 menit sebelum sesi sampai 30 menit setelah sesi selesai
export const TOLERANSI_MENIT = 30;

export async function ambilConfigAbsensi() {
  const s = await getDoc(doc(db, "config", "absensi")).catch(() => null);
  const d = s?.exists() ? s.data() : {};
  const tersimpan = Object.fromEntries((d.sesi || []).map(x => [x.id, x]));
  const sesi = SESI_BAWAAN.map(b => {
    const x = { ...b, ...(tersimpan[b.id] || {}) };
    if (!Array.isArray(x.hari)) x.hari = [...b.hari];
    return x;
  });
  return { sesi, guruMandiri: d.guruMandiri !== false };
}

const keMenit = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const keJam = (menit) => {
  const m = ((menit % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const jamSesi = (s) => `${s.mulai}–${s.selesai}`;

const menitWIB = () => { const d = new Date(Date.now() + WIB_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const sesiSudahSelesai = (sesi) => menitWIB() > keMenit(sesi.selesai);

// Apakah sekarang (WIB) masih dalam waktu absen sesi ini?
export function waktuAbsen(sesi) {
  const now = new Date(Date.now() + WIB_MS);
  const menit = now.getUTCHours() * 60 + now.getUTCMinutes();
  const buka = keMenit(sesi.mulai) - TOLERANSI_MENIT;
  const tutup = keMenit(sesi.selesai) + TOLERANSI_MENIT;
  if (menit < buka) return { boleh: false, pesan: `Bisa absen mulai pukul ${keJam(buka)}` };
  if (menit > tutup) return { boleh: false, pesan: "Waktu absen sesi ini sudah lewat" };
  return { boleh: true, pesan: "" };
}

// ---------- Jadwal mengajar ----------
// Koleksi "mengajar": satu dokumen per teungku × sesi × hari,
// id = "<guruId>_<sesiId>_<hari>", berisi kitab, materi, kelas. Dapat dilihat publik.
// Hari memakai getDay(): 0 = Ahad, 1 = Senin, ... 6 = Sabtu
export const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const SEMUA_HARI = [0, 1, 2, 3, 4, 5, 6];
export const hariDari = (tgl) => new Date(tgl + "T00:00:00").getDay();
export const idJadwal = (guruId, sesiId, hari) => `${guruId}_${sesiId}_${hari}`;

export async function ambilJadwal(guruId = null) {
  const q = guruId ? query(collection(db, "mengajar"), where("guruId", "==", guruId)) : collection(db, "mengajar");
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// Set id jadwal untuk pengecekan cepat
export const indeksJadwal = (entri) => new Set(entri.map(e => idJadwal(e.guruId, e.sesi, e.hari)));

// Sesi dayah yang berjalan pada hari tertentu
export const sesiPadaHari = (cfg, hari) => cfg.sesi.filter(s => s.hari.includes(hari));

// Apakah teungku dijadwalkan mengajar sesi ini pada hari itu?
export const terjadwal = (idx, guruId, sesi, hari) =>
  sesi.hari.includes(hari) && idx.has(idJadwal(guruId, sesi.id, hari));

// Jumlah sesi terjadwal seorang teungku dalam satu bulan (sampai hari ini)
export function hitungJadwalBulan(cfg, idx, guruId, bln) {
  const [y, m] = bln.split("-").map(Number);
  const akhir = new Date(y, m, 0).getDate();
  const sekarang = today();
  let n = 0;
  for (let d = 1; d <= akhir; d++) {
    const tgl = `${bln}-${String(d).padStart(2, "0")}`;
    if (tgl > sekarang) break;
    const h = new Date(y, m - 1, d).getDay();
    // Hari ini: hanya sesi yang sudah selesai (sesi malam belum dihitung saat siang hari)
    n += cfg.sesi.filter(s => terjadwal(idx, guruId, s, h) && (tgl < sekarang || sesiSudahSelesai(s))).length;
  }
  return n;
}

// ---------- Login & profil ----------
export async function ambilProfil(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

export async function keluar() {
  simpan.del("profil", true);
  await signOut(auth).catch(() => {});
  location.replace("./");
}

function pesanGangguan(teks) {
  let el = document.getElementById("gangguan");
  if (!el) {
    el = document.createElement("div");
    el.id = "gangguan";
    el.className = "gangguan";
    document.body.prepend(el);
  }
  el.innerHTML = `${esc(teks)} <button class="btn btn-sm" onclick="location.reload()">Muat ulang</button>`;
}

// Panggil di setiap halaman yang butuh login.
// roles = daftar peran yang boleh membuka halaman (null = semua peran).
// Mengembalikan Promise<{ user, profil }>.
export function requireAuth(roles = null) {
  // Header langsung digambar dari profil tersimpan sesi ini, supaya tidak "hilang" saat pindah menu
  const cache = simpan.get("profil", true);
  if (cache) renderNav(cache);
  pasangFooter();

  return new Promise((resolve) => {
    let stop = null;
    stop = onAuthStateChanged(auth, async (user) => {
      if (stop) stop();
      if (!user) { simpan.del("profil", true); return location.replace("./"); }

      let profil;
      try {
        profil = await ambilProfil(user.uid);
      } catch {
        // Gangguan jaringan: jangan langsung logout. Pakai cache bila ada & masih milik user ini.
        if (cache?.uid === user.uid) profil = cache;
        else { pesanGangguan("Tidak bisa terhubung ke server. Periksa internet Anda."); return; }
      }
      if (!profil || !profil.aktif) {
        simpan.del("profil", true);
        await signOut(auth).catch(() => {});
        return location.replace("./?nonaktif=1");
      }
      if (roles && !roles.includes(profil.role)) return location.replace(beranda(profil.role));

      simpan.set("profil", profil, true);
      if (!cache || JSON.stringify(cache) !== JSON.stringify(profil)) renderNav(profil);
      // Hapus elemen bertanda data-roles="a,b" bila peran tidak cocok
      document.querySelectorAll("[data-roles]").forEach(el => {
        if (!el.dataset.roles.split(",").includes(profil.role)) el.remove();
      });
      resolve({ user, profil });
    });
  });
}

function renderNav(profil) {
  const el = document.getElementById("navbar");
  if (!el) return;
  const t = tampilanCache();
  const now = location.pathname.split("/").pop() || "dashboard.html";
  el.innerHTML = `
    <div class="nav-atas">
      <a class="brand" href="${beranda(profil.role)}">
        ${t.logo ? `<img src="${t.logo}" alt="">` : `<span class="logo">☪</span>`}
        <div><strong>${esc(t.nama)}</strong><small>Sistem Administrasi</small></div>
      </a>
      <div class="nav-user">
        <span class="user">${esc(profil.nama)}<br><b>${PERAN[profil.role] || profil.role}</b></span>
        <button class="btn btn-ghost btn-sm" id="btnLogout">Keluar</button>
      </div>
    </div>
    <nav class="nav-tab">
      ${MENU.filter(m => !m.roles || m.roles.includes(profil.role))
        .map(m => `<a href="${m.href}" class="${m.href === now ? "active" : ""}">${m.label}</a>`).join("")}
    </nav>`;
  document.getElementById("btnLogout").onclick = keluar;
  // Tab aktif digeser agar terlihat (di HP menu bisa digeser ke samping)
  el.querySelector(".nav-tab a.active")?.scrollIntoView({ block: "nearest", inline: "center" });
}

// Kaki halaman: versi & hak cipta (dipasang di semua halaman)
export function pasangFooter(target = document.body) {
  if (document.getElementById("kaki")) return;
  const f = document.createElement("footer");
  f.id = "kaki";
  f.className = "kaki";
  const build = APP_BUILD.startsWith("__") ? "" : ` (${APP_BUILD})`;
  const publik = /(^|\/)(index\.html)?$/.test(location.pathname) ? "" : ` · <a href="./">Jadwal mengajar</a>`;
  f.innerHTML = `Versi ${APP_VERSI}${build} · ${HAK_CIPTA}${publik}`;
  target.appendChild(f);
}
export const versiAplikasi = () => APP_VERSI;

export const rupiah = (n) =>
  "Rp " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });

// Tanggal hari ini menurut WIB (UTC+7), apa pun zona waktu yang disetel di HP/komputer
export const WIB_MS = 7 * 3600 * 1000;
export const today = () => new Date(Date.now() + WIB_MS).toISOString().slice(0, 10);

// Selisih jam perangkat dengan jam server (ms). Diambil dari header "Date" situs ini sendiri.
export async function selisihJam() {
  try {
    const r = await fetch(location.href, { method: "HEAD", cache: "no-store" });
    const tgl = r.headers.get("date");
    return tgl ? Date.now() - Date.parse(tgl) : 0;
  } catch { return 0; }
}

export const thisMonth = () => today().slice(0, 7);

export const namaBulan = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
};

export const tglIndo = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, type === "err" ? 6000 : 2800);
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Unduh array of arrays sebagai CSV (bisa dibuka di Excel)
export function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Perkecil gambar di browser sebelum disimpan (agar ringan & muat di database)
export function perkecilGambar(file, maxSisi, kualitas = 0.82, tipe = "image/jpeg") {
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
