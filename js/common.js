// Fungsi bersama: penjaga login & peran, navigasi, format rupiah, notifikasi
import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from "./firebase.js";
import { LEMBAGA, EMAIL_DOMAIN } from "./pengaturan.js";

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
  pengguna: ["superadmin"]
};

// Halaman awal tiap peran
const beranda = (role) => role === "guru" ? "absen-saya.html" : "dashboard.html";

const MENU = [
  { href: "dashboard.html", label: "Dashboard", roles: AKSES.dashboard },
  { href: "absen-saya.html", label: "Absen Saya", roles: AKSES.absenSaya },
  { href: "guru.html", label: "Data Guru", roles: AKSES.guru },
  { href: "absensi.html", label: "Absensi", roles: AKSES.absensi },
  { href: "penggajian.html", label: "Penggajian", roles: AKSES.penggajian },
  { href: "kas.html", label: "Kas", roles: AKSES.kas },
  { href: "pengguna.html", label: "Pengguna", roles: AKSES.pengguna },
  { href: "akun.html", label: "Akun Saya" }
];

// ---------- Username ----------
export const normUsername = (s) => String(s || "").trim().toLowerCase();
export const usernameValid = (u) => /^[a-z0-9._]{3,20}$/.test(u);
// Email internal unik per akun (akhiran acak agar username bisa dipakai ulang / direset)
export const buatEmail = (u) => `${u}.${Math.random().toString(36).slice(2, 8)}@${EMAIL_DOMAIN}`;

// ---------- Pengaturan absensi ----------
// Disimpan di config/absensi. Bawaan: satu sesi "Harian", teungku boleh absen sendiri.
export async function ambilConfigAbsensi() {
  const s = await getDoc(doc(db, "config", "absensi")).catch(() => null);
  const d = s?.exists() ? s.data() : {};
  const sesi = (d.sesi?.length ? d.sesi : [{ id: "harian", nama: "Harian" }])
    .map(x => ({ ...x, hari: Array.isArray(x.hari) ? x.hari : [...SEMUA_HARI] }));
  return { sesi, guruMandiri: d.guruMandiri !== false };
}

// ---------- Jadwal ----------
// Hari memakai getDay(): 0 = Ahad, 1 = Senin, ... 6 = Sabtu
export const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const SEMUA_HARI = [0, 1, 2, 3, 4, 5, 6];
export const hariDari = (tgl) => new Date(tgl + "T00:00:00").getDay();

// Sesi dayah yang berjalan pada hari tertentu
export const sesiPadaHari = (cfg, hari) => cfg.sesi.filter(s => s.hari.includes(hari));

// Apakah teungku dijadwalkan mengajar sesi ini pada hari ini?
// guru.jadwal = ["<sesiId>:<hari>", ...]. Belum diatur = ikut semua sesi dayah.
export const terjadwal = (guru, sesi, hari) =>
  sesi.hari.includes(hari) && (!Array.isArray(guru.jadwal) || guru.jadwal.includes(`${sesi.id}:${hari}`));

// Jumlah sesi terjadwal seorang teungku dalam satu bulan (sampai hari ini)
export function hitungJadwalBulan(cfg, guru, bln) {
  const [y, m] = bln.split("-").map(Number);
  const akhir = new Date(y, m, 0).getDate();
  const sekarang = today();
  let n = 0;
  for (let d = 1; d <= akhir; d++) {
    const tgl = `${bln}-${String(d).padStart(2, "0")}`;
    if (tgl > sekarang) break;
    const h = new Date(y, m - 1, d).getDay();
    n += cfg.sesi.filter(s => terjadwal(guru, s, h)).length;
  }
  return n;
}

export async function ambilProfil(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

// Panggil di setiap halaman yang butuh login.
// roles = daftar peran yang boleh membuka halaman (null = semua peran).
// Mengembalikan Promise<{ user, profil }>.
export function requireAuth(roles = null) {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) return location.replace("index.html");
      const profil = await ambilProfil(user.uid).catch(() => null);
      if (!profil || !profil.aktif) {
        await signOut(auth);
        return location.replace("index.html?nonaktif=1");
      }
      if (roles && !roles.includes(profil.role)) return location.replace(beranda(profil.role));
      renderNav(profil);
      // Sembunyikan elemen bertanda data-roles="a,b" bila peran tidak cocok
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
  const now = location.pathname.split("/").pop() || "dashboard.html";
  el.innerHTML = `
    <div class="brand">
      <span class="logo">☪</span>
      <div><strong>${LEMBAGA.nama}</strong><small>Sistem Administrasi</small></div>
    </div>
    <button class="menu-toggle" id="menuToggle" aria-label="Menu">☰</button>
    <nav id="menuLinks">
      ${MENU.filter(m => !m.roles || m.roles.includes(profil.role))
        .map(m => `<a href="${m.href}" class="${m.href === now ? "active" : ""}">${m.label}</a>`).join("")}
      <span class="user">${esc(profil.nama)}<br><b>${PERAN[profil.role] || profil.role}</b></span>
      <button class="btn btn-ghost" id="btnLogout">Keluar</button>
    </nav>`;
  document.getElementById("btnLogout").onclick = async () => {
    await signOut(auth);
    location.href = "index.html";
  };
  document.getElementById("menuToggle").onclick = () =>
    document.getElementById("menuLinks").classList.toggle("open");
}

export const rupiah = (n) =>
  "Rp " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

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
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2800);
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
