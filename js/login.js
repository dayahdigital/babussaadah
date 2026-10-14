import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc, getDocs, collection
} from "./firebase.js";
import { ambilProfil, ambilTampilan, tampilanCache, beranda, simpan, esc, PERAN, pasangFooter } from "./common.js";

pasangFooter(document.querySelector(".login-panel"));

const form = document.getElementById("formLogin");
const sel = document.getElementById("username");
const err = document.getElementById("err");
const btn = document.getElementById("btnMasuk");
let sedangLogin = false;

if (new URLSearchParams(location.search).has("nonaktif"))
  err.textContent = "Akun Anda nonaktif. Hubungi Super Admin.";

// ---------- Bilah kiri: foto & logo dayah ----------
function pasangTampilan(t) {
  document.getElementById("namaDayah").textContent = t.nama;
  document.getElementById("alamatDayah").textContent = t.alamat || "";
  document.getElementById("taglineDayah").textContent = t.tagline || "";
  document.title = "Login — " + t.nama;
  if (t.logo) document.getElementById("logoWrap").innerHTML = `<img src="${t.logo}" alt="Logo">`;
  if (t.foto) document.getElementById("panelFoto").style.backgroundImage = `url("${t.foto}")`;
}
pasangTampilan(tampilanCache());        // langsung dari cache
ambilTampilan().then(pasangTampilan);    // lalu versi terbaru dari server

// ---------- Daftar nama pengguna (dropdown) ----------
const URUTAN = ["superadmin", "admin", "bendahara", "operator", "guru"];
async function muatDaftar() {
  try {
    const snap = await getDocs(collection(db, "usernames"));
    const list = snap.docs.map(d => ({ username: d.id, ...d.data() })).filter(u => u.aktif !== false);
    if (!list.length) {
      sel.innerHTML = `<option value="">Belum ada pengguna</option>`;
      document.getElementById("infoSetup").hidden = false;
      return;
    }
    const grup = {};
    list.forEach(u => (grup[u.role || "lain"] ??= []).push(u));
    sel.innerHTML = `<option value="">— pilih nama —</option>` +
      [...URUTAN, "lain"].filter(r => grup[r]).map(r => `<optgroup label="${PERAN[r] || "Lainnya"}">` +
        grup[r].sort((a, b) => (a.nama || a.username).localeCompare(b.nama || b.username))
          .map(u => `<option value="${esc(u.username)}">${esc(u.nama || u.username)}</option>`).join("") +
        `</optgroup>`).join("");
    const terakhir = simpan.get("loginTerakhir");
    if (terakhir && list.some(u => u.username === terakhir)) {
      sel.value = terakhir;
      form.password.focus();
    }
  } catch (ex) {
    sel.innerHTML = `<option value="">Gagal memuat daftar</option>`;
    err.textContent = "Tidak bisa terhubung ke server (" + (ex.code || ex.message) + ").";
  }
}
muatDaftar();

// Tampilkan tautan setup bila belum ada Super Admin sama sekali
getDoc(doc(db, "config", "setup"))
  .then(s => { if (!s.exists()) document.getElementById("infoSetup").hidden = false; })
  .catch(() => {});

// Sudah login sebelumnya? langsung ke halaman awal
onAuthStateChanged(auth, async (user) => {
  if (!user || sedangLogin) return;
  const p = await ambilProfil(user.uid).catch(() => null);
  if (p?.aktif) location.replace(beranda(p.role));
  else await signOut(auth);
});

document.getElementById("lihatSandi").onclick = () =>
  form.password.type = form.password.type === "password" ? "text" : "password";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const u = sel.value;
  if (!u) { err.textContent = "Pilih nama pengguna."; return; }

  sedangLogin = true;
  btn.disabled = true; btn.textContent = "Memproses...";
  try {
    const map = await getDoc(doc(db, "usernames", u));
    if (!map.exists()) throw { code: "auth/invalid-credential" };
    const cred = await signInWithEmailAndPassword(auth, map.data().email, form.password.value);
    const p = await ambilProfil(cred.user.uid);
    if (!p || !p.aktif) {
      await signOut(auth);
      err.textContent = "Akun Anda nonaktif. Hubungi Super Admin.";
      return;
    }
    simpan.set("loginTerakhir", u);
    simpan.set("profil", p, true);
    location.replace(beranda(p.role));
  } catch (ex) {
    err.textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(ex.code)
      ? "Kata sandi salah."
      : ex.code === "auth/too-many-requests"
        ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
        : "Gagal masuk: " + (ex.code || ex.message);
  } finally {
    sedangLogin = false;
    btn.disabled = false; btn.textContent = "Masuk";
  }
});
